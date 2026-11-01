# Semtrail

Self-hosted data agents grounded in dbt semantics and metadata. Python + LangGraph,
your compute, your database, your LLM API keys. Apache-2.0.

**Status: working early MVP.** The repository includes a real investigation loop,
two domain agents, enforced model access, PostgreSQL and DuckDB execution, and local
query evidence. No hosted control plane, account, telemetry or tracing service required.

[React workspace](#react-workspace) · [Connect dbt](#connect-your-dbt-repository-and-database) ·
[API & MCP](#api-and-mcp-interoperability) · [Roadmap](ROADMAP.md)

## Quick start

Python 3.11–3.13:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
semtrail demo
semtrail demo --agent customers --directory .semtrail/customer-demo
```

The offline demos use a **deterministic fixture model**, clearly labeled in the
answer. They execute the real LangGraph, policy, semantic compiler and database
tools, and store actual SQL and results. They demonstrate two fixed investigations;
they do not answer arbitrary questions or require an API key.

The revenue demo returns DE 200, GB 150 and US 350 USD across five completed orders.
Customer counts are business 1 and consumer 2. A payroll table exists but is excluded
by policy, even though it carries the finance tag.

## Ask arbitrary questions with your own LLM

See the React workspace and API sections below for browser and integration workflows.

```bash
pip install -e '.[openai]'
semtrail init-demo .semtrail/live-demo
# Edit .semtrail/live-demo/revenue.yml: set llm.model to your model identifier.
export OPENAI_API_KEY=your-key
semtrail ask --agent .semtrail/live-demo/revenue.yml \
  'Compare revenue by country. Which countries account for most revenue?'
```

For Anthropic install `.[anthropic]`, set `llm.provider: anthropic`,
`llm.api_key_env: ANTHROPIC_API_KEY`, and a model identifier, then export that key.
For an OpenAI-compatible provider, set `llm.base_url_env: SEMTRAIL_LLM_BASE_URL`
and export its API URL and API key. The endpoint must support LangChain's tool-calling
contract. Provider-specific model names are configuration, not hardcoded defaults.

Metadata, your question, and bounded query results are sent to your selected provider.
Secrets are read from environment variables; do not put them in agent YAML or Git.
External tracing is not enabled by Semtrail. If you enable LangChain tracing through
environment variables, that service may receive these inputs and results too.

## Connect your dbt repository and database

Clone or mount your repository using your existing Git authentication. Generate fresh
artifacts in the **trusted repository's own dbt environment** (`dbt parse`, and
`dbt docs generate` if needed). Semtrail only reads artifacts; it never runs dbt,
Jinja, hooks, or repository code. Build the dbt models separately before querying.

See [`examples/postgres-agent.yml`](examples/postgres-agent.yml) for a full configuration:

```yaml
name: revenue
instructions: |
  Investigate revenue using defined metrics. State grain and currency.
  Distinguish observed changes from causal explanations.
manifest: /srv/dbt/target/manifest.json
semantic_manifest: /srv/dbt/target/semantic_manifest.json
policy:
  allow_tags_any: [finance]
  deny_tags: [sensitive]
warehouse:
  type: postgres
  dsn_env: SEMTRAIL_REVENUE_DATABASE_URL
  timeout_seconds: 15
  max_rows: 100
llm:
  provider: openai
  model: YOUR_MODEL
  api_key_env: OPENAI_API_KEY
max_steps: 12
max_queries: 6
evidence_dir: /var/lib/semtrail/revenue
```

```bash
pip install -e '.[postgres,openai]'
export SEMTRAIL_REVENUE_DATABASE_URL='postgresql://revenue_reader:password@host/analytics'
semtrail catalog --agent /srv/agents/revenue.yml
semtrail ask --agent /srv/agents/revenue.yml 'What is revenue by country?'
```

All file paths in configuration resolve relative to the YAML file. Refresh artifacts
explicitly after dbt changes; each new `DataAgent` loads an immutable snapshot and
records its SHA-256 hash. Recreate long-lived `DataAgent` objects to pick up updates.
The optional semantic manifest may be omitted for metadata-grounded exploration.

## What the agent actually does

`discover` → `describe` → `query_metric` / `query_model` → investigate further → `finish`.
The LLM chooses actions; the graph dispatches them through deterministic policy and
query compilation. Both domain agents use the implemented reusable `DataAgent`.
Instructions and data scope are editable independently. Query and turn budgets prevent
unbounded loops; provider calls and database queries have timeouts.

The provider must support tool calling. No arbitrary SQL, Python, shell, or external
network tool is available to the agent. Structured model queries support selections,
categorical grouping, basic aggregates, comparisons and sorting. Field values use
bound parameters. An answer must cite at least one successful query ID; the citation
check verifies existence, **not** that every natural-language claim is true.

## Supported dbt semantics

- `manifest.json` schema **v12** (dbt Core 1.9/1.10 artifact shape).
- Parsed effective model tags, column descriptions, physical relation identities.
- Materialized dbt models only; sources, seeds, snapshots and ephemeral models are not
  directly queryable. They can be upstream of a permitted materialized model.
- Semantic manifests with `semantic_models`, `node_relation`, `measures`, and `metrics`.
- **Simple, unfiltered, single-measure metrics**: sum, average, min, max, count and
  count_distinct. Expressions must reference one declared column; count also allows `1`.
- Declared categorical dimensions on the same semantic model.

Filters in metric definitions, derived/ratio/cumulative metrics, non-additive dimensions,
time grains, joins and arbitrary measure SQL are rejected, never approximated.
Only supported, permitted metrics are advertised to the agent. Do not assume a name
such as "revenue" has a universal formula; define its meaning in dbt.

The built-in compiler is a deliberately small alternative to installing MetricFlow in
the core runtime. The `MetricCompiler` protocol is the extension point; **a MetricFlow
adapter is not included in this release**. This is narrower than the initial design
proposal, keeping the implemented subset explicit and testable.

## Access boundary

Tags become a physical relation allowlist. At least one allow tag must match; a deny
tag always wins. No allow tags means no access. There is no automatic upstream grant.
Discovery omits forbidden resources. Every execution revalidates the SQL AST against
the allowlist and permits one SELECT over one fully qualified model relation, with a
small function allowlist. CTEs, joins, set operations, writes and table functions fail.
This gate is defense in depth for trusted compilers, **not a general SQL sandbox**.

Use a separate read-only database role per agent, granted only its allowed relations;
see [`docs/security.md`](docs/security.md). PostgreSQL queries run in read-only
transactions with an explicit search path and statement timeout. DuckDB opens read-only
with external access disabled. DuckDB has no per-agent relation ACL, so the app gate is
the model boundary; use separate database files for stronger demo isolation.

Permitting a view permits the data it exposes, including upstream data inside that view.
Tags restrict models, not rows or columns. Apply row/column policies in the database.
Local operators, configuration, artifact authors and installed compiler/provider code
are trusted. This is a single-operator tool, not a multi-user authorization service.

## Inspect evidence

The command prints the complete run as JSON. Query IDs connect the explanation to
executed SQL, parameters, result rows, definitions and timing. The run also records
effective policy, permitted model IDs and artifact hash.

```bash
semtrail runs --directory .semtrail/demo/runs
semtrail inspect RUN_ID --directory .semtrail/demo/runs
```

Runs are stored in SQLite with restricted filesystem permissions. They contain potentially
sensitive questions, SQL parameters and results. Keep the directory private and delete it
according to your retention policy. Results are bounded and marked if truncated. Semtrail
does not store hidden reasoning, credentials or raw provider error messages.

## Python API

```python
from pathlib import Path
from semtrail.agent import DataAgent
from semtrail.config import AgentConfig
from semtrail.providers import create_model

config = AgentConfig.load(Path("/srv/agents/revenue.yml"))
agent = DataAgent(config, create_model(config.llm))
run = agent.run("Compare revenue by country.")
print(run["answer"])
```

Swap a LangChain-compatible tool-calling model, a `Warehouse`, or a `MetricCompiler`
without changing the investigation graph. Metadata/policy, query compilation,
execution, providers and evidence are separate small modules.

## Development

```bash
pip install -e '.[dev,server,mcp,postgres,openai,anthropic]'
pytest
ruff check .
python -m build
```

PostgreSQL integration tests need `SEMTRAIL_TEST_POSTGRES_DSN` for a disposable test
database. CI runs them against PostgreSQL 16. Default tests use real DuckDB and a
scripted tool-calling model; they don't spend LLM API credits. Live provider smoke tests
require your own credentials and aren't represented as passing by offline tests.

See [`docs/design.md`](docs/design.md) for architecture, boundaries and deferred work.

## React workspace

The UI uses **React, TypeScript and Tailwind CSS**. It includes an investigation
workspace, domain-agent selection, a dbt semantic catalog, query/results inspection,
run history and JSON evidence export. All data comes from the Python API.

```bash
pip install -e '.[server]'
cd ui
npm ci
npm run build
cd ..
semtrail serve --demo
```

Open `http://127.0.0.1:8000`. The server creates demo files once in
`.semtrail/workspace`; later starts preserve the data and history. To ask arbitrary
questions, configure live agent YAML files and run `semtrail serve --agents /srv/agents`
without `--demo`. An empty agent directory shows an explicit empty state.

For frontend development, run the Python server and `npm run dev` in `ui/`; Vite proxies
API requests to port 8000. Production builds are served by Python on the same origin.
Build the UI **before** `python -m build` to include it in distributable wheels.

The server binds loopback by default, rejects cross-origin API requests and arbitrary
Host headers, and never accepts credential/configuration uploads. For remote use set
`SEMTRAIL_SERVER_TOKEN`, pass `--host 0.0.0.0 --allowed-host your-hostname`, and put it
behind a TLS reverse proxy. Enter the server token using the UI's Access button.
This is a single trusted operator workspace, not multi-user SSO or tenant isolation.

## API and MCP interoperability

The same agent service powers the UI, HTTP API and MCP. Interactive OpenAPI
documentation is at `/docs`; machine-readable schema is at `/openapi.json`.

```bash
curl http://127.0.0.1:8000/api/agents
curl -X POST http://127.0.0.1:8000/api/agents/revenue/investigations \
  -H 'Content-Type: application/json' \
  -d '{"question":"What is revenue by country?"}'
```

Use a live-configured server for arbitrary questions; offline mode accepts only its
displayed example questions. When a server token is configured, include
`Authorization: Bearer YOUR_SERVER_TOKEN`. API requests have bounded body sizes and at
most two concurrent investigations per process. Investigations are synchronous; a
disconnected HTTP client does not cancel an already running investigation.

```bash
pip install -e '.[mcp,openai]'
semtrail mcp --agents /srv/agents
```

Example MCP client configuration (use the executable path from your environment):

```json
{
  "mcpServers": {
    "semtrail": {
      "command": "/srv/semtrail/.venv/bin/semtrail",
      "args": ["mcp", "--agents", "/srv/agents"]
    }
  }
}
```

Tools: `list_agents`, `get_catalog`, `investigate`, `get_run`. Provider and database
credentials belong in the server process environment. MCP exposes configured domain
agents to the local client; it does not grant arbitrary SQL or filesystem access.

## Docker on your own compute

```bash
docker build -t semtrail .
export SEMTRAIL_SERVER_TOKEN=choose-a-long-random-token
docker run --rm -p 127.0.0.1:8000:8000 \
  -e SEMTRAIL_SERVER_TOKEN semtrail
```

The default container starts the offline demo. Mount a trusted agent directory and
pass `serve --agents /srv/agents --host 0.0.0.0` for live use, supplying database and
LLM environment variables. Persist `/home/semtrail/.semtrail` if you want demo history
to survive container replacement. The container runs as UID 10001.
