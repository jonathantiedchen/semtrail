"""Optional real-dbt artifact integration, also exercised in CI."""

import os
from pathlib import Path

import pytest

from semtrail.catalog import Catalog
from semtrail.config import PolicyConfig, WarehouseConfig
from semtrail.policy import Policy
from semtrail.query import MetricQuery
from semtrail.semantics import SimpleMetricCompiler
from semtrail.warehouse import DuckDBWarehouse


def test_real_dbt_artifacts_compile_and_execute():
    project = os.environ.get("SEMTRAIL_DBT_PROJECT")
    if not project:
        pytest.skip("Build examples/shop with dbt and set SEMTRAIL_DBT_PROJECT.")
    root = Path(project).resolve()
    catalog = Catalog(root / "target/manifest.json", root / "target/semantic_manifest.json")
    policy = Policy(catalog, PolicyConfig(allow_tags_any=("finance",), deny_tags=("sensitive",)))
    assert set(policy.models) == {"model.shop.completed_orders"}
    compiler = SimpleMetricCompiler(catalog, policy)
    assert {m["name"] for m in compiler.discover()} == {"revenue", "orders"}
    query = compiler.compile(MetricQuery(metric="revenue"), "duckdb", 100)
    warehouse = DuckDBWarehouse(WarehouseConfig(path=str(root / "semtrail_demo.duckdb")))
    data = warehouse.execute(query, policy, 100)
    assert float(data["rows"][0][0]) == 700.0
