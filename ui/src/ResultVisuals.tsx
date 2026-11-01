import { ArrowUpRight, BarChart3 } from "lucide-react";
import type { Query } from "./types";

// Only explicit, finite numeric values are charted. Preserve the original value in labels.
export function numericValue(value: unknown): number | null {
  if (
    typeof value !== "number" &&
    (typeof value !== "string" || !/^-?\d+(\.\d+)?$/.test(value))
  )
    return null;
  const result = Number(value);
  return Number.isFinite(result) && Math.abs(result) <= Number.MAX_SAFE_INTEGER
    ? result
    : null;
}
export default function ResultVisuals({
  queries,
  onInspect,
}: {
  queries: Query[];
  onInspect: (id: string) => void;
}) {
  const visuals = queries.filter((query) => {
    const result = query.result;
    if (query.status !== "ok" || !result || result.cells_truncated)
      return false;
    if (result.columns.length === 1 && result.rows.length === 1)
      return numericValue(result.rows[0][0]) !== null;
    return (
      result.columns.length === 2 &&
      result.rows.length > 1 &&
      result.rows.length <= 12 &&
      result.rows.every(
        (row) =>
          typeof row[0] === "string" &&
          numericValue(row[1]) !== null &&
          numericValue(row[1])! >= 0,
      )
    );
  });
  if (!visuals.length) return null;
  return (
    <div className="result-visuals" aria-label="Visual query results">
      {visuals.map((query) => {
        const result = query.result!;
        const scalar = result.columns.length === 1;
        const maximum = scalar
          ? 1
          : Math.max(...result.rows.map((row) => numericValue(row[1])!));
        return (
          <section
            className={`result-visual ${scalar ? "scalar" : ""}`}
            key={query.query_id}
          >
            <header>
              <span>
                <BarChart3 size={15} />
                {result.columns[scalar ? 0 : 1].replaceAll("_", " ")}
                {!scalar ? ` by ${result.columns[0].replaceAll("_", " ")}` : ""}
              </span>
              <button
                aria-label={`Inspect chart query ${query.query_id}`}
                onClick={() => onInspect(query.query_id)}
              >
                {query.query_id}
                <ArrowUpRight size={13} />
              </button>
            </header>
            {scalar ? (
              <div className="scalar-value">{String(result.rows[0][0])}</div>
            ) : (
              <ul className="bar-chart">
                {result.rows.map((row, index) => (
                  <li key={index}>
                    <div>
                      <span>{String(row[0])}</span>
                      <strong>{String(row[1])}</strong>
                    </div>
                    <div className="bar-track" aria-hidden="true">
                      <span
                        style={{
                          width: `${maximum === 0 ? 0 : (numericValue(row[1])! / maximum) * 100}%`,
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <footer>
              {result.truncated
                ? "Partial result · query row limit reached"
                : `${result.rows.length} returned ${result.rows.length === 1 ? "row" : "rows"}`}
              <span>Source: {query.query_id}</span>
            </footer>
          </section>
        );
      })}
    </div>
  );
}
