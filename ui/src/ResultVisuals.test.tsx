import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import ResultVisuals, { numericValue } from "./ResultVisuals";
import type { Query } from "./types";

afterEach(cleanup);
const query: Query = {
  query_id: "q1",
  sql: "",
  parameters: [],
  models: [],
  kind: "exploration",
  definition: "Count",
  status: "ok",
  elapsed_ms: 1,
  result: {
    columns: ["segment", "customers"],
    rows: [
      ["Business", 1],
      ["Consumer", 2],
    ],
    truncated: false,
    cells_truncated: false,
  },
};

test("charts actual values and discloses truncated results", () => {
  render(
    <ResultVisuals
      queries={[{ ...query, result: { ...query.result!, truncated: true } }]}
      onInspect={vi.fn()}
    />,
  );
  expect(screen.getByText("Business")).toBeInTheDocument();
  expect(screen.getByText("2")).toBeInTheDocument();
  expect(screen.getByText(/Partial result/)).toBeInTheDocument();
});

test("does not turn nulls, non-finite values, or unsafe integers into chart data", () => {
  for (const value of [
    null,
    "",
    "Infinity",
    Infinity,
    "2026-01-01",
    Number.MAX_SAFE_INTEGER + 1,
  ])
    expect(numericValue(value)).toBeNull();
  expect(numericValue("700.25")).toBe(700.25);
  render(
    <ResultVisuals
      queries={[
        {
          ...query,
          result: {
            ...query.result!,
            rows: [
              ["Business", null],
              ["Consumer", 2],
            ],
          },
        },
      ]}
      onInspect={vi.fn()}
    />,
  );
  expect(
    screen.queryByLabelText("Visual query results"),
  ).not.toBeInTheDocument();
});

test("does not chart failed, shortened, or negative bar results", () => {
  render(
    <ResultVisuals
      queries={[
        { ...query, status: "error" },
        {
          ...query,
          query_id: "q2",
          result: { ...query.result!, cells_truncated: true },
        },
        {
          ...query,
          query_id: "q3",
          result: {
            ...query.result!,
            rows: [
              ["Business", -1],
              ["Consumer", 2],
            ],
          },
        },
      ]}
      onInspect={vi.fn()}
    />,
  );
  expect(
    screen.queryByLabelText("Visual query results"),
  ).not.toBeInTheDocument();
});
