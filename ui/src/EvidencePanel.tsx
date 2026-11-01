import { useState } from "react";
import { Check, Clipboard, Code2, Table2 } from "lucide-react";
import type { Query, Run } from "./types";

export function CodeBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="code-block relative rounded-xl bg-[#222b40] p-4 text-xs text-slate-100">
      <button
        className="absolute right-3 top-3 rounded p-1.5 text-slate-300 hover:bg-white/10"
        aria-label="Copy code"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? <Check size={14} /> : <Clipboard size={14} />}
      </button>
      <pre className="overflow-x-auto whitespace-pre-wrap pr-7 font-mono leading-6">
        {text}
      </pre>
    </div>
  );
}

function Results({ query }: { query: Query }) {
  const data = query.result;
  if (!data)
    return (
      <p className="text-sm text-red-700">
        {query.error || "No result available."}
      </p>
    );
  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-stone-200">
        <table className="w-full text-left text-xs">
          <thead className="bg-stone-50 text-stone-500">
            <tr>
              {data.columns.map((column) => (
                <th
                  key={column}
                  className="whitespace-nowrap px-4 py-3 font-medium"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {data.rows.map((row, index) => (
              <tr key={index}>
                {row.map((cell, column) => (
                  <td
                    key={column}
                    className="max-w-72 break-words px-4 py-3 font-mono text-stone-700"
                  >
                    {cell === null ? (
                      <span className="text-stone-400">null</span>
                    ) : (
                      String(cell)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {data.rows.length === 0 ? (
          <p className="p-4 text-xs text-stone-500">
            The query returned no rows.
          </p>
        ) : null}
      </div>
      <p className="mt-3 text-[11px] text-stone-400">
        {data.rows.length} rows returned
        {data.truncated
          ? " · Row limit reached; results are truncated"
          : " · Complete result"}
        {data.cells_truncated ? " · Large cell values shortened" : ""}
      </p>
    </div>
  );
}

export default function EvidencePanel({
  run,
  selected,
  onSelect,
}: {
  run: Run;
  selected: string;
  onSelect: (id: string) => void;
}) {
  const [tab, setTab] = useState<"results" | "sql">("results");
  const query =
    run.queries.find((query) => query.query_id === selected) || run.queries[0];
  return (
    <section
      className="evidence-panel overflow-hidden"
      aria-label="Supporting query evidence"
    >
      <div className="evidence-header">
        <h3>Query evidence</h3>
        <p>Executed SQL and actual results for this run.</p>
      </div>
      <div>
        <div className="query-list">
          {run.queries.map((item) => (
            <button
              key={item.query_id}
              aria-pressed={query?.query_id === item.query_id}
              onClick={() => onSelect(item.query_id)}
            >
              <span>
                <span className="font-mono">{item.query_id}</span>
                <span className="ml-2">
                  {item.kind === "dbt_metric" ? "dbt metric" : "Exploration"}
                </span>
              </span>
            </button>
          ))}
          {run.queries.length === 0 ? (
            <p className="p-2 text-xs text-stone-400">No queries executed.</p>
          ) : null}
        </div>
        {query ? (
          <div className="evidence-content min-w-0">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div
                className="flex rounded-lg bg-stone-100 p-1"
                role="group"
                aria-label="Evidence view"
              >
                <button
                  aria-pressed={tab === "results"}
                  onClick={() => setTab("results")}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs ${tab === "results" ? "bg-white text-stone-800 shadow-sm" : "text-stone-500"}`}
                >
                  <Table2 size={12} /> Results
                </button>
                <button
                  aria-pressed={tab === "sql"}
                  onClick={() => setTab("sql")}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs ${tab === "sql" ? "bg-white text-stone-800 shadow-sm" : "text-stone-500"}`}
                >
                  <Code2 size={12} /> SQL
                </button>
              </div>
              <span
                className={`text-[11px] ${query.status === "ok" ? "text-forest-600" : "text-red-600"}`}
              >
                {query.status === "ok" ? "● Executed" : "● Failed"} ·{" "}
                {query.elapsed_ms} ms
              </span>
            </div>
            <p className="mb-4 text-xs leading-5 text-stone-500">
              {query.definition}
            </p>
            {tab === "results" ? (
              <Results query={query} />
            ) : (
              <>
                <CodeBlock text={query.sql} />
                {query.parameters.length ? (
                  <p className="mt-3 font-mono text-xs text-stone-500">
                    Parameters: {JSON.stringify(query.parameters)}
                  </p>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}
