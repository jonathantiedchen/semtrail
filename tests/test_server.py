from pathlib import Path

import pytest

pytest.importorskip("fastapi")
from fastapi.testclient import TestClient

from semtrail.server import create_app
from semtrail.service import DEMO_QUESTIONS, AgentService


@pytest.fixture
def service(demo):
    return AgentService(Path(demo[0].manifest).parent, demo=True)


def test_http_investigation_catalog_and_history(service):
    with TestClient(create_app(service), base_url="http://localhost") as client:
        agents = client.get("/api/agents").json()
        assert {a["id"] for a in agents} == {"revenue", "customers", "orchestrator"}
        catalog = client.get("/api/agents/revenue/catalog").json()
        assert "payroll" not in str(catalog)
        response = client.post(
            "/api/agents/revenue/investigations", json={"question": DEMO_QUESTIONS["revenue"]}
        )
        assert response.status_code == 200, response.text
        run = response.json()
        assert run["answer"]["status"] == "answered"
        history = client.get("/api/runs").json()
        assert len(history) == 1 and history[0]["agent_id"] == "revenue"
        assert client.get(f"/api/agents/revenue/runs/{run['run_id']}").json() == run
        assert client.get(f"/api/agents/customers/runs/{run['run_id']}").status_code == 404
        assert client.get("/api/agents/unknown/catalog").status_code == 404
        assert client.get("/api/health").json()["mode"] == "demo"


def test_server_token_origin_and_body_boundary(service):
    with TestClient(create_app(service, token="test-token"), base_url="http://localhost") as client:
        assert client.get("/api/agents").status_code == 401
        headers = {"Authorization": "Bearer test-token"}
        assert client.get("/api/agents", headers=headers).status_code == 200
        assert (
            client.post(
                "/api/agents/revenue/investigations",
                headers={**headers, "Origin": "https://evil.example"},
                json={"question": "test"},
            ).status_code
            == 403
        )
        assert (
            client.post(
                "/api/agents/revenue/investigations", headers=headers, content="question=test"
            ).status_code
            == 415
        )
        assert (
            client.post(
                "/api/agents/revenue/investigations",
                headers=headers,
                json={"question": "x" * 50001},
            ).status_code
            == 413
        )
        assert (
            client.get("/api/agents", headers={**headers, "Host": "evil.example"}).status_code
            == 400
        )


def test_demo_does_not_claim_to_answer_arbitrary_questions(service):
    with TestClient(create_app(service), base_url="http://localhost") as client:
        result = client.post(
            "/api/agents/revenue/investigations", json={"question": "Why did churn rise?"}
        )
        assert result.status_code == 400
        assert "example question" in result.json()["detail"]


def test_chat_context_references_only_runs_from_same_agent(service):
    with TestClient(create_app(service), base_url="http://localhost") as client:
        first = client.post(
            "/api/agents/revenue/investigations", json={"question": DEMO_QUESTIONS["revenue"]}
        ).json()
        second = client.post(
            "/api/agents/revenue/investigations",
            json={"question": DEMO_QUESTIONS["revenue"], "previous_run_ids": [first["run_id"]]},
        )
        assert second.status_code == 200
        assert second.json()["previous_run_ids"] == [first["run_id"]]
        denied = client.post(
            "/api/agents/customers/investigations",
            json={"question": DEMO_QUESTIONS["customers"], "previous_run_ids": [first["run_id"]]},
        )
        assert denied.status_code == 404
