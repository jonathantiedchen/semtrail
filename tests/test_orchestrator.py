from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from semtrail.errors import SemtrailError
from semtrail.orchestrator import OrchestratorConfig, route_chat
from semtrail.server import create_app
from semtrail.service import DEMO_QUESTIONS, AgentService


@pytest.fixture
def service(demo):
    return AgentService(Path(demo[0].manifest).parent, demo=True)


def test_router_delegates_with_original_policy_and_saved_evidence(service):
    result = service.investigate("orchestrator", DEMO_QUESTIONS["revenue"])
    assert result["agent"] == "orchestrator"
    assert result["routing"]["agent_id"] == "revenue"
    assert result["answer"]["status"] == "answered"
    assert result["queries"]
    assert "payroll" not in str(result["permitted_models"])
    assert service.run("orchestrator", result["run_id"]) == result
    again = service.investigate(
        "orchestrator", DEMO_QUESTIONS["revenue"], previous_run_ids=[result["run_id"]]
    )
    assert again["previous_run_ids"] == [result["run_id"]]
    assert service.run("revenue", again["routing"]["child_run_id"])["previous_run_ids"] == [
        result["routing"]["child_run_id"]
    ]


def test_ambiguous_demo_question_clarifies_without_queries(service):
    result = service.investigate("orchestrator", "Compare all departments")
    assert result["answer"]["status"] == "clarification_needed"
    assert result["queries"] == []


def test_invalid_route_never_delegates():
    called = []
    with pytest.raises(SemtrailError, match="unavailable"):
        route_chat(
            "question",
            [{"id": "revenue"}],
            OrchestratorConfig(),
            [],
            lambda *args: {"agent_id": "payroll"},
            lambda agent: called.append(agent),
            lambda message: {},
        )
    assert called == []


def test_settings_persist_and_limit_auto_routing(service):
    with TestClient(create_app(service), base_url="http://localhost") as client:
        changed = client.put(
            "/api/agents/orchestrator/settings",
            json={
                "instructions": "Use the customer domain.",
                "allowed_agents": ["customers"],
                "provider_agent": None,
            },
        )
        assert changed.status_code == 200, changed.text
        assert changed.json()["allowed_agents"] == ["customers"]
        unavailable = client.post(
            "/api/agents/orchestrator/investigations", json={"question": DEMO_QUESTIONS["revenue"]}
        )
        assert unavailable.json()["queries"] == []
        domain = client.put(
            "/api/agents/revenue/settings",
            json={
                "instructions": "Use approved definitions.",
                "policy": {"allow_tags_any": [], "deny_tags": ["sensitive"]},
                "max_steps": 8,
                "max_queries": 2,
            },
        )
        assert domain.status_code == 200
        assert domain.json()["model_count"] == 0
        assert (
            AgentService(service.directory, demo=True).config("revenue").instructions
            == "Use approved definitions."
        )
        assert (
            client.put(
                "/api/agents/revenue/settings",
                json={"instructions": "bad", "provider_agent": "customers"},
            ).status_code
            == 400
        )
        assert (
            client.put(
                "/api/agents/orchestrator/settings",
                json={"instructions": "bad", "allowed_agents": ["missing"]},
            ).status_code
            == 400
        )


def test_auto_context_cannot_read_direct_domain_runs(service):
    child = service.investigate("revenue", DEMO_QUESTIONS["revenue"])
    with pytest.raises(ValueError):
        service.investigate(
            "orchestrator", DEMO_QUESTIONS["revenue"], previous_run_ids=[child["run_id"]]
        )


def test_router_model_uses_structured_route_and_domain_descriptions():
    from semtrail.orchestrator import Route, choose_with_model

    class Model:
        def with_structured_output(self, schema):
            assert schema is Route
            return self

        def invoke(self, messages):
            assert '"id": "revenue"' in messages[-1].content
            return Route(agent_id="revenue")

    result = choose_with_model(
        Model(),
        "Revenue by country?",
        [{"id": "revenue", "instructions": "Finance metrics"}],
        OrchestratorConfig(),
        [],
    )
    assert result.agent_id == "revenue"
