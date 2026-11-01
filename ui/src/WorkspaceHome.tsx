import {
  ArrowRight,
  ArrowUpRight,
  Database,
  GitBranch,
  Layers3,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { Agent, RunSummary } from "./types";

export default function WorkspaceHome({
  runs,
  agents,
  selected,
  question,
  onQuestion,
  onSelect,
  onSubmit,
  onOpenRun,
  onCatalog,
  onHistory,
  mode,
  busy,
}: {
  runs: RunSummary[];
  agents: Agent[];
  selected: string;
  question: string;
  onQuestion: (value: string) => void;
  onSelect: (agent: Agent) => void;
  onSubmit: (event: React.FormEvent) => void;
  onOpenRun: (run: RunSummary) => void;
  onCatalog: () => void;
  onHistory: () => void;
  mode: string;
  busy: boolean;
}) {
  const agent = agents.find((item) => item.id === selected);
  return (
    <main className="home-workspace fade-in">
      <div className="home-intro">
        <div>
          <p className="eyebrow">
            <span className="tiny-cross">✳</span> THE SEMANTIC WORKSPACE
          </p>
          <h1>
            A little curiosity.
            <br />
            <em>A clearer picture.</em>
          </h1>
          <p>
            Explore your business with agents that understand your data.
            <br className="desktop-break" /> Every answer leaves a trail you can
            follow.
          </p>
        </div>
        <div
          className="semantic-map"
          aria-label="From dbt definitions through domain agents to query evidence"
        >
          <div className="map-grid" aria-hidden="true" />
          <div className="map-node">
            <GitBranch size={19} />
            <span>dbt definitions</span>
          </div>
          <div className="map-line" />
          <div className="map-node central">
            <Sparkles size={24} />
            <span>Domain agent</span>
          </div>
          <div className="map-line" />
          <div className="map-node">
            <Database size={19} />
            <span>Query evidence</span>
          </div>
          <span className="map-caption">CONTEXT → QUESTION → EVIDENCE</span>
        </div>
      </div>
      <form className="home-composer" onSubmit={onSubmit}>
        <div className="home-composer-label">
          <Sparkles size={16} />
          <label htmlFor="home-question">
            {agent ? `Ask ${agent.name} analyst` : "Ask your data"}
          </label>
          <span>NEW INVESTIGATION</span>
        </div>
        <textarea
          id="home-question"
          value={question}
          onChange={(event) => onQuestion(event.target.value)}
          disabled={busy || !agent?.ready}
          maxLength={10000}
          rows={2}
          placeholder="What would you like to understand about your business?"
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <div className="home-composer-bottom">
          <label className="agent-picker">
            <span className="status-dot" />
            <select
              aria-label="Investigation agent"
              value={selected}
              disabled={busy}
              onChange={(event) => {
                const next = agents.find(
                  (item) => item.id === event.target.value,
                );
                if (next) onSelect(next);
              }}
            >
              {agents.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name.charAt(0).toUpperCase() + item.name.slice(1)}{" "}
                  analyst
                </option>
              ))}
            </select>
          </label>
          <span className="home-permission">
            <ShieldCheck size={13} />
            Read-only access
          </span>
          <button
            className="primary-button"
            disabled={busy || !agent?.ready || !question.trim()}
            aria-label="Run investigation"
          >
            Investigate
            <ArrowRight size={15} />
          </button>
        </div>
      </form>
      <p className="home-disclosure">
        {mode === "demo" ? "DEMO WORKSPACE" : "YOUR WORKSPACE"}
        <span>
          {mode === "demo"
            ? "Synthetic data. Scripted decisions. Real queries. Use the example question for each agent."
            : "Grounded in your dbt definitions. Queries run within the selected agent’s permitted scope."}
        </span>
      </p>
      <section className="home-agents">
        <div className="section-heading">
          <div>
            <h2>Your domain experts</h2>
            <p>Different questions. The right context.</p>
          </div>
          <button onClick={onCatalog}>
            Explore catalog
            <ArrowUpRight size={14} />
          </button>
        </div>
        <div className="domain-grid">
          {agents.map((item, index) => (
            <button
              className={`domain-card ${item.id === selected ? "selected" : ""}`}
              aria-pressed={item.id === selected}
              key={item.id}
              disabled={busy}
              onClick={() => onSelect(item)}
            >
              <div className="domain-card-top">
                <span className="domain-number">0{index + 1}</span>
                <span className={`readiness ${item.ready ? "" : "not-ready"}`}>
                  <span className="status-dot" />
                  {item.ready ? "Ready to investigate" : "Setup required"}
                </span>
                <ArrowUpRight size={18} />
              </div>
              <h3>
                {item.name.charAt(0).toUpperCase() + item.name.slice(1)} analyst
              </h3>
              <p>{item.instructions}</p>
              <div className="domain-card-bottom">
                <span>
                  <Layers3 size={13} />
                  {item.model_count} models · {item.metric_count} metrics
                </span>
                <span className="domain-tag">
                  {item.policy.allow_tags_any.join(" · ")}
                </span>
              </div>
            </button>
          ))}
        </div>
      </section>
      <section className="home-recent">
        <div className="section-heading">
          <div>
            <h2>Recent investigations</h2>
            <p>Your work, with the evidence attached.</p>
          </div>
          <button onClick={onHistory}>
            View all
            <ArrowRight size={14} />
          </button>
        </div>
        {runs.length ? (
          <div className="recent-table">
            <div className="recent-table-header">
              <span>INVESTIGATION</span>
              <span>CREATED</span>
              <span />
            </div>
            {runs.slice(0, 4).map((item) => (
              <button key={item.run_id} onClick={() => onOpenRun(item)}>
                <span>
                  <GitBranch size={16} />
                  <strong>{item.agent} investigation</strong>
                  <code>{item.run_id.slice(0, 8)}</code>
                </span>
                <time>
                  {new Date(item.created_at).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </time>
                <ArrowUpRight size={15} />
              </button>
            ))}
          </div>
        ) : (
          <div className="recent-empty">
            <GitBranch size={21} />
            <div>
              <strong>A good question starts a trail.</strong>
              <p>
                Your completed investigations will appear here, with their
                queries and results.
              </p>
            </div>
          </div>
        )}
      </section>
      <footer className="home-footer">
        <span>
          <GitBranch size={13} />
          Your compute. Your data. Your trail.
        </span>
        <span>SEMTRAIL / OPEN SOURCE</span>
      </footer>
    </main>
  );
}
