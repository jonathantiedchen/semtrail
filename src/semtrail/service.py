"""Shared application service for the CLI, HTTP UI and MCP clients."""

import os
import re
from pathlib import Path
from threading import BoundedSemaphore

from semtrail.agent import DataAgent
from semtrail.catalog import Catalog
from semtrail.config import AgentConfig
from semtrail.demo import DemoModel
from semtrail.errors import SemtrailError
from semtrail.evidence import EvidenceStore
from semtrail.policy import Policy
from semtrail.providers import create_model
from semtrail.semantics import SimpleMetricCompiler

DEMO_QUESTIONS = {
    "revenue": "Show completed revenue by country and the total completed order count.",
    "customers": "Show customer counts by segment and the total.",
}


class AgentService:
    def __init__(self, directory: Path, *, demo: bool = False):
        self.directory = directory.resolve()
        self.demo = demo
        self.slots = BoundedSemaphore(2)

    def configs(self) -> dict[str, AgentConfig]:
        result = {}
        for file in sorted(self.directory.glob("*.yml")):
            if re.fullmatch(r"[A-Za-z0-9_-]+", file.stem):
                result[file.stem] = AgentConfig.load(file)
        return result

    def config(self, agent_id: str) -> AgentConfig:
        config = self.configs().get(agent_id)
        if not config:
            raise KeyError("Unknown agent.")
        return config

    def list_agents(self) -> list[dict]:
        agents = []
        for agent_id, config in self.configs().items():
            catalog = self.catalog(agent_id)
            ready = self.demo or bool(
                os.environ.get(config.llm.api_key_env)
                and config.llm.model
                and config.llm.model != "YOUR_MODEL"
            )
            agents.append(
                {
                    "id": agent_id,
                    "name": config.name,
                    "instructions": config.instructions,
                    "policy": config.policy.model_dump(),
                    "provider": config.llm.provider,
                    "model": config.llm.model,
                    "warehouse": config.warehouse.type,
                    "model_count": len(catalog["models"]),
                    "metric_count": len(catalog["metrics"]),
                    "ready": ready,
                    "demo_question": DEMO_QUESTIONS.get(agent_id) if self.demo else None,
                    "max_queries": config.max_queries,
                    "max_steps": config.max_steps,
                }
            )
        return agents

    def catalog(self, agent_id: str) -> dict:
        config = self.config(agent_id)
        catalog = Catalog(
            Path(config.manifest),
            Path(config.semantic_manifest) if config.semantic_manifest else None,
        )
        policy = Policy(catalog, config.policy)
        return {
            "models": policy.discover(),
            "metrics": SimpleMetricCompiler(catalog, policy).discover(),
            "artifact_sha256": catalog.fingerprint,
        }

    def investigate(
        self, agent_id: str, question: str, *, previous_run_ids: list[str] | None = None
    ) -> dict:
        config = self.config(agent_id)
        previous_run_ids = previous_run_ids or []
        if len(previous_run_ids) > 6:
            raise SemtrailError("A chat can reference at most six recent responses.")
        context = [self.run(agent_id, run_id) for run_id in previous_run_ids]
        if self.demo:
            if question != DEMO_QUESTIONS.get(agent_id):
                raise SemtrailError(
                    "Offline demo only supports the displayed example question. "
                    "Configure a live provider to ask arbitrary questions."
                )
            model = DemoModel(agent_id)
        else:
            model = create_model(config.llm)
        if not self.slots.acquire(blocking=False):
            raise SemtrailError("Two investigations are already running. Try again shortly.")
        try:
            return DataAgent(config, model).run(question, context=context)
        finally:
            self.slots.release()

    def runs(self) -> list[dict]:
        runs = []
        for agent_id, config in self.configs().items():
            runs.extend(
                {**item, "agent_id": agent_id}
                for item in EvidenceStore(Path(config.evidence_dir)).list()
            )
        # Multiple configs may intentionally share one store; expose each run once.
        unique = {item["run_id"]: item for item in runs}
        # Resolve display identity from run.agent rather than shared store location.
        names = {config.name: agent_id for agent_id, config in self.configs().items()}
        return sorted(
            [
                {**item, "agent_id": names.get(item["agent"], item["agent_id"])}
                for item in unique.values()
            ],
            key=lambda item: item["created_at"],
            reverse=True,
        )[:100]

    def run(self, agent_id: str, run_id: str) -> dict:
        config = self.config(agent_id)
        run = EvidenceStore(Path(config.evidence_dir)).load(run_id)
        if run["agent"] != config.name:
            raise KeyError("Run does not belong to this agent.")
        return run
