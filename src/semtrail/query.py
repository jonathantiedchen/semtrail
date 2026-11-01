"""The public query surface is structured. SQL is compiled, never supplied by the LLM."""

from dataclasses import dataclass
from typing import Literal

import sqlglot
from pydantic import Field
from sqlglot import exp
from sqlglot.optimizer.scope import traverse_scope

from semtrail.catalog import Model
from semtrail.config import StrictModel
from semtrail.errors import AccessDenied, Unsupported
from semtrail.policy import Policy


class Filter(StrictModel):
    column: str
    op: Literal["eq", "ne", "gt", "gte", "lt", "lte", "is_null", "is_not_null"]
    value: str | int | float | bool | None = None


class Aggregate(StrictModel):
    op: Literal["count", "count_distinct", "sum", "avg", "min", "max"]
    column: str | None = None
    alias: str = Field(pattern=r"^[A-Za-z][A-Za-z0-9_]{0,62}$")


class ExploreQuery(StrictModel):
    model_id: str
    columns: list[str] = Field(default_factory=list, max_length=20)
    aggregates: list[Aggregate] = Field(default_factory=list, max_length=10)
    filters: list[Filter] = Field(default_factory=list, max_length=10)
    order_by: str | None = None
    descending: bool = False
    limit: int = Field(default=100, ge=1, le=1000)


class MetricQuery(StrictModel):
    metric: str
    group_by: list[str] = Field(default_factory=list, max_length=5)
    limit: int = Field(default=100, ge=1, le=1000)


@dataclass(frozen=True)
class CompiledQuery:
    sql: str
    parameters: tuple
    models: tuple[str, ...]
    kind: str
    definition: str


def quote(value: str) -> str:
    return '"' + value.replace('"', '""') + '"'


def relation(model: Model, dialect: str) -> str:
    parts = [model.schema, model.identifier]
    if dialect == "duckdb" and model.database:
        parts.insert(0, model.database)
    return ".".join(quote(part) for part in parts)


def field(model: Model, name: str) -> str:
    if name not in model.columns:
        raise AccessDenied("Column is unavailable in the permitted model.")
    return quote(name)


def compile_explore(query: ExploreQuery, policy: Policy, dialect: str, max_rows: int):
    model = policy.require(query.model_id)
    selected = [field(model, name) for name in query.columns]
    aliases = list(query.columns)
    for aggregate in query.aggregates:
        if aggregate.column is None and aggregate.op != "count":
            raise Unsupported("Only count supports an omitted column.")
        column = field(model, aggregate.column) if aggregate.column else "*"
        if aggregate.op == "count_distinct":
            expression = f"COUNT(DISTINCT {column})"
        else:
            expression = f"{aggregate.op.upper()}({column})"
        selected.append(f"{expression} AS {quote(aggregate.alias)}")
        aliases.append(aggregate.alias)
    if not selected or len(set(aliases)) != len(aliases):
        raise Unsupported("Select at least one field and use unique output names.")
    sql = f"SELECT {', '.join(selected)} FROM {relation(model, dialect)}"
    predicates, params = [], []
    operators = {"eq": "=", "ne": "<>", "gt": ">", "gte": ">=", "lt": "<", "lte": "<="}
    placeholder = "%s" if dialect == "postgres" else "?"
    for item in query.filters:
        column = field(model, item.column)
        if item.op in {"is_null", "is_not_null"}:
            predicates.append(f"{column} IS {'NOT ' if item.op == 'is_not_null' else ''}NULL")
        else:
            if item.value is None:
                raise Unsupported("Use is_null or is_not_null for null comparisons.")
            predicates.append(f"{column} {operators[item.op]} {placeholder}")
            params.append(item.value)
    if predicates:
        sql += " WHERE " + " AND ".join(predicates)
    if query.aggregates and query.columns:
        sql += " GROUP BY " + ", ".join(field(model, c) for c in query.columns)
    if query.order_by:
        if query.order_by not in aliases:
            raise Unsupported("Order by a selected field or aggregate alias.")
        sql += f" ORDER BY {quote(query.order_by)} {'DESC' if query.descending else 'ASC'}"
    # Fetch one sentinel row so truncation is observable.
    sql += f" LIMIT {min(query.limit, max_rows) + 1}"
    validate_sql(sql, policy, dialect)
    return CompiledQuery(
        sql,
        tuple(params),
        (model.id,),
        "exploratory",
        "Exploratory calculation; not a defined dbt metric.",
    )


def validate_sql(sql: str, policy: Policy, dialect: str) -> None:
    """Defense in depth for local compilers. This is not a general SQL sandbox."""
    try:
        statements = sqlglot.parse(sql, read=dialect)
    except sqlglot.errors.ParseError as exc:
        raise AccessDenied("Compiler produced unsupported SQL.") from exc
    if len(statements) != 1 or not isinstance(statements[0], exp.Select):
        raise AccessDenied("Only one SELECT statement is permitted.")
    tree = statements[0]
    banned = (
        exp.Insert,
        exp.Update,
        exp.Delete,
        exp.Create,
        exp.Drop,
        exp.Command,
        exp.Into,
        exp.Union,
        exp.Intersect,
        exp.Except,
        exp.Join,
        exp.With,
    )
    if any(isinstance(node, banned) for node in tree.walk()):
        raise AccessDenied(
            "Joins, CTEs, set operations and writes are outside the MVP query surface."
        )
    allowed_functions = {"COUNT", "SUM", "AVG", "MIN", "MAX"}
    for function in tree.find_all(exp.Func):
        if function.sql_name() not in allowed_functions:
            raise AccessDenied("Function is outside the supported query surface.")
    allowed = set()
    for model in policy.models.values():
        catalog = model.database if dialect == "duckdb" else ""
        allowed.add((catalog or "", model.schema, model.identifier))
    found = False
    for scope in traverse_scope(tree):
        for source in scope.sources.values():
            if not isinstance(source, exp.Table):
                raise AccessDenied("Subquery sources are unsupported.")
            if not isinstance(source.this, exp.Identifier):
                raise AccessDenied("Table functions are forbidden.")
            key = (source.catalog or "", source.db, source.name)
            if key not in allowed:
                raise AccessDenied("Query references an unavailable relation.")
            found = True
    if not found or len(list(tree.find_all(exp.Table))) != 1:
        raise AccessDenied("Query must read exactly one permitted relation.")
