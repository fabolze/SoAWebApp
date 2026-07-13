import { useMemo, useRef } from "react";
import type { EntryRecord } from "../../types/editorQol";

const rows = (value: unknown): EntryRecord[] => Array.isArray(value) ? value.filter((item): item is EntryRecord => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
const text = (value: unknown, fallback = "") => typeof value === "string" ? value : value == null ? fallback : String(value);

interface OutlineRow { node: EntryRecord; depth: number }

function outline(nodes: EntryRecord[], startId: string): OutlineRow[] {
  const byId = new Map(nodes.map((node) => [text(node.id), node]));
  const visited = new Set<string>(); const result: OutlineRow[] = [];
  const visit = (id: string, depth: number) => {
    if (!id || visited.has(id)) return;
    const node = byId.get(id); if (!node) return;
    visited.add(id); result.push({ node, depth });
    rows(node.choices).forEach((choice) => visit(text(choice.next_node_id), depth + (text(choice.choice_text) ? 1 : 0)));
  };
  visit(startId || text(nodes[0]?.id), 0);
  nodes.forEach((node) => visit(text(node.id), 0));
  return result;
}

export default function DialogueScriptView({ nodes, startId, characters, selectedNodeId, onSelect, onChange, onAdd, onAddChoice, onDelete, onSetStart, onMove, onDuplicateBranch }: {
  nodes: EntryRecord[]; startId: string; characters: EntryRecord[]; selectedNodeId: string;
  onSelect: (id: string) => void; onChange: (id: string, patch: EntryRecord) => void;
  onAdd: (id: string) => void; onAddChoice: (id: string, label: string) => void; onDelete: (id: string) => void; onSetStart: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void; onDuplicateBranch: (id: string, choiceIndex: number) => void;
}) {
  const ordered = useMemo(() => outline(nodes, startId), [nodes, startId]);
  const recentSpeakers = [...new Set(nodes.map((node) => text(node.speaker)).filter(Boolean).reverse())];
  const speakers = [...new Set([...recentSpeakers, ...characters.map((character) => text(character.name, text(character.title, text(character.slug))))].filter(Boolean))];
  const editors = useRef(new Map<string, HTMLTextAreaElement>());
  const focusNext = (id: string) => window.setTimeout(() => editors.current.get(id)?.focus());
  return <div className="mx-auto max-w-4xl space-y-3 p-4" aria-label="Dialogue script editor">
    <datalist id="dialogue-speakers">{speakers.map((speaker) => <option key={speaker} value={speaker} />)}</datalist>
    {ordered.map(({ node, depth }, rowIndex) => {
      const id = text(node.id); const choices = rows(node.choices); const selected = selectedNodeId === id;
      const invalid = !text(node.speaker).trim() || !text(node.text).trim() || (Boolean(node.is_terminal) === (choices.length > 0));
      return <article key={id} id={`script-line-${id}`} aria-label={`Dialogue line ${rowIndex + 1}`} aria-level={Math.min(6, depth + 1)} style={{ marginLeft: `${Math.min(depth, 5) * 1.5}rem` }} className={`rounded-lg border p-3 ${invalid ? "border-red-400" : selected ? "border-violet-500 bg-violet-50 dark:bg-violet-950/30" : "border-slate-200 dark:border-slate-800"}`} onFocus={() => onSelect(id)}>
        <div className="flex flex-wrap items-center gap-2">
          <input aria-label="Speaker" list="dialogue-speakers" className="min-w-40 flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-sm font-semibold dark:border-slate-700 dark:bg-slate-950" value={text(node.speaker)} onChange={(event) => onChange(id, { speaker: event.target.value, speaker_character_id: null })} />
          {id === startId && <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-semibold text-emerald-800">Start</span>}
          {Boolean(node.is_terminal) && <span className="rounded-full bg-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-700">Ending</span>}
          <button type="button" className="text-xs text-violet-700" onClick={() => onSetStart(id)}>Set as start</button>
          <button type="button" className="text-xs text-slate-600" aria-label="Move line up" disabled={rowIndex === 0} onClick={() => onMove(id, -1)}>↑</button><button type="button" className="text-xs text-slate-600" aria-label="Move line down" disabled={rowIndex === ordered.length - 1} onClick={() => onMove(id, 1)}>↓</button>
          <button type="button" className="text-xs text-red-700" onClick={() => onDelete(id)}>Remove</button>
        </div>
        <textarea ref={(element) => { if (element) editors.current.set(id, element); else editors.current.delete(id); }} aria-label={`Line spoken by ${text(node.speaker, "speaker")}`} className="mt-2 min-h-24 w-full resize-y rounded border border-slate-300 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-950" value={text(node.text)} onChange={(event) => onChange(id, { text: event.target.value })} onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); onAdd(id); }
          if (event.altKey && event.key === "Enter") { event.preventDefault(); const choice = window.prompt("Player choice label"); if (choice?.trim()) onAddChoice(id, choice.trim()); }
          if (event.key === "ArrowDown" && event.altKey) { event.preventDefault(); const next = ordered[rowIndex + 1]; if (next) { onSelect(text(next.node.id)); focusNext(text(next.node.id)); } }
        }} />
        <div className="mt-2 flex flex-wrap gap-1">{text(node.requirements_id) && <span className="rounded bg-amber-100 px-2 py-1 text-[10px]">Requirement</span>}{Array.isArray(node.set_flags) && node.set_flags.length > 0 && <span className="rounded bg-fuchsia-100 px-2 py-1 text-[10px]">{node.set_flags.length} flags out</span>}</div>
        {choices.map((choice, index) => <div key={index} className="mt-2 flex items-center gap-2 border-l-2 border-blue-300 pl-3 text-sm"><span className="text-blue-700">{text(choice.choice_text, "Continue")}</span><span aria-hidden="true">→</span><button type="button" className="min-w-0 flex-1 truncate text-left text-slate-500 underline" onClick={() => { const target = text(choice.next_node_id); onSelect(target); focusNext(target); }}>{text(nodes.find((item) => text(item.id) === text(choice.next_node_id))?.text, "Empty line")}</button><button type="button" className="text-xs text-violet-700" onClick={() => onDuplicateBranch(id, index)}>Duplicate branch</button></div>)}
        <div className="mt-3 flex gap-2"><button type="button" className="rounded border border-slate-300 px-2 py-1 text-xs" onClick={() => onAdd(id)}>Continue as… <kbd>Ctrl↵</kbd></button><button type="button" className="rounded border border-slate-300 px-2 py-1 text-xs" onClick={() => { const choice = window.prompt("Player choice label"); if (choice?.trim()) onAddChoice(id, choice.trim()); }}>Add choice <kbd>Alt↵</kbd></button><label className="ml-auto flex items-center gap-1 text-xs"><input type="checkbox" checked={Boolean(node.is_terminal)} disabled={choices.length > 0} onChange={(event) => onChange(id, { is_terminal: event.target.checked })} /> Ending</label></div>
      </article>;
    })}
    {!ordered.length && <div className="rounded border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">Add the first line or import a DLG/1 draft to begin.</div>}
  </div>;
}
