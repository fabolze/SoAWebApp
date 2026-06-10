import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useDirtyState } from "../components/useDirtyState";
import { apiFetch } from "../lib/api";
import type { EntryRecord } from "../types/editorQol";
import { generateSlug, generateUlid } from "../utils/generateId";

const inputClass = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950";
const panelClass = "rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900";

function rows(value: unknown): EntryRecord[] {
  return Array.isArray(value) ? value.filter((row): row is EntryRecord => typeof row === "object" && row !== null && !Array.isArray(row)) : [];
}

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

function JsonEditor({ label, value, onChange }: { label: string; value: unknown; onChange: (value: unknown) => void }) {
  const [draft, setDraft] = useState(JSON.stringify(value ?? [], null, 2));
  useEffect(() => setDraft(JSON.stringify(value ?? [], null, 2)), [value]);
  return <label className="block text-sm font-medium">{label}<textarea className={`${inputClass} mt-1 min-h-32 font-mono text-xs`} value={draft} onChange={(event) => {
    setDraft(event.target.value);
    try { onChange(JSON.parse(event.target.value)); } catch { /* Keep incomplete JSON local until valid. */ }
  }} /></label>;
}

function useDraft<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try { return JSON.parse(localStorage.getItem(key) || "") as T; } catch { return initial; }
  });
  useEffect(() => { localStorage.setItem(key, JSON.stringify(value)); }, [key, value]);
  return [value, setValue] as const;
}

function Shell({ title, subtitle, dirty, onSave, onReset, children }: { title: string; subtitle: string; dirty: boolean; onSave: () => void; onReset: () => void; children: React.ReactNode }) {
  return <div className="space-y-5 p-5">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-semibold">{title}</h1><p className="text-sm text-slate-500">{subtitle}</p></div>
      <div className="flex gap-2"><button className="rounded-md border px-3 py-2 text-sm" onClick={onReset}>Reset</button><button className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={!dirty} onClick={onSave}>Save All</button></div>
    </header>
    {children}
  </div>;
}

export function QuestJourneyPage() {
  const { id = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const isNew = !id || location.pathname.endsWith("/new");
  const generatedId = useMemo(() => generateUlid(), []);
  const empty = useMemo(() => ({ quest: { id: generatedId, slug: generateSlug(`new-quest-${generatedId.slice(-6)}`), title: "New Quest", description: "", objectives: [], flags_set_on_completion: [], item_rewards: [], currency_rewards: [], reputation_rewards: [], tags: [] }, requirements: [], arc: { story_arc_id: "", related_quests: [generatedId], branches: [] }, quest_giver_profile_ids: [] }) as EntryRecord, [generatedId]);
  const [packet, setPacket] = useDraft<EntryRecord>(`soa.quest-journey.${isNew ? "new" : id}`, empty);
  const [original, setOriginal] = useState(JSON.stringify(empty));
  const dirty = JSON.stringify(packet) !== original;
  const { setDirty } = useDirtyState();
  useEffect(() => { setDirty("quest-journey", dirty); return () => setDirty("quest-journey", false); }, [dirty, setDirty]);
  useEffect(() => { if (!isNew) apiFetch(`/api/ui/quests/${encodeURIComponent(id)}`).then((response) => response.json()).then((data) => { setPacket(data); setOriginal(JSON.stringify(data)); }); }, [id, isNew, setPacket]);
  const quest = packet.quest as EntryRecord;
  const update = (key: string, value: unknown) => setPacket({ ...packet, quest: { ...quest, [key]: value } });
  const save = async () => { const response = await apiFetch("/api/ui/quests/bundle", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(packet) }); const data = await response.json(); if (response.ok) { setPacket(data); setOriginal(JSON.stringify(data)); if (isNew) navigate(`/author/quests/${encodeURIComponent(text(data.quest.id))}`, { replace: true }); } };
  return <Shell title="Quest Journey Board" subtitle="Compose invitation, ordered objectives, completion, payoff, and aftermath." dirty={dirty} onSave={save} onReset={() => setPacket(JSON.parse(original))}><div className="grid gap-4 lg:grid-cols-2"><section className={panelClass}><h2 className="mb-3 font-semibold">Invitation</h2>{["title", "slug", "description"].map((key) => <label key={key} className="mb-3 block text-sm">{key}<input className={inputClass} value={text(quest[key])} onChange={(event) => update(key, event.target.value)} /></label>)}<JsonEditor label="Quest giver profile IDs" value={packet.quest_giver_profile_ids} onChange={(value) => setPacket({ ...packet, quest_giver_profile_ids: value })} /></section><section className={panelClass}><h2 className="mb-3 font-semibold">Ordered Objectives</h2><JsonEditor label="Objectives" value={quest.objectives} onChange={(value) => update("objectives", value)} />{rows(quest.objectives).length === 0 && <p className="text-sm text-amber-600">Warning: quest has no objectives.</p>}<JsonEditor label="Completion flags" value={quest.flags_set_on_completion} onChange={(value) => update("flags_set_on_completion", value)} /><JsonEditor label="Item rewards" value={quest.item_rewards} onChange={(value) => update("item_rewards", value)} /></section><section className={panelClass}><h2 className="mb-3 font-semibold">Arc & Branches</h2><JsonEditor label="Arc selection and branches" value={packet.arc} onChange={(value) => setPacket({ ...packet, arc: value })} /></section><section className={panelClass}><h2 className="mb-3 font-semibold">Walkthrough & Aftermath</h2><p className="text-sm text-slate-500">Objectives apply flags in order, then completion flags reveal newly gated content.</p><pre className="mt-3 max-h-64 overflow-auto text-xs">{JSON.stringify(packet.dependency_context ?? {}, null, 2)}</pre><Link className="mt-3 inline-block text-sm text-primary" to="/author/dependencies">Open Dependency Map</Link></section></div></Shell>;
}

export function DependencyMapPage() {
  const [index, setIndex] = useState<EntryRecord>({ nodes: [], edges: [], health: {} });
  const [focus, setFocus] = useState("");
  useEffect(() => { apiFetch("/api/ui/dependencies").then((response) => response.json()).then(setIndex); }, []);
  const nodes = rows(index.nodes);
  const edges = rows(index.edges).filter((edge) => !focus || edge.source === focus || edge.target === focus);
  return <div className="space-y-5 p-5"><header><h1 className="text-2xl font-semibold">Adventure Dependency Map</h1><p className="text-sm text-slate-500">Solid relationships are stored; dashed relationships are inferred.</p></header><select className={inputClass} value={focus} onChange={(event) => setFocus(event.target.value)}><option value="">All nodes</option>{nodes.map((node) => <option key={text(node.id)} value={text(node.id)}>{text(node.kind)}: {text(node.label)}</option>)}</select><div className="grid gap-4 lg:grid-cols-3"><section className={panelClass}><h2 className="font-semibold">Health Lenses</h2><pre className="mt-3 max-h-[32rem] overflow-auto text-xs">{JSON.stringify(index.health, null, 2)}</pre></section><section className={`${panelClass} lg:col-span-2`}><h2 className="font-semibold">Focused Relationships</h2><div className="mt-3 space-y-2">{edges.map((edge) => <div key={text(edge.id)} className={`rounded-md border p-2 text-xs ${edge.explicit ? "border-solid" : "border-dashed"}`}>{text(edge.source)} → {text(edge.relation)} → {text(edge.target)}</div>)}</div></section></div></div>;
}
