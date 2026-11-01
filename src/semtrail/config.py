from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class PolicyConfig(StrictModel):
    allow_tags_any: tuple[str, ...] = ()
    deny_tags: tuple[str, ...] = ()


class ProviderConfig(StrictModel):
    provider: Literal["openai", "anthropic"] = "openai"
    model: str = ""
    api_key_env: str = "OPENAI_API_KEY"
    base_url_env: str | None = None
    max_tokens: int = Field(default=2048, ge=128, le=16384)
    timeout_seconds: int = Field(default=60, ge=1, le=300)


class WarehouseConfig(StrictModel):
    type: Literal["duckdb", "postgres"] = "duckdb"
    path: str | None = None
    dsn_env: str = "SEMTRAIL_DATABASE_URL"
    timeout_seconds: int = Field(default=15, ge=1, le=120)
    max_rows: int = Field(default=100, ge=1, le=1000)


class AgentConfig(StrictModel):
    name: str
    instructions: str = Field(min_length=1, max_length=20000)
    manifest: str
    semantic_manifest: str | None = None
    policy: PolicyConfig
    warehouse: WarehouseConfig
    llm: ProviderConfig = ProviderConfig()
    max_steps: int = Field(default=12, ge=2, le=40)
    max_queries: int = Field(default=6, ge=1, le=20)
    evidence_dir: str = ".semtrail"

    @classmethod
    def load(cls, path: Path) -> "AgentConfig":
        path = path.resolve()
        config = cls.model_validate(yaml.safe_load(path.read_text()))
        base = path.parent

        def absolute(value: str | None) -> str | None:
            return str((base / value).resolve()) if value else None

        warehouse = config.warehouse.model_copy(
            update={
                "path": absolute(config.warehouse.path),
            }
        )
        return config.model_copy(
            update={
                "manifest": absolute(config.manifest),
                "semantic_manifest": absolute(config.semantic_manifest),
                "evidence_dir": absolute(config.evidence_dir),
                "warehouse": warehouse,
            }
        )
