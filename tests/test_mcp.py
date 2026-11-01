import asyncio
import sys
from pathlib import Path

import pytest

pytest.importorskip("mcp")
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

from semtrail.service import DEMO_QUESTIONS


def test_stdio_mcp_real_client_can_discover_and_investigate(demo):
    async def exercise():
        parameters = StdioServerParameters(
            command=sys.executable,
            args=[
                "-m",
                "semtrail.cli",
                "mcp",
                "--demo",
                "--agents",
                str(Path(demo[0].manifest).parent),
            ],
        )
        async with stdio_client(parameters) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                tools = await session.list_tools()
                assert {tool.name for tool in tools.tools} == {
                    "list_agents",
                    "get_catalog",
                    "investigate",
                    "get_run",
                }
                catalog = await session.call_tool("get_catalog", {"agent_id": "revenue"})
                assert not catalog.isError
                assert "payroll" not in str(catalog.content)
                run = await session.call_tool(
                    "investigate", {"agent_id": "revenue", "question": DEMO_QUESTIONS["revenue"]}
                )
                assert not run.isError
                assert "q1" in str(run.content) and "answered" in str(run.content)

    asyncio.run(exercise())
