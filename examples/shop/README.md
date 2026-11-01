# Real dbt example

The `semtrail demo` command uses lightweight generated fixtures. This project also
builds the same business dataset using **actual dbt** and produces real artifacts.

From the Semtrail repository:

```bash
pip install -e '.[dbt-demo]'
cd examples/shop
dbt seed --profiles-dir .
dbt build --profiles-dir .
```

Connect an agent to `target/manifest.json`, `target/semantic_manifest.json` and
`semtrail_demo.duckdb` in this directory. Do not use live demo fixture files with
this database: always pair artifacts and data from the same environment.

From the repository root, validate the artifact path against Semtrail:

```bash
SEMTRAIL_DBT_PROJECT=examples/shop pytest tests/test_dbt_artifacts.py
```

The core runtime does not require dbt or execute repository code. The `dbt-demo`
extra pins dbt Core 1.9 and its DuckDB adapter for this example only.
