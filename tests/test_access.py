import json
from pathlib import Path

import pytest

from semtrail.catalog import Catalog
from semtrail.config import PolicyConfig
from semtrail.errors import AccessDenied, Unsupported
from semtrail.policy import Policy
from semtrail.query import (
    Aggregate,
    CompiledQuery,
    ExploreQuery,
    Filter,
    compile_explore,
    validate_sql,
)
from semtrail.warehouse import DuckDBWarehouse


def test_allow_deny_and_empty_policy(demo):
    _, catalog, policy = demo
    assert set(policy.models) == {"model.shop.completed_orders"}
    assert not Policy(catalog, PolicyConfig()).models
    with pytest.raises(AccessDenied):
        policy.require("model.shop.payroll")
    with pytest.raises(AccessDenied):
        policy.require("model.shop.customers")
    assert "payroll" not in json.dumps(policy.discover())


@pytest.mark.parametrize(
    "sql",
    [
        "SELECT * FROM semtrail_demo.private.payroll",
        "SELECT * FROM semtrail_demo.marts.customers",
        "SELECT * FROM information_schema.tables",
        "SELECT * FROM completed_orders",
        "SELECT * FROM read_csv_auto('/etc/passwd')",
        "SELECT * FROM semtrail_demo.marts.completed_orders; DROP TABLE x",
        "COPY semtrail_demo.marts.completed_orders TO '/tmp/leak.csv'",
        "ATTACH '/tmp/leak.duckdb' AS leak",
        "SELECT * INTO x FROM semtrail_demo.marts.completed_orders",
        "SELECT * FROM semtrail_demo.marts.completed_orders UNION SELECT * FROM x",
        "WITH x AS (SELECT * FROM semtrail_demo.private.payroll) SELECT * FROM x",
        "SELECT * FROM semtrail_demo.marts.completed_orders a "
        "JOIN semtrail_demo.private.payroll b ON 1=1",
        "SELECT pg_read_file('/etc/passwd') FROM semtrail_demo.marts.completed_orders",
        "SELECT (SELECT salary FROM semtrail_demo.private.payroll) "
        "FROM semtrail_demo.marts.completed_orders",
        "DELETE FROM semtrail_demo.marts.completed_orders",
    ],
)
def test_sql_gate_rejects_escapes(demo, sql):
    with pytest.raises(AccessDenied):
        validate_sql(sql, demo[2], "duckdb")


def test_denied_compiled_query_never_executes(demo):
    config, _, policy = demo
    warehouse = DuckDBWarehouse(config.warehouse)
    query = CompiledQuery("SELECT * FROM semtrail_demo.private.payroll", (), (), "exploratory", "")
    with pytest.raises(AccessDenied):
        warehouse.execute(query, policy, 100)


def test_parameterized_injection_and_result(demo):
    config, _, policy = demo
    malicious = "DE' OR 1=1; DROP TABLE marts.completed_orders; --"
    query = ExploreQuery(
        model_id="model.shop.completed_orders",
        columns=["country"],
        filters=[Filter(column="country", op="eq", value=malicious)],
    )
    compiled = compile_explore(query, policy, "duckdb", 100)
    assert malicious not in compiled.sql
    assert compiled.parameters == (malicious,)
    warehouse = DuckDBWarehouse(config.warehouse)
    assert warehouse.execute(compiled, policy, 100)["rows"] == []
    count = compile_explore(
        ExploreQuery(model_id=query.model_id, aggregates=[Aggregate(op="count", alias="orders")]),
        policy,
        "duckdb",
        100,
    )
    assert warehouse.execute(count, policy, 100)["rows"] == [[5]]


def test_truncation_and_unknown_columns(demo):
    config, _, policy = demo
    query = ExploreQuery(model_id="model.shop.completed_orders", columns=["order_id"], limit=2)
    compiled = compile_explore(query, policy, "duckdb", 100)
    data = DuckDBWarehouse(config.warehouse).execute(compiled, policy, 2)
    assert len(data["rows"]) == 2 and data["truncated"]
    with pytest.raises(AccessDenied):
        compile_explore(query.model_copy(update={"columns": ["salary"]}), policy, "duckdb", 100)


def test_artifact_version_rejected(demo, tmp_path):
    data = json.loads(Path(demo[0].manifest).read_text())
    data["metadata"]["dbt_schema_version"] = "v99.json"
    path = tmp_path / "bad.json"
    path.write_text(json.dumps(data))
    with pytest.raises(Unsupported):
        Catalog(path)


def test_duplicate_relations_rejected(demo, tmp_path):
    data = json.loads(Path(demo[0].manifest).read_text())
    data["nodes"]["model.other.alias"] = data["nodes"]["model.shop.completed_orders"]
    path = tmp_path / "duplicate.json"
    path.write_text(json.dumps(data))
    with pytest.raises(Unsupported):
        Catalog(path)
