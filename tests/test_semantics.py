from decimal import Decimal

import pytest

from semtrail.errors import Unsupported
from semtrail.query import MetricQuery
from semtrail.semantics import SimpleMetricCompiler
from semtrail.warehouse import DuckDBWarehouse


def test_defined_revenue_and_grain(demo):
    config, catalog, policy = demo
    compiler = SimpleMetricCompiler(catalog, policy)
    query = compiler.compile(MetricQuery(metric="revenue", group_by=["country"]), "duckdb", 100)
    assert query.kind == "dbt_metric"
    rows = DuckDBWarehouse(config.warehouse).execute(query, policy, 100)["rows"]
    assert {country: Decimal(value) for country, value in rows} == {
        "DE": Decimal("200"),
        "GB": Decimal("150"),
        "US": Decimal("350"),
    }


@pytest.mark.parametrize(
    "mutation",
    [
        {"type": "ratio"},
        {"filter": {"where_sql_template": "country = 'DE'"}},
        {"type_params": {"measure": {"name": "order_value", "fill_nulls_with": 0}}},
        {"type_params": {"measure": {"name": "order_value", "join_to_timespine": True}}},
    ],
)
def test_unsupported_semantics_never_approximated(demo, mutation):
    _, catalog, policy = demo
    catalog.semantic["metrics"][0].update(mutation)
    compiler = SimpleMetricCompiler(catalog, policy)
    assert "revenue" not in [m["name"] for m in compiler.discover()]
    with pytest.raises(Unsupported):
        compiler.compile(MetricQuery(metric="revenue"), "duckdb", 100)


def test_measure_expression_is_not_executable_sql(demo):
    _, catalog, policy = demo
    catalog.semantic["semantic_models"][0]["measures"][0]["expr"] = "amount + 1000"
    with pytest.raises(Unsupported):
        SimpleMetricCompiler(catalog, policy).compile(MetricQuery(metric="revenue"), "duckdb", 100)


def test_metric_cannot_read_forbidden_model(demo):
    _, catalog, policy = demo
    catalog.semantic["semantic_models"][0]["node_relation"]["alias"] = "payroll"
    catalog.semantic["semantic_models"][0]["node_relation"]["schema_name"] = "private"
    assert not SimpleMetricCompiler(catalog, policy).discover()
