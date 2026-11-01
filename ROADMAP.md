# Where Semtrail can grow

Expand the governed investigation boundary before adding more channels or deployment
infrastructure. The current release ships a working agent, React workspace, HTTP API,
MCP bridge, two database executors and an explicit subset of dbt semantics.

## Richer questions with consistent definitions

- Add a separately installed MetricFlow adapter with pinned compatibility fixtures.
  Expand the SQL gate to resolve CTE scopes and every physical relation before allowing
  joins. Test join fanout, forbidden dependencies and time-spine access.
- Support metric filters, time grains and period comparisons through the semantic
  compiler. Keep formula generation out of the LLM's responsibilities.
- Surface unsupported metrics and artifact freshness to operators without exposing
  out-of-scope metadata to an agent.
- Add reusable evaluation suites: domain questions, expected metric/grain, forbidden
  accesses and numeric tolerances. Compare providers on those same suites.

## Team trust and reliability

- Background jobs, progress events, cancellation and LangGraph checkpoint recovery.
  Keep failed or interrupted evidence inspectable.
- A reviewed answer library with definition fingerprints and revalidation when dbt
  changes. Verified answers should be reusable evidence, not permanent truth.
- Provider token/cost accounting, query cost estimation and warehouse budgets.
  A returned-row limit does not bound scanned bytes.
- OIDC login, per-user agent permissions and scoped warehouse identities before
  treating the workspace as a multi-user service. A shared server token is not SSO.
- Retention controls and audit export for runs containing sensitive results.

## Interoperability

The HTTP/OpenAPI and stdio MCP surfaces are implemented now. Future adapters can
connect notebooks, Slack or orchestration systems through those same interfaces.
Additional warehouse support should include real database tests and documented
isolation guarantees. Credentials and policy enforcement stay on operator compute.

## Keep the maintenance burden small

Defer a hosted control plane, a general code-execution sandbox, unbounded autonomous
analysis and a home-grown full semantic engine. Add provider-specific behavior behind
adapters rather than branching the investigation graph.
