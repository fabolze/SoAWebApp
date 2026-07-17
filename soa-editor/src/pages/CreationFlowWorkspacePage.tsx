import { useEffect, useMemo, useState } from "react";
import { createCreationFlowDraft, creationFlowIssues, type CreationFlowDraft } from "../authoring/creationFlow";
import {
  deleteCreationFlowDraft, listCreationFlowDrafts, loadCreationFlowDraft, saveCreationFlowDraft,
  type CreationFlowDraftSummary,
} from "../authoring/creationFlowDraftStorage";
import ThenComposer from "../components/authoring/ThenComposer";
import { AuthoringPageShell, AuthoringPanel, EmptyState, StatusNotice } from "../components/authoringUi";
import { apiFetch } from "../lib/api";
import { BUTTON_CLASSES, BUTTON_SIZES } from "../styles/uiTokens";
import { generateUlid } from "../utils/generateId";

interface CommittedFlow {
  id: string;
  title: string;
  revision: number;
  compiler_version: string;
  updated_at: number;
  normalized_draft: CreationFlowDraft;
}

function isCommittedFlow(value: unknown): value is CommittedFlow {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Partial<CommittedFlow>;
  return typeof row.id === "string" && typeof row.title === "string" && Boolean(row.normalized_draft?.format);
}

function originLabel(draft: CreationFlowDraft): string {
  return draft.origin?.subRef?.label || draft.origin?.ref.label || draft.title;
}

function FlowTopology({ draft }: { draft: CreationFlowDraft }) {
  const labels = new Map(draft.steps.map((step, index) => [step.id, `${index + 1}. ${step.text || step.kind}`]));
  const branchCount = draft.transitions.filter((transition) => transition.trigger !== "complete").length;
  return <details className="mt-3 rounded border border-slate-200 p-2 text-xs dark:border-slate-800"><summary className="cursor-pointer font-semibold">Topology · {draft.transitions.length} transitions · {branchCount} explicit branches</summary><div className="mt-2 grid gap-2 lg:grid-cols-2"><ol className="space-y-1">{draft.steps.map((step, index) => <li key={step.id}><span className="font-mono text-slate-500">{index + 1}</span> {step.text || step.kind}</li>)}</ol><div className="space-y-1">{draft.transitions.map((transition) => <div key={transition.id} className="rounded bg-slate-50 p-1 dark:bg-slate-950">{labels.get(transition.fromStepId)} <b>—{transition.label || transition.trigger}→</b> {labels.get(transition.toStepId)}</div>)}{draft.relations.map((relation) => <div key={relation.id} className="rounded bg-violet-50 p-1 text-violet-800 dark:bg-violet-950 dark:text-violet-200">{labels.get(relation.fromStepId)} <b>—{relation.relation}→</b> {labels.get(relation.toStepId)}</div>)}</div></div></details>;
}

export default function CreationFlowWorkspacePage() {
  const [drafts, setDrafts] = useState<CreationFlowDraftSummary[]>([]);
  const [committed, setCommitted] = useState<CommittedFlow[]>([]);
  const [active, setActive] = useState<CreationFlowDraft | null>(null);
  const [loadingCommitted, setLoadingCommitted] = useState(true);
  const [query, setQuery] = useState("");
  const [shapeFilter, setShapeFilter] = useState<"all" | CreationFlowDraft["shape"]>("all");
  const [issueFilter, setIssueFilter] = useState<"all" | "blocked" | "ready">("all");
  const refreshDrafts = () => setDrafts(listCreationFlowDrafts());

  useEffect(() => {
    refreshDrafts();
    const refresh = () => refreshDrafts();
    window.addEventListener("soa:creation-flow-drafts-changed", refresh);
    return () => window.removeEventListener("soa:creation-flow-drafts-changed", refresh);
  }, []);

  useEffect(() => {
    setLoadingCommitted(true);
    void apiFetch("/api/creation-flow-manifests")
      .then(async (response) => response.ok ? response.json() as Promise<unknown> : [])
      .then((value) => setCommitted(Array.isArray(value) ? value.filter(isCommittedFlow).sort((a, b) => b.updated_at - a.updated_at) : []))
      .catch(() => setCommitted([]))
      .finally(() => setLoadingCommitted(false));
  }, [active]);

  const allLocalDrafts = useMemo(() => drafts.map((summary) => ({ summary, draft: loadCreationFlowDraft(summary.id) })).filter((row): row is { summary: CreationFlowDraftSummary; draft: CreationFlowDraft } => Boolean(row.draft)), [drafts]);
  const localDrafts = useMemo(() => allLocalDrafts.filter(({ draft }) => {
    const haystack = [draft.title, originLabel(draft), ...draft.steps.map((step) => step.text)].join(" ").toLowerCase();
    const blockers = creationFlowIssues(draft).some((issue) => issue.severity === "blocker");
    return (!query.trim() || haystack.includes(query.trim().toLowerCase()))
      && (shapeFilter === "all" || draft.shape === shapeFilter)
      && (issueFilter === "all" || (issueFilter === "blocked" ? blockers : !blockers));
  }), [allLocalDrafts, issueFilter, query, shapeFilter]);
  const visibleCommitted = useMemo(() => committed.filter((flow) => !query.trim() || [flow.title, originLabel(flow.normalized_draft), ...flow.normalized_draft.steps.map((step) => step.text)].join(" ").toLowerCase().includes(query.trim().toLowerCase())), [committed, query]);
  const start = (shape: CreationFlowDraft["shape"]) => {
    const anchor = generateUlid();
    const draft = createCreationFlowDraft({
      title: shape === "constellation" ? "Untitled story seed" : "Untitled creation flow",
      shape,
      origin: { ref: { kind: "custom", draftId: anchor, label: "Creation Flow workspace" } },
      returnFrame: { workspace: "creation-flow" },
    });
    saveCreationFlowDraft(draft);
    setActive(draft);
  };
  const openCommitted = (flow: CommittedFlow) => {
    const draft = saveCreationFlowDraft(flow.normalized_draft);
    setActive(draft);
  };

  return <AuthoringPageShell>
    <AuthoringPanel
      title="Creation Flow"
      subtitle="Resume, shape, rehearse, review, and commit narrative sequences and story constellations."
      help="Local drafts remain browser-recoverable. Canonical records are written only through rollback-only preview followed by atomic commit."
      actions={<><button type="button" className={`${BUTTON_CLASSES.primary} ${BUTTON_SIZES.sm}`} onClick={() => start("sequence")}>New sequence</button><button type="button" className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.sm}`} onClick={() => start("constellation")}>New story seed</button></>}
    >
      <StatusNotice tone="info">Runtime and DataTable execution remain separately verified contracts; this workspace never treats a web preview as game execution.</StatusNotice>
    </AuthoringPanel>

    <div className="grid gap-4 xl:grid-cols-2">
      <AuthoringPanel title="Find and compare flows" subtitle="Search story, state, reward, runtime, and issue intent without opening each draft." help="Shape and issue filters apply to browser-local work; text search also filters committed manifests.">
        <div className="grid gap-2 sm:grid-cols-3"><input className="rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search titles and steps" /><select className="rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" value={shapeFilter} onChange={(event) => setShapeFilter(event.target.value as typeof shapeFilter)}><option value="all">All shapes</option><option value="sequence">Sequences</option><option value="constellation">Constellations</option><option value="hybrid">Hybrids</option></select><select className="rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" value={issueFilter} onChange={(event) => setIssueFilter(event.target.value as typeof issueFilter)}><option value="all">All issue states</option><option value="blocked">Needs resolution</option><option value="ready">No blockers</option></select></div>
      </AuthoringPanel>
      <div className="hidden xl:block" />
      <AuthoringPanel title="Browser-local drafts" subtitle={`${localDrafts.length} recoverable flow${localDrafts.length === 1 ? "" : "s"}`} help="Open a draft in the same composer used by Dialogue Flow, World Builder, Encounter Stage, and Quest Journey.">
        <div className="space-y-2">
          {localDrafts.map(({ summary, draft }) => {
            const issues = creationFlowIssues(draft);
            const blockers = issues.filter((issue) => issue.severity === "blocker").length;
            return <article key={summary.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <div className="flex items-start justify-between gap-3"><div><div className="font-semibold">{summary.title}</div><div className="text-xs text-slate-500">{summary.shape} · {summary.stepCount} steps · {summary.placeholderCount} unresolved ideas · updated {new Date(summary.updatedAt).toLocaleString()}</div></div>{blockers > 0 && <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">{blockers} blockers</span>}</div>
              <div className="mt-3 flex gap-2"><button type="button" className={`${BUTTON_CLASSES.primary} ${BUTTON_SIZES.xs}`} onClick={() => setActive(draft)}>Open flow</button><button type="button" className={`${BUTTON_CLASSES.danger} ${BUTTON_SIZES.xs}`} onClick={() => { if (window.confirm(`Delete browser-local draft “${summary.title}”?`)) deleteCreationFlowDraft(summary.id); }}>Delete local draft</button></div>
              <FlowTopology draft={draft} />
            </article>;
          })}
          {localDrafts.length === 0 && <EmptyState title="No local Creation Flow drafts">Start a sequence for executable order or a story seed for a scoped creative constellation.</EmptyState>}
        </div>
      </AuthoringPanel>

      <AuthoringPanel title="Committed manifests" subtitle="Project-local provenance and recoverable working revisions" help="Opening a manifest creates or refreshes its browser-local working revision; committing again remains stale-checked and atomic.">
        <div className="space-y-2">
          {visibleCommitted.map((flow) => <article key={flow.id} className="rounded-lg border border-emerald-200 p-3 dark:border-emerald-900"><div className="font-semibold">{flow.title}</div><div className="text-xs text-slate-500">Revision {flow.revision} · {flow.compiler_version} · committed {new Date(flow.updated_at * 1000).toLocaleString()}</div><button type="button" className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs} mt-3`} onClick={() => openCommitted(flow)}>Open working revision</button><FlowTopology draft={flow.normalized_draft} /></article>)}
          {!loadingCommitted && committed.length === 0 && <EmptyState title="No committed flows">A successful atomic Creation Flow commit will appear here with its normalized draft and artifact provenance.</EmptyState>}
          {loadingCommitted && <p className="text-sm text-slate-500">Loading committed manifests…</p>}
        </div>
      </AuthoringPanel>
    </div>

    {active && active.origin && <ThenComposer
      open
      mode={active.shape === "constellation" ? "expand" : "then"}
      origin={active.origin}
      originLabel={originLabel(active)}
      returnFrame={active.returnStack[0] ?? { workspace: "creation-flow" }}
      initialDraftId={active.id}
      onClose={() => { setActive(null); refreshDrafts(); }}
    />}
  </AuthoringPageShell>;
}
