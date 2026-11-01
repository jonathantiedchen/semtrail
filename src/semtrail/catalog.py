"""Immutable per-run snapshots; never render Jinja or execute a dbt repository."""

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path

from semtrail.errors import Unsupported


@dataclass(frozen=True)
class Model:
    id: str
    name: str
    description: str
    tags: frozenset[str]
    database: str | None
    schema: str
    identifier: str
    columns: dict

    def public(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "tags": sorted(self.tags),
            "columns": self.columns,
        }


class Catalog:
    def __init__(self, manifest: Path, semantic_manifest: Path | None = None):
        raw = manifest.read_bytes()
        data = json.loads(raw)
        version = data.get("metadata", {}).get("dbt_schema_version", "")
        if version.rsplit("/", 1)[-1] not in {"v12.json"}:
            raise Unsupported("Expected dbt manifest v12; regenerate with a supported dbt version.")
        self.models = {}
        relations = set()
        for key, node in data.get("nodes", {}).items():
            if node.get("resource_type") != "model":
                continue
            if node.get("config", {}).get("materialized") == "ephemeral":
                continue
            if node.get("config", {}).get("enabled", True) is False:
                continue
            model = Model(
                key,
                node["name"],
                node.get("description", ""),
                frozenset(node.get("tags", [])),
                node.get("database"),
                node["schema"],
                node.get("alias") or node["name"],
                {
                    name: {
                        "name": name,
                        "description": column.get("description", ""),
                        "data_type": column.get("data_type"),
                    }
                    for name, column in node.get("columns", {}).items()
                },
            )
            relation = (model.database, model.schema, model.identifier)
            if relation in relations:
                raise Unsupported("Multiple model IDs resolve to one relation; fix the manifest.")
            relations.add(relation)
            self.models[key] = model
        self.semantic = {"semantic_models": [], "metrics": []}
        if semantic_manifest:
            semantic_raw = semantic_manifest.read_bytes()
            self.semantic = json.loads(semantic_raw)
            if not isinstance(self.semantic.get("semantic_models"), list):
                raise Unsupported("Expected semantic_models list in semantic manifest.")
            raw += semantic_raw
        self.fingerprint = hashlib.sha256(raw).hexdigest()
        self.manifest_path = manifest.resolve()
        self.semantic_path = semantic_manifest.resolve() if semantic_manifest else None
