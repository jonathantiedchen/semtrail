import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Braces,
  Check,
  ChevronRight,
  CircleDot,
  Clock3,
  Database,
  GitBranch,
  KeyRound,
  Layers3,
  PanelRight,
  Loader2,
  MessageSquare,
  Plus,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Terminal,
  Users,
  X,
} from "lucide-react";
import { api, downloadJson } from "./api";
import type { Agent, Catalog, Run, RunSummary } from "./types";
import ResultVisuals from "./ResultVisuals";
import CatalogPanel from "./CatalogPanel";
import EvidencePanel, { CodeBlock } from "./EvidencePanel";

type View = "overview" | "investigate" | "catalog" | "history" | "integrations";
const navigation = [
  { id: "investigate" as const, title: "Chat", icon: MessageSquare },
  { id: "catalog" as const, title: "Semantic catalog", icon: Layers3 },
  { id: "history" as const, title: "Chat history", icon: Clock3 },
  { id: "integrations" as const, title: "Integrations", icon: Braces },
];
const titles = {
  catalog: [
    "Semantic catalog",
    "Explore the business definitions and models available to this agent.",
  ],
  history: [
    "Run history",
    "Reopen a chat to inspect its answer, SQL, and results.",
  ],
  integrations: [
    "Integrations",
    "Connect your data stack and use Semtrail in your existing workflows.",
  ],
};
function displayName(agent: Agent) {
  return `${agent.name.charAt(0).toUpperCase()}${agent.name.slice(1)} analyst`;
}
function Explanation({
  text,
  onCitation,
}: {
  text: string;
  onCitation: (id: string) => void;
}) {
  return (
    <p className="answer-copy">
      {text.split(/(\[q\d+\])/g).map((part, i) =>
        /^\[q\d+\]$/.test(part) ? (
          <button
            key={i}
            className="citation"
            onClick={() => onCitation(part.slice(1, -1))}
          >
            {part}
          </button>
        ) : (
          part
        ),
      )}
    </p>
  );
}
export default function App() {
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspector, setInspector] = useState<"scope" | "evidence">("scope");
  const questionInput = useRef<HTMLTextAreaElement>(null);
  const [view, setView] = useState<View>("investigate");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selected, setSelected] = useState("");
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [previousMessages, setPreviousMessages] = useState<Run[]>([]);
  const [run, setRun] = useState<Run | null>(null);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState("");
  const [token, setToken] = useState("");
  const [tokenDraft, setTokenDraft] = useState("");
  const [showAccess, setShowAccess] = useState(false);
  const dialog = useRef<HTMLElement>(null);
  const [evidenceRun, setEvidenceRun] = useState<Run | null>(null);
  const [queryId, setQueryId] = useState("q1");
  const agent = agents.find((agent) => agent.id === selected);

  useEffect(() => {
    if (!showAccess) return;
    const previous = document.activeElement as HTMLElement | null;
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowAccess(false);
      if (event.key !== "Tab") return;
      const elements =
        dialog.current?.querySelectorAll<HTMLElement>("button, input");
      if (!elements?.length) return;
      const first = elements[0],
        last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      previous?.focus();
    };
  }, [showAccess]);

  useEffect(() => {
    let active = true;
    Promise.all([
      api<Agent[]>("/agents", token),
      api<{ mode: string }>("/health", token),
      api<RunSummary[]>("/runs", token),
    ])
      .then(([list, health, history]) => {
        if (active) {
          setAgents(list);
          setMode(health.mode);
          setRuns(history);
          setSelected((previous) => previous || list[0]?.id || "");

          setError("");
        }
      })
      .catch((reason) => {
        if (active) setError(reason.message);
      });
    return () => {
      active = false;
    };
  }, [token]);
  useEffect(() => {
    if (!selected) return;
    let active = true;
    setCatalog(null);
    api<Catalog>(`/agents/${selected}/catalog`, token)
      .then((data) => {
        if (active) setCatalog(data);
      })
      .catch((reason) => {
        if (active) setError(reason.message);
      });

    return () => {
      active = false;
    };
  }, [selected, token, agents]);

  async function investigate(event: React.FormEvent) {
    event.preventDefault();
    if (!agent || busy || !question.trim()) return;
    setView("investigate");
    setBusy(true);
    setError("");
    if (run) setPreviousMessages((messages) => [...messages, run]);
    setRun(null);
    try {
      const result = await api<Run>(
        `/agents/${agent.id}/investigations`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            question,
            ...([...previousMessages, ...(run ? [run] : [])].length
              ? {
                  previous_run_ids: [...previousMessages, ...(run ? [run] : [])]
                    .slice(-6)
                    .map((item) => item.run_id),
                }
              : {}),
          }),
        },
      );
      setRun(result);
      setEvidenceRun(result);
      setQuestion("");
      setInspector("evidence");
      setInspectorOpen(false);
      setQueryId(result.queries[0]?.query_id || "q1");
      setRuns(await api<RunSummary[]>("/runs", token));
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not send message.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function openRun(item: RunSummary) {
    setError("");
    try {
      const result = await api<Run>(
        `/agents/${item.agent_id}/runs/${item.run_id}`,
        token,
      );
      const prior = await Promise.all(
        (result.previous_run_ids || [])
          .slice(-6)
          .map((id) => api<Run>(`/agents/${item.agent_id}/runs/${id}`, token)),
      );
      setPreviousMessages(prior);
      setSelected(item.agent_id);
      setRun(result);
      setEvidenceRun(result);
      setQuestion("");
      setInspector("evidence");
      setInspectorOpen(false);
      setQueryId(result.queries[0]?.query_id || "q1");
      setQuestion("");
      setView("investigate");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not open run.",
      );
    }
  }

  function newInvestigation() {
    setRun(null);
    setEvidenceRun(null);
    setPreviousMessages([]);
    setError("");
    setQuestion("");
    setInspector("scope");
    setView("investigate");
    setInspectorOpen(false);
  }
  function selectCitation(id: string) {
    setQueryId(id);
    setInspector("evidence");
    setInspectorOpen(true);
    requestAnimationFrame(() =>
      document
        .getElementById("investigation-inspector")
        ?.scrollIntoView?.({ block: "nearest" }),
    );
  }
  return (
    <div className="app-shell">
      <aside className="workspace-sidebar">
        <a href="/" className="brand">
          <span className="brand-icon">
            <GitBranch size={20} />
          </span>
          semtrail<span className="version">/</span>
        </a>
        <div className="workspace-name">
          <span className="workspace-avatar">S</span>
          <div>
            <strong>Workspace</strong>
            <span>Personal · Self-hosted</span>
          </div>
          <span className="status-dot" />
        </div>
        <button
          className="new-investigation"
          disabled={busy}
          onClick={newInvestigation}
        >
          <Plus size={16} />
          New chat
        </button>
        <nav aria-label="Main navigation" className="main-nav">
          {navigation.map((item) => (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              aria-current={view === item.id ? "page" : undefined}
            >
              <item.icon size={17} />
              <span>{item.title}</span>
              {item.id === "history" && runs.length > 0 ? (
                <span className="nav-count">{runs.length}</span>
              ) : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-heading">
          <span>AGENTS</span>
          <span>{agents.length}</span>
        </div>
        <div className="agent-list">
          {agents.map((item) => (
            <button
              key={item.id}
              disabled={busy}
              aria-pressed={selected === item.id}
              onClick={() => {
                setSelected(item.id);
                setQuestion("");
                setRun(null);
                setPreviousMessages([]);
                setInspector("scope");
                setView("investigate");
              }}
            >
              <span
                className={`agent-avatar ${item.id === "customers" ? "blue" : "purple"}`}
              >
                {item.id === "customers" ? (
                  <Users size={16} />
                ) : (
                  <Activity size={16} />
                )}
              </span>
              <div>
                <strong>{displayName(item)}</strong>
                <span>
                  {item.model_count} models · {item.metric_count} metrics
                </span>
              </div>
              <span className={`agent-state ${item.ready ? "ready" : ""}`} />
            </button>
          ))}
        </div>
        {runs.length ? (
          <div className="sidebar-recent">
            <div className="sidebar-heading">CHATS</div>
            {runs.slice(0, 3).map((item) => (
              <button
                disabled={busy}
                key={item.run_id}
                onClick={() => openRun(item)}
              >
                <MessageSquare size={13} />
                <span>{item.agent} chat</span>
                <ChevronRight size={12} />
              </button>
            ))}
          </div>
        ) : null}
        <div className="sidebar-bottom">
          <button onClick={() => setShowAccess(true)}>
            <KeyRound size={15} />
            Server access
          </button>
          <a
            href="https://github.com/jonathantiedchen/semtrail"
            target="_blank"
            rel="noreferrer"
          >
            <GitBranch size={15} />
            GitHub repository
            <ArrowUpRight size={13} />
          </a>
          <div className="sidebar-version">
            <span className="status-dot" />
            Self-hosted<span>v0.1.0</span>
          </div>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="workspace-header">
          <div className="breadcrumbs">
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>
              {navigation.find((item) => item.id === view)?.title}
            </strong>
          </div>
          <div className="header-actions">
            <button
              className="mobile-access icon-button"
              aria-label="Server access"
              onClick={() => setShowAccess(true)}
            >
              <KeyRound size={14} />
            </button>
            <span className="environment-badge">
              <span className="status-dot" />
              {mode === "demo" ? "Demo environment" : "Self-hosted"}
            </span>
            <a href="/docs" target="_blank" rel="noreferrer">
              API docs
              <ArrowUpRight size={13} />
            </a>
          </div>
        </header>
        {error ? (
          <div role="alert" className="error-banner">
            <span>{error}</span>
            <button aria-label="Dismiss error" onClick={() => setError("")}>
              <X size={15} />
            </button>
          </div>
        ) : null}
        {view === "investigate" && agent ? (
          <div
            className={`investigation-layout ${inspectorOpen ? "" : "inspector-closed"}`}
          >
            <main className="investigation-main">
              <div className="investigation-toolbar">
                <div>
                  <span
                    className={`agent-avatar small ${agent.id === "customers" ? "blue" : "purple"}`}
                  >
                    {agent.id === "customers" ? (
                      <Users size={14} />
                    ) : (
                      <Activity size={14} />
                    )}
                  </span>
                  <label className="chat-agent-picker">
                    <select
                      aria-label="Chat agent"
                      value={selected}
                      disabled={busy}
                      onChange={(event) => {
                        setSelected(event.target.value);
                        setRun(null);
                        setPreviousMessages([]);
                        setQuestion("");
                      }}
                    >
                      {agents.map((item) => (
                        <option key={item.id} value={item.id}>
                          {displayName(item)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span className="subtle-badge">
                    {agent.ready ? "Ready" : "Setup required"}
                  </span>
                </div>
                <button
                  className="quiet-button inspector-toggle"
                  aria-expanded={inspectorOpen}
                  aria-controls="investigation-inspector"
                  onClick={() => setInspectorOpen(!inspectorOpen)}
                >
                  <PanelRight size={15} />
                  {inspectorOpen ? "Hide details" : "Show details"}
                </button>
              </div>
              <div
                className={`conversation ${!run && !busy && !previousMessages.length ? "conversation-empty" : ""}`}
              >
                {!run && !busy && !previousMessages.length ? (
                  <div className="investigation-welcome fade-in">
                    <span className="welcome-symbol">
                      <GitBranch size={30} strokeWidth={1.5} />
                    </span>
                    <h1>What’s on your mind?</h1>
                    <p>Chat with your data. Get answers you can trace.</p>
                    <button
                      className="suggested-question"
                      onClick={() => {
                        setQuestion(
                          agent.demo_question ||
                            "What business definitions are available?",
                        );
                        questionInput.current?.focus();
                      }}
                    >
                      <Sparkles size={14} />
                      <span>
                        {agent.demo_question ||
                          "Explore available business definitions"}
                      </span>
                      <ArrowRight size={14} />
                    </button>
                  </div>
                ) : null}
                {[...previousMessages, ...(run ? [run] : [])].map((run) => (
                  <div className="answer-thread fade-in" key={run.run_id}>
                    <div className="question-bubble">{run.question}</div>
                    <section className="answer-section">
                      <div className="answer-heading">
                        <span className="brand-icon">
                          <GitBranch size={16} />
                        </span>
                        <h2>Semtrail</h2>
                        <span className="subtle-badge">
                          <Check size={11} />
                          {run.answer.status.replaceAll("_", " ")}
                        </span>
                      </div>
                      <Explanation
                        text={run.answer.explanation}
                        onCitation={(id) => {
                          setQueryId(id);
                          setInspector("evidence");
                          setInspectorOpen(true);
                          setEvidenceRun(run);
                        }}
                      />
                      {run.answer.query_ids.length ? (
                        <div className="answer-sources">
                          {run.answer.query_ids.map((id) => (
                            <button
                              key={id}
                              onClick={() => {
                                setEvidenceRun(run);
                                selectCitation(id);
                              }}
                            >
                              <Database size={12} />
                              {id}
                              <ArrowUpRight size={12} />
                            </button>
                          ))}
                        </div>
                      ) : null}
                      <ResultVisuals
                        queries={run.queries}
                        onInspect={(id) => {
                          setQueryId(id);
                          setInspector("evidence");
                          setInspectorOpen(true);
                          setEvidenceRun(run);
                        }}
                      />
                      {run.answer.definitions.length ? (
                        <div className="definition-note">
                          <BookOpen size={15} />
                          <div>
                            <strong>Definitions used</strong>
                            {run.answer.definitions.map((item, i) => (
                              <p key={i}>{item}</p>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {run.answer.limitations.length ? (
                        <details className="answer-limitations" open>
                          <summary>Assumptions & limitations</summary>
                          <ul>
                            {run.answer.limitations.map((item, i) => (
                              <li key={i}>{item}</li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
                      <div className="answer-footer">
                        <span>
                          {run.queries.length} queries · {run.actions.length}{" "}
                          actions
                        </span>
                        <button
                          onClick={() =>
                            downloadJson(run, `semtrail-${run.run_id}.json`)
                          }
                        >
                          <ArrowDownToLine size={13} />
                          Export run
                        </button>
                      </div>
                    </section>
                    <details className="activity-details">
                      <summary>
                        <Activity size={14} />
                        Response activity
                        <span>{run.actions.length} actions</span>
                      </summary>
                      <ol>
                        {run.actions.map((action, i) => (
                          <li key={i}>
                            <CircleDot size={11} />
                            <code>{action.tool}</code>
                            <span>{action.status}</span>
                            {action.query_id ? (
                              <button
                                onClick={() => selectCitation(action.query_id!)}
                              >
                                {action.query_id}
                              </button>
                            ) : null}
                          </li>
                        ))}
                      </ol>
                    </details>
                  </div>
                ))}
                {busy ? (
                  <div role="status" className="investigating-state">
                    <Loader2 size={24} className="animate-spin" />
                    <h2>Thinking…</h2>
                    <p>
                      Reading business definitions and querying permitted data.
                    </p>
                    <span>Results and supporting SQL will appear here.</span>
                  </div>
                ) : null}
              </div>
              <div className="composer-area">
                <form className="question-composer" onSubmit={investigate}>
                  <label htmlFor="question" className="sr-only">
                    Ask {displayName(agent).toLowerCase()}
                  </label>
                  <textarea
                    ref={questionInput}
                    id="question"
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    onKeyDown={(event) => {
                      if (
                        (event.metaKey || event.ctrlKey) &&
                        event.key === "Enter"
                      ) {
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                      }
                    }}
                    placeholder="Message Semtrail…"
                    rows={2}
                    maxLength={10000}
                    disabled={busy || !agent.ready}
                  />
                  <div className="composer-toolbar">
                    <span>
                      <ShieldCheck size={13} />
                      Read-only · {agent.model_count} permitted models
                    </span>
                    <button
                      className="primary-button"
                      aria-label="Send message"
                      disabled={busy || !agent.ready || !question.trim()}
                    >
                      {busy ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Send size={14} />
                      )}
                      {busy ? "Thinking…" : "Send"}
                    </button>
                  </div>
                </form>
                {!agent.ready ? (
                  <button
                    className="setup-prompt"
                    onClick={() => setView("integrations")}
                  >
                    Configure a model and API key to begin →
                  </button>
                ) : null}
                <p className="composer-hint">
                  {mode === "demo"
                    ? "Demo uses synthetic data and scripted decisions. Try the example question."
                    : "Answers include supporting queries. Review the evidence before acting."}
                  <span>⌘ / Ctrl + Enter</span>
                </p>
              </div>
            </main>
            <aside
              id="investigation-inspector"
              className="inspector"
              hidden={!inspectorOpen}
            >
              <div
                className="inspector-tabs"
                role="group"
                aria-label="Response details"
              >
                <button
                  aria-pressed={inspector === "scope"}
                  onClick={() => setInspector("scope")}
                >
                  <Layers3 size={14} />
                  Agent context
                </button>
                <button
                  aria-pressed={inspector === "evidence"}
                  onClick={() => setInspector("evidence")}
                >
                  <Database size={14} />
                  Evidence<span>{run?.queries.length || 0}</span>
                </button>
              </div>
              {inspector === "evidence" ? (
                evidenceRun || run ? (
                  <EvidencePanel
                    run={(evidenceRun || run)!}
                    selected={queryId}
                    onSelect={setQueryId}
                  />
                ) : (
                  <div className="inspector-empty">
                    <Database size={25} strokeWidth={1.5} />
                    <h3>No queries yet</h3>
                    <p>
                      Send a message to inspect the SQL, results, and
                      definitions behind the answer.
                    </p>
                  </div>
                )
              ) : (
                <div className="scope-content">
                  <div className="scope-title">
                    <span
                      className={`agent-avatar ${agent.id === "customers" ? "blue" : "purple"}`}
                    >
                      {agent.id === "customers" ? (
                        <Users size={18} />
                      ) : (
                        <Activity size={18} />
                      )}
                    </span>
                    <h2>{displayName(agent)}</h2>
                    <span>Domain agent</span>
                  </div>
                  <p className="scope-description">{agent.instructions}</p>
                  <div className="scope-counts">
                    <button onClick={() => setView("catalog")}>
                      <strong>{agent.model_count}</strong>
                      <span>Models</span>
                    </button>
                    <button onClick={() => setView("catalog")}>
                      <strong>{agent.metric_count}</strong>
                      <span>Metrics</span>
                    </button>
                    <div>
                      <strong>{agent.max_queries}</strong>
                      <span>Query limit</span>
                    </div>
                  </div>
                  <section className="scope-section">
                    <h3>
                      <ShieldCheck size={14} />
                      Data access
                    </h3>
                    <p>
                      Only models matching the permitted dbt tags can be
                      queried.
                    </p>
                    <div className="tag-row">
                      {agent.policy.allow_tags_any.map((tag) => (
                        <span className="scope-tag" key={tag}>
                          {tag}
                        </span>
                      ))}
                    </div>
                    {agent.policy.deny_tags.length ? (
                      <div className="denied-tags">
                        Excluded: {agent.policy.deny_tags.join(", ")}
                      </div>
                    ) : null}
                    <span className="enforcement-note">
                      <Check size={12} />
                      Enforced at query execution
                    </span>
                  </section>
                  <section className="scope-section">
                    <h3>
                      <Database size={14} />
                      Connected sources
                    </h3>
                    <dl className="connection-list">
                      <div>
                        <dt>
                          <GitBranch size={14} />
                          Semantics
                        </dt>
                        <dd>dbt artifacts</dd>
                      </div>
                      <div>
                        <dt>
                          <Database size={14} />
                          Warehouse
                        </dt>
                        <dd>{agent.warehouse}</dd>
                      </div>
                      <div>
                        <dt>
                          <Sparkles size={14} />
                          Model
                        </dt>
                        <dd>
                          {mode === "demo" ? "Offline fixture" : agent.provider}
                        </dd>
                      </div>
                    </dl>
                  </section>
                  <section className="scope-section">
                    <div className="scope-section-title">
                      <h3>Available models</h3>
                      <button
                        aria-label="Open semantic catalog"
                        onClick={() => setView("catalog")}
                      >
                        <ArrowUpRight size={14} />
                      </button>
                    </div>
                    {catalog?.models.map((model) => (
                      <button
                        className="model-link"
                        key={model.id}
                        onClick={() => setView("catalog")}
                      >
                        <Layers3 size={14} />
                        <span>{model.name}</span>
                        <ChevronRight size={13} />
                      </button>
                    ))}
                  </section>
                  <button
                    className="catalog-link"
                    onClick={() => setView("catalog")}
                  >
                    Explore semantic catalog
                    <ArrowRight size={14} />
                  </button>
                </div>
              )}
            </aside>
          </div>
        ) : null}
        {view !== "investigate" && view !== "overview" ? (
          <main className="secondary-content">
            <div className="page-heading">
              <h1>{titles[view][0]}</h1>
              <p>{titles[view][1]}</p>
            </div>
            {view === "catalog" && agent ? (
              <CatalogPanel catalog={catalog} agent={agent} />
            ) : null}
            {view === "history" ? (
              <section className="panel overflow-hidden fade-in">
                <div className="border-b border-stone-100 px-6 py-4 text-xs font-medium">
                  Recent chats <span className="ml-2 pill">{runs.length}</span>
                </div>
                {runs.length ? (
                  runs.map((item) => (
                    <button
                      key={item.run_id}
                      onClick={() => openRun(item)}
                      className="flex w-full items-center gap-4 border-b border-stone-100 px-6 py-5 text-left transition last:border-b-0 hover:bg-stone-50"
                    >
                      <span className="rounded-lg bg-forest-50 p-2 text-forest-600">
                        <GitBranch size={16} />
                      </span>
                      <div className="flex-1">
                        <p className="text-sm font-medium capitalize">
                          {item.agent} chat
                        </p>
                        <p className="mt-1 text-[11px] text-stone-400">
                          {new Date(item.created_at).toLocaleString()} ·{" "}
                          <span className="font-mono">
                            {item.run_id.slice(0, 10)}
                          </span>
                        </p>
                      </div>
                      <ArrowRight size={15} className="text-stone-400" />
                    </button>
                  ))
                ) : (
                  <div className="p-10 text-center text-sm text-stone-400">
                    Your first chat will appear here with its complete evidence
                    trail.
                  </div>
                )}
              </section>
            ) : null}
            {view === "integrations" ? (
              <div className="grid gap-5 fade-in lg:grid-cols-2">
                <section className="panel p-6">
                  <Terminal size={20} className="mb-4 text-forest-600" />
                  <h2 className="text-sm font-semibold">
                    Connect your own stack
                  </h2>
                  <p className="my-3 text-xs leading-6 text-stone-500">
                    Configure a local agent YAML with dbt artifact paths, a
                    read-only database connection, and your preferred provider.
                    Keys stay in environment variables on your compute.
                  </p>
                  <CodeBlock
                    text={`pip install -e '.[server,postgres,openai]'\nexport OPENAI_API_KEY=your-key\nexport SEMTRAIL_REVENUE_DATABASE_URL=your-dsn\nsemtrail serve --agents /srv/agents`}
                  />
                  <a
                    className="mt-4 inline-flex items-center gap-1 text-xs text-forest-700"
                    href="https://github.com/jonathantiedchen/semtrail#connect-your-dbt-repository-and-database"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Read the setup guide
                    <ArrowUpRight size={12} />
                  </a>
                </section>
                <section className="panel p-6">
                  <Braces size={20} className="mb-4 text-forest-600" />
                  <h2 className="text-sm font-semibold">
                    An API for your workflows
                  </h2>
                  <p className="my-3 text-xs leading-6 text-stone-500">
                    Embed data conversations in internal tools, notebooks and
                    automation. Every response includes the explanation,
                    supporting SQL and bounded results.
                  </p>
                  <CodeBlock
                    text={`POST /api/agents/revenue/investigations\nContent-Type: application/json\n\n{ "question": "What is revenue by country?" }`}
                  />
                  <a
                    href="/docs"
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 inline-flex items-center gap-1 text-xs text-forest-700"
                  >
                    Explore OpenAPI documentation
                    <ArrowUpRight size={12} />
                  </a>
                </section>
                <section className="panel p-6">
                  <Settings2 size={20} className="mb-4 text-forest-600" />
                  <h2 className="text-sm font-semibold">
                    Use agents from MCP clients
                  </h2>
                  <p className="my-3 text-xs leading-6 text-stone-500">
                    Let compatible AI tools discover domain agents, inspect
                    permitted semantics, ask a question and retrieve its
                    evidence through stdio MCP.
                  </p>
                  <CodeBlock
                    text={`pip install -e '.[mcp,openai]'\nsemtrail mcp --agents /srv/agents`}
                  />
                  <p className="mt-4 text-[11px] leading-5 text-stone-400">
                    The same runtime and access policy serve the UI, API and MCP
                    tools.
                  </p>
                </section>
                <section className="panel p-6">
                  <ArrowDownToLine size={20} className="mb-4 text-forest-600" />
                  <h2 className="text-sm font-semibold">
                    Evidence you can take with you
                  </h2>
                  <p className="my-3 text-xs leading-6 text-stone-500">
                    Export response JSON for reviews, notebooks and reproducible
                    handoffs. Each run includes an artifact fingerprint,
                    effective model scope, exact SQL and actual query results.
                  </p>
                  <button
                    disabled={!run}
                    className="quiet-button mt-3"
                    onClick={() =>
                      run && downloadJson(run, `semtrail-${run.run_id}.json`)
                    }
                  >
                    <ArrowDownToLine size={13} />
                    Export current response
                  </button>
                  <p className="mt-4 text-[11px] leading-5 text-stone-400">
                    Evidence may contain sensitive data. Store and share it
                    according to your policies.
                  </p>
                </section>
              </div>
            ) : null}
            {!agents.length && !error ? (
              <div className="panel p-8 text-sm text-stone-500">
                No agents configured. Add YAML files to the server’s agent
                directory, then reload.
              </div>
            ) : null}
          </main>
        ) : null}
        {view === "investigate" && !agents.length ? (
          <div className="empty-workspace">
            {error
              ? "Connect to your server to load agents."
              : "Loading workspace…"}
          </div>
        ) : null}
      </div>
      {showAccess ? (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-stone-900/25 p-5"
          onClick={() => setShowAccess(false)}
        >
          <section
            ref={dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="access-title"
            className="panel w-full max-w-md p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 id="access-title" className="text-base font-semibold">
                Server access
              </h2>
              <button
                aria-label="Close access dialog"
                onClick={() => setShowAccess(false)}
              >
                <X size={18} />
              </button>
            </div>
            <p className="my-4 text-xs leading-6 text-stone-500">
              If your server requires an access token, enter it here. This is
              the Semtrail server token, not your LLM API key. It is kept in
              memory for this tab.
            </p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                setToken(tokenDraft);
                setShowAccess(false);
              }}
            >
              <label htmlFor="server-token" className="text-xs font-medium">
                Server token
              </label>
              <input
                autoFocus
                id="server-token"
                type="password"
                value={tokenDraft}
                onChange={(event) => setTokenDraft(event.target.value)}
                className="mt-2 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
              />
              <button className="primary-button mt-5 w-full">
                Connect workspace
              </button>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}
