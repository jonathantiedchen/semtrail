"""Shared application service for the CLI, HTTP UI and MCP clients."""

import os
import re
from pathlib import Path
from threading import BoundedSemaphore
from uuid import uuid4

import yaml

from semtrail.agent import DataAgent
from semtrail.catalog import Catalog
from semtrail.config import AgentConfig
from semtrail.demo import DemoModel
from semtrail.errors import SemtrailError
from semtrail.evidence import EvidenceStore
from semtrail.orchestrator import OrchestratorConfig, choose_with_model, route_chat
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
            if file.stem in {"_orchestrator", "orchestrator"}:
                continue
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
        orchestration = self.orchestrator_config()
        candidates = [
            a
            for a in agents
            if orchestration.allowed_agents is None or a["id"] in orchestration.allowed_agents
        ]
        return [
            {
                "id": "orchestrator",
                "name": "Auto",
                "kind": "orchestrator",
                "instructions": orchestration.instructions,
                "policy": {"allow_tags_any": [], "deny_tags": []},
                "provider": "routing",
                "model": "",
                "warehouse": "delegated",
                "model_count": 0,
                "metric_count": 0,
                "ready": any(a["ready"] for a in candidates),
                "demo_question": next((a["demo_question"] for a in candidates if a["ready"]), None),
                "max_queries": 0,
                "max_steps": 2,
                "allowed_agents": [a["id"] for a in candidates],
                "provider_agent": orchestration.provider_agent,
            },
            *[{**a, "kind": "domain"} for a in agents],
        ]

    def orchestrator_config(self):
        path = self.directory / "_orchestrator.yml"
        return OrchestratorConfig.model_validate(
            yaml.safe_load(path.read_text()) if path.exists() else {}
        )

    def update_settings(self, agent_id: str, changes: dict) -> dict:
        if agent_id == "orchestrator":
            value = OrchestratorConfig.model_validate(
                {**self.orchestrator_config().model_dump(), **changes}
            )
            known = self.configs()
            if any(a not in known for a in (value.allowed_agents or [])) or (
                value.provider_agent and value.provider_agent not in known
            ):
                raise SemtrailError("Settings reference an unknown domain agent.")
            if (
                value.provider_agent
                and value.allowed_agents is not None
                and value.provider_agent not in value.allowed_agents
            ):
                raise SemtrailError("The routing model must use an enabled domain agent.")
            data = value.model_dump()
            path = self.directory / "_orchestrator.yml"
        else:
            self.config(agent_id)
            path = self.directory / f"{agent_id}.yml"
            data = yaml.safe_load(path.read_text())
            allowed = {"instructions", "policy", "max_queries", "max_steps"}
            if set(changes) - allowed:
                raise SemtrailError(
                    "Only instructions, tag policy and budgets can be changed here."
                )
            data.update(changes)
            AgentConfig.model_validate(data)
        temporary = path.with_name(f".{path.name}.{uuid4().hex}.tmp")
        try:
            temporary.write_text(yaml.safe_dump(data, sort_keys=False))
            temporary.chmod(0o600)
            temporary.replace(path)
        finally:
            temporary.unlink(missing_ok=True)
        return next(a for a in self.list_agents() if a["id"] == agent_id)

    def orchestration_store(self):
        return EvidenceStore(self.directory / ".semtrail-orchestrator")

    def orchestrate(self, question, previous_run_ids):
        if not question.strip() or len(question) > 10000 or len(previous_run_ids) > 6:
            raise SemtrailError("Invalid chat message or context limit.")
        config = self.orchestrator_config()
        candidates = [
            a
            for a in self.list_agents()
            if a["id"] != "orchestrator"
            and a["ready"]
            and (config.allowed_agents is None or a["id"] in config.allowed_agents)
        ]
        context = [self.run("orchestrator", rid) for rid in previous_run_ids]
        if not candidates:
            raise SemtrailError("No enabled domain agent is ready. Check Settings.")

        def choose(question, candidates, config, context):
            if self.demo:
                target = next(
                    (a["id"] for a in candidates if DEMO_QUESTIONS.get(a["id"]) == question), None
                )
                return {
                    "agent_id": target,
                    "clarification": (
                        "Choose a domain example question, or configure a live model in Settings."
                    ),
                }
            provider = config.provider_agent or candidates[0]["id"]
            if provider not in {a["id"] for a in candidates}:
                raise SemtrailError("The routing provider agent must be enabled and ready.")
            return choose_with_model(
                create_model(self.config(provider).llm), question, candidates, config, context
            )

        def delegate(agent_id):
            prior = [
                r["routing"]["child_run_id"]
                for r in context
                if r.get("routing", {}).get("agent_id") == agent_id
            ]
            child = self.investigate(agent_id, question, previous_run_ids=prior, _delegated=True)
            return {
                **child,
                "run_id": uuid4().hex,
                "agent": "orchestrator",
                "previous_run_ids": previous_run_ids,
                "routing": {"agent_id": agent_id, "child_run_id": child["run_id"]},
                "actions": [
                    {"tool": "route_to_agent", "status": "ok", "agent_id": agent_id},
                    *child["actions"],
                ],
            }

        def clarify(message):
            return {
                "run_id": uuid4().hex,
                "agent": "orchestrator",
                "question": question,
                "previous_run_ids": previous_run_ids,
                "artifact_sha256": "",
                "permitted_models": [],
                "queries": [],
                "actions": [{"tool": "clarify", "status": "ok"}],
                "answer": {
                    "status": "clarification_needed",
                    "explanation": message,
                    "query_ids": [],
                    "definitions": [],
                    "limitations": [],
                },
            }

        if not self.slots.acquire(blocking=False):
            raise SemtrailError("Two chats are already running. Try again shortly.")
        try:
            result = route_chat(question, candidates, config, context, choose, delegate, clarify)
            self.orchestration_store().save(result)
            return result
        finally:
            self.slots.release()

    def catalog(self, agent_id: str) -> dict:
        if agent_id == "orchestrator":
            return {
                "models": [],
                "metrics": [],
                "artifact_sha256": "",
                "domains": self.list_agents()[0]["allowed_agents"],
            }
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
        self,
        agent_id: str,
        question: str,
        *,
        previous_run_ids: list[str] | None = None,
        _delegated: bool = False,
    ) -> dict:
        if agent_id == "orchestrator":
            return self.orchestrate(question, previous_run_ids or [])
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
        if not _delegated and not self.slots.acquire(blocking=False):
            raise SemtrailError("Two investigations are already running. Try again shortly.")
        try:
            return DataAgent(config, model).run(question, context=context)
        finally:
            if not _delegated:
                self.slots.release()

    def runs(self) -> list[dict]:
        runs = []
        for agent_id, config in self.configs().items():
            runs.extend(
                {**item, "agent_id": agent_id}
                for item in EvidenceStore(Path(config.evidence_dir)).list()
            )
        store = self.orchestration_store()
        orchestration_history = store.list()
        delegated_ids = {
            store.load(r["run_id"]).get("routing", {}).get("child_run_id")
            for r in orchestration_history
        }
        runs = [r for r in runs if r["run_id"] not in delegated_ids]
        runs.extend({**r, "agent_id": "orchestrator"} for r in orchestration_history)
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
        if agent_id == "orchestrator":
            result = self.orchestration_store().load(run_id)
            if result["agent"] != "orchestrator":
                raise KeyError("Unknown chat.")
            return result
        config = self.config(agent_id)
        run = EvidenceStore(Path(config.evidence_dir)).load(run_id)
        if run["agent"] != config.name:
            raise KeyError("Run does not belong to this agent.")
        return run
