import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { readDraftInventory } from "../../navigation/draftInventory";
import {
  appendCreationFlowStep,
  createCreationFlowDraft,
  createCreationFlowStep,
  moveCreationFlowStep,
  normalizeCreationFlowDraft,
  removeCreationFlowStep,
  sameCreationFlowRef,
  updateCreationFlowStep,
  validateCreationFlowDraft,
  type CreationFlowDraft,
  type CreationFlowOrigin,
  type CreationFlowPlaceholder,
  type CreationFlowRef,
  type CreationFlowShape,
  type CreationFlowStepKind,
} from "../../authoring/creationFlow";
import {
  downloadCreationFlowDraft,
  findCreationFlowDrafts,
  importCreationFlowDraft,
  listCreationFlowDrafts,
  readCreationFlowDraft,
  saveCreationFlowDraft,
  saveCreationFlowSnapshot,
} from "../../authoring/creationFlowDraftStorage";
import { generateUlid } from "../../utils/generateId";
import { BUTTON_CLASSES, BUTTON_SIZES } from "../../styles/uiTokens";
import { apiFetch } from "../../lib/api";
import { AuthoringPanel, AuthoringStatusChip, EmptyState, StatusNotice } from "../authoringUi";

const inputClass = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";
const buttonClass = `${BUTTON_CLASSES.outline} ${BUTTON_SIZES.sm}`;
const primaryClass = `${BUTTON_CLASSES.primary} ${BUTTON_SIZES.sm}`;

const STEP_OPTIONS: Array<{ value: CreationFlowStepKind; label: string }> = [
  { value: "unshaped", label: "Decide later" },
  { value: "dialogue", label: "Dialogue" },
  { value: "encounter", label: "Start encounter" },
  { value: "open_shop", label: "Open shop now" },
  { value: "item_reward", label: "Give item" },
  { value: "numeric_reward", label: "Give XP/currency/reputation" },
  { value: "quest_assignment", label: "Assign/discover quest" },
  { value: "quest_turn_in", label: "Turn in quest" },
  { value: "inventory_objective", label: "Inventory objective" },
  { value: "join_companion", label: "Companion joins" },
  { value: "lore_reveal", label: "Reveal lore" },
  { value: "make_available", label: "Make available later" },
  { value: "persistent_fact", label: "Remember a fact" },
  { value: "world_state", label: "Change world state" },
  { value: "gameplay_effect", label: "Gameplay effect" },
  { value: "story_placement", label: "Place in story" },
  { value: "scripted_moment", label: "Scripted moment" },
  { value: "teleport", label: "Teleport" },
  { value: "note", label: "Note only" },
  { value: "custom", label: "Unsupported/custom" },
];

const IDEA_KINDS = ["character", "faction", "location", "item", "quest", "encounter", "lore_entry", "event", "custom"];

function refSignature(origin: CreationFlowOrigin): string {
  return JSON.stringify([origin.ref.kind, origin.ref.canonicalId, origin.ref.draftId, origin.subRef?.kind, origin.subRef?.canonicalId, origin.subRef?.draftId]);
}

function supportTone(support: string): "neutral" | "success" | "warning" | "error" | "info" {
  if (support === "compilable") return "success";
  if (support === "story_only") return "info";
  if (support === "unsupported") return "error";
  if (support === "unresolved" || support === "runtime_unverified") return "warning";
  return "neutral";
}

function updateDraft(draft: CreationFlowDraft, patch: Partial<CreationFlowDraft>): CreationFlowDraft {
  return normalizeCreationFlowDraft({ ...draft, ...patch, revision: draft.revision + 1, updatedAt: Date.now() });
}

export interface CreationFlowCaptureProps {
  variant: "then" | "expand";
  title: string;
  origin: CreationFlowOrigin;
  shape: CreationFlowShape;
  returnFrame?: { workspace: string; context?: CreationFlowRef; selectedId?: string; localViewState?: Record<string, unknown> };
  className?: string;
}

export default function CreationFlowCapture({ variant, title, origin, shape, returnFrame, className = "" }: CreationFlowCaptureProps) {
  const signature = refSignature(origin);
  const [openedFor, setOpenedFor] = useState("");
  const [draft, setDraft] = useState<CreationFlowDraft | null>(null);
  const [knownDrafts, setKnownDrafts] = useState<CreationFlowDraft[]>([]);
  const [newStepText, setNewStepText] = useState("");
  const [newStepKind, setNewStepKind] = useState<CreationFlowStepKind>("unshaped");
  const [snapshotName, setSnapshotName] = useState("");
  const [notice, setNotice] = useState("");
  const [ideaLabel, setIdeaLabel] = useState("");
  const [ideaKind, setIdeaKind] = useState("character");
  const [relationFrom, setRelationFrom] = useState("");
  const [relationTo, setRelationTo] = useState("");
  const [relationLabel, setRelationLabel] = useState("causes");
  const proseRef = useRef<HTMLTextAreaElement | null>(null);
  const isOpen = openedFor === signature && draft !== null;
  const issues = useMemo(() => draft ? validateCreationFlowDraft(draft) : [], [draft]);

  const persist = (next: CreationFlowDraft) => {
    const saved = saveCreationFlowDraft(next);
    setDraft(saved);
    setKnownDrafts(findCreationFlowDrafts(origin));
    window.dispatchEvent(new Event("soa:creation-flow-drafts-changed"));
  };

  const open = () => {
    const matches = findCreationFlowDrafts(origin);
    const next = matches[0] ?? saveCreationFlowDraft(createCreationFlowDraft({ title, shape, origin, returnFrame }));
    setKnownDrafts(matches.length ? matches : [next]);
    setDraft(next);
    setOpenedFor(signature);
  };

  const createAnother = () => {
    const next = saveCreationFlowDraft(createCreationFlowDraft({ title, shape, origin, returnFrame }));
    setDraft(next);
    setKnownDrafts(findCreationFlowDrafts(origin));
    setNotice("New browser-local Creation Flow draft created.");
  };

  const appendStep = () => {
    if (!draft || !newStepText.trim()) return;
    persist(appendCreationFlowStep(draft, createCreationFlowStep(newStepText.trim(), newStepKind)));
    setNewStepText("");
    setNewStepKind("unshaped");
  };

  const addIdea = (label: string, kind: string, mention?: { noteId: string; start: number; end: number; quotedText: string }) => {
    if (!draft || !label.trim()) return;
    const normalizedLabel = label.trim();
    const existing = draft.placeholders.find((placeholder) => placeholder.label.localeCompare(normalizedLabel, undefined, { sensitivity: "accent" }) === 0);
    const placeholder: CreationFlowPlaceholder = existing ?? { id: generateUlid(), kind, label: normalizedLabel };
    let next = draft;
    if (!existing) {
      const step = createCreationFlowStep(normalizedLabel, "note");
      step.target = { kind: IDEA_KINDS.includes(kind) ? kind as CreationFlowRef["kind"] : "custom", draftId: placeholder.id, label: normalizedLabel };
      step.targetResolution = "placeholder";
      next = appendCreationFlowStep(next, step);
      next = updateDraft(next, { placeholders: [...next.placeholders, placeholder] });
    }
    if (mention) {
      const duplicate = next.mentions.some((entry) => entry.ideaId === placeholder.id && entry.noteId === mention.noteId && entry.start === mention.start && entry.end === mention.end);
      if (!duplicate) next = updateDraft(next, { mentions: [...next.mentions, { id: generateUlid(), ideaId: placeholder.id, ...mention }] });
    }
    persist(next);
    setIdeaLabel("");
  };

  const updateProse = (value: string) => {
    if (!draft) return;
    const note = draft.localNotes[0] ?? { id: generateUlid(), text: "" };
    const mentions = draft.mentions.filter((mention) => mention.noteId !== note.id || (mention.end <= value.length && value.slice(mention.start, mention.end) === mention.quotedText));
    persist(updateDraft(draft, { localNotes: [{ ...note, text: value }, ...draft.localNotes.slice(1)], mentions }));
  };

  const promoteSelection = () => {
    if (!draft || !proseRef.current) return;
    const note = draft.localNotes[0];
    if (!note) return;
    const start = proseRef.current.selectionStart;
    const end = proseRef.current.selectionEnd;
    const quotedText = note.text.slice(start, end).trim();
    if (!quotedText) { setNotice("Select a phrase in the prose before promoting it."); return; }
    const rawStart = note.text.indexOf(quotedText, start);
    addIdea(quotedText, ideaKind, { noteId: note.id, start: rawStart, end: rawStart + quotedText.length, quotedText });
    setNotice(`Linked '${quotedText}' to one shared idea card.`);
  };

  const addRelation = () => {
    if (!draft || !relationFrom || !relationTo || relationFrom === relationTo || !relationLabel.trim()) return;
    persist(updateDraft(draft, { relations: [...draft.relations, { id: generateUlid(), fromStepId: relationFrom, toStepId: relationTo, relation: relationLabel.trim(), resolution: "local_intent" }] }));
  };

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const imported = importCreationFlowDraft(await file.text());
      setDraft(imported);
      setKnownDrafts(findCreationFlowDrafts(origin));
      setOpenedFor(signature);
      setNotice(`Imported '${imported.title}' as browser-local work.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Creation Flow import failed.");
    }
  };

  if (!isOpen) {
    return <div className={`rounded-md border border-dashed border-violet-300 bg-violet-50/60 p-3 dark:border-violet-800 dark:bg-violet-950/20 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><div className="text-xs font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">{variant === "then" ? "Narrative continuation" : "Narrative expansion"}</div><div className="text-sm text-slate-600 dark:text-slate-300">Capture the idea before creating technical records.</div></div>
        <button type="button" className={primaryClass} onClick={open}>{variant === "then" ? "Then…" : "Expand this place"}</button>
      </div>
    </div>;
  }

  const prose = draft.localNotes[0]?.text ?? "";
  return <AuthoringPanel
    className={className}
    title={variant === "then" ? "Then…" : "Expand this place"}
    subtitle="Browser-local Creation Flow capture"
    help="Capture and shape intent here. This alpha creates no flags, requirements, canonical records, or runtime claims."
    status={<div className="flex flex-wrap gap-1"><AuthoringStatusChip tone="warning">Local only</AuthoringStatusChip><AuthoringStatusChip tone={issues.some((issue) => issue.severity === "blocker") ? "error" : "neutral"}>{issues.length} issues</AuthoringStatusChip></div>}
    actions={<button type="button" className={buttonClass} onClick={() => { setOpenedFor(""); setDraft(null); }}>Close</button>}
  >
    {notice && <StatusNotice className="mb-3" tone={notice.toLowerCase().includes("fail") || notice.toLowerCase().includes("unsupported") ? "error" : "info"}>{notice}</StatusNotice>}
    <div className="flex flex-wrap items-end gap-2">
      <label className="min-w-52 flex-1 text-xs font-semibold uppercase text-slate-500">Draft
        <select className={`${inputClass} mt-1 normal-case`} value={draft.id} onChange={(event) => { const selected = readCreationFlowDraft(event.target.value); if (selected) setDraft(selected); }}>
          {knownDrafts.map((entry) => <option key={entry.id} value={entry.id}>{entry.title} · {entry.steps.length} steps</option>)}
        </select>
      </label>
      <button type="button" className={buttonClass} onClick={createAnother}>New draft</button>
      <button type="button" className={buttonClass} onClick={() => downloadCreationFlowDraft(draft)}>Export JSON</button>
      <label className={`${buttonClass} cursor-pointer`}>Import JSON<input className="sr-only" type="file" accept="application/json,.json" onChange={(event) => void importFile(event)} /></label>
    </div>

    <StatusNotice className="mt-3" tone="warning">Work in progress is stored only in this browser. Canonical preview and commit remain disabled until the authoritative compiler is implemented.</StatusNotice>

    {variant === "expand" && <div className="mt-4 grid gap-4 xl:grid-cols-2">
      <div>
        <label className="text-xs font-semibold uppercase text-slate-500">Lore / brainstorming prose
          <textarea ref={proseRef} className={`${inputClass} mt-1 min-h-36 normal-case`} value={prose} onChange={(event) => updateProse(event.target.value)} placeholder="Write freely. Select a phrase to promote it into a linked idea card." />
        </label>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select className={inputClass} value={ideaKind} onChange={(event) => setIdeaKind(event.target.value)}>{IDEA_KINDS.map((kind) => <option key={kind} value={kind}>{kind.replace(/_/g, " ")}</option>)}</select>
          <button type="button" className={buttonClass} onClick={promoteSelection}>Promote selected text</button>
        </div>
        {draft.mentions.length > 0 && <div className="mt-2 text-xs text-slate-500">{draft.mentions.length} linked prose mention{draft.mentions.length === 1 ? "" : "s"}; idea cards survive if mentions are removed.</div>}
      </div>
      <div>
        <div className="text-xs font-semibold uppercase text-slate-500">Idea cards</div>
        <div className="mt-1 flex gap-2"><input className={inputClass} value={ideaLabel} onChange={(event) => setIdeaLabel(event.target.value)} placeholder="Ash Regent" onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addIdea(ideaLabel, ideaKind); } }} /><button type="button" className={primaryClass} onClick={() => addIdea(ideaLabel, ideaKind)}>Add idea</button></div>
        <div className="mt-2 flex flex-wrap gap-2">{draft.placeholders.map((placeholder) => <div key={placeholder.id} className="rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-xs dark:border-violet-800 dark:bg-violet-950/30"><span className="block text-[10px] font-semibold uppercase text-violet-600">{placeholder.kind.replace(/_/g, " ")} · unresolved</span><span className="font-semibold">{placeholder.label}</span></div>)}{draft.placeholders.length === 0 && <EmptyState variant="compact">Add a card directly or promote selected prose.</EmptyState>}</div>
      </div>
    </div>}

    <div className="mt-4 grid gap-2 md:grid-cols-[minmax(0,1fr)_220px_auto]">
      <label className="text-xs font-semibold uppercase text-slate-500">What happens next?
        <input className={`${inputClass} mt-1 normal-case`} value={newStepText} onChange={(event) => setNewStepText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); appendStep(); } }} placeholder={variant === "then" ? "The player opens Mara's shop…" : "The displaced bandits need a leader…"} />
      </label>
      <label className="text-xs font-semibold uppercase text-slate-500">Behavior
        <select className={`${inputClass} mt-1 normal-case`} value={newStepKind} onChange={(event) => setNewStepKind(event.target.value as CreationFlowStepKind)}>{STEP_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
      </label>
      <button type="button" className={`${primaryClass} self-end`} onClick={appendStep}>Add</button>
    </div>

    <div className="mt-4 space-y-2">
      {draft.steps.map((step, index) => <div key={step.id} className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-[10px] font-semibold uppercase text-slate-500">{index + 1}. {draft.shape === "constellation" ? "Idea" : index === 0 ? "First" : "Then"}</span><AuthoringStatusChip tone={supportTone(step.support)}>{step.support.replace(/_/g, " ")}</AuthoringStatusChip></div><input className={`${inputClass} mt-2 normal-case`} value={step.text} onChange={(event) => persist(updateCreationFlowStep(draft, step.id, { text: event.target.value }))} /><p className="mt-1 text-[10px] text-slate-500">{step.supportReason}</p></div>
          <div className="flex gap-1"><button type="button" aria-label="Move up" disabled={index === 0} className={buttonClass} onClick={() => persist(moveCreationFlowStep(draft, step.id, -1))}>↑</button><button type="button" aria-label="Move down" disabled={index === draft.steps.length - 1} className={buttonClass} onClick={() => persist(moveCreationFlowStep(draft, step.id, 1))}>↓</button><button type="button" className={`${BUTTON_CLASSES.danger} ${BUTTON_SIZES.sm}`} onClick={() => persist(removeCreationFlowStep(draft, step.id))}>Remove</button></div>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <select aria-label={`Behavior for ${step.text}`} className={inputClass} value={step.kind} onChange={(event) => persist(updateCreationFlowStep(draft, step.id, { kind: event.target.value as CreationFlowStepKind }))}>{STEP_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
          <select aria-label={`Timing for ${step.text}`} className={inputClass} value={step.timing ?? ""} onChange={(event) => persist(updateCreationFlowStep(draft, step.id, { timing: (event.target.value || undefined) as CreationFlowDraft["steps"][number]["timing"] }))}><option value="">Timing undecided</option><option value="immediate">Do now</option><option value="after_completion">After completion</option><option value="available_later">Make available</option><option value="story_only">Story only</option></select>
          <select aria-label={`Repeat policy for ${step.text}`} className={inputClass} value={step.repeatPolicy ?? "unspecified"} onChange={(event) => persist(updateCreationFlowStep(draft, step.id, { repeatPolicy: event.target.value as CreationFlowDraft["steps"][number]["repeatPolicy"] }))}><option value="unspecified">Repeat undecided</option><option value="inherit_owner">Inherit owner</option><option value="repeatable">Repeatable</option><option value="one_shot">One shot</option></select>
        </div>
      </div>)}
      {draft.steps.length === 0 && <EmptyState title="The idea is safe as soon as you add the first line.">Use plain language. You can choose behavior and targets later.</EmptyState>}
    </div>

    {variant === "expand" && draft.steps.length > 1 && <div className="mt-4 rounded-md border border-slate-200 p-3 dark:border-slate-800">
      <div className="text-xs font-semibold uppercase text-slate-500">Causal / creative relation</div>
      <div className="mt-2 grid gap-2 md:grid-cols-[1fr_180px_1fr_auto]">
        <select className={inputClass} value={relationFrom} onChange={(event) => setRelationFrom(event.target.value)}><option value="">From idea…</option>{draft.steps.map((step) => <option key={step.id} value={step.id}>{step.text}</option>)}</select>
        <input className={inputClass} value={relationLabel} onChange={(event) => setRelationLabel(event.target.value)} />
        <select className={inputClass} value={relationTo} onChange={(event) => setRelationTo(event.target.value)}><option value="">To idea…</option>{draft.steps.map((step) => <option key={step.id} value={step.id}>{step.text}</option>)}</select>
        <button type="button" className={buttonClass} onClick={addRelation}>Link</button>
      </div>
      <div className="mt-2 space-y-1">{draft.relations.map((relation) => <div key={relation.id} className="text-xs text-slate-600 dark:text-slate-300">{draft.steps.find((step) => step.id === relation.fromStepId)?.text} <strong>{relation.relation}</strong> {draft.steps.find((step) => step.id === relation.toStepId)?.text} <span className="text-slate-400">(authoring intent)</span></div>)}</div>
    </div>}

    <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
      <label className="min-w-52 text-xs font-semibold uppercase text-slate-500">Snapshot name<input className={`${inputClass} mt-1 normal-case`} value={snapshotName} onChange={(event) => setSnapshotName(event.target.value)} placeholder="Before resolving targets" /></label>
      <button type="button" className={buttonClass} onClick={() => { saveCreationFlowSnapshot(draft, snapshotName); setSnapshotName(""); setNotice("Named local snapshot saved."); }}>Save snapshot</button>
      <span className="text-xs text-slate-500">Revision {draft.revision} · updated {new Date(draft.updatedAt).toLocaleString()}</span>
    </div>
  </AuthoringPanel>;
}

export function ContinueWhereStopped({ context }: { context: CreationFlowRef }) {
  const [refresh, setRefresh] = useState(0);
  const [manifests, setManifests] = useState<Array<Record<string, unknown>>>([]);
  void refresh;
  const flows = listCreationFlowDrafts().filter((draft) => sameCreationFlowRef(draft.origin?.ref, context) || sameCreationFlowRef(draft.origin?.subRef, context)).slice(0, 5);
  const relatedId = context.canonicalId || context.draftId || "";
  const localDrafts = readDraftInventory().filter((item) => !relatedId || item.route.includes(encodeURIComponent(relatedId))).slice(0, 5);
  useEffect(() => {
    let active = true;
    void apiFetch("/api/creation-flow-manifests")
      .then((response) => response.ok ? response.json() : [])
      .then((value: unknown) => {
        if (!active || !Array.isArray(value)) return;
        setManifests(value.filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null && !Array.isArray(entry) && String((entry as Record<string, unknown>).origin_id || "") === relatedId).slice(0, 5));
      })
      .catch(() => { if (active) setManifests([]); });
    return () => { active = false; };
  }, [relatedId, refresh]);
  return <div className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
    <div className="flex items-center justify-between gap-2"><div><div className="text-xs font-semibold uppercase text-slate-500">Continue where I stopped</div><div className="text-xs text-slate-500">Local drafts and project-local committed-flow provenance for this context.</div></div><button type="button" className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`} onClick={() => setRefresh((value) => value + 1)}>Refresh</button></div>
    <div className="mt-2 grid gap-2 lg:grid-cols-3">
      <div><div className="text-[10px] font-semibold uppercase text-slate-500">Creation Flow drafts</div>{flows.map((flow) => <div key={flow.id} className="mt-1 rounded border border-violet-200 p-2 text-xs dark:border-violet-800"><span className="font-semibold">{flow.title}</span><span className="block text-slate-500">{flow.steps.length} steps · {flow.placeholders.length} placeholders</span></div>)}{flows.length === 0 && <span className="text-xs text-slate-500">No related flow yet.</span>}</div>
      <div><div className="text-[10px] font-semibold uppercase text-slate-500">Related local workspace drafts</div>{localDrafts.map((item) => <div key={item.key} className="mt-1 rounded border border-slate-200 p-2 text-xs dark:border-slate-800"><span className="font-semibold">{item.title}</span><span className="block text-slate-500">{item.subtitle}</span></div>)}{localDrafts.length === 0 && <span className="text-xs text-slate-500">No related workspace draft found.</span>}</div>
      <div><div className="text-[10px] font-semibold uppercase text-slate-500">Committed manifests</div>{manifests.map((manifest) => <div key={String(manifest.id)} className="mt-1 rounded border border-emerald-200 p-2 text-xs dark:border-emerald-800"><span className="font-semibold">{String(manifest.title || manifest.slug || manifest.id)}</span><span className="block text-slate-500">{String(manifest.compiler_version || "unknown compiler")} · {Array.isArray(manifest.artifacts) ? manifest.artifacts.length : 0} artifacts</span></div>)}{manifests.length === 0 && <span className="text-xs text-slate-500">No committed flow manifest found.</span>}</div>
    </div>
  </div>;
}
