import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import App from "./App";

const question =
  "Show completed revenue by country and the total completed order count.";
const agent = {
  id: "revenue",
  name: "revenue",
  instructions: "Use defined metrics.",
  policy: { allow_tags_any: ["finance"], deny_tags: ["sensitive"] },
  provider: "openai",
  model: "test",
  warehouse: "duckdb",
  ready: true,
  model_count: 1,
  metric_count: 1,
  demo_question: question,
  max_steps: 12,
  max_queries: 6,
};
const run = {
  run_id: "test-run",
  agent: "revenue",
  question,
  artifact_sha256: "abc",
  answer: {
    status: "answered",
    explanation: "Revenue is 700 USD [q1].",
    query_ids: ["q1"],
    definitions: ["Completed order value in USD."],
    limitations: ["Synthetic data."],
  },
  queries: [
    {
      query_id: "q1",
      sql: "SELECT SUM(amount) AS revenue FROM completed_orders",
      parameters: [],
      models: ["orders"],
      kind: "dbt_metric",
      definition: "Completed revenue",
      status: "ok",
      elapsed_ms: 2,
      result: {
        columns: ["revenue"],
        rows: [[700]],
        truncated: false,
        cells_truncated: false,
      },
    },
  ],
  actions: [{ tool: "query_metric", status: "ok", query_id: "q1" }],
  permitted_models: ["orders"],
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options?: RequestInit) => {
      let value: unknown = [];
      if (url.endsWith("/agents")) value = [agent];
      else if (url.endsWith("/health")) value = { mode: "demo" };
      else if (url.endsWith("/catalog"))
        value = {
          artifact_sha256: "abc",
          metrics: [
            {
              name: "revenue",
              description: "Completed revenue",
              dimensions: [],
            },
          ],
          models: [],
        };
      else if (options?.method === "POST") value = run;
      return new Response(JSON.stringify(value), { status: 200 });
    }),
  );
});

test("investigates through the API and exposes supporting SQL", async () => {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByLabelText("Ask revenue analyst");
  await waitFor(() =>
    expect(screen.getByLabelText("Ask revenue analyst")).toHaveValue(question),
  );
  await user.click(screen.getByRole("button", { name: "Run investigation" }));
  await screen.findByText("What the data tells us");
  expect(screen.getByText("700")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /^SQL$/ }));
  expect(screen.getByText(run.queries[0].sql)).toBeInTheDocument();
  expect(fetch).toHaveBeenCalledWith(
    "/api/agents/revenue/investigations",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ question }),
    }),
  );
});

test("shows permitted semantics through the catalog navigation", async () => {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByLabelText("Ask revenue analyst");
  await user.click(screen.getByRole("button", { name: "Semantic catalog" }));
  await screen.findByText("Business metrics");
  expect(
    screen.getByText("Scope is enforced at data access."),
  ).toBeInTheDocument();
});

test("switches between context and query evidence without losing the answer", async () => {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByLabelText("Ask revenue analyst");
  await user.click(screen.getByRole("button", { name: "Run investigation" }));
  await screen.findByRole("heading", { name: "Query evidence" });
  await user.click(
    screen.getByRole("button", { name: "Agent context" }),
  );
  expect(screen.getByText("Enforced at query execution")).toBeInTheDocument();
  expect(screen.getByText("What the data tells us")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /^Evidence/ }));
  expect(screen.getByText("700")).toBeInTheDocument();
});

test("filters the semantic catalog and explains empty search results", async () => {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByLabelText("Ask revenue analyst");
  await user.click(screen.getByRole("button", { name: "Semantic catalog" }));
  const search = await screen.findByRole("textbox", {
    name: "Search models and metrics",
  });
  await user.type(search, "nonexistent");
  expect(screen.getByText(/No models or metrics match/)).toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: "revenue" }),
  ).not.toBeInTheDocument();
  await user.clear(search);
  expect(screen.getByRole("heading", { name: "revenue" })).toBeInTheDocument();
});
