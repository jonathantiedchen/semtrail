"""Offline demo with deterministic model decisions, real tools, SQL, DB and LangGraph.

This is explicitly a fixture model for two known questions, not a pretend LLM.
For arbitrary questions use a live provider through `semtrail ask`.
"""

import json
from pathlib import Path

import duckdb
import yaml
from langchain_core.messages import AIMessage, ToolMessage


def create_demo(directory: Path) -> dict[str, Path]:
    directory.mkdir(parents=True, exist_ok=True)
    database = directory / "semtrail_demo.duckdb"
    # Refuse to overwrite a user's edits or database.
    paths = [
        database,
        directory / "manifest.json",
        directory / "semantic_manifest.json",
        directory / "revenue.yml",
        directory / "customers.yml",
    ]
    if any(p.exists() for p in paths):
        raise ValueError("Demo files already exist. Choose a new directory to preserve them.")
    with duckdb.connect(str(database)) as connection:
        connection.execute("CREATE SCHEMA marts")
        connection.execute("CREATE SCHEMA private")
        connection.execute("""CREATE TABLE marts.completed_orders AS
            SELECT * FROM (VALUES
              (1, 'DE', 120.00::DECIMAL(12,2)), (2, 'DE', 80.00),
              (3, 'GB', 150.00), (4, 'US', 250.00), (5, 'US', 100.00)
            ) AS t(order_id, country, amount)""")
        connection.execute("""CREATE TABLE marts.customers AS
            SELECT * FROM (VALUES (1, 'business'), (2, 'consumer'), (3, 'consumer'))
            AS t(customer_id, segment)""")
        connection.execute("CREATE TABLE private.payroll AS SELECT 'secret' AS salary")
    nodes = {}
    specifications = [
        (
            "completed_orders",
            "marts",
            ["finance"],
            "One row per completed order. Amount in USD; "
            "cancelled orders are excluded upstream. Revenue is the sum of amount.",
            {
                "order_id": "Unique order identifier",
                "country": "Customer billing country",
                "amount": "Completed order value in USD",
            },
        ),
        (
            "customers",
            "marts",
            ["customers"],
            "One row per customer, including inactive customers.",
            {"customer_id": "Unique customer identifier", "segment": "Customer market segment"},
        ),
        (
            "payroll",
            "private",
            ["finance", "sensitive"],
            "Restricted payroll.",
            {"salary": "Sensitive payroll data"},
        ),
    ]
    for name, schema, tags, description, columns in specifications:
        key = f"model.shop.{name}"
        nodes[key] = {
            "unique_id": key,
            "resource_type": "model",
            "name": name,
            "alias": name,
            "database": "semtrail_demo",
            "schema": schema,
            "tags": tags,
            "description": description,
            "config": {"materialized": "table"},
            "columns": {k: {"name": k, "description": v} for k, v in columns.items()},
        }
    manifest = {
        "metadata": {
            "dbt_schema_version": "https://schemas.getdbt.com/dbt/manifest/v12.json",
            "dbt_version": "1.9.0",
        },
        "nodes": nodes,
    }
    semantic = {
        "semantic_models": [
            {
                "name": "orders",
                "node_relation": {
                    "database": "semtrail_demo",
                    "schema_name": "marts",
                    "alias": "completed_orders",
                },
                "dimensions": [{"name": "country", "type": "categorical"}],
                "measures": [
                    {"name": "order_value", "agg": "sum", "expr": "amount"},
                    {"name": "order_count", "agg": "count", "expr": "1"},
                ],
            }
        ],
        "metrics": [
            {
                "name": "revenue",
                "description": "Completed order revenue in USD; excludes cancellations.",
                "type": "simple",
                "type_params": {"measure": {"name": "order_value"}},
            },
            {
                "name": "orders",
                "description": "Number of completed orders.",
                "type": "simple",
                "type_params": {"measure": {"name": "order_count"}},
            },
        ],
    }
    (directory / "manifest.json").write_text(json.dumps(manifest, indent=2))
    (directory / "semantic_manifest.json").write_text(json.dumps(semantic, indent=2))
    for name, tags, instructions in [
        (
            "revenue",
            ["finance"],
            "Investigate completed-order revenue. Use defined metrics. "
            "Explain currency, grain, and coverage; do not infer causal explanations.",
        ),
        (
            "customers",
            ["customers"],
            "Investigate customer composition and segments. "
            "Count customers at customer grain. Do not claim that all customers are active.",
        ),
    ]:
        config = {
            "name": name,
            "instructions": instructions,
            "manifest": "manifest.json",
            "semantic_manifest": "semantic_manifest.json",
            "policy": {"allow_tags_any": tags, "deny_tags": ["sensitive"]},
            "warehouse": {"type": "duckdb", "path": "semtrail_demo.duckdb"},
            "llm": {"provider": "openai", "model": "YOUR_MODEL", "api_key_env": "OPENAI_API_KEY"},
            "evidence_dir": "runs",
        }
        (directory / f"{name}.yml").write_text(yaml.safe_dump(config, sort_keys=False))
    return {name: directory / f"{name}.yml" for name in ("revenue", "customers")}


class DemoModel:
    def __init__(self, domain: str):
        self.domain = domain

    def bind_tools(self, tools):
        return self

    def invoke(self, messages):
        outputs = [json.loads(m.content) for m in messages if isinstance(m, ToolMessage)]
        step = len(outputs)
        name, args = "discover", {}
        if step == 1:
            name, args = (
                "describe",
                {
                    "model_id": "model.shop."
                    + ("completed_orders" if self.domain == "revenue" else "customers")
                },
            )
        elif step == 2:
            if self.domain == "revenue":
                name, args = "query_metric", {"metric": "revenue", "group_by": ["country"]}
            else:
                name, args = (
                    "query_model",
                    {
                        "model_id": "model.shop.customers",
                        "columns": ["segment"],
                        "aggregates": [{"op": "count", "alias": "customers"}],
                        "order_by": "segment",
                    },
                )
        elif step == 3:
            if self.domain == "revenue":
                name, args = "query_metric", {"metric": "orders"}
            else:
                name, args = (
                    "query_model",
                    {
                        "model_id": "model.shop.customers",
                        "aggregates": [
                            {"op": "count_distinct", "column": "customer_id", "alias": "customers"}
                        ],
                    },
                )
        elif step >= 4:
            evidence = [o for o in outputs if o.get("status") == "ok" and "query_id" in o]
            if len(evidence) != 2:
                explanation = "Demo queries failed. Inspect the evidence."
                status, citations = "insufficient_data", []
            else:
                first, second = evidence
                details = "; ".join(f"{row[0]}: {row[1]}" for row in first["result"]["rows"])
                total = second["result"]["rows"][0][0]
                explanation = (
                    f"Completed revenue by billing country in USD: {details} [q1]. "
                    f"This covers {total} completed orders [q2]."
                    if self.domain == "revenue"
                    else f"Customer counts by segment: {details} [q1]. "
                    f"There are {total} distinct customers in total [q2]."
                )
                status, citations = "answered", [e["query_id"] for e in evidence]
            name, args = (
                "finish",
                {
                    "status": status,
                    "explanation": explanation,
                    "query_ids": citations,
                    "definitions": [
                        "Revenue is completed order value in USD."
                        if self.domain == "revenue"
                        else "Customers includes inactive customers."
                    ],
                    "limitations": [
                        "Synthetic fixture data. Deterministic offline demo model; "
                        "use a live provider for arbitrary questions."
                    ],
                },
            )
        return AIMessage(
            content="", tool_calls=[{"name": name, "args": args, "id": f"demo-{step}"}]
        )
