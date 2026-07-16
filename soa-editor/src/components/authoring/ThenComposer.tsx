import { useEffect, useMemo, useRef, useState } from "react";
import {
  CREATION_FLOW_STEP_KINDS, addCreationFlowStep, createCreationFlowDraft, createCreationFlowStep,
  creationFlowIssues, moveCreationFlowStep, patchCreationFlowStep, reconcileCreationFlowMentions,
  removeCreationFlowStep, touchCreationFlowDraft, type CreationFlowDraft, type CreationFlowLocalNote,
  type CreationFlowPlaceholder, type CreationFlowRefKind, type CreationFlowReturnFrame,
  type CreationFlowStepKind, type CreationFlowTiming,
} from "../../authoring/creationFlow";
import {
  draftsForOrigin, exportCreationFlowDraft, importCreationFlowDraft, loadCreationFlowDraft,
  readCreationFlowSnapshots, saveCreationFlowDraft, saveCreationFlowSnapshot,
  type CreationFlowDraftSummary, type CreationFlowSnapshot,
} from "../../authoring/creationFlowDraftStorage";
import { BUTTON_CLASSES, BUTTON_SIZES, ISSUE_CLASSES } from "../../styles/uiTokens";
import { generateUlid } from "../../utils/generateId";

interface ThenComposerProps {
  open: boolean;
  mode: "then" | "expand";
  origin: NonNullable<CreationFlowDraft["origin"]>;
  originLabel: string;
  returnFrame: CreationFlowReturnFrame;
  onClose: () => void;
}

const inputClass = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";
const smallButton = `${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`;
const IDEA_KINDS: CreationFlowRefKind[] = ["character", "faction", "location", "location_poi", "item", "creature", "quest", "encounter", "lore_entry", "event", "custom"];
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

export default function ThenComposer({ open, mode, origin, originLabel, returnFrame, onClose }: ThenComposerProps) {
  const [draft, setDraft] = useState<CreationFlowDraft | null>(null);
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
  const [branchLabel, setBranchLabel] = useState("");
  const [notice, setNotice] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);
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
    const restored = matching[0] ? loadCreationFlowDraft(matching[0].id) : null;
    if (restored) {
      setDraft(restored); setSnapshots(readCreationFlowSnapshots(restored.id)); setNotice("Continued the most recent browser-local draft for this context.");
    } else startNew();
    // Opening is deliberately keyed to the stable origin, not object identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, originLabel, origin.ref.canonicalId, origin.ref.draftId, origin.subRef?.canonicalId, origin.subRef?.draftId]);

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

  return <div role="dialog" aria-modal="true" aria-label={mode === "expand" ? "Expand this place" : "Then composer"} className="fixed inset-0 z-[70] overflow-y-auto bg-slate-950/65 p-3 sm:p-6">
    <div className="mx-auto max-w-7xl overflow-hidden rounded-xl bg-slate-50 shadow-2xl dark:bg-slate-950">
      <header className="border-b border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><div className="text-xs font-semibold uppercase tracking-wide text-violet-600">{mode === "expand" ? "Story Seed / Expand this place" : "Then…"}</div><h2 className="text-xl font-bold text-slate-950 dark:text-white">{originLabel}</h2><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Capture the idea first. No flags, requirements, beats, or canonical records are written here.</p></div>
          <button type="button" className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.sm}`} onClick={closeComposer}>Close</button>
        </div>
        <div className={`mt-3 rounded-md border p-3 text-xs ${ISSUE_CLASSES.warning}`}><b>Browser-local work in progress.</b> Autosave and snapshots recover this draft in this browser. This is not project persistence or a runtime/DataTable commit.</div>
        {notice && <div className={`mt-2 rounded-md border p-2 text-xs ${ISSUE_CLASSES.info}`}>{notice}</div>}
      </header>

      <div className="grid gap-4 p-4 xl:grid-cols-[240px_minmax(0,1fr)_300px]">
        <aside className="space-y-3">
          <section className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-sm font-semibold">Continue where I stopped</h3>
            <div className="mt-2 space-y-1">{recent.map((row) => <button key={row.id} type="button" className={`w-full rounded border p-2 text-left text-xs ${row.id === draft.id ? "border-violet-500 bg-violet-50 dark:bg-violet-950" : "border-slate-200 dark:border-slate-800"}`} onClick={() => selectDraft(row.id)}><b className="block truncate">{row.title}</b><span>{row.stepCount} steps · {row.placeholderCount} ideas</span><span className="block text-slate-500">{new Date(row.updatedAt).toLocaleString()}</span></button>)}</div>
            <button type="button" className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.sm} mt-2 w-full`} onClick={startNew}>New scoped draft</button>
          </section>
          <section className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-sm font-semibold">Recovery</h3><div className="mt-2 grid gap-2"><button type="button" className={smallButton} onClick={createSnapshot}>Named snapshot</button><button type="button" className={smallButton} onClick={download}>Export JSON</button><button type="button" className={smallButton} onClick={() => importRef.current?.click()}>Import JSON</button><input ref={importRef} className="hidden" type="file" accept="application/json,.json" onChange={(event) => void importFile(event.target.files?.[0])} /></div>
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
            {draft.steps.map((step, index) => <article key={step.id} className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-wrap items-center gap-2"><span className="grid h-6 w-6 place-items-center rounded-full bg-slate-100 text-xs font-bold dark:bg-slate-800">{index + 1}</span><span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase ${supportClass(step.support)}`}>{step.support.replace(/_/g, " ")}</span><div className="ml-auto flex gap-1"><button type="button" aria-label="Move step up" className={smallButton} disabled={index === 0} onClick={() => setDraft(moveCreationFlowStep(draft, step.id, -1))}>↑</button><button type="button" aria-label="Move step down" className={smallButton} disabled={index === draft.steps.length - 1} onClick={() => setDraft(moveCreationFlowStep(draft, step.id, 1))}>↓</button><button type="button" className={`${BUTTON_CLASSES.danger} ${BUTTON_SIZES.xs}`} onClick={() => setDraft(removeCreationFlowStep(draft, step.id))}>Remove</button></div></div>
              <textarea aria-label={`Step ${index + 1} text`} className={`${inputClass} mt-2`} rows={2} value={step.text} onChange={(event) => setDraft(patchCreationFlowStep(draft, step.id, { text: event.target.value }))} />
              <div className="mt-2 grid gap-2 md:grid-cols-3"><label className="text-[10px] font-semibold uppercase text-slate-500">Meaning<select className={`${inputClass} mt-1 normal-case`} value={step.kind} onChange={(event) => setDraft(patchCreationFlowStep(draft, step.id, { kind: event.target.value as CreationFlowStepKind }))}>{CREATION_FLOW_STEP_KINDS.map((kind) => <option key={kind} value={kind}>{LABELS[kind]}</option>)}</select></label><label className="text-[10px] font-semibold uppercase text-slate-500">When<select className={`${inputClass} mt-1 normal-case`} value={step.timing ?? "after_completion"} onChange={(event) => setDraft(patchCreationFlowStep(draft, step.id, { timing: event.target.value as CreationFlowTiming }))}><option value="immediate">Do now</option><option value="after_completion">Then, after completion</option><option value="available_later">Make available later</option><option value="story_only">Story only</option></select></label><label className="text-[10px] font-semibold uppercase text-slate-500">Repeat<select className={`${inputClass} mt-1 normal-case`} value={step.repeatPolicy ?? "unspecified"} onChange={(event) => setDraft(patchCreationFlowStep(draft, step.id, { repeatPolicy: event.target.value as CreationFlowDraft["steps"][number]["repeatPolicy"] }))}><option value="unspecified">Decide later</option><option value="inherit_owner">Inherit owner</option><option value="repeatable">Repeatable</option><option value="one_shot">One shot</option></select></label></div>
              {step.kind !== "note" && <label className="mt-2 block text-[10px] font-semibold uppercase text-slate-500">Local target / placeholder<select className={`${inputClass} mt-1 normal-case`} value={step.target?.draftId ?? ""} onChange={(event) => { const placeholder = draft.placeholders.find((row) => row.id === event.target.value); setDraft(patchCreationFlowStep(draft, step.id, { target: placeholder ? { kind: placeholder.kind as CreationFlowRefKind, draftId: placeholder.id, label: placeholder.label } : undefined })); }}><option value="">Not resolved yet</option>{draft.placeholders.map((placeholder) => <option key={placeholder.id} value={placeholder.id}>{placeholder.label} ({placeholder.kind})</option>)}</select></label>}
            </article>)}
            {draft.steps.length === 0 && <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">Capture freely. Structure can wait.</div>}
          </section>

          {(draft.shape === "sequence" || draft.shape === "hybrid") && draft.steps.length > 1 && <section className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"><h3 className="text-sm font-semibold">Local branch label</h3><p className="text-xs text-slate-500">This preserves an explicit alternative; it does not become runtime behavior in capture-only mode.</p><div className="mt-2 grid gap-2 sm:grid-cols-3"><select aria-label="Branch from" className={inputClass} value={branchFrom} onChange={(event) => setBranchFrom(event.target.value)}><option value="">From step</option>{draft.steps.map((step) => <option key={step.id} value={step.id}>{step.text || "Untitled"}</option>)}</select><select aria-label="Branch to" className={inputClass} value={branchTo} onChange={(event) => setBranchTo(event.target.value)}><option value="">To step</option>{draft.steps.map((step) => <option key={step.id} value={step.id}>{step.text || "Untitled"}</option>)}</select><input aria-label="Branch label" className={inputClass} value={branchLabel} onChange={(event) => setBranchLabel(event.target.value)} placeholder="e.g. Retreat for now" /></div><button type="button" className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.sm} mt-2`} disabled={!branchFrom || !branchTo || branchFrom === branchTo || !branchLabel.trim()} onClick={() => { update({ transitions: [...draft.transitions, { id: generateUlid(), fromStepId: branchFrom, toStepId: branchTo, trigger: "condition", label: branchLabel.trim(), sortOrder: draft.transitions.length }] }); setBranchLabel(""); }}>Add local branch</button></section>}
        </main>

        <aside className="space-y-3">
          <section className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"><h3 className="text-sm font-semibold">Idea cards</h3><div className="mt-2 grid gap-2"><input aria-label="Idea label" className={inputClass} value={ideaLabel} onChange={(event) => setIdeaLabel(event.target.value)} placeholder="Name the idea" /><select aria-label="Idea kind" className={inputClass} value={ideaKind} onChange={(event) => setIdeaKind(event.target.value as CreationFlowRefKind)}>{IDEA_KINDS.map((kind) => <option key={kind} value={kind}>{kind.replace(/_/g, " ")}</option>)}</select><textarea aria-label="Idea direction" className={inputClass} rows={2} value={ideaDirection} onChange={(event) => setIdeaDirection(event.target.value)} placeholder="Creative direction (optional)" /><button type="button" className={`${BUTTON_CLASSES.violet} ${BUTTON_SIZES.sm}`} disabled={!ideaLabel.trim()} onClick={() => addIdea()}>Add idea card</button></div>
            <div className="mt-3 space-y-2">{draft.placeholders.map((placeholder) => <div key={placeholder.id} className="rounded border border-dashed border-violet-300 p-2 text-xs"><b>{placeholder.label}</b><span className="ml-1 text-violet-600">{placeholder.kind}</span>{placeholder.direction && <p className="mt-1 text-slate-600 dark:text-slate-300">{placeholder.direction}</p>}<span className="mt-1 block text-amber-700 dark:text-amber-300">Local placeholder</span></div>)}</div>
          </section>
          {ideaSteps.length > 1 && <section className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"><h3 className="text-sm font-semibold">Creative relationship</h3><p className="text-xs text-slate-500">Relationships explain association, never execution order.</p><div className="mt-2 grid gap-2"><select aria-label="Relation from" className={inputClass} value={relationFrom} onChange={(event) => setRelationFrom(event.target.value)}><option value="">From idea</option>{draft.placeholders.map((placeholder) => <option key={placeholder.id} value={placeholder.id}>{placeholder.label}</option>)}</select><input aria-label="Relation label" className={inputClass} value={relationLabel} onChange={(event) => setRelationLabel(event.target.value)} /><select aria-label="Relation to" className={inputClass} value={relationTo} onChange={(event) => setRelationTo(event.target.value)}><option value="">To idea</option>{draft.placeholders.map((placeholder) => <option key={placeholder.id} value={placeholder.id}>{placeholder.label}</option>)}</select><button type="button" className={smallButton} disabled={!relationFrom || !relationTo || relationFrom === relationTo || !relationLabel.trim()} onClick={() => { const fromStepId = ideaStepId(draft, relationFrom); const toStepId = ideaStepId(draft, relationTo); if (fromStepId && toStepId) update({ relations: [...draft.relations, { id: generateUlid(), fromStepId, toStepId, relation: relationLabel.trim(), resolution: "local_intent" }] }); }}>Connect ideas</button></div><div className="mt-2 space-y-1">{draft.relations.map((relation) => <div key={relation.id} className="rounded bg-slate-100 p-2 text-xs dark:bg-slate-800">{draft.steps.find((step) => step.id === relation.fromStepId)?.target?.label} <b>{relation.relation}</b> {draft.steps.find((step) => step.id === relation.toStepId)?.target?.label}</div>)}</div></section>}
          <section className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Capture health</h3><span className="text-[10px] text-slate-500">{savedAt ? `Saved ${new Date(savedAt).toLocaleTimeString()}` : "Saving…"}</span></div><div className="mt-2 space-y-2">{issues.slice(0, 12).map((issue, index) => <div key={`${issue.stepId || issue.placeholderId || index}`} className={`rounded border p-2 text-xs ${ISSUE_CLASSES[issue.severity === "blocker" ? "blocker" : issue.severity === "warning" ? "warning" : "info"]}`}>{issue.message}</div>)}{issues.length === 0 && <div className={`rounded border p-2 text-xs ${ISSUE_CLASSES.success}`}>Capture is structurally healthy.</div>}</div></section>
        </aside>
      </div>
    </div>
  </div>;
}
