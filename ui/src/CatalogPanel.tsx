import { useState } from "react";
import { BookOpen, Database, Hash, Search, ShieldCheck } from "lucide-react";
import type { Agent, Catalog } from "./types";

export default function CatalogPanel({
  catalog,
  agent,
}: {
  catalog: Catalog | null;
  agent: Agent;
}) {
  const [search, setSearch] = useState("");
  const matches = (name: string, description: string) =>
    `${name} ${description}`.toLowerCase().includes(search.toLowerCase());
  if (!catalog)
    return <p className="text-sm text-stone-500">Loading catalog…</p>;
  return (
    <div className="space-y-6 fade-in">
      <label className="catalog-search">
        <Search size={16} />
        <input
          aria-label="Search models and metrics"
          placeholder="Search models and metrics…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      <div className="flex items-start gap-3 rounded-xl border border-forest-100 bg-forest-50 px-5 py-4 text-forest-700">
        <ShieldCheck size={18} className="mt-0.5 shrink-0" />
        <div className="text-xs leading-6">
          <strong>Scope is enforced at data access.</strong> Showing only models
          allowed by this agent’s dbt tags.
          <div className="flex flex-wrap gap-2">
            {agent.policy.allow_tags_any.map((tag) => (
              <span key={tag} className="font-mono">
                allow: {tag}
              </span>
            ))}
            {agent.policy.deny_tags.map((tag) => (
              <span key={tag} className="font-mono text-stone-500">
                deny: {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
      {search &&
      ![...catalog.models, ...catalog.metrics].some((item) =>
        matches(item.name, item.description),
      ) ? (
        <p className="text-xs text-stone-500">
          No models or metrics match “{search}”.
        </p>
      ) : null}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <BookOpen size={16} className="text-forest-600" />
          <h2 className="text-sm font-semibold">Business metrics</h2>
          <span className="pill">{catalog.metrics.length}</span>
        </div>
        {catalog.metrics.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {catalog.metrics
              .filter((metric) => matches(metric.name, metric.description))
              .map((metric) => (
                <article className="panel p-5" key={metric.name}>
                  <div className="flex items-center gap-2">
                    <Hash size={14} className="text-forest-600" />
                    <h3 className="font-mono text-sm font-semibold">
                      {metric.name}
                    </h3>
                    <span className="ml-auto pill">dbt defined</span>
                  </div>
                  <p className="mt-3 text-xs leading-6 text-stone-500">
                    {metric.description}
                  </p>
                  <p className="mt-3 text-[11px] text-stone-400">
                    Dimensions:{" "}
                    {metric.dimensions.map((d) => d.name).join(", ") || "None"}
                  </p>
                </article>
              ))}
          </div>
        ) : (
          <div className="panel p-5 text-xs leading-6 text-stone-500">
            No supported metrics in this agent’s scope. Model exploration is
            still available. Advanced metric types require an extended semantic
            compiler.
          </div>
        )}
      </section>
      <section>
        <div className="mb-3 flex items-center gap-2">
          <Database size={16} className="text-forest-600" />
          <h2 className="text-sm font-semibold">Permitted models</h2>
          <span className="pill">{catalog.models.length}</span>
        </div>
        <div className="space-y-3">
          {catalog.models
            .filter((model) => matches(model.name, model.description))
            .map((model) => (
              <article className="panel p-5" key={model.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-mono text-sm font-semibold">
                    {model.name}
                  </h3>
                  {model.tags.map((tag) => (
                    <span className="pill" key={tag}>
                      {tag}
                    </span>
                  ))}
                </div>
                <p className="my-3 text-xs leading-6 text-stone-500">
                  {model.description}
                </p>
                <details className="rounded-lg bg-stone-50 px-4 py-3 text-xs">
                  <summary className="cursor-pointer font-medium text-stone-600">
                    {Object.keys(model.columns).length} declared columns
                  </summary>
                  <dl className="mt-3 grid gap-3">
                    {Object.values(model.columns).map((column) => (
                      <div
                        key={column.name}
                        className="grid gap-1 sm:grid-cols-[140px_1fr]"
                      >
                        <dt className="font-mono text-stone-700">
                          {column.name}
                        </dt>
                        <dd className="text-stone-500">
                          {column.description || "No description"}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </details>
              </article>
            ))}
        </div>
      </section>
      <p className="break-all font-mono text-[10px] leading-5 text-stone-400">
        Artifact snapshot · {catalog.artifact_sha256}
      </p>
    </div>
  );
}
