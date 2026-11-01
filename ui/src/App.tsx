import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Braces,
  Check,
  ChevronDown,
  CircleDot,
  Clock3,
  Database,
  GitBranch,
  KeyRound,
  Layers3,
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
import CatalogPanel from "./CatalogPanel";
import EvidencePanel, { CodeBlock } from "./EvidencePanel";

type View = "investigate" | "catalog" | "history" | "integrations";
const navigation = [
  { id: "investigate" as const, title: "Investigate", icon: MessageSquare },
  { id: "catalog" as const, title: "Semantic catalog", icon: Layers3 },
  { id: "history" as const, title: "Run history", icon: Clock3 },
  { id: "integrations" as const, title: "Integrations", icon: Braces },
];
const titles: Record<View, [string, string]> = {
  investigate: [
    "Good questions. Grounded answers.",
    "Investigate your business with agents that know what your data means.",
  ],
  catalog: [
    "Your business, defined.",
    "The models and metrics this agent can use, directly from dbt.",
  ],
  history: [
    "An answer is only the beginning.",
    "Revisit investigations and follow the evidence behind each conclusion.",
  ],
  integrations: [
    "Fits into your world.",
    "Your repository, your warehouse, your model. Connect the tools you already use.",
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
    <p className="whitespace-pre-wrap text-sm leading-8 text-stone-600">
      {text.split(/(\[q\d+\])/g).map((part, i) =>
        /^\[q\d+\]$/.test(part) ? (
          <button
            key={i}
            onClick={() => onCitation(part.slice(1, -1))}
            className="mx-1 rounded bg-forest-50 px-1.5 py-0.5 font-mono text-xs font-medium text-forest-700 hover:bg-forest-100"
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
  const [view, setView] = useState<View>("investigate");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selected, setSelected] = useState("");
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [run, setRun] = useState<Run | null>(null);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState("");
  const [token, setToken] = useState("");
  const [tokenDraft, setTokenDraft] = useState("");
  const [showAccess, setShowAccess] = useState(false);
  const dialog = useRef<HTMLElement>(null);
  const [queryId, setQueryId] = useState("q1");
  const agent = agents.find((agent) => agent.id === selected);

  useEffect(() => {
    if (!showAccess) return;
    const previous = document.activeElement as HTMLElement | null;
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowAccess(false);
      if (event.key !== "Tab") return;
      const elements = dialog.current?.querySelectorAll<HTMLElement>("button, input");
      if (!elements?.length) return;
      const first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("keydown", keydown); previous?.focus(); };
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
    setQuestion(
      agents.find((agent) => agent.id === selected)?.demo_question || "",
    );
    return () => {
      active = false;
    };
  }, [selected, token, agents]);

  async function investigate(event: React.FormEvent) {
    event.preventDefault();
    if (!agent || busy || !question.trim()) return;
    setBusy(true);
    setError("");
    setRun(null);
    try {
      const result = await api<Run>(
        `/agents/${agent.id}/investigations`,
        token,
        { method: "POST", body: JSON.stringify({ question }) },
      );
      setRun(result);
      setQueryId(result.queries[0]?.query_id || "q1");
      setRuns(await api<RunSummary[]>("/runs", token));
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Investigation failed.",
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
      setSelected(item.agent_id);
      setRun(result);
      setQueryId(result.queries[0]?.query_id || "q1");
      setView("investigate");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not open run.",
      );
    }
  }

  return (
    <div className="min-h-screen lg:flex">
      <aside className="flex shrink-0 flex-col border-b border-stone-200 bg-[#f0f2ec] lg:fixed lg:inset-y-0 lg:w-[238px] lg:border-b-0 lg:border-r">
        <a
          href="/"
          className="flex items-center gap-2.5 px-6 pb-6 pt-7 text-xl font-semibold tracking-tight text-forest-900"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-forest-900 text-white">
            <GitBranch size={19} />
          </span>
          semtrail<span className="mt-1 text-forest-500">.</span>
        </a>
        <div className="mx-4 mb-6 flex items-center gap-2.5 rounded-xl border border-stone-200/70 bg-white/70 px-3 py-3">
          <span className="rounded-md bg-stone-100 p-1.5">
            <Database size={15} className="text-stone-500" />
          </span>
          <div className="flex-1">
            <p className="text-xs font-medium">My workspace</p>
            <p className="mt-0.5 text-[10px] text-stone-400">
              Self-hosted · v0.1
            </p>
          </div>
          <ChevronDown size={13} className="text-stone-400" />
        </div>
        <nav
          aria-label="Main navigation"
          className="flex flex-wrap gap-1 px-3 lg:block"
        >
          {navigation.map((item) => (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              aria-current={view === item.id ? "page" : undefined}
              className={`mb-1 flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] transition lg:w-full ${view === item.id ? "bg-white font-medium text-forest-900 shadow-sm" : "text-stone-500 hover:bg-white/60"}`}
            >
              <item.icon size={16} />
              {item.title}
              {view === item.id ? (
                <span className="ml-auto hidden h-1.5 w-1.5 rounded-full bg-forest-500 lg:block" />
              ) : null}
            </button>
          ))}
        </nav>
        <div className="mx-6 mb-3 mt-7 flex items-center justify-between">
          <p className="label">Your agents</p>
          <ShieldCheck size={13} className="text-stone-400" />
        </div>
        <div className="flex gap-2 px-3 pb-4 lg:block">
          {agents.map((item) => (
            <button
              key={item.id}
              disabled={busy}
              onClick={() => {
                setSelected(item.id);
                setRun(null);
                setView("investigate");
              }}
              className={`mb-2 flex items-center gap-3 rounded-xl border p-3 text-left transition lg:w-full ${selected === item.id ? "border-forest-100 bg-forest-50" : "border-transparent hover:bg-white/70"}`}
            >
              <span
                className={`rounded-lg p-2 ${selected === item.id ? "bg-forest-100 text-forest-700" : "bg-stone-200/60 text-stone-500"}`}
              >
                {item.id === "customers" ? (
                  <Users size={16} />
                ) : (
                  <Activity size={16} />
                )}
              </span>
              <div>
                <p className="text-xs font-medium">{displayName(item)}</p>
                <p className="mt-1 text-[10px] text-stone-400">
                  {item.model_count} models · {item.metric_count} metrics
                </p>
              </div>
            </button>
          ))}
        </div>
        <div className="mt-auto hidden p-4 lg:block">
          <div className="rounded-xl border border-stone-200 bg-white/55 p-4">
            <ShieldCheck size={18} className="mb-2.5 text-forest-600" />
            <p className="text-xs font-medium">Grounded. Governed. Yours.</p>
            <p className="mt-2 text-[11px] leading-5 text-stone-500">
              Your compute and API keys.
              <br />
              Access enforced beyond the prompt.
            </p>
          </div>
          <a
            href="https://github.com/jonathantiedchen/semtrail"
            target="_blank"
            rel="noreferrer"
            className="mt-4 flex items-center justify-between px-1 text-[11px] text-stone-500"
          >
            Open source on GitHub
            <ArrowUpRight size={13} />
          </a>
        </div>
      </aside>

      <div className="min-w-0 flex-1 lg:ml-[238px]">
        <header className="flex h-[76px] items-center justify-between border-b border-stone-200/70 bg-white/60 px-5 md:px-9">
          <div className="flex items-center gap-2 text-xs text-stone-400">
            <span>Workspace</span>
            <span>/</span>
            <span className="font-medium text-stone-700">
              {agent ? displayName(agent) : "Connect"}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden items-center gap-1.5 text-[11px] text-stone-500 sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-forest-500" />
              {mode === "demo" ? "Offline demo" : "Self-hosted"}
            </span>
            <button
              className="quiet-button"
              onClick={() => setShowAccess(true)}
            >
              <KeyRound size={13} />
              Access
            </button>
          </div>
        </header>
        <main className="mx-auto max-w-[1400px] px-5 py-8 md:px-9 md:py-10">
          <div className="mb-7 flex items-start justify-between gap-4">
            <div>
              <p className="label mb-3">
                {navigation.find((item) => item.id === view)?.title}
              </p>
              <h1 className="text-2xl font-semibold tracking-[-0.035em] text-[#263d33] md:text-[29px]">
                {titles[view][0]}
              </h1>
              <p className="mt-3 text-[13px] leading-6 text-stone-500">
                {titles[view][1]}
              </p>
            </div>
            {view === "investigate" && run ? (
              <button
                className="quiet-button mt-5 shrink-0"
                onClick={() => {
                  setRun(null);
                  setQuestion(agent?.demo_question || "");
                }}
              >
                <Plus size={14} /> New
              </button>
            ) : null}
          </div>
          {error ? (
            <div
              role="alert"
              className="mb-5 flex items-start justify-between gap-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs leading-6 text-red-800"
            >
              <span>{error}</span>
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={15} />
              </button>
            </div>
          ) : null}
          {mode === "demo" ? (
            <div className="mb-6 flex items-start gap-2.5 rounded-xl border border-amber-200/60 bg-[#fff9eb] px-4 py-3 text-[11px] leading-5 text-amber-800">
              <Sparkles size={15} className="mt-0.5 shrink-0" />
              <p>
                <strong>Explore the offline demo.</strong> Real SQL and results,
                synthetic data, scripted model decisions. Use the example
                question, or configure your own LLM for open-ended
                investigations.
              </p>
            </div>
          ) : null}

          {view === "investigate" && agent ? (
            <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_265px]">
              <div className="min-w-0 space-y-5">
                <form
                  onSubmit={investigate}
                  className="panel p-5 shadow-[0_3px_16px_-12px_#425d49]"
                >
                  <label
                    htmlFor="question"
                    className="flex items-center gap-2 text-xs font-medium text-stone-700"
                  >
                    <MessageSquare size={14} className="text-forest-600" /> Ask{" "}
                    {displayName(agent).toLowerCase()}
                  </label>
                  <textarea
                    id="question"
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    placeholder="What would you like to understand about your business?"
                    rows={3}
                    maxLength={10000}
                    disabled={busy || !agent.ready}
                    className="mt-3 w-full resize-y border-0 bg-transparent py-2 text-sm leading-7 placeholder:text-stone-400 focus:outline-none disabled:opacity-60"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 pt-4">
                    <span className="flex items-center gap-1.5 text-[11px] text-stone-400">
                      <ShieldCheck size={13} />
                      {agent.model_count} permitted models · Read-only
                    </span>
                    <button
                      className="primary-button"
                      aria-label="Run investigation"
                      disabled={busy || !agent.ready || !question.trim()}
                    >
                      {busy ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Send size={14} />
                      )}
                      {busy ? "Investigating…" : "Investigate"}
                    </button>
                  </div>
                  {!agent.ready ? (
                    <button
                      type="button"
                      className="mt-3 text-xs text-forest-700 underline"
                      onClick={() => setView("integrations")}
                    >
                      Configure a model and API key to begin →
                    </button>
                  ) : null}
                </form>
                {busy ? (
                  <div
                    role="status"
                    className="panel flex items-center gap-4 p-6"
                  >
                    <Loader2
                      size={20}
                      className="animate-spin text-forest-600"
                    />
                    <div>
                      <p className="text-sm font-medium">
                        Following the evidence…
                      </p>
                      <p className="mt-1 text-xs leading-6 text-stone-500">
                        Inspecting definitions and querying permitted data. This
                        can take several model calls.
                      </p>
                    </div>
                  </div>
                ) : null}
                {!run && !busy ? (
                  <div className="py-7">
                    <div className="mb-5 flex items-center gap-2 text-xs text-stone-500">
                      <Sparkles size={14} /> A good place to start
                    </div>
                    <button
                      onClick={() =>
                        setQuestion(
                          agent.demo_question ||
                            `What can you tell me about ${agent.name}? Start with the available business definitions.`,
                        )
                      }
                      className="group panel flex w-full items-center justify-between gap-4 p-5 text-left transition hover:border-forest-100 hover:bg-forest-50/40"
                    >
                      <div>
                        <p className="text-[13px] font-medium">
                          {agent.demo_question ||
                            `Explore the business definitions available to ${displayName(agent).toLowerCase()}.`}
                        </p>
                        <p className="mt-2 text-xs text-stone-400">
                          Understand the numbers and see how they were
                          calculated.
                        </p>
                      </div>
                      <ArrowRight
                        size={17}
                        className="shrink-0 text-forest-600 transition group-hover:translate-x-1"
                      />
                    </button>
                    <div className="mt-9 grid gap-5 sm:grid-cols-3">
                      {[
                        {
                          icon: BookOpen,
                          title: "Business meaning first",
                          text: "Definitions and model grain come directly from dbt.",
                        },
                        {
                          icon: ShieldCheck,
                          title: "A deliberate data scope",
                          text: "Tag policies are checked before every query runs.",
                        },
                        {
                          icon: GitBranch,
                          title: "A trail you can follow",
                          text: "Inspect the SQL and results supporting each answer.",
                        },
                      ].map((item) => (
                        <div key={item.title}>
                          <item.icon
                            size={18}
                            className="mb-3 text-stone-400"
                          />
                          <h3 className="text-xs font-medium text-stone-600">
                            {item.title}
                          </h3>
                          <p className="mt-2 text-[11px] leading-5 text-stone-400">
                            {item.text}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {run ? (
                  <div className="space-y-5 fade-in">
                    <section className="panel p-6">
                      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-forest-50 text-forest-700">
                            <Sparkles size={15} />
                          </span>
                          <h2 className="text-sm font-semibold">
                            What the data tells us
                          </h2>
                        </div>
                        <span className="pill">
                          <Check size={11} />
                          {run.answer.status.replaceAll("_", " ")}
                        </span>
                      </div>
                      <p className="mb-4 border-l-2 border-stone-200 pl-3 text-xs italic leading-6 text-stone-400">
                        {run.question}
                      </p>
                      <Explanation
                        text={run.answer.explanation}
                        onCitation={setQueryId}
                      />
                      {run.answer.definitions.length ? (
                        <div className="mt-5 rounded-xl bg-forest-50/70 p-4">
                          <p className="label mb-2 text-forest-600">
                            Definitions used
                          </p>
                          {run.answer.definitions.map((item, i) => (
                            <p
                              key={i}
                              className="text-xs leading-6 text-forest-700"
                            >
                              {item}
                            </p>
                          ))}
                        </div>
                      ) : null}
                      {run.answer.limitations.length ? (
                        <details className="mt-5 text-xs text-stone-500" open>
                          <summary className="cursor-pointer font-medium">
                            Assumptions & limitations
                          </summary>
                          <ul className="mt-2 list-disc space-y-1 pl-4 leading-6">
                            {run.answer.limitations.map((item, i) => (
                              <li key={i}>{item}</li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
                    </section>
                    <EvidencePanel
                      run={run}
                      selected={queryId}
                      onSelect={setQueryId}
                    />
                    <details className="px-1 text-xs text-stone-400">
                      <summary className="cursor-pointer">
                        Investigation activity · {run.actions.length} actions
                      </summary>
                      <ol className="mt-3 space-y-2 border-l border-stone-200 pl-4">
                        {run.actions.map((action, i) => (
                          <li key={i} className="flex items-center gap-2">
                            <CircleDot size={11} />
                            <span className="font-mono">{action.tool}</span>
                            <span>{action.status}</span>
                            {action.query_id ? (
                              <button
                                className="text-forest-600"
                                onClick={() => setQueryId(action.query_id!)}
                              >
                                {action.query_id}
                              </button>
                            ) : null}
                          </li>
                        ))}
                      </ol>
                    </details>
                  </div>
                ) : null}
              </div>
              <aside className="space-y-4">
                <section className="panel p-5">
                  <p className="label mb-4">Agent context</p>
                  <div className="mb-4 flex items-center gap-2.5">
                    <span className="rounded-lg bg-forest-50 p-2 text-forest-600">
                      {agent.id === "customers" ? (
                        <Users size={17} />
                      ) : (
                        <Activity size={17} />
                      )}
                    </span>
                    <div>
                      <p className="text-xs font-semibold">
                        {displayName(agent)}
                      </p>
                      <p className="mt-1 text-[10px] text-stone-400">
                        Domain-specific data agent
                      </p>
                    </div>
                  </div>
                  <p className="text-xs leading-6 text-stone-500">
                    {agent.instructions}
                  </p>
                  <div className="my-5 h-px bg-stone-100" />
                  <p className="label mb-3">Accessible domains</p>
                  <div className="flex flex-wrap gap-2">
                    {agent.policy.allow_tags_any.map((tag) => (
                      <span
                        key={tag}
                        className="pill bg-forest-50 text-forest-700"
                      >
                        <span className="h-1 w-1 rounded-full bg-forest-500" />
                        {tag}
                      </span>
                    ))}
                  </div>
                  <button
                    onClick={() => setView("catalog")}
                    className="mt-5 flex items-center gap-2 text-xs font-medium text-forest-700"
                  >
                    Explore semantic catalog
                    <ArrowUpRight size={13} />
                  </button>
                </section>
                <section className="rounded-xl border border-dashed border-stone-300/70 p-5">
                  <p className="label mb-4">Connected stack</p>
                  <dl className="space-y-4 text-xs">
                    {[
                      {
                        icon: GitBranch,
                        title: "Semantics",
                        value: "dbt artifacts",
                      },
                      {
                        icon: Database,
                        title: "Warehouse",
                        value: agent.warehouse,
                      },
                      {
                        icon: Sparkles,
                        title: "Model",
                        value:
                          mode === "demo" ? "Offline fixture" : agent.provider,
                      },
                    ].map((item) => (
                      <div
                        key={item.title}
                        className="flex items-center justify-between gap-2"
                      >
                        <dt className="flex items-center gap-2 text-stone-400">
                          <item.icon size={13} />
                          {item.title}
                        </dt>
                        <dd className="font-medium text-stone-600">
                          {item.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-5 border-t border-stone-200/60 pt-4 text-[10px] leading-5 text-stone-400">
                    Up to {agent.max_queries} queries and {agent.max_steps}{" "}
                    model turns per investigation.
                  </p>
                </section>
              </aside>
            </div>
          ) : null}

          {view === "catalog" && agent ? (
            <CatalogPanel catalog={catalog} agent={agent} />
          ) : null}
          {view === "history" ? (
            <section className="panel overflow-hidden fade-in">
              <div className="border-b border-stone-100 px-6 py-4 text-xs font-medium">
                Recent investigations{" "}
                <span className="ml-2 pill">{runs.length}</span>
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
                        {item.agent} investigation
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
                  Your first investigation will appear here with its complete
                  evidence trail.
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
                  Embed governed investigations in internal tools, notebooks and
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
                  permitted semantics, run an investigation and retrieve its
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
                  Export investigation JSON for reviews, notebooks and
                  reproducible handoffs. Each run includes an artifact
                  fingerprint, effective model scope, exact SQL and actual query
                  results.
                </p>
                <button
                  disabled={!run}
                  className="quiet-button mt-3"
                  onClick={() =>
                    run && downloadJson(run, `semtrail-${run.run_id}.json`)
                  }
                >
                  <ArrowDownToLine size={13} />
                  Export current investigation
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
          <footer className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-stone-200/70 pt-5 text-[10px] text-stone-400">
            <span className="flex items-center gap-1.5">
              <ShieldCheck size={12} />
              Grounded in dbt. Backed by evidence.
            </span>
            <span>Semtrail · Open-source data agents</span>
          </footer>
        </main>
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
