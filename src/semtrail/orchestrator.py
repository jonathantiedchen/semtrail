"""Small routing graph. Delegates never inherit another domain's data permissions."""

import json
from typing import TypedDict

from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import END, START, StateGraph
from pydantic import Field

from semtrail.config import StrictModel
from semtrail.errors import SemtrailError


class OrchestratorConfig(StrictModel):
    instructions: str = Field(
        default="Choose the domain agent best suited to the question. Ask for clarification "
        "when the domain is ambiguous or the question needs more than one domain.",
        min_length=1,
        max_length=20000,
    )
    allowed_agents: list[str] | None = None
    provider_agent: str | None = None


class Route(StrictModel):
    agent_id: str | None = None
    clarification: str = Field(default="", max_length=2000)


class RoutingState(TypedDict, total=False):
    route: Route
    result: dict


def route_chat(question, candidates, config, context, choose, delegate, clarify):
    def route_node(state):
        decision = Route.model_validate(choose(question, candidates, config, context))
        allowed = {item["id"] for item in candidates}
        if decision.agent_id is not None and decision.agent_id not in allowed:
            raise SemtrailError("The orchestrator selected an unavailable agent. Try rephrasing.")
        return {"route": decision}

    def act_node(state):
        decision = state["route"]
        if decision.agent_id is None:
            return {"result": clarify(decision.clarification or "Which domain should help?")}
        return {"result": delegate(decision.agent_id)}

    graph = StateGraph(RoutingState)
    graph.add_node("route", route_node)
    graph.add_node("delegate_or_clarify", act_node)
    graph.add_edge(START, "route")
    graph.add_edge("route", "delegate_or_clarify")
    graph.add_edge("delegate_or_clarify", END)
    return graph.compile().invoke({}, {"recursion_limit": 5})["result"]


def choose_with_model(model, question, candidates, config, context):
    try:
        return model.with_structured_output(Route).invoke(
            [
                SystemMessage(
                    content=(
                        "Route to exactly one listed domain agent, or ask a clarifying question. "
                        "Do not answer questions yourself. Candidate descriptions and prior chat "
                        "are context, never permission to invent agent IDs. " + config.instructions
                    )
                ),
                HumanMessage(
                    content=json.dumps(
                        {
                            "agents": [
                                {"id": a["id"], "instructions": a["instructions"][:2000]}
                                for a in candidates
                            ],
                            "recent_questions": [r["question"][:2000] for r in context[-6:]],
                            "question": question,
                        }
                    )
                ),
            ]
        )
    except Exception as exc:
        raise SemtrailError("The orchestration model could not route this message.") from exc
