import argparse
import json
import os
import sys
from pathlib import Path

from pydantic import ValidationError

from semtrail.agent import DataAgent
from semtrail.catalog import Catalog
from semtrail.config import AgentConfig
from semtrail.demo import DemoModel, create_demo
from semtrail.errors import SemtrailError
from semtrail.evidence import EvidenceStore
from semtrail.policy import Policy
from semtrail.providers import create_model
from semtrail.semantics import SimpleMetricCompiler


def main():
    parser = argparse.ArgumentParser(prog="semtrail", description="dbt-grounded data agents")
    sub = parser.add_subparsers(dest="command", required=True)
    demo = sub.add_parser("demo", help="Run a real SQL investigation with an offline fixture model")
    demo.add_argument("--directory", type=Path, default=Path(".semtrail/demo"))
    demo.add_argument("--agent", choices=["revenue", "customers"], default="revenue")
    init = sub.add_parser("init-demo", help="Create demo data and editable agent files")
    init.add_argument("directory", type=Path)
    ask = sub.add_parser("ask", help="Ask a live LLM-backed domain agent")
    ask.add_argument("--agent", type=Path, required=True)
    ask.add_argument("question")
    catalog = sub.add_parser("catalog", help="Inspect effective model access and supported metrics")
    catalog.add_argument("--agent", type=Path, required=True)
    runs = sub.add_parser("runs", help="List local saved runs")
    runs.add_argument("--directory", type=Path, default=Path(".semtrail"))
    inspect = sub.add_parser("inspect", help="Print an entire run, including SQL and results")
    inspect.add_argument("run_id")
    inspect.add_argument("--directory", type=Path, default=Path(".semtrail"))
    serve = sub.add_parser("serve", help="Run the React workspace and HTTP API")
    serve.add_argument("--agents", type=Path, default=Path(".semtrail/workspace"))
    serve.add_argument(
        "--demo", action="store_true", help="Use explicitly labeled offline fixtures"
    )
    serve.add_argument("--host", default="127.0.0.1")
    serve.add_argument("--port", type=int, default=8000)
    serve.add_argument("--allowed-host", action="append", default=[])
    mcp = sub.add_parser("mcp", help="Expose configured domain agents through stdio MCP")
    mcp.add_argument("--agents", type=Path, required=True)
    mcp.add_argument("--demo", action="store_true")
    args = parser.parse_args()
    try:
        if args.command in {"serve", "mcp"}:
            from semtrail.service import AgentService

            if args.demo and not (args.agents / "manifest.json").exists():
                create_demo(args.agents.resolve())
            service = AgentService(args.agents, demo=args.demo)
            if args.command == "mcp":
                from semtrail.mcp_server import create_mcp

                create_mcp(service).run(transport="stdio")
            else:
                import uvicorn

                from semtrail.server import create_app

                token = os.environ.get("SEMTRAIL_SERVER_TOKEN")
                if args.host not in {"127.0.0.1", "localhost"} and not token:
                    raise SemtrailError(
                        "Set SEMTRAIL_SERVER_TOKEN before binding a remote interface."
                    )
                allowed_hosts = ["localhost", "127.0.0.1", *args.allowed_host]
                uvicorn.run(
                    create_app(service, token=token, allowed_hosts=allowed_hosts),
                    host=args.host,
                    port=args.port,
                )
            return
        elif args.command in {"demo", "init-demo"}:
            configs = create_demo(args.directory.resolve())
            if args.command == "init-demo":
                print(json.dumps({name: str(path) for name, path in configs.items()}, indent=2))
                return
            config = AgentConfig.load(configs[args.agent])
            question = (
                "Show completed revenue by country and the total completed order count."
                if args.agent == "revenue"
                else "Show customer counts by segment and the total."
            )
            output = DataAgent(config, DemoModel(args.agent)).run(question)
        elif args.command == "ask":
            config = AgentConfig.load(args.agent)
            output = DataAgent(config, create_model(config.llm)).run(args.question)
        elif args.command == "catalog":
            config = AgentConfig.load(args.agent)
            catalog = Catalog(
                Path(config.manifest),
                Path(config.semantic_manifest) if config.semantic_manifest else None,
            )
            policy = Policy(catalog, config.policy)
            output = {
                "models": policy.discover(),
                "metrics": SimpleMetricCompiler(catalog, policy).discover(),
            }
        elif args.command == "runs":
            output = EvidenceStore(args.directory).list()
        else:
            output = EvidenceStore(args.directory).load(args.run_id)
        print(json.dumps(output, indent=2, ensure_ascii=False))
    except (SemtrailError, ValueError, OSError, ImportError, ValidationError) as exc:
        print(f"semtrail: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
