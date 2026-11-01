"""Stdio MCP bridge for local AI clients. All data access uses the same agent boundary."""

from semtrail.service import AgentService


def create_mcp(service: AgentService):
    from mcp.server.fastmcp import FastMCP

    server = FastMCP("Semtrail")

    @server.tool()
    def list_agents() -> list[dict]:
        """List configured domain agents, their scopes and available question modes."""
        return service.list_agents()

    @server.tool()
    def get_catalog(agent_id: str) -> dict:
        """Discover models and business metrics permitted to a configured domain agent."""
        return service.catalog(agent_id)

    @server.tool()
    def investigate(agent_id: str, question: str) -> dict:
        """Ask a domain agent a question; returns an explanation and actual query evidence."""
        return service.investigate(agent_id, question)

    @server.tool()
    def get_run(agent_id: str, run_id: str) -> dict:
        """Read saved supporting SQL and results for one domain agent investigation."""
        return service.run(agent_id, run_id)

    return server
