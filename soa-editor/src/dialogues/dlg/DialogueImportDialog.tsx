import { useMemo, useState } from "react";
import type { EntryRecord } from "../../types/editorQol";
import { generateSlug, generateUlid } from "../../utils/generateId";
import { parseDlg } from "./parser";
import type { DlgDocument } from "./types";
import { buildDialoguePrompt } from "./prompt";

const value = (entry: EntryRecord, key: string) => typeof entry[key] === "string" ? entry[key] as string : "";
const display = (entry: EntryRecord) => value(entry, "name") || value(entry, "title") || value(entry, "slug") || value(entry, "id");
const normalized = (input: string) => input.trim().toLocaleLowerCase();

function stage(document: DlgDocument, dialogueId: string, characters: EntryRecord[], speakerMap: Record<string, string>) {
  const ids = Object.fromEntries(document.nodes.map((node) => [node.label, generateUlid()]));
  const nodes = document.nodes.map((node, index) => {
    const selectedId = speakerMap[node.speaker] || "";
    return { id: ids[node.label], slug: generateSlug(`${document.slug || "imported-dialogue"}-${node.label}-${index + 1}`), dialogue_id: dialogueId, speaker: node.speaker, speaker_character_id: selectedId || null, text: node.text, is_terminal: node.terminal, choices: [...node.choices.map((choice) => ({ choice_text: choice.text, next_node_id: ids[choice.target], set_flags: [] })), ...(node.continuation ? [{ choice_text: "", next_node_id: ids[node.continuation], set_flags: [] }] : [])], set_flags: [], tags: [], __new: true };
  });
  const owner = characters.find((entry) => normalized(display(entry)) === normalized(document.owner || ""));
  return { dialogue: { title: document.title, slug: document.slug || generateSlug(document.title), description: document.direction || "", character_id: owner ? value(owner, "id") : null, starting_node_id: ids[document.start] }, nodes };
}

export default function DialogueImportDialog({ dialogueId, characters, onCancel, onStage }: { dialogueId: string; characters: EntryRecord[]; onCancel: () => void; onStage: (candidate: { dialogue: EntryRecord; nodes: EntryRecord[] }) => void }) {
  const [brief, setBrief] = useState(""); const [selected, setSelected] = useState<string[]>([]); const [source, setSource] = useState(""); const [speakerMap, setSpeakerMap] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<"outline" | "prose">("outline"); const [policyApproved, setPolicyApproved] = useState(false);
  const context = characters.filter((entry) => selected.includes(value(entry, "id")));
  const prompt = buildDialoguePrompt(brief, context, phase);
  const parsed = useMemo(() => parseDlg(source), [source]);
  const speakers = useMemo(() => [...new Set(parsed.document?.nodes.map((node) => node.speaker) || [])], [parsed.document]);
  const resolvedMap = useMemo(() => Object.fromEntries(speakers.map((speaker) => {
    const matches = characters.filter((entry) => [value(entry, "slug"), display(entry)].some((candidate) => normalized(candidate) === normalized(speaker)));
    return [speaker, speakerMap[speaker] ?? (matches.length === 1 ? value(matches[0], "id") : "")];
  })), [characters, speakerMap, speakers]);
  return <div role="dialog" aria-modal="true" aria-labelledby="dlg-import-title" className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 p-4"><div className="mx-auto max-w-5xl rounded-xl bg-white p-5 shadow-2xl dark:bg-slate-900">
    <div className="flex justify-between"><div><h2 id="dlg-import-title" className="text-lg font-bold">Import a human-reviewed DLG/1 draft</h2><p className="text-sm text-slate-500">Pasted content stays local until you stage it. Staging does not commit project data.</p></div><button type="button" onClick={onCancel} aria-label="Close import">✕</button></div>
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <section className="space-y-3"><label className="block text-sm font-semibold">Structured scene brief / approved topology<textarea className="mt-1 min-h-28 w-full rounded border p-2 font-normal dark:bg-slate-950" value={brief} onChange={(event) => setBrief(event.target.value)} placeholder="Decisions, facts to reveal or conceal, intended branch outcomes…" /></label><div className="flex gap-2"><button type="button" className={`rounded px-3 py-1 text-sm ${phase === "outline" ? "bg-violet-700 text-white" : "border"}`} onClick={() => setPhase("outline")}>1. Branch outline</button><button type="button" className={`rounded px-3 py-1 text-sm ${phase === "prose" ? "bg-violet-700 text-white" : "border"}`} onClick={() => setPhase("prose")}>2. DLG/1 prose</button></div><details><summary className="cursor-pointer text-sm font-semibold">Select minimum approved context</summary><div className="mt-2 max-h-44 overflow-y-auto">{characters.map((entry) => <label key={value(entry, "id")} className="block text-sm"><input type="checkbox" checked={selected.includes(value(entry, "id"))} onChange={(event) => setSelected((current) => event.target.checked ? [...current, value(entry, "id")] : current.filter((id) => id !== value(entry, "id")))} /> {display(entry)}</label>)}</div></details><label className="block rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900"><input type="checkbox" checked={policyApproved} onChange={(event) => setPolicyApproved(event.target.checked)} /> I confirmed the provider/workspace, retention rules, provenance handling, and unpublished-content policy are approved for exactly the selected context.</label><label className="block text-sm font-semibold">Exact outgoing prompt<textarea readOnly className="mt-1 min-h-64 w-full rounded border bg-slate-50 p-2 font-mono text-xs dark:bg-slate-950" value={prompt} /></label><button type="button" disabled={!policyApproved} className="rounded bg-violet-700 px-3 py-2 text-sm text-white disabled:opacity-40" onClick={() => void navigator.clipboard.writeText(prompt)}>Copy prompt</button></section>
      <section className="space-y-3"><label className="block text-sm font-semibold">Paste one DLG/1 candidate<textarea className="mt-1 min-h-72 w-full rounded border p-2 font-mono text-xs dark:bg-slate-950" value={source} onChange={(event) => setSource(event.target.value)} /></label>{parsed.diagnostics.length > 0 && <div className="max-h-48 overflow-y-auto rounded border border-red-300 bg-red-50 p-2 text-xs text-red-900">{parsed.diagnostics.map((item, index) => <button type="button" className="block text-left" key={`${item.code}:${index}`} onClick={() => { /* source spans are exposed for editor integrations */ }}>Line {item.span.line}: {item.message}</button>)}</div>}{parsed.document && <><div className="rounded border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900"><b>{parsed.document.title}</b>: {parsed.document.nodes.length} lines, {parsed.document.nodes.reduce((sum, node) => sum + node.choices.length + (node.continuation ? 1 : 0), 0)} connections. Start: {parsed.document.start}.</div><div><div className="text-sm font-semibold">Speaker resolution</div>{speakers.map((speaker) => <label className="mt-1 flex items-center gap-2 text-sm" key={speaker}><span className="w-36 truncate">{speaker}</span><select className="flex-1 rounded border p-1 dark:bg-slate-950" value={resolvedMap[speaker]} onChange={(event) => setSpeakerMap((current) => ({ ...current, [speaker]: event.target.value }))}><option value="">Keep fallback text only</option>{characters.map((entry) => <option key={value(entry, "id")} value={value(entry, "id")}>{display(entry)}</option>)}</select></label>)}</div><div className="rounded border p-3 text-xs"><b>Semantic review before staging:</b> verify branch outcomes, knowledge boundaries, meaningful choices, cycles, voice, and lore. The importer cannot prove narrative correctness.</div></>}
      </section>
    </div>
    <div className="mt-4 flex justify-end gap-2"><button type="button" className="rounded border px-3 py-2 text-sm" onClick={onCancel}>Cancel</button><button type="button" className="rounded bg-violet-700 px-3 py-2 text-sm text-white disabled:opacity-40" disabled={!parsed.document} onClick={() => parsed.document && onStage(stage(parsed.document, dialogueId, characters, resolvedMap))}>Stage local draft</button></div>
  </div></div>;
}
