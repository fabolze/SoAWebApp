import { useEffect, useMemo, useRef, useState } from "react";
import {
  CREATION_FLOW_STEP_KINDS, addCreationFlowStep, createCreationFlowDraft, createCreationFlowStep,
  creationFlowIssues, duplicateCreationFlowStep, insertCreationFlowStep, moveCreationFlowStep,
  patchCreationFlowStep, reconcileCreationFlowMentions, removeCreationFlowStep,
  touchCreationFlowDraft, type CreationFlowDraft, type CreationFlowLocalNote,
  type CreationFlowPlaceholder, type CreationFlowRefKind, type CreationFlowReturnFrame,
  type CreationFlowStepKind, type CreationFlowTiming, type NarrativeGameplayAction,
} from "../../authoring/creationFlow";
import {
  draftsForOrigin, exportCreationFlowDraft, importCreationFlowDraft, loadCreationFlowDraft,
  readCreationFlowSnapshots, saveCreationFlowDraft, saveCreationFlowSnapshot,
  type CreationFlowDraftSummary, type CreationFlowSnapshot,
} from "../../authoring/creationFlowDraftStorage";
import {
  creationFlowErrorMessage, isCreationFlowCatalog, isCreationFlowPreview,
  type CreationFlowCatalog, type CreationFlowPreview,
} from "../../authoring/creationFlowCompiler";
import { apiFetch } from "../../lib/api";
import { createHistory, pushHistory, redoHistory, undoHistory, type HistoryState } from "../../dialogues/history";
import { BUTTON_CLASSES, BUTTON_SIZES, ISSUE_CLASSES } from "../../styles/uiTokens";
import { generateUlid } from "../../utils/generateId";
import BundleReview from "./BundleReview";

interface ThenComposerProps {
  open: boolean;
  mode: "then" | "expand";
  origin: NonNullable<CreationFlowDraft["origin"]>;
  originLabel: string;
  returnFrame: CreationFlowReturnFrame;
  initialDraftId?: string;
  onClose: () => void;
}
interface CommittedCreationFlowSummary {
  id: string;
  title: string;
  revision: number;
  compiler_version: string;
  updated_at: number;
  normalized_draft: CreationFlowDraft;
}

const inputClass = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";
const smallButton = `${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`;
const IDEA_KINDS: CreationFlowRefKind[] = ["character", "faction", "location", "location_poi", "item", "creature", "quest", "encounter", "lore_entry", "event", "custom"];
const TARGET_KIND_BY_STEP: Partial<Record<CreationFlowStepKind, CreationFlowRefKind>> = {
  dialogue: "dialogue", encounter: "encounter", item_reward: "item", lore_reveal: "lore_entry",
  teleport: "location", open_shop: "shop", quest_assignment: "quest", quest_turn_in: "quest",
  inventory_objective: "item", join_companion: "character", activate_location_variant: "location",
  activate_character_variant: "character", activate_item_variant: "item", story_placement: "story_beat",
};
const AVAILABILITY_TARGET_KINDS: CreationFlowRefKind[] = ["dialogue_node", "dialogue", "encounter", "event", "item", "location_poi", "location_route", "quest", "shop"];
const LABELS: Record<CreationFlowStepKind, string> = {
  unshaped: "Unshaped idea", dialogue: "Dialogue", encounter: "Start encounter", item_reward: "Give item",
  numeric_reward: "Give reward", lore_reveal: "Reveal lore", teleport: "Move player", scripted_moment: "Scripted moment",
  open_shop: "Open shop now", make_available: "Make available later", quest_assignment: "Add quest",
  quest_turn_in: "Turn in quest", inventory_objective: "Inventory objective", join_companion: "Companion joins",
  persistent_fact: "Remember this", activate_location_variant: "Change location presentation",
  activate_character_variant: "Change character presentation", activate_item_variant: "Change item presentation",
  world_state: "Change the world", gameplay_effect: "Gameplay effect", story_placement: "Place in story",
  note: "Note only", custom: "Unsupported/custom",
};
const GAMEPLAY_ACTION_TYPES = ["apply_effect", "restore_resource", "apply_status", "remove_status", "remove_matching_statuses", "grant_currency", "take_currency"] as const;
type GameplayActionType = typeof GAMEPLAY_ACTION_TYPES[number];

function defaultGameplayAction(actionType: GameplayActionType): NarrativeGameplayAction {
  const target = { scope: "player" as const };
  if (actionType === "apply_effect" || actionType === "restore_resource") return { actionType, effect: { kind: "effect" }, target };
  if (actionType === "apply_status") return { actionType, status: { kind: "status" }, target, stacks: 1 };
  if (actionType === "remove_status") return { actionType, status: { kind: "status" }, target, removalMode: "cleanse" };
  if (actionType === "remove_matching_statuses") return { actionType, filter: { polarity: "Harmful" }, target, removalMode: "cleanse" };
  if (actionType === "grant_currency") return { actionType, currency: { kind: "currency" }, amount: 1, target };
  return { actionType, currency: { kind: "currency" }, amount: 1, target, insufficientPolicy: "block" };
}

function supportClass(support: string) {
  if (support === "compilable") return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200";
  if (support === "story_only") return "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200";
  if (support === "runtime_unverified") return "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200";
  if (support === "unsupported") return "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200";
  return "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200";
}

function ideaStepId(draft: CreationFlowDraft, placeholderId: string): string | undefined {
  return draft.steps.find((step) => step.payload?.ideaPlaceholderId === placeholderId)?.id;
}

function objectRows(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object" && !Array.isArray(row)) : [];
}

export default function ThenComposer({ open, mode, origin, originLabel, returnFrame, initialDraftId, onClose }: ThenComposerProps) {
  const [draftHistory, setDraftHistory] = useState<HistoryState<CreationFlowDraft> | null>(null);
  const draft = draftHistory?.present ?? null;
  const setDraft = (value: CreationFlowDraft | null | ((current: CreationFlowDraft | null) => CreationFlowDraft | null)) => {
    setDraftHistory((currentHistory) => {
      const current = currentHistory?.present ?? null;
      const next = typeof value === "function" ? value(current) : value;
      if (!next) return null;
      if (!currentHistory || currentHistory.present.id !== next.id) return createHistory(next);
      return pushHistory(currentHistory, next);
    });
  };
  const [recent, setRecent] = useState<CreationFlowDraftSummary[]>([]);
  const [snapshots, setSnapshots] = useState<CreationFlowSnapshot[]>([]);
  const [quickText, setQuickText] = useState("");
  const [ideaLabel, setIdeaLabel] = useState("");
  const [ideaKind, setIdeaKind] = useState<CreationFlowRefKind>("character");
  const [ideaDirection, setIdeaDirection] = useState("");
  const [relationFrom, setRelationFrom] = useState("");
  const [relationTo, setRelationTo] = useState("");
  const [relationLabel, setRelationLabel] = useState("relates to");
  const [branchFrom, setBranchFrom] = useState("");
  const [branchTo, setBranchTo] = useState("");
  const [branchTrigger, setBranchTrigger] = useState<CreationFlowDraft["transitions"][number]["trigger"]>("condition");
  const [branchRequirementId, setBranchRequirementId] = useState("");
  const [branchSourceRefId, setBranchSourceRefId] = useState("");
  const [branchLabel, setBranchLabel] = useState("");
  const [notice, setNotice] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [catalog, setCatalog] = useState<CreationFlowCatalog | null>(null);
  const [compilerReview, setCompilerReview] = useState<CreationFlowPreview | null>(null);
  const [compilerError, setCompilerError] = useState("");
  const [compilerBusy, setCompilerBusy] = useState(false);
  const [committedManifest, setCommittedManifest] = useState<object | null>(null);
  const [committedFlows, setCommittedFlows] = useState<CommittedCreationFlowSummary[]>([]);
  const proseRef = useRef<HTMLTextAreaElement>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const refreshRecent = () => setRecent(draftsForOrigin(origin));
  const startNew = () => {
    const next = createCreationFlowDraft({
      title: mode === "expand" ? `${originLabel} story seed` : `${originLabel} — then…`,
      shape: mode === "expand" ? "constellation" : "sequence", origin, returnFrame,
    });
    if (mode === "expand") next.localNotes = [{ id: generateUlid(), text: "" }];
    setDraft(next); setSnapshots([]); setNotice("New browser-local capture started.");
  };

  useEffect(() => {
    if (!open) return;
    const matching = draftsForOrigin(origin);
    setRecent(matching);
    const requested = initialDraftId ? loadCreationFlowDraft(initialDraftId) : null;
    const restored = requested ?? (matching[0] ? loadCreationFlowDraft(matching[0].id) : null);
    if (restored) {
      setDraft(restored); setSnapshots(readCreationFlowSnapshots(restored.id)); setNotice("Continued the most recent browser-local draft for this context.");
    } else startNew();
    // Opening is deliberately keyed to the stable origin, not object identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, originLabel, initialDraftId, origin.ref.canonicalId, origin.ref.draftId, origin.subRef?.canonicalId, origin.subRef?.draftId]);

  useEffect(() => {
    if (!open) return;
    setCatalog(null); setCompilerReview(null); setCompilerError(""); setCommittedManifest(null);
    void apiFetch("/api/ui/creation-flow/catalog")
      .then(async (response) => {
        const body: unknown = await response.json();
        if (!response.ok) throw new Error(creationFlowErrorMessage(body, "Could not load canonical targets."));
        if (isCreationFlowCatalog(body)) setCatalog(body);
      })
      .catch((error) => setCompilerError(error instanceof Error ? error.message : "Could not load canonical targets."));
    void apiFetch("/api/creation-flow-manifests")
      .then((response) => response.ok ? response.json() as Promise<unknown> : [])
      .then((body) => {
        if (!Array.isArray(body)) return;
        const matches = body.filter((value): value is CommittedCreationFlowSummary => {
          if (!value || typeof value !== "object" || Array.isArray(value)) return false;
          const row = value as Partial<CommittedCreationFlowSummary>;
          const ref = row.normalized_draft?.origin?.ref;
          return typeof row.id === "string" && typeof row.title === "string" && Boolean(row.normalized_draft)
            && ref?.kind === origin.ref.kind
            && (ref.canonicalId || "") === (origin.ref.canonicalId || "")
            && (ref.draftId || "") === (origin.ref.draftId || "");
        });
        setCommittedFlows(matches.sort((a, b) => b.updated_at - a.updated_at));
      })
      .catch(() => setCommittedFlows([]));
  }, [open, origin.ref.kind, origin.ref.canonicalId, origin.ref.draftId]);

  useEffect(() => {
    if (!open || !draft) return;
    const timer = window.setTimeout(() => {
      saveCreationFlowDraft(draft); setSavedAt(Date.now()); refreshRecent();
    }, 200);
    return () => window.clearTimeout(timer);
    // origin is intentionally represented inside the draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, open]);

  const issues = useMemo(() => draft ? creationFlowIssues(draft) : [], [draft]);
  const loreNote = draft?.localNotes[0];
  const ideaSteps = useMemo(() => draft?.steps.filter((step) => typeof step.payload?.ideaPlaceholderId === "string") ?? [], [draft]);

  if (!open || !draft) return null;

  const update = (patch: Partial<CreationFlowDraft>) => setDraft((current) => current ? touchCreationFlowDraft(current, patch) : current);
  const addStep = () => {
    if (!quickText.trim()) return;
    setDraft((current) => current ? addCreationFlowStep(current, createCreationFlowStep(quickText)) : current);
    setQuickText("");
  };
  const addIdea = (label = ideaLabel.trim(), kind = ideaKind, direction = ideaDirection.trim()) => {
    if (!label || !draft) return null;
    const placeholder: CreationFlowPlaceholder = { id: generateUlid(), kind, label, ...(direction ? { direction } : {}), owningWorkspace: returnFrame.workspace };
    const step = createCreationFlowStep(`Idea: ${label}`, "note", { kind, draftId: placeholder.id, label });
    step.payload = { ideaPlaceholderId: placeholder.id };
    const withStep = addCreationFlowStep(touchCreationFlowDraft(draft, { placeholders: [...draft.placeholders, placeholder] }), step);
    setDraft(withStep); setIdeaLabel(""); setIdeaDirection("");
    return { placeholder, step };
  };
  const changeProse = (text: string) => {
    const note: CreationFlowLocalNote = loreNote ?? { id: generateUlid(), text: "" };
    const nextNote = { ...note, text, mentions: reconcileCreationFlowMentions(note.text, text, note.mentions) };
    update({ localNotes: [nextNote, ...draft.localNotes.slice(1)] });
  };
  const promoteSelection = () => {
    const field = proseRef.current;
    if (!field || field.selectionStart === field.selectionEnd) { setNotice("Select a phrase in the lore prose first."); return; }
    const selectedText = field.value.slice(field.selectionStart, field.selectionEnd).trim();
    if (!selectedText) return;
    const start = field.value.indexOf(selectedText, field.selectionStart);
    const created = addIdea(selectedText, ideaKind, ideaDirection.trim());
    if (!created) return;
    const note = loreNote ?? { id: generateUlid(), text: field.value };
    const mention = { id: generateUlid(), placeholderId: created.placeholder.id, start, end: start + selectedText.length, text: selectedText };
    setDraft((current) => current ? touchCreationFlowDraft(current, { localNotes: [{ ...note, text: field.value, mentions: [...(note.mentions ?? []), mention] }, ...current.localNotes.slice(1)] }) : current);
    setNotice(`Linked “${selectedText}” to the same local idea card.`);
  };
  const selectDraft = (id: string) => {
    const loaded = loadCreationFlowDraft(id);
    if (!loaded) { setNotice("That browser-local draft could not be recovered."); return; }
    setDraft(loaded); setSnapshots(readCreationFlowSnapshots(id)); setNotice("Browser-local draft restored.");
  };
  const createSnapshot = () => {
    const name = window.prompt("Snapshot name", `Snapshot ${new Date().toLocaleString()}`)?.trim();
    if (!name) return;
    const next = saveCreationFlowSnapshot({ id: generateUlid(), name, createdAt: Date.now(), draft });
    setSnapshots(next); setNotice(`Created local snapshot “${name}”.`);
  };
  const undoDraft = () => {
    setDraftHistory((current) => current ? undoHistory(current) : current);
    setNotice("Undid the latest flow edit.");
  };
  const redoDraft = () => {
    setDraftHistory((current) => current ? redoHistory(current) : current);
    setNotice("Restored the next flow edit.");
  };
  const download = () => {
    const blob = new Blob([exportCreationFlowDraft(draft)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `${draft.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "creation-flow"}.json`;
    anchor.click(); URL.revokeObjectURL(url); setNotice("Recovery JSON exported.");
  };
  const importFile = async (file?: File) => {
    if (!file) return;
    try {
      const imported = importCreationFlowDraft(await file.text());
      setDraft(imported); setSnapshots(readCreationFlowSnapshots(imported.id)); setNotice("Imported draft validated and staged browser-locally.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Import failed."); }
    if (importRef.current) importRef.current.value = "";
  };
  const closeComposer = () => {
    saveCreationFlowDraft(draft);
    setSavedAt(Date.now());
    onClose();
  };
  const previewCompiler = async () => {
    setCompilerBusy(true); setCompilerError("");
    try {
      const response = await apiFetch("/api/ui/creation-flow/preview", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draft }),
      });
      const body: unknown = await response.json();
      if (!response.ok || !isCreationFlowPreview(body)) throw new Error(creationFlowErrorMessage(body, "Compiler preview failed."));
      setDraft(body.normalized_draft); saveCreationFlowDraft(body.normalized_draft);
      setCompilerReview(body); setNotice("Backend preview validated the proposed canonical bundle and rolled it back.");
    } catch (error) {
      setCompilerError(error instanceof Error ? error.message : "Compiler preview failed.");
    } finally { setCompilerBusy(false); }
  };
  const commitCompiler = async (acceptedWarningIds: string[]) => {
    if (!compilerReview) return;
    setCompilerBusy(true); setCompilerError("");
    try {
      const response = await apiFetch("/api/ui/creation-flow/bundle", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          draft: compilerReview.normalized_draft,
          preview_hash: compilerReview.preview_hash,
          accepted_warning_ids: acceptedWarningIds,
        }),
      });
      const body: unknown = await response.json();
      if (!response.ok || !isCreationFlowPreview(body)) throw new Error(creationFlowErrorMessage(body, "Creation Flow commit failed."));
      setDraft(body.normalized_draft); saveCreationFlowDraft(body.normalized_draft);
      setCommittedManifest(body.manifest ?? null); setCompilerReview(null);
      setNotice("Canonical bundle committed atomically. A project-local provenance manifest now records this flow.");
    } catch (error) {
      setCompilerError(error instanceof Error ? error.message : "Creation Flow commit failed.");
    } finally { setCompilerBusy(false); }
  };
  const targetKindsForStep = (kind: CreationFlowStepKind): CreationFlowRefKind[] => kind === "make_available"
    ? AVAILABILITY_TARGET_KINDS
    : TARGET_KIND_BY_STEP[kind] ? [TARGET_KIND_BY_STEP[kind] as CreationFlowRefKind] : [];

  return <div role="dialog" aria-modal="true" aria-label={mode === "expand" ? "Expand this place" : "Then composer"} className="fixed inset-0 z-[70] overflow-y-auto bg-slate-950/65 p-3 sm:p-6">
    <div className="mx-auto max-w-7xl overflow-hidden rounded-xl bg-slate-50 shadow-2xl dark:bg-slate-950">
      <header className="border-b border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><div className="text-xs font-semibold uppercase tracking-wide text-violet-600">{mode === "expand" ? "Story Seed / Expand this place" : "Then…"}</div><h2 className="text-xl font-bold text-slate-950 dark:text-white">{originLabel}</h2><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Capture locally, resolve existing targets, then preview the complete canonical bundle before anything is committed.</p></div>
          <button type="button" className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.sm}`} onClick={closeComposer}>Close</button>
        </div>
        <div className={`mt-3 rounded-md border p-3 text-xs ${committedManifest ? ISSUE_CLASSES.success : ISSUE_CLASSES.warning}`}><b>{committedManifest ? "Committed with provenance." : "Browser-local work in progress."}</b> {committedManifest ? "Canonical records and a project-local authoring manifest were committed together. Runtime/DataTable verification is still separate." : "Autosave and snapshots recover this unfinished draft only in this browser. Project persistence begins only after backend preview and commit."}</div>
        {notice && <div className={`mt-2 rounded-md border p-2 text-xs ${ISSUE_CLASSES.info}`}>{notice}</div>}
      </header>

      <div className="grid gap-4 p-4 xl:grid-cols-[240px_minmax(0,1fr)_300px]">
        <aside className="space-y-3">
          <section className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-sm font-semibold">Continue where I stopped</h3>
            <div className="mt-2 space-y-1">{recent.map((row) => <button key={row.id} type="button" className={`w-full rounded border p-2 text-left text-xs ${row.id === draft.id ? "border-violet-500 bg-violet-50 dark:bg-violet-950" : "border-slate-200 dark:border-slate-800"}`} onClick={() => selectDraft(row.id)}><b className="block truncate">{row.title}</b><span>{row.stepCount} steps · {row.placeholderCount} ideas</span><span className="block text-slate-500">{new Date(row.updatedAt).toLocaleString()}</span></button>)}</div>
            {committedFlows.length > 0 && <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-800"><h4 className="text-[10px] font-semibold uppercase text-emerald-700 dark:text-emerald-300">Committed manifests</h4><div className="mt-1 space-y-1">{committedFlows.map((row) => <button key={row.id} type="button" className="w-full rounded border border-emerald-200 p-2 text-left text-xs dark:border-emerald-900" onClick={() => { setDraft(row.normalized_draft); saveCreationFlowDraft(row.normalized_draft); setCommittedManifest(row); setNotice("Opened the committed manifest as a browser-local working revision."); }}><b className="block truncate">{row.title}</b><span>Revision {row.revision} · {row.compiler_version}</span><span className="block text-slate-500">{new Date(row.updated_at * 1000).toLocaleString()}</span></button>)}</div></div>}
            <button type="button" className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.sm} mt-2 w-full`} onClick={startNew}>New scoped draft</button>
          </section>
          <section className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-sm font-semibold">Recovery</h3><div className="mt-2 grid grid-cols-2 gap-2"><button type="button" className={smallButton} disabled={!draftHistory?.past.length} onClick={undoDraft}>Undo</button><button type="button" className={smallButton} disabled={!draftHistory?.future.length} onClick={redoDraft}>Redo</button><button type="button" className={`${smallButton} col-span-2`} onClick={createSnapshot}>Named snapshot</button><button type="button" className={smallButton} onClick={download}>Export JSON</button><button type="button" className={smallButton} onClick={() => importRef.current?.click()}>Import JSON</button><input ref={importRef} className="hidden" type="file" accept="application/json,.json" onChange={(event) => void importFile(event.target.files?.[0])} /></div>
            {snapshots.length > 0 && <div className="mt-3 space-y-1">{snapshots.slice().reverse().map((snapshot) => <button key={snapshot.id} type="button" className="block w-full truncate rounded border border-slate-200 p-1 text-left text-xs dark:border-slate-800" onClick={() => { setDraft(snapshot.draft); setNotice(`Restored snapshot “${snapshot.name}”.`); }}>{snapshot.name}</button>)}</div>}
          </section>
        </aside>

        <main className="space-y-4">
          <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="grid gap-3 sm:grid-cols-[1fr_180px]"><label className="text-xs font-semibold uppercase text-slate-500">Flow title<input className={`${inputClass} mt-1 normal-case`} value={draft.title} onChange={(event) => update({ title: event.target.value })} /></label><label className="text-xs font-semibold uppercase text-slate-500">Shape<select className={`${inputClass} mt-1 normal-case`} value={draft.shape} onChange={(event) => update({ shape: event.target.value as CreationFlowDraft["shape"] })}><option value="sequence">Sequence</option><option value="constellation">Constellation</option><option value="hybrid">Hybrid</option></select></label></div>
            <div className="mt-3 flex gap-2"><textarea aria-label="Capture next idea" className={inputClass} rows={2} value={quickText} onChange={(event) => setQuickText(event.target.value)} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") addStep(); }} placeholder={mode === "then" ? "What happens next?" : "Capture a playable or story idea…"} /><button type="button" className={`${BUTTON_CLASSES.violet} ${BUTTON_SIZES.md}`} disabled={!quickText.trim()} onClick={addStep}>Add</button></div><div className="mt-1 text-[11px] text-slate-500">Ctrl/Cmd+Enter adds the step. Shape it only when the behavior matters.</div>
          </section>

          {mode === "expand" && <section className="rounded-lg border border-violet-200 bg-white p-4 dark:border-violet-900 dark:bg-slate-900">
            <h3 className="font-semibold">Lore prose and linked ideas</h3><p className="text-xs text-slate-500">Select a phrase to create the same placeholder identity shown as an idea card. Removing a mention never deletes the card.</p>
            <textarea ref={proseRef} aria-label="Lore prose" className={`${inputClass} mt-3 min-h-32`} value={loreNote?.text ?? ""} onChange={(event) => changeProse(event.target.value)} placeholder={`What is remembered, hidden, or changing in ${originLabel}?`} />
            <div className="mt-2 flex flex-wrap gap-2"><select aria-label="Selected text idea kind" className="rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950" value={ideaKind} onChange={(event) => setIdeaKind(event.target.value as CreationFlowRefKind)}>{IDEA_KINDS.map((kind) => <option key={kind} value={kind}>{kind.replace(/_/g, " ")}</option>)}</select><button type="button" className={smallButton} onClick={promoteSelection}>Create/link card from selection</button></div>
            {(loreNote?.mentions?.length ?? 0) > 0 && <div className="mt-2 flex flex-wrap gap-1">{loreNote?.mentions?.map((mention) => <span key={mention.id} className="rounded-full bg-violet-100 px-2 py-1 text-xs text-violet-800 dark:bg-violet-950 dark:text-violet-200">{mention.text}</span>)}</div>}
          </section>}

          <section className="space-y-2"><div className="flex items-center justify-between"><h3 className="font-semibold">{draft.shape === "constellation" ? "Captured ideas" : "What happens next"}</h3><span className="text-xs text-slate-500">{draft.steps.length} steps</span></div>
            {draft.steps.map((step, index) => <article id={`creation-flow-step-${step.id}`} key={step.id} className="scroll-mt-4 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-wrap items-center gap-2"><span className="grid h-6 w-6 place-items-center rounded-full bg-slate-100 text-xs font-bold dark:bg-slate-800">{index + 1}</span><span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase ${supportClass(step.support)}`}>{step.support.replace(/_/g, " ")}</span><div className="ml-auto flex flex-wrap gap-1"><button type="button" aria-label="Move step up" className={smallButton} disabled={index === 0} onClick={() => setDraft(moveCreationFlowStep(draft, step.id, -1))}>↑</button><button type="button" aria-label="Move step down" className={smallButton} disabled={index === draft.steps.length - 1} onClick={() => setDraft(moveCreationFlowStep(draft, step.id, 1))}>↓</button><button type="button" className={smallButton} onClick={() => setDraft(insertCreationFlowStep(draft, createCreationFlowStep("New idea"), index + 1))}>Insert after</button><button type="button" className={smallButton} disabled={typeof step.payload?.ideaPlaceholderId === "string"} title={typeof step.payload?.ideaPlaceholderId === "string" ? "Idea cards share a placeholder identity and are not duplicated as sequence steps." : "Duplicate this step without copying its branches."} onClick={() => setDraft(duplicateCreationFlowStep(draft, step.id))}>Duplicate</button><button type="button" className={`${BUTTON_CLASSES.danger} ${BUTTON_SIZES.xs}`} onClick={() => setDraft(removeCreationFlowStep(draft, step.id))}>Remove</button></div></div>
              <textarea aria-label={`Step ${index + 1} text`} className={`${inputClass} mt-2`} rows={2} value={step.text} onChange={(event) => setDraft(patchCreationFlowStep(draft, step.id, { text: event.target.value }))} />
              <div className="mt-2 grid gap-2 md:grid-cols-3"><label className="text-[10px] font-semibold uppercase text-slate-500">Meaning<select className={`${inputClass} mt-1 normal-case`} value={step.kind} onChange={(event) => setDraft(patchCreationFlowStep(draft, step.id, { kind: event.target.value as CreationFlowStepKind }))}>{CREATION_FLOW_STEP_KINDS.map((kind) => <option key={kind} value={kind}>{LABELS[kind]}</option>)}</select></label><label className="text-[10px] font-semibold uppercase text-slate-500">When<select className={`${inputClass} mt-1 normal-case`} value={step.timing ?? "after_completion"} onChange={(event) => setDraft(patchCreationFlowStep(draft, step.id, { timing: event.target.value as CreationFlowTiming }))}><option value="immediate">Do now</option><option value="after_completion">Then, after completion</option><option value="available_later">Make available later</option><option value="story_only">Story only</option></select></label><label className="text-[10px] font-semibold uppercase text-slate-500">Repeat<select className={`${inputClass} mt-1 normal-case`} value={step.repeatPolicy ?? "unspecified"} onChange={(event) => setDraft(patchCreationFlowStep(draft, step.id, { repeatPolicy: event.target.value as CreationFlowDraft["steps"][number]["repeatPolicy"] }))}><option value="unspecified">Decide later</option><option value="inherit_owner">Inherit owner</option><option value="repeatable">Repeatable</option><option value="one_shot">One shot</option></select></label></div>
              {step.kind !== "note" && targetKindsForStep(step.kind).length > 0 && <label className="mt-2 block text-[10px] font-semibold uppercase text-slate-500">Existing canonical target<select aria-label={`Step ${index + 1} canonical target`} className={`${inputClass} mt-1 normal-case`} value={step.target?.canonicalId ? `${step.target.kind}:${step.target.canonicalId}` : step.target?.draftId ? `local:${step.target.draftId}` : ""} onChange={(event) => {
                const [kind, ...idParts] = event.target.value.split(":"); const id = idParts.join(":");
                const clearsVariant = ["activate_location_variant", "activate_character_variant", "activate_item_variant"].includes(step.kind);
                if (kind === "local") { const placeholder = draft.placeholders.find((row) => row.id === id); setDraft(patchCreationFlowStep(draft, step.id, { target: placeholder ? { kind: placeholder.kind as CreationFlowRefKind, draftId: placeholder.id, label: placeholder.label } : undefined, ...(clearsVariant ? { payload: { ...(step.payload ?? {}), variantId: undefined } } : {}) })); return; }
                const entry = catalog?.references[kind as CreationFlowRefKind]?.entries.find((row) => row.id === id);
                setDraft(patchCreationFlowStep(draft, step.id, { target: entry ? { kind: kind as CreationFlowRefKind, canonicalId: entry.id, label: entry.label } : undefined, ...(clearsVariant ? { payload: { ...(step.payload ?? {}), variantId: undefined } } : {}) }));
              }}><option value="">Not resolved yet</option>{targetKindsForStep(step.kind).flatMap((kind) => (catalog?.references[kind]?.entries ?? []).map((entry) => <option key={`${kind}:${entry.id}`} value={`${kind}:${entry.id}`}>{entry.label} ({kind.replace(/_/g, " ")})</option>))}{draft.placeholders.filter((placeholder) => targetKindsForStep(step.kind).includes(placeholder.kind as CreationFlowRefKind)).map((placeholder) => <option key={`local:${placeholder.id}`} value={`local:${placeholder.id}`}>{placeholder.label} (local placeholder)</option>)}</select></label>}
              {step.kind === "numeric_reward" && <label className="mt-2 block text-[10px] font-semibold uppercase text-slate-500">XP reward<input aria-label={`Step ${index + 1} XP reward`} className={`${inputClass} mt-1 normal-case`} type="number" min="0" value={typeof step.payload?.xpReward === "number" ? step.payload.xpReward : ""} onChange={(event) => setDraft(patchCreationFlowStep(draft, step.id, { payload: { ...(step.payload ?? {}), xpReward: event.target.value === "" ? undefined : Number(event.target.value) } }))} /></label>}
              {step.kind === "item_reward" && <label className="mt-2 block text-[10px] font-semibold uppercase text-slate-500">Quantity<input aria-label={`Step ${index + 1} item quantity`} className={`${inputClass} mt-1 normal-case`} type="number" min="1" value={typeof step.payload?.quantity === "number" ? step.payload.quantity : 1} onChange={(event) => setDraft(patchCreationFlowStep(draft, step.id, { payload: { ...(step.payload ?? {}), quantity: Math.max(1, Number(event.target.value) || 1) } }))} /></label>}
              {step.kind === "inventory_objective" && <div className="mt-2 grid gap-2 sm:grid-cols-2"><label className="text-[10px] font-semibold uppercase text-slate-500">Required count<input aria-label={`Step ${index + 1} required item count`} className={`${inputClass} mt-1 normal-case`} type="number" min="1" value={typeof step.payload?.requiredCount === "number" ? step.payload.requiredCount : 1} onChange={(event) => setDraft(patchCreationFlowStep(draft, step.id, { payload: { ...(step.payload ?? {}), requiredCount: Math.max(1, Number(event.target.value) || 1) } }))} /></label><label className="text-[10px] font-semibold uppercase text-slate-500">On progress<select className={`${inputClass} mt-1 normal-case`} value={String(step.payload?.consumptionPolicy ?? "keep")} onChange={(event) => setDraft(patchCreationFlowStep(draft, step.id, { payload: { ...(step.payload ?? {}), consumptionPolicy: event.target.value } }))}><option value="keep">Keep item</option><option value="consume_on_turn_in">Consume on turn-in</option><option value="consume_on_progress">Consume as progress</option></select></label></div>}
              {(["activate_location_variant", "activate_character_variant", "activate_item_variant"] as CreationFlowStepKind[]).includes(step.kind) && (() => {
                const targetEntry = step.target?.canonicalId ? catalog?.references[step.target.kind]?.entries.find((entry) => entry.id === step.target?.canonicalId) : undefined;
                const variants = objectRows(targetEntry?.variants);
                return <label className="mt-2 block text-[10px] font-semibold uppercase text-slate-500">Canonical variant<select aria-label={`Step ${index + 1} variant identity`} className={`${inputClass} mt-1 normal-case`} value={String(step.payload?.variantId ?? "")} disabled={!targetEntry || variants.length === 0} onChange={(event) => setDraft(patchCreationFlowStep(draft, step.id, { payload: { ...(step.payload ?? {}), variantId: event.target.value } }))}><option value="">{!targetEntry ? "Choose the canonical target first" : variants.length === 0 ? "This target has no authored variants" : "Choose a stable variant"}</option>{variants.map((variant) => <option key={String(variant.id)} value={String(variant.id)}>{String(variant.label || variant.name || variant.id)}</option>)}</select></label>;
              })()}
              {step.kind === "gameplay_effect" && (() => {
                const action = step.gameplayAction ?? defaultGameplayAction("apply_effect");
                const actionType = action.actionType;
                const refKind: CreationFlowRefKind | null = actionType === "apply_effect" || actionType === "restore_resource" ? "effect" : actionType === "apply_status" || actionType === "remove_status" ? "status" : actionType === "grant_currency" || actionType === "take_currency" ? "currency" : null;
                const selectedRef = "effect" in action ? action.effect : "status" in action ? action.status : "currency" in action ? action.currency : undefined;
                const patchAction = (patch: Record<string, unknown>) => setDraft(patchCreationFlowStep(draft, step.id, { gameplayAction: { ...action, ...patch } as NarrativeGameplayAction }));
                return <fieldset className="mt-2 rounded border border-blue-200 p-3 dark:border-blue-900"><legend className="px-1 text-[10px] font-semibold uppercase text-blue-700 dark:text-blue-300">Typed gameplay action</legend><div className="grid gap-2 sm:grid-cols-2"><label className="text-[10px] font-semibold uppercase text-slate-500">Action<select className={`${inputClass} mt-1 normal-case`} value={actionType} onChange={(event) => setDraft(patchCreationFlowStep(draft, step.id, { gameplayAction: defaultGameplayAction(event.target.value as GameplayActionType) }))}>{GAMEPLAY_ACTION_TYPES.map((value) => <option key={value} value={value}>{value.replace(/_/g, " ")}</option>)}</select></label><label className="text-[10px] font-semibold uppercase text-slate-500">Target scope<select className={`${inputClass} mt-1 normal-case`} value={action.target.scope} onChange={(event) => patchAction({ target: { ...action.target, scope: event.target.value } })}>{["player", "party", "source_character", "target_character", "encounter_side", "location", "explicit_entity"].map((value) => <option key={value} value={value}>{value.replace(/_/g, " ")}</option>)}</select></label>{refKind && <label className="text-[10px] font-semibold uppercase text-slate-500 sm:col-span-2">Canonical {refKind}<select className={`${inputClass} mt-1 normal-case`} value={selectedRef?.canonicalId ?? ""} onChange={(event) => { const entry = catalog?.references[refKind]?.entries.find((row) => row.id === event.target.value); patchAction({ [refKind]: { kind: refKind, ...(entry ? { canonicalId: entry.id, label: entry.label } : {}) } }); }}><option value="">Choose {refKind}</option>{(catalog?.references[refKind]?.entries ?? []).map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select></label>}{(actionType === "grant_currency" || actionType === "take_currency") && <label className="text-[10px] font-semibold uppercase text-slate-500">Amount<input className={`${inputClass} mt-1 normal-case`} type="number" min="1" value={action.amount} onChange={(event) => patchAction({ amount: Math.max(1, Number(event.target.value) || 1) })} /></label>}{(actionType === "remove_status" || actionType === "remove_matching_statuses") && <label className="text-[10px] font-semibold uppercase text-slate-500">Removal mode<select className={`${inputClass} mt-1 normal-case`} value={action.removalMode} onChange={(event) => patchAction({ removalMode: event.target.value })}><option value="cleanse">Cleanse</option><option value="dispel">Dispel</option><option value="system">System removal</option></select></label>}{actionType === "remove_matching_statuses" && <><label className="text-[10px] font-semibold uppercase text-slate-500">Polarity<select className={`${inputClass} mt-1 normal-case`} value={action.filter.polarity ?? "Harmful"} onChange={(event) => patchAction({ filter: { ...action.filter, polarity: event.target.value } })}><option value="Harmful">Harmful</option><option value="Beneficial">Beneficial</option><option value="Neutral">Neutral</option></select></label><label className="text-[10px] font-semibold uppercase text-slate-500">Status tag<input className={`${inputClass} mt-1 normal-case`} value={action.filter.statusTag ?? ""} onChange={(event) => patchAction({ filter: { ...action.filter, statusTag: event.target.value } })} /></label></>}</div><p className="mt-2 text-[11px] text-blue-700 dark:text-blue-300">This row is validated and exported by the web app. Runtime execution remains unverified.</p></fieldset>;
              })()}
              {step.kind === "numeric_reward" && ([
                { key: "currencyRewards", kind: "currency" as CreationFlowRefKind, idKey: "currencyId", label: "Currency rewards", min: 0.01 },
                { key: "reputationRewards", kind: "faction" as CreationFlowRefKind, idKey: "factionId", label: "Reputation changes", min: undefined },
              ]).map((config) => {
                const rows = objectRows(step.payload?.[config.key]); const entries = catalog?.references[config.kind]?.entries ?? [];
                return <fieldset key={config.key} className="mt-2 rounded border border-slate-200 p-2 dark:border-slate-700"><legend className="px-1 text-[10px] font-semibold uppercase text-slate-500">{config.label}</legend><div className="space-y-2">{rows.map((row, rewardIndex) => <div key={rewardIndex} className="grid gap-2 sm:grid-cols-[1fr_110px_auto]"><select aria-label={`Step ${index + 1} ${config.kind} ${rewardIndex + 1}`} className={inputClass} value={String(row[config.idKey] ?? "")} onChange={(event) => { const next = rows.map((item, itemIndex) => itemIndex === rewardIndex ? { ...item, [config.idKey]: event.target.value } : item); setDraft(patchCreationFlowStep(draft, step.id, { payload: { ...(step.payload ?? {}), [config.key]: next } })); }}><option value="">Choose {config.kind}</option>{entries.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select><input aria-label={`Step ${index + 1} ${config.kind} amount ${rewardIndex + 1}`} className={inputClass} type="number" {...(config.min === undefined ? {} : { min: config.min })} value={typeof row.amount === "number" ? row.amount : 0} onChange={(event) => { const next = rows.map((item, itemIndex) => itemIndex === rewardIndex ? { ...item, amount: Number(event.target.value) } : item); setDraft(patchCreationFlowStep(draft, step.id, { payload: { ...(step.payload ?? {}), [config.key]: next } })); }} /><button type="button" className={`${BUTTON_CLASSES.danger} ${BUTTON_SIZES.xs}`} onClick={() => setDraft(patchCreationFlowStep(draft, step.id, { payload: { ...(step.payload ?? {}), [config.key]: rows.filter((_, itemIndex) => itemIndex !== rewardIndex) } }))}>Remove</button></div>)}<button type="button" className={smallButton} disabled={entries.length === 0} onClick={() => setDraft(patchCreationFlowStep(draft, step.id, { payload: { ...(step.payload ?? {}), [config.key]: [...rows, { [config.idKey]: entries[0]?.id ?? "", amount: config.kind === "currency" ? 1 : 0 }] } }))}>Add {config.kind === "currency" ? "currency" : "reputation"}</button></div></fieldset>;
              })}
            </article>)}
            {draft.steps.length === 0 && <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">Capture freely. Structure can wait.</div>}
          </section>

          {(draft.shape === "sequence" || draft.shape === "hybrid") && draft.steps.length > 1 && <section className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-sm font-semibold">Outcome transitions</h3><p className="text-xs text-slate-500">Name the playable outcome. Conditional and dialogue-choice branches require the exact canonical condition that makes them honest; every compiled transition remains runtime-unverified.</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3"><select aria-label="Branch from" className={inputClass} value={branchFrom} onChange={(event) => setBranchFrom(event.target.value)}><option value="">From step</option>{draft.steps.map((step) => <option key={step.id} value={step.id}>{step.text || "Untitled"}</option>)}</select><select aria-label="Branch to" className={inputClass} value={branchTo} onChange={(event) => setBranchTo(event.target.value)}><option value="">To step</option>{draft.steps.map((step) => <option key={step.id} value={step.id}>{step.text || "Untitled"}</option>)}</select><select aria-label="Branch trigger" className={inputClass} value={branchTrigger} onChange={(event) => { setBranchTrigger(event.target.value as CreationFlowDraft["transitions"][number]["trigger"]); setBranchRequirementId(""); setBranchSourceRefId(""); }}><option value="condition">When a condition is met</option><option value="fallback">Otherwise / fallback</option><option value="dialogue_choice">After an exact dialogue choice</option><option value="victory">On victory</option><option value="interaction_closed">After interaction closes</option><option value="complete">On completion</option></select><input aria-label="Branch label" className={inputClass} value={branchLabel} onChange={(event) => setBranchLabel(event.target.value)} placeholder="Player-facing outcome label (optional)" />
              {branchTrigger === "condition" && <select aria-label="Branch requirement" className={inputClass} value={branchRequirementId} onChange={(event) => setBranchRequirementId(event.target.value)}><option value="">Choose canonical requirement</option>{(catalog?.references.requirement?.entries ?? []).map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select>}
              {branchTrigger === "dialogue_choice" && <select aria-label="Branch dialogue choice" className={inputClass} value={branchSourceRefId} onChange={(event) => setBranchSourceRefId(event.target.value)}><option value="">Choose exact saved choice</option>{(catalog?.references.dialogue_choice?.entries ?? []).map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select>}
            </div>
            <button type="button" className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.sm} mt-2`} disabled={!branchFrom || !branchTo || branchFrom === branchTo || (branchTrigger === "condition" && !branchRequirementId) || (branchTrigger === "dialogue_choice" && !branchSourceRefId) || (branchTrigger === "complete" && !branchLabel.trim())} onClick={() => { update({ transitions: [...draft.transitions, { id: generateUlid(), fromStepId: branchFrom, toStepId: branchTo, trigger: branchTrigger, ...(branchRequirementId ? { requirementId: branchRequirementId } : {}), ...(branchSourceRefId ? { sourceRefId: branchSourceRefId } : {}), ...(branchLabel.trim() ? { label: branchLabel.trim() } : {}), sortOrder: draft.transitions.length }] }); setBranchLabel(""); setBranchRequirementId(""); setBranchSourceRefId(""); }}>Add outcome transition</button>
            <div className="mt-3 space-y-1">{draft.transitions.filter((transition) => transition.trigger !== "complete" || transition.label || transition.requirementId || transition.sourceRefId).map((transition) => <div key={transition.id} className="flex items-center justify-between gap-2 rounded bg-slate-100 p-2 text-xs dark:bg-slate-800"><span><b>{transition.trigger.replace(/_/g, " ")}</b>: {draft.steps.find((step) => step.id === transition.fromStepId)?.text || "Missing step"} → {draft.steps.find((step) => step.id === transition.toStepId)?.text || "Missing step"}{transition.label ? ` — ${transition.label}` : ""}</span><button type="button" className={`${BUTTON_CLASSES.danger} ${BUTTON_SIZES.xs}`} onClick={() => update({ transitions: draft.transitions.filter((row) => row.id !== transition.id) })}>Remove</button></div>)}</div>
          </section>}
        </main>

        <aside className="space-y-3">
          <section className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"><h3 className="text-sm font-semibold">Idea cards</h3><div className="mt-2 grid gap-2"><input aria-label="Idea label" className={inputClass} value={ideaLabel} onChange={(event) => setIdeaLabel(event.target.value)} placeholder="Name the idea" /><select aria-label="Idea kind" className={inputClass} value={ideaKind} onChange={(event) => setIdeaKind(event.target.value as CreationFlowRefKind)}>{IDEA_KINDS.map((kind) => <option key={kind} value={kind}>{kind.replace(/_/g, " ")}</option>)}</select><textarea aria-label="Idea direction" className={inputClass} rows={2} value={ideaDirection} onChange={(event) => setIdeaDirection(event.target.value)} placeholder="Creative direction (optional)" /><button type="button" className={`${BUTTON_CLASSES.violet} ${BUTTON_SIZES.sm}`} disabled={!ideaLabel.trim()} onClick={() => addIdea()}>Add idea card</button></div>
            <div className="mt-3 space-y-2">{draft.placeholders.map((placeholder) => <div key={placeholder.id} className="rounded border border-dashed border-violet-300 p-2 text-xs"><b>{placeholder.label}</b><span className="ml-1 text-violet-600">{placeholder.kind}</span>{placeholder.direction && <p className="mt-1 text-slate-600 dark:text-slate-300">{placeholder.direction}</p>}<span className="mt-1 block text-amber-700 dark:text-amber-300">Local placeholder</span></div>)}</div>
          </section>
          {ideaSteps.length > 1 && <section className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"><h3 className="text-sm font-semibold">Creative relationship</h3><p className="text-xs text-slate-500">Relationships explain association, never execution order.</p><div className="mt-2 grid gap-2"><select aria-label="Relation from" className={inputClass} value={relationFrom} onChange={(event) => setRelationFrom(event.target.value)}><option value="">From idea</option>{draft.placeholders.map((placeholder) => <option key={placeholder.id} value={placeholder.id}>{placeholder.label}</option>)}</select><input aria-label="Relation label" className={inputClass} value={relationLabel} onChange={(event) => setRelationLabel(event.target.value)} /><select aria-label="Relation to" className={inputClass} value={relationTo} onChange={(event) => setRelationTo(event.target.value)}><option value="">To idea</option>{draft.placeholders.map((placeholder) => <option key={placeholder.id} value={placeholder.id}>{placeholder.label}</option>)}</select><button type="button" className={smallButton} disabled={!relationFrom || !relationTo || relationFrom === relationTo || !relationLabel.trim()} onClick={() => { const fromStepId = ideaStepId(draft, relationFrom); const toStepId = ideaStepId(draft, relationTo); if (fromStepId && toStepId) update({ relations: [...draft.relations, { id: generateUlid(), fromStepId, toStepId, relation: relationLabel.trim(), resolution: "local_intent" }] }); }}>Connect ideas</button></div><div className="mt-2 space-y-1">{draft.relations.map((relation) => <div key={relation.id} className="rounded bg-slate-100 p-2 text-xs dark:bg-slate-800">{draft.steps.find((step) => step.id === relation.fromStepId)?.target?.label} <b>{relation.relation}</b> {draft.steps.find((step) => step.id === relation.toStepId)?.target?.label}</div>)}</div></section>}
          <section className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Capture health</h3><span className="text-[10px] text-slate-500">{savedAt ? `Saved ${new Date(savedAt).toLocaleTimeString()}` : "Saving…"}</span></div><div className="mt-2 space-y-2">{issues.slice(0, 12).map((issue, index) => <div key={`${issue.stepId || issue.placeholderId || index}`} className={`rounded border p-2 text-xs ${ISSUE_CLASSES[issue.severity === "blocker" ? "blocker" : issue.severity === "warning" ? "warning" : "info"]}`}>{issue.message}</div>)}{issues.length === 0 && <div className={`rounded border p-2 text-xs ${ISSUE_CLASSES.success}`}>Capture is structurally healthy.</div>}</div></section>
          <section className="rounded-lg border border-emerald-200 bg-white p-3 dark:border-emerald-900 dark:bg-slate-900"><h3 className="text-sm font-semibold">Canonical compiler</h3><p className="mt-1 text-xs text-slate-500">Backend preview is authoritative and rollback-only. Unsupported semantics return step-scoped blockers.</p>{catalog && <p className="mt-2 text-[11px] text-slate-500">{catalog.compiler_version} · {catalog.capabilities.compilable_step_kinds.length} step kinds currently compilable</p>}{compilerError && <div className={`mt-2 rounded border p-2 text-xs ${ISSUE_CLASSES.blocker}`}>{compilerError}</div>}<button type="button" className={`${BUTTON_CLASSES.primary} ${BUTTON_SIZES.sm} mt-3 w-full`} disabled={compilerBusy || draft.steps.length === 0} onClick={() => void previewCompiler()}>{compilerBusy ? "Validating…" : "Preview canonical bundle"}</button></section>
        </aside>
      </div>
    </div>
    {compilerReview && <BundleReview result={compilerReview} title="Creation Flow Bundle Review" description={`${compilerReview.implementation_summary} Preview was validated and rolled back; commit recompiles and checks for stale canonical data.`} variant="modal" commitLabel="Commit Creation Flow" saving={compilerBusy} error={compilerError} warningAcknowledgement="required" onCancel={() => { setCompilerReview(null); setCompilerError(""); }} onCommit={(acceptedWarningIds) => void commitCompiler(acceptedWarningIds)}>
      {[...compilerReview.blockers, ...compilerReview.warnings].some((issue) => issue.step_id) && <section className="mt-3 rounded border border-amber-200 p-2 dark:border-amber-900"><h3 className="text-sm font-semibold">Issues by step</h3><div className="mt-2 space-y-1">{[...compilerReview.blockers, ...compilerReview.warnings].filter((issue) => issue.step_id).map((issue) => <button key={issue.id} type="button" className="block w-full rounded bg-amber-50 p-2 text-left text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-100" onClick={() => { const stepId = issue.step_id; setCompilerReview(null); window.setTimeout(() => { if (stepId) document.getElementById(`creation-flow-step-${stepId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); }, 0); }}>{issue.message}<span className="mt-1 block font-semibold">Open owning step</span></button>)}</div></section>}
      <details className="mt-3 rounded border border-slate-200 p-2 dark:border-slate-700" open>
        <summary className="cursor-pointer text-sm font-semibold">Temporary sequence and state rehearsal ({compilerReview.rehearsal.paths.length} paths)</summary>
        <p className="mt-1 text-xs text-slate-500">{compilerReview.rehearsal.note}</p>
        {compilerReview.rehearsal.truncated && <p className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">Only the first {compilerReview.rehearsal.path_limit} outcomes are shown. Split this flow so every playable path can be reviewed before commit.</p>}
        <div className="mt-2 space-y-2">{compilerReview.rehearsal.paths.map((path, pathIndex) => <div key={`${path.entry_event_id}:${pathIndex}`} className="rounded bg-slate-50 p-2 text-xs dark:bg-slate-950"><b>Path {pathIndex + 1}</b><ol className="mt-1 list-decimal space-y-1 pl-5">{path.trace.map((row, rowIndex) => <li key={`${row.event_id}:${rowIndex}`}><span>{row.title || row.event_type || row.event_id}</span>{row.via_transition && <span className="ml-1 text-violet-700 dark:text-violet-300">via {row.via_transition.label || row.via_transition.trigger.replace(/_/g, " ")}</span>}{row.flags_added.length > 0 && <span className="ml-1 text-emerald-700 dark:text-emerald-300">sets {row.flags_added.length} state flag{row.flags_added.length === 1 ? "" : "s"}</span>}</li>)}</ol></div>)}</div>
      </details>
    </BundleReview>}
  </div>;
}
