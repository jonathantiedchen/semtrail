import math
import os
from threading import Timer
from typing import Protocol

from semtrail.config import WarehouseConfig
from semtrail.errors import SemtrailError
from semtrail.policy import Policy
from semtrail.query import CompiledQuery, validate_sql


class Warehouse(Protocol):
    dialect: str

    def execute(self, query: CompiledQuery, policy: Policy, limit: int) -> dict: ...


def result(cursor, limit: int) -> dict:
    rows = cursor.fetchmany(limit + 1)
    cells_truncated = False
    bounded = []
    for row in rows[:limit]:
        values = []
        for cell in row:
            if isinstance(cell, (str, bytes)) and len(cell) > 2048:
                cell = cell[:2048]
                cells_truncated = True
            if isinstance(cell, float) and not math.isfinite(cell):
                cell = str(cell)
            values.append(cell)
        bounded.append(values)
    # A second cap bounds provider egress even for wide or text-heavy results.
    import json

    from semtrail.evidence import json_safe

    bounded = json_safe(bounded)
    truncated = len(rows) > limit
    while len(json.dumps(bounded)) > 64000:
        bounded.pop()
        truncated = True
    return {
        "columns": [c[0] for c in cursor.description],
        "rows": bounded,
        "truncated": truncated,
        "cells_truncated": cells_truncated,
    }


class DuckDBWarehouse:
    dialect = "duckdb"

    def __init__(self, config: WarehouseConfig):
        self.config = config
        if not config.path:
            raise SemtrailError("DuckDB requires warehouse.path.")

    def execute(self, query: CompiledQuery, policy: Policy, limit: int):
        import duckdb

        # Validate again immediately before touching the database.
        validate_sql(query.sql, policy, self.dialect)
        with duckdb.connect(
            self.config.path,
            read_only=True,
            config={
                "enable_external_access": "false",
                "threads": "2",
                "memory_limit": "256MB",
            },
        ) as connection:
            timeout = Timer(self.config.timeout_seconds, connection.interrupt)
            timeout.daemon = True
            timeout.start()
            try:
                return result(connection.execute(query.sql, query.parameters), limit)
            except duckdb.Error as exc:
                raise SemtrailError(
                    "Database query failed or timed out; check types and fields."
                ) from exc
            finally:
                timeout.cancel()


class PostgresWarehouse:
    dialect = "postgres"

    def __init__(self, config: WarehouseConfig):
        self.config = config

    def execute(self, query: CompiledQuery, policy: Policy, limit: int):
        import psycopg

        validate_sql(query.sql, policy, self.dialect)
        dsn = os.environ.get(self.config.dsn_env)
        if not dsn:
            raise SemtrailError(f"Set {self.config.dsn_env} to a read-only PostgreSQL DSN.")
        try:
            with psycopg.connect(dsn, connect_timeout=10) as connection:
                connection.read_only = True
                with connection.cursor() as cursor:
                    cursor.execute(
                        "SELECT set_config('statement_timeout', %s, true)",
                        (str(self.config.timeout_seconds * 1000),),
                    )
                    cursor.execute("SET LOCAL search_path = pg_catalog")
                    cursor.execute(query.sql, query.parameters)
                    return result(cursor, limit)
        except psycopg.Error as exc:
            # Database messages may expose forbidden object names or credentials.
            raise SemtrailError(
                "Database query failed or timed out; check grants, types and fields."
            ) from exc


def create_warehouse(config: WarehouseConfig) -> Warehouse:
    if config.type == "postgres":
        return PostgresWarehouse(config)
    return DuckDBWarehouse(config)
