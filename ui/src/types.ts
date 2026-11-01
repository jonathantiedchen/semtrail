export interface Agent {
  id: string;
  name: string;
  instructions: string;
  policy: { allow_tags_any: string[]; deny_tags: string[] };
  provider: string;
  model: string;
  warehouse: string;
  ready: boolean;
  model_count: number;
  metric_count: number;
  demo_question: string | null;
  max_steps: number;
  max_queries: number;
}
export interface Catalog {
  artifact_sha256: string;
  models: {
    id: string;
    name: string;
    description: string;
    tags: string[];
    columns: Record<
      string,
      { name: string; description: string; data_type?: string }
    >;
  }[];
  metrics: {
    name: string;
    description: string;
    model_id: string;
    dimensions: { name: string; description: string }[];
  }[];
}
export interface Query {
  query_id: string;
  sql: string;
  parameters: unknown[];
  models: string[];
  kind: string;
  definition: string;
  status: string;
  elapsed_ms: number;
  error?: string;
  result?: {
    columns: string[];
    rows: unknown[][];
    truncated: boolean;
    cells_truncated: boolean;
  };
}
export interface Run {
  run_id: string;
  agent: string;
  question: string;
  artifact_sha256: string;
  answer: {
    status: string;
    explanation: string;
    query_ids: string[];
    definitions: string[];
    limitations: string[];
  };
  queries: Query[];
  actions: { tool: string; status: string; query_id?: string }[];
  permitted_models: string[];
}
export interface RunSummary {
  run_id: string;
  agent: string;
  agent_id: string;
  created_at: string;
}
