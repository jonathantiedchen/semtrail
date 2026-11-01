import os
from dataclasses import replace

import pytest

from semtrail.config import PolicyConfig, WarehouseConfig
from semtrail.policy import Policy
from semtrail.query import Aggregate, ExploreQuery, compile_explore
from semtrail.warehouse import PostgresWarehouse


@pytest.mark.postgres
def test_postgres_readonly_execution(demo):
    dsn = os.environ.get("SEMTRAIL_TEST_POSTGRES_DSN")
    if not dsn:
        pytest.skip("Set SEMTRAIL_TEST_POSTGRES_DSN for a disposable PostgreSQL database.")
    import psycopg

    # Dedicated schema in a disposable test database. No production setup mutation.
    with psycopg.connect(dsn, autocommit=True) as db:
        db.execute("CREATE SCHEMA IF NOT EXISTS semtrail_test")
        db.execute("CREATE TABLE semtrail_test.orders (amount integer)")
        try:
            db.execute("INSERT INTO semtrail_test.orders VALUES (120), (80)")
            catalog = demo[1]
            catalog.models = {
                "model.shop.completed_orders": replace(
                    catalog.models["model.shop.completed_orders"],
                    schema="semtrail_test",
                    identifier="orders",
                )
            }
            policy = Policy(catalog, PolicyConfig(allow_tags_any=("finance",)))
            query = compile_explore(
                ExploreQuery(
                    model_id="model.shop.completed_orders",
                    aggregates=[Aggregate(op="sum", column="amount", alias="revenue")],
                ),
                policy,
                "postgres",
                100,
            )
            warehouse = PostgresWarehouse(
                WarehouseConfig(type="postgres", dsn_env="SEMTRAIL_TEST_POSTGRES_DSN")
            )
            assert warehouse.execute(query, policy, 100)["rows"] == [[200]]
        finally:
            db.execute("DROP TABLE semtrail_test.orders")
