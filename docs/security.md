# Access and deployment boundaries

## Model access

The operator controls the dbt repository, artifacts, configuration, provider adapter
and compiler. The LLM, question, database cell contents and metadata descriptions are
untrusted. Domain instructions never authorize extra access.

Every permitted model must match an allow tag and no deny tag. All direct SQL relation
references must resolve to an allowed model. Effective inherited tags come from dbt's
parsed manifest, not from source-file scanning. Policy does not expand dependencies.
Duplicate model relations and unknown artifact versions fail startup.

Only materialized model relations are exposed. A permitted view is treated as one
relation; its upstream dependencies are not separately inspected. Model authors decide
which data that view exposes. Tags are not row, column, or PII controls.

## PostgreSQL setup

Provision a separate reader role for each domain and grant only specific model views
or tables. Review existing PUBLIC, inherited role and default grants in your database.
Run setup with an administrator outside the agent runtime. Example (adapt locally):

```sql
CREATE ROLE semtrail_revenue LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
-- Set its password using your existing secrets workflow.
GRANT CONNECT ON DATABASE analytics TO semtrail_revenue;
GRANT USAGE ON SCHEMA marts TO semtrail_revenue;
GRANT SELECT ON marts.completed_orders TO semtrail_revenue;
ALTER ROLE semtrail_revenue SET default_transaction_read_only = on;
```

Do not grant SELECT on all current/future schema tables. When tags or relations change,
update grants as part of your deployment and refresh artifacts. Read-only transactions
alone do not restrict reads to tagged models; Semtrail's deterministic gate enforces
that restriction while scoped database credentials provide an additional boundary.

The runtime doesn't automatically provision roles or verify all inherited grants.
Only structured tools are exposed; the SQL gate is not safe for a general public
`execute_sql` API. Installed custom adapters and compilers run as trusted local code.

## DuckDB

Opened read-only with external access disabled, fixed memory/thread limits and an
interrupt timer. It has no per-relation roles. For stronger isolation give each domain
its own physical database file. Do not expose a database file or Python API to
untrusted remote users.

## Secrets, results and egress

Environment variables carry credentials; YAML stores only variable names. Semtrail
does not persist API keys, DSNs, full model transcripts, or hidden reasoning. Provider
and database failures are sanitized before returning them to the agent. The selected
LLM provider receives relevant metadata and bounded results. Setting external tracing
environment variables may also send data to that service.

Evidence contains questions, SQL parameter values and result data. Directories are
mode 0700 and SQLite files 0600 on POSIX. Backups, shared volumes and the host are
the operator's responsibility. Delete evidence with ordinary filesystem tools; there
is no default remote retention or analytics collection.

Query limits include a sentinel row so truncation can be detected. Large cells and
results are capped and marked. SQL LIMIT limits returned rows, not warehouse scan
cost. Query counts, statement timeouts and least-privilege warehouse roles remain
important, especially on metered databases.


## Agent administration and orchestration

The authenticated operator can change domain instructions, tag policies and budgets
through Settings (`PUT /api/agents/{id}/settings`). These writes are validated and
atomically replace only registered agent YAML files. Orchestration Settings write
`_orchestrator.yml`. File paths, database DSNs and provider credentials cannot be
changed through this endpoint. The same token, host, origin and body-size boundary
protects configuration writes. Anyone with server access is a trusted administrator;
per-user administrative roles are not implemented.

Auto chooses one enabled, ready domain agent. Model-selected IDs are checked against
that candidate list before delegation. Its graph has no SQL or warehouse tool and
never unions domain permissions. Delegation executes the ordinary scoped DataAgent.
Prior context is loaded from saved server records; only same-domain child responses
are passed to a delegated agent. The envelope stores the route and child evidence
reference; a clarification response contains no query results.
