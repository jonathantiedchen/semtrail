# Contributing

Use Python 3.11–3.13 and install `pip install -e '.[dev,postgres]'`.
Run `pytest` and `ruff check .`. Database/LLM adapters belong behind the existing
protocols. Keep the core dependency list small.

For query-policy changes, include an allowed query, a forbidden-relation bypass
attempt and a real database regression test. Unsupported semantics should raise a
clear error, never quietly produce a different metric. New dialects must be tested
against their actual database, not only SQL-string snapshots.

Do not commit credentials or real query results. Examples use synthetic data.
