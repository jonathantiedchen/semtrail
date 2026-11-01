"""A deliberately small dbt metric compiler, not a reimplementation of MetricFlow.

Supports simple, unfiltered, single-measure metrics with identifier expressions.
Anything that might change the metric's meaning fails closed.
"""

import re
from typing import Protocol

from semtrail.catalog import Catalog
from semtrail.errors import SemtrailError, Unsupported
from semtrail.policy import Policy
from semtrail.query import Aggregate, CompiledQuery, ExploreQuery, MetricQuery, compile_explore


class MetricCompiler(Protocol):
    def discover(self) -> list[dict]: ...

    def compile(self, query: MetricQuery, dialect: str, max_rows: int) -> CompiledQuery: ...


class SimpleMetricCompiler:
    def __init__(self, catalog: Catalog, policy: Policy):
        self.catalog, self.policy = catalog, policy

    def _resolve(self, metric_name: str):
        metrics = [
            m for m in self.catalog.semantic.get("metrics", []) if m.get("name") == metric_name
        ]
        if len(metrics) != 1:
            raise Unsupported("Metric is unavailable or ambiguous.")
        metric = metrics[0]
        if metric.get("type") != "simple" or metric.get("filter"):
            raise Unsupported("MVP supports unfiltered simple metrics only.")
        params = metric.get("type_params", {})
        measure_ref = params.get("measure")
        if not isinstance(measure_ref, dict) or not measure_ref.get("name"):
            raise Unsupported("Expected a simple metric with one measure.")
        for ref in [measure_ref, *params.get("input_measures", [])]:
            if not isinstance(ref, dict) or ref.get("name") != measure_ref["name"]:
                raise Unsupported("Input measures must match the metric's single measure.")
            for key, value in ref.items():
                if key in {"name", "alias"} or value is None:
                    continue
                if key == "join_to_timespine" and value is False:
                    continue
                raise Unsupported(f"Unsupported measure option: {key}.")
        for key, value in params.items():
            if key not in {"measure", "input_measures"} and value not in (None, [], {}):
                raise Unsupported(f"Unsupported metric option: {key}.")
        matches = []
        for semantic in self.catalog.semantic.get("semantic_models", []):
            for measure in semantic.get("measures", []):
                if measure.get("name") == measure_ref["name"]:
                    matches.append((semantic, measure))
        if len(matches) != 1:
            raise Unsupported("Metric measure must resolve to exactly one semantic model.")
        semantic, measure = matches[0]
        node = semantic.get("node_relation", {})
        candidates = [
            m
            for m in self.policy.models.values()
            if (m.database, m.schema, m.identifier)
            == (node.get("database"), node.get("schema_name"), node.get("alias"))
        ]
        if len(candidates) != 1:
            raise Unsupported("Metric is unavailable under this agent's tag policy.")
        model = self.policy.require(candidates[0].id)
        if measure.get("non_additive_dimension") or measure.get("filter"):
            raise Unsupported("Non-additive or filtered measures require a different compiler.")
        if measure.get("agg_time_dimension") and measure.get("agg") in {"cumulative", "percentile"}:
            raise Unsupported("Unsupported aggregation.")
        operation = measure.get("agg")
        if operation not in {"count", "count_distinct", "sum", "average", "min", "max"}:
            raise Unsupported("Unsupported measure aggregation.")
        expression = str(measure.get("expr", measure.get("name", "")))
        if operation == "count" and expression == "1":
            column = None
        elif re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", expression) and expression in model.columns:
            column = expression
        else:
            raise Unsupported("Measure expressions must be a declared column, or 1 for count.")
        return metric, semantic, model, operation, column

    def discover(self) -> list[dict]:
        available = []
        for metric in self.catalog.semantic.get("metrics", []):
            try:
                item, semantic, model, _, _ = self._resolve(metric["name"])
            except SemtrailError:
                continue
            dimensions = []
            for dimension in semantic.get("dimensions", []):
                expr = dimension.get("expr") or dimension.get("name")
                if dimension.get("type") == "categorical" and expr in model.columns:
                    dimensions.append(
                        {"name": dimension["name"], "description": dimension.get("description", "")}
                    )
            available.append(
                {
                    "name": item["name"],
                    "description": item.get("description", ""),
                    "model_id": model.id,
                    "dimensions": dimensions,
                }
            )
        return available

    def compile(self, query: MetricQuery, dialect: str, max_rows: int):
        metric, semantic, model, operation, column = self._resolve(query.metric)
        if len(query.group_by) != len(set(query.group_by)):
            raise Unsupported("Dimensions must be unique.")
        dimensions = {d["name"]: d for d in semantic.get("dimensions", [])}
        columns = []
        for name in query.group_by:
            dimension = dimensions.get(name)
            if not dimension or dimension.get("type") != "categorical":
                raise Unsupported("Only declared categorical dimensions are supported.")
            columns.append(dimension.get("expr") or dimension["name"])
        compiled = compile_explore(
            ExploreQuery(
                model_id=model.id,
                columns=columns,
                limit=query.limit,
                aggregates=[
                    Aggregate(
                        op="avg" if operation == "average" else operation,
                        column=column,
                        alias=metric["name"],
                    )
                ],
            ),
            self.policy,
            dialect,
            max_rows,
        )
        return CompiledQuery(
            compiled.sql,
            compiled.parameters,
            compiled.models,
            "dbt_metric",
            f"{metric['name']}: {metric.get('description', '')}",
        )
