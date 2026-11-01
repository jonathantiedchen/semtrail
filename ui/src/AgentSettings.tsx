import { useState } from "react";
import { Check, Loader2, Settings2, ShieldCheck, Workflow } from "lucide-react";
import type { Agent } from "./types";
import { api } from "./api";

export default function AgentSettings({
  agents,
  token,
  onSaved,
}: {
  agents: Agent[];
  token: string;
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState(agents[0]?.id || "");
  const agent = agents.find((a) => a.id === selected);
  return (
    <div className="agent-settings">
      <nav aria-label="Agent configurations">
        {agents.map((a) => (
          <button
            aria-pressed={selected === a.id}
            onClick={() => setSelected(a.id)}
            key={a.id}
          >
            {a.kind === "orchestrator" ? (
              <Workflow size={16} />
            ) : (
              <Settings2 size={16} />
            )}
            <span>
              {a.kind === "orchestrator" ? "Orchestration" : a.name}
              <small>
                {a.kind === "orchestrator"
                  ? "Automatic routing"
                  : "Domain agent"}
              </small>
            </span>
          </button>
        ))}
      </nav>
      {agent ? (
        <SettingsForm
          key={agent.id}
          agent={agent}
          agents={agents}
          token={token}
          onSaved={onSaved}
        />
      ) : null}
    </div>
  );
}
function SettingsForm({
  agent,
  agents,
  token,
  onSaved,
}: {
  agent: Agent;
  agents: Agent[];
  token: string;
  onSaved: () => void;
}) {
  const [instructions, setInstructions] = useState(agent.instructions);
  const [allow, setAllow] = useState(agent.policy.allow_tags_any.join(", "));
  const [deny, setDeny] = useState(agent.policy.deny_tags.join(", "));
  const [enabled, setEnabled] = useState(agent.allowed_agents || []);
  const [provider, setProvider] = useState(agent.provider_agent || "");
  const [queries, setQueries] = useState(agent.max_queries);
  const [steps, setSteps] = useState(agent.max_steps);
  const [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  const orchestration = agent.kind === "orchestrator";
  const tags = (value: string) =>
    value
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  return (
    <form
      className="settings-form"
      onSubmit={async (event) => {
        event.preventDefault();
        setSaving(true);
        setError("");
        setSaved(false);
        try {
          await api(`/agents/${agent.id}/settings`, token, {
            method: "PUT",
            body: JSON.stringify(
              orchestration
                ? {
                    instructions,
                    allowed_agents: enabled,
                    provider_agent: provider || null,
                  }
                : {
                    instructions,
                    policy: {
                      allow_tags_any: tags(allow),
                      deny_tags: tags(deny),
                    },
                    max_steps: steps,
                    max_queries: queries,
                  },
            ),
          });
          setSaved(true);
          onSaved();
        } catch (reason) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Could not save settings.",
          );
        } finally {
          setSaving(false);
        }
      }}
    >
      <h2>
        {orchestration
          ? "Orchestration agent"
          : `${agent.name.charAt(0).toUpperCase() + agent.name.slice(1)} agent`}
      </h2>
      <p>
        {orchestration
          ? "Auto chooses one enabled domain agent per message. It asks for clarification when the question spans domains or is unclear."
          : "Define this agent’s business role, permitted dbt tags and query limits."}
      </p>
      <label>
        Instructions
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          required
          maxLength={20000}
          rows={6}
        />
      </label>
      {orchestration ? (
        <>
          <fieldset>
            <legend>Available domain agents</legend>
            {agents
              .filter((a) => a.id !== "orchestrator")
              .map((a) => (
                <label className="settings-check" key={a.id}>
                  <input
                    type="checkbox"
                    checked={enabled.includes(a.id)}
                    onChange={(e) =>
                      setEnabled(
                        e.target.checked
                          ? [...enabled, a.id]
                          : enabled.filter((id) => id !== a.id),
                      )
                    }
                  />
                  {a.name}
                  <span>{a.ready ? "Ready" : "Setup required"}</span>
                </label>
              ))}
          </fieldset>
          <label>
            Routing model configuration
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
            >
              <option value="">Use first ready domain agent’s provider</option>
              {agents
                .filter(
                  (a) => a.id !== "orchestrator" && enabled.includes(a.id),
                )
                .map((a) => (
                  <option value={a.id} key={a.id}>
                    {a.name} · {a.provider}
                  </option>
                ))}
            </select>
          </label>
        </>
      ) : (
        <>
          <div className="settings-fields">
            <label>
              Allowed dbt tags
              <input
                value={allow}
                onChange={(e) => setAllow(e.target.value)}
                placeholder="finance, revenue"
              />
            </label>
            <label>
              Denied dbt tags
              <input
                value={deny}
                onChange={(e) => setDeny(e.target.value)}
                placeholder="sensitive"
              />
            </label>
          </div>
          <p className="settings-note">
            <ShieldCheck size={14} />
            Comma-separated tags. Deny rules override allow rules; an empty
            allow list grants no model access.
          </p>
          <div className="settings-fields">
            <label>
              Queries per response
              <input
                type="number"
                min={1}
                max={20}
                value={queries}
                onChange={(e) => setQueries(Number(e.target.value))}
              />
            </label>
            <label>
              Model turns per response
              <input
                type="number"
                min={2}
                max={40}
                value={steps}
                onChange={(e) => setSteps(Number(e.target.value))}
              />
            </label>
          </div>
          <dl className="settings-connection">
            <div>
              <dt>Warehouse</dt>
              <dd>{agent.warehouse}</dd>
            </div>
            <div>
              <dt>LLM provider</dt>
              <dd>{agent.provider}</dd>
            </div>
            <div>
              <dt>Model</dt>
              <dd>{agent.model || "Not configured"}</dd>
            </div>
          </dl>
          <p className="settings-note">
            Database connections and LLM API keys are configured on the server
            using agent YAML files and environment variables.
          </p>
        </>
      )}
      {error ? (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      ) : null}
      <div className="settings-save">
        <button className="primary-button" disabled={saving}>
          {saving ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Check size={14} />
          )}
          Save changes
        </button>
        {saved ? (
          <span role="status">Saved. New messages use these settings.</span>
        ) : null}
      </div>
    </form>
  );
}
