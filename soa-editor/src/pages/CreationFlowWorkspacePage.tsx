import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  createCreationFlowDraft, creationFlowIssues, creationFlowMatchesLibraryFilters,
  type CreationFlowDraft, type CreationFlowLibraryLens,
} from "../authoring/creationFlow";
import {
  deleteCreationFlowDraft, listCreationFlowDrafts, loadCreationFlowDraft, saveCreationFlowDraft,
  readCreationFlowSnapshots, saveCreationFlowSnapshot,
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

function hasMeaningfulFlow(draft: CreationFlowDraft): boolean {
  return draft.steps.length > 0 || draft.placeholders.length > 0 || draft.localNotes.some((note) => note.text.trim());
}

function FlowTopology({ draft }: { draft: CreationFlowDraft }) {
  const labels = new Map(draft.steps.map((step, index) => [step.id, `${index + 1}. ${step.text || step.kind}`]));
  const branchCount = draft.transitions.filter((transition) => transition.trigger !== "complete").length;
  return <details className="mt-3 rounded border border-slate-200 p-2 text-xs dark:border-slate-800"><summary className="cursor-pointer font-semibold">Topology · {draft.transitions.length} transitions · {branchCount} explicit branches</summary><div className="mt-2 grid gap-2 lg:grid-cols-2"><ol className="space-y-1">{draft.steps.map((step, index) => <li key={step.id}><span className="font-mono text-slate-500">{index + 1}</span> {step.text || step.kind}</li>)}</ol><div className="space-y-1">{draft.transitions.map((transition) => <div key={transition.id} className="rounded bg-slate-50 p-1 dark:bg-slate-950">{labels.get(transition.fromStepId)} <b>—{transition.label || transition.trigger}→</b> {labels.get(transition.toStepId)}</div>)}{draft.relations.map((relation) => <div key={relation.id} className="rounded bg-violet-50 p-1 text-violet-800 dark:bg-violet-950 dark:text-violet-200">{labels.get(relation.fromStepId)} <b>—{relation.relation}→</b> {labels.get(relation.toStepId)}</div>)}</div></div></details>;
}

export default function CreationFlowWorkspacePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedDraftId = searchParams.get("draft") || "";
  const [drafts, setDrafts] = useState<CreationFlowDraftSummary[]>([]);
  const [committed, setCommitted] = useState<CommittedFlow[]>([]);
  const [active, setActive] = useState<CreationFlowDraft | null>(null);
  const [loadingCommitted, setLoadingCommitted] = useState(true);
  const [query, setQuery] = useState("");
  const [shapeFilter, setShapeFilter] = useState<"all" | CreationFlowDraft["shape"]>("all");
  const [issueFilter, setIssueFilter] = useState<"all" | "blocked" | "ready">("all");
  const [lensFilter, setLensFilter] = useState<CreationFlowLibraryLens>("all");
  const [deletedDraft, setDeletedDraft] = useState<{ draft: CreationFlowDraft; snapshots: ReturnType<typeof readCreationFlowSnapshots> } | null>(null);
  const refreshDrafts = () => setDrafts(listCreationFlowDrafts());

  useEffect(() => {
    refreshDrafts();
    const refresh = () => refreshDrafts();
    window.addEventListener("soa:creation-flow-drafts-changed", refresh);
    return () => window.removeEventListener("soa:creation-flow-drafts-changed", refresh);
  }, []);

  useEffect(() => {
    if (!requestedDraftId) return;
    const requested = loadCreationFlowDraft(requestedDraftId);
    if (requested) setActive(requested);
  }, [requestedDraftId]);

  useEffect(() => {
    setLoadingCommitted(true);
    void apiFetch("/api/creation-flow-manifests")
      .then(async (response) => response.ok ? response.json() as Promise<unknown> : [])
      .then((value) => setCommitted(Array.isArray(value) ? value.filter(isCommittedFlow).sort((a, b) => b.updated_at - a.updated_at) : []))
      .catch(() => setCommitted([]))
      .finally(() => setLoadingCommitted(false));
  }, [active]);

  const allLocalDrafts = useMemo(() => drafts.map((summary) => ({ summary, draft: loadCreationFlowDraft(summary.id) })).filter((row): row is { summary: CreationFlowDraftSummary; draft: CreationFlowDraft } => Boolean(row.draft) && hasMeaningfulFlow(row.draft as CreationFlowDraft)), [drafts]);
  const filters = useMemo(() => ({ query, shape: shapeFilter, issue: issueFilter, lens: lensFilter }), [issueFilter, lensFilter, query, shapeFilter]);
  const localDrafts = useMemo(() => allLocalDrafts.filter(({ draft }) => creationFlowMatchesLibraryFilters(draft, filters)), [allLocalDrafts, filters]);
  const visibleCommitted = useMemo(() => committed.filter((flow) => creationFlowMatchesLibraryFilters(flow.normalized_draft, filters)), [committed, filters]);
  const start = (shape: CreationFlowDraft["shape"]) => {
    const anchor = generateUlid();
    const draft = createCreationFlowDraft({
      title: shape === "constellation" ? "Untitled story seed" : "Untitled creation flow",
      shape,
      origin: { ref: { kind: "custom", draftId: anchor, label: "New story idea" } },
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
      title="Idea Studio"
      subtitle="Catch a thought, follow where it leads, and turn it into playable story when it is ready."
      help="Your work saves locally while you explore. You decide when it becomes part of the project."
      actions={<button type="button" className={`${BUTTON_CLASSES.primary} ${BUTTON_SIZES.sm}`} onClick={() => start("sequence")}>Start with an idea</button>}
    >
      <StatusNotice tone="info">Start in plain language. Structure, targets, and implementation details can wait.</StatusNotice>
    </AuthoringPanel>

    <div className="grid gap-4 xl:grid-cols-2">
      <AuthoringPanel title="Find an older idea" subtitle="Search and filter only when you need to." help="Filters apply to both local drafts and flows already saved to the project." collapsible defaultCollapsed>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4"><input className="rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search titles, ideas, and notes" /><select aria-label="Composition shape filter" className="rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" value={shapeFilter} onChange={(event) => setShapeFilter(event.target.value as typeof shapeFilter)}><option value="all">All shapes</option><option value="sequence">Sequences</option><option value="constellation">Constellations</option><option value="hybrid">Hybrids</option></select><select aria-label="Issue state filter" className="rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" value={issueFilter} onChange={(event) => setIssueFilter(event.target.value as typeof issueFilter)}><option value="all">All issue states</option><option value="blocked">Needs resolution</option><option value="ready">No blockers</option></select><select aria-label="Content lens" className="rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" value={lensFilter} onChange={(event) => setLensFilter(event.target.value as CreationFlowLibraryLens)}><option value="all">All content</option><option value="story">Story and lore</option><option value="state">State and unlocks</option><option value="reward">Rewards and progress</option><option value="runtime">Executable runtime intent</option><option value="issues">Needs author attention</option></select></div>
      </AuthoringPanel>
      <div className="hidden xl:block" />
      <AuthoringPanel title="Continue creating" subtitle={`${localDrafts.length} local draft${localDrafts.length === 1 ? "" : "s"}`} help="Pick up exactly where you stopped. Drafts save automatically in this browser.">
        <div className="space-y-2">
          {localDrafts.map(({ summary, draft }) => {
            const issues = creationFlowIssues(draft);
            const blockers = issues.filter((issue) => issue.severity === "blocker").length;
            return <article key={summary.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <div className="flex items-start justify-between gap-3"><div><div className="font-semibold">{summary.title}</div><div className="text-xs text-slate-500">{summary.shape} · {summary.stepCount} steps · {summary.placeholderCount} unresolved ideas · updated {new Date(summary.updatedAt).toLocaleString()}</div>{draft.provisionalPlacement && <div className="mt-1 text-xs font-medium text-fuchsia-700 dark:text-fuchsia-300">Placed provisionally on {draft.provisionalPlacement.target.label || draft.provisionalPlacement.target.canonicalId}</div>}</div>{blockers > 0 && <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">{blockers} blockers</span>}</div>
              <div className="mt-3 flex gap-2"><button type="button" className={`${BUTTON_CLASSES.primary} ${BUTTON_SIZES.xs}`} onClick={() => setActive(draft)}>Continue</button><button type="button" className={`${BUTTON_CLASSES.danger} ${BUTTON_SIZES.xs}`} onClick={() => { setDeletedDraft({ draft, snapshots: readCreationFlowSnapshots(draft.id) }); deleteCreationFlowDraft(summary.id); refreshDrafts(); }}>Delete draft</button></div>
              <FlowTopology draft={draft} />
            </article>;
          })}
          {localDrafts.length === 0 && <EmptyState title="No ideas in progress">Start with a sentence. You can decide what it becomes later.</EmptyState>}
        </div>
      </AuthoringPanel>

      <AuthoringPanel title="Saved to the project" subtitle="Flows that are ready for the rest of the game" help="Open any saved flow to make a new working revision.">
        <div className="space-y-2">
          {visibleCommitted.map((flow) => <article key={flow.id} className="rounded-lg border border-emerald-200 p-3 dark:border-emerald-900"><div className="font-semibold">{flow.title}</div><div className="text-xs text-slate-500">Revision {flow.revision} · {flow.compiler_version} · committed {new Date(flow.updated_at * 1000).toLocaleString()}</div><button type="button" className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs} mt-3`} onClick={() => openCommitted(flow)}>Open working revision</button><FlowTopology draft={flow.normalized_draft} /></article>)}
          {!loadingCommitted && visibleCommitted.length === 0 && <EmptyState title={committed.length === 0 ? "Nothing saved yet" : "Nothing saved matches these filters"}>{committed.length === 0 ? "When an idea is shaped and checked, save it to the project and it will appear here." : "Adjust the filters to find other saved work."}</EmptyState>}
          {loadingCommitted && <p className="text-sm text-slate-500">Loading saved flows…</p>}
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
      onClose={() => { const stored = loadCreationFlowDraft(active.id); if (stored && !hasMeaningfulFlow(stored)) deleteCreationFlowDraft(active.id); setActive(null); if (requestedDraftId) setSearchParams({}, { replace: true }); refreshDrafts(); }}
    />}
    {deletedDraft && <div role="status" className="fixed bottom-5 left-1/2 z-[120] flex -translate-x-1/2 items-center gap-3 rounded-xl bg-slate-950 px-4 py-3 text-sm text-white shadow-2xl dark:bg-white dark:text-slate-950"><span>Removed “{deletedDraft.draft.title}”.</span><button type="button" className="font-semibold text-violet-300 underline underline-offset-2 dark:text-violet-700" onClick={() => { saveCreationFlowDraft(deletedDraft.draft); deletedDraft.snapshots.forEach((snapshot) => saveCreationFlowSnapshot(snapshot)); setDeletedDraft(null); refreshDrafts(); }}>Undo</button><button type="button" aria-label="Dismiss draft removal message" className="opacity-70 hover:opacity-100" onClick={() => setDeletedDraft(null)}>×</button></div>}
  </AuthoringPageShell>;
}
