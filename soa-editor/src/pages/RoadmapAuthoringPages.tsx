import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { EditableTagList, ReferenceChipPicker, ReferenceManageLink, rowLabel, useReferenceOptions } from "../authoringViews/controls";
import StoryPlacementPanel from "../components/storyPlacement/StoryPlacementPanel";
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

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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

function MultiReferencePicker({ label, values, options, onChange, emptyText = "None selected." }: { label: string; values: unknown; options: EntryRecord[]; onChange: (values: string[]) => void; emptyText?: string }) {
  const selected = strings(values);
  const available = options.filter((option) => !selected.includes(text(option.id)));
  const reference = label.includes("Flag") ? "flags" : label.includes("Quest Giver") ? "interaction_profiles" : "";
  return <div>
    <div className="mb-1 text-[11px] font-semibold uppercase text-slate-500">{label}</div>{reference && <ReferenceManageLink reference={reference} onCreated={(id) => onChange(selected.includes(id) ? selected : [...selected, id])} />}
    <div className="flex flex-wrap gap-1">
      {selected.map((id) => {
        const option = options.find((entry) => text(entry.id) === id);
        return <button key={id} type="button" className="rounded-full bg-slate-900 px-2 py-1 text-xs font-medium text-white dark:bg-slate-100 dark:text-slate-900" title="Remove" onClick={() => onChange(selected.filter((value) => value !== id))}>{option ? rowLabel(option, id) : id} x</button>;
      })}
      {selected.length === 0 && <span className="text-xs text-slate-500">{emptyText}</span>}
    </div>
    <select className={`${inputClass} mt-2`} value="" disabled={available.length === 0} onChange={(event) => event.target.value && onChange([...selected, event.target.value])}>
      <option value="">{available.length ? `Add ${label.toLowerCase()}...` : "No more available"}</option>
      {available.map((option) => <option key={text(option.id)} value={text(option.id)}>{rowLabel(option, text(option.id))}</option>)}
    </select>
  </div>;
}

function ObjectiveBoard({ objectives, flags, onChange }: { objectives: unknown; flags: EntryRecord[]; onChange: (objectives: EntryRecord[]) => void }) {
  const objectiveRows = rows(objectives);
  const update = (index: number, patch: EntryRecord) => onChange(objectiveRows.map((objective, rowIndex) => rowIndex === index ? { ...objective, ...patch } : objective));
  const move = (index: number, offset: number) => {
    const next = [...objectiveRows];
    const [objective] = next.splice(index, 1);
    next.splice(index + offset, 0, objective);
    onChange(next);
  };
  return <div className="space-y-3">
    {objectiveRows.map((objective, index) => <article key={`${text(objective.objective_id)}-${index}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div><div className="text-xs font-semibold uppercase text-slate-500">Objective {index + 1}</div><div className="text-sm font-medium">{text(objective.description) || "Describe what the player must accomplish."}</div></div>
        <div className="flex gap-1">
          <button type="button" className="rounded border px-2 py-1 text-xs disabled:opacity-40" disabled={index === 0} onClick={() => move(index, -1)}>Up</button>
          <button type="button" className="rounded border px-2 py-1 text-xs disabled:opacity-40" disabled={index === objectiveRows.length - 1} onClick={() => move(index, 1)}>Down</button>
          <button type="button" className="rounded border border-red-300 px-2 py-1 text-xs text-red-700" onClick={() => onChange(objectiveRows.filter((_, rowIndex) => rowIndex !== index))}>Remove</button>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block text-xs font-semibold uppercase text-slate-500">Objective ID<input className={`${inputClass} mt-1`} value={text(objective.objective_id)} onChange={(event) => update(index, { objective_id: event.target.value })} /></label>
        <ReferenceChipPicker label="Unlock Requirement" value={objective.requirements_id} reference="requirements" onChange={(requirements_id) => update(index, { requirements_id })} />
        <label className="block text-xs font-semibold uppercase text-slate-500 md:col-span-2">Player-Facing Description<textarea className={`${inputClass} mt-1 min-h-20`} value={text(objective.description)} onChange={(event) => update(index, { description: event.target.value })} /></label>
        <div className="md:col-span-2"><MultiReferencePicker label="Flags Set" values={objective.flags_set} options={flags} onChange={(flags_set) => update(index, { flags_set })} /></div>
      </div>
    </article>)}
    {objectiveRows.length === 0 && <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">Quest has no objectives.</p>}
    <button type="button" className="rounded-md border border-blue-300 px-3 py-2 text-sm font-semibold text-blue-700 dark:border-blue-800 dark:text-blue-300" onClick={() => onChange([...objectiveRows, { objective_id: generateSlug(`objective-${generateUlid().slice(-6)}`), description: "", requirements_id: "", flags_set: [] }])}>Add Objective</button>
  </div>;
}

function RewardRows({ label, rowsValue, reference, idKey, amountKey, onChange }: { label: string; rowsValue: unknown; reference: string; idKey: string; amountKey: string; onChange: (value: EntryRecord[]) => void }) {
  const options = useReferenceOptions(reference);
  const rewardRows = rows(rowsValue);
  const update = (index: number, patch: EntryRecord) => onChange(rewardRows.map((reward, rowIndex) => rowIndex === index ? { ...reward, ...patch } : reward));
  return <div>
    <div className="mb-2"><div className="text-[11px] font-semibold uppercase text-slate-500">{label}</div><ReferenceManageLink reference={reference} onCreated={(id) => onChange([...rewardRows, { [idKey]: id, [amountKey]: amountKey === "quantity" ? 1 : 0 }])} /></div>
    <div className="space-y-2">{rewardRows.map((reward, index) => <div key={`${text(reward[idKey])}-${index}`} className="grid grid-cols-[1fr_7rem_auto] gap-2">
      <select className={inputClass} value={text(reward[idKey])} onChange={(event) => update(index, { [idKey]: event.target.value })}><option value="">Choose...</option>{options.map((option) => <option key={text(option.id)} value={text(option.id)}>{rowLabel(option, text(option.id))}</option>)}</select>
      <input className={inputClass} type="number" value={text(reward[amountKey])} onChange={(event) => update(index, { [amountKey]: Number(event.target.value) })} />
      <button type="button" className="rounded border border-red-300 px-2 text-xs text-red-700" onClick={() => onChange(rewardRows.filter((_, rowIndex) => rowIndex !== index))}>Remove</button>
    </div>)}</div>
    <button type="button" className="mt-2 rounded border px-2 py-1 text-xs font-semibold" onClick={() => onChange([...rewardRows, { [idKey]: "", [amountKey]: amountKey === "quantity" ? 1 : 0 }])}>Add {label}</button>
  </div>;
}

function DependencyContext({ context, packet }: { context: unknown; packet: EntryRecord }) {
  const value = typeof context === "object" && context !== null && !Array.isArray(context) ? context as EntryRecord : {};
  const edges = [...rows(value.prerequisites), ...rows(value.aftermath)];
  const catalogs = [...rows(packet.flags), ...rows(packet.requirements), ...rows(packet.quests), ...rows(packet.story_arcs)];
  const labels = new Map<string, string>();
  catalogs.forEach((entry) => labels.set(text(entry.id), rowLabel(entry, text(entry.id))));
  const nodeLabel = (nodeId: unknown) => {
    const raw = text(nodeId);
    const entryId = raw.includes(":") ? raw.slice(raw.indexOf(":") + 1) : raw;
    return labels.get(entryId) || entryId || "Unknown";
  };
  return <div className="space-y-3">
    <p className="text-sm text-slate-500">Objectives apply flags in order. Completion flags can unlock later content.</p>
    <div><div className="mb-1 text-xs font-semibold uppercase text-slate-500">Prerequisites</div>{rows(value.prerequisites).length ? rows(value.prerequisites).map((edge) => <div key={text(edge.id)} className="mb-1 rounded border border-amber-200 px-2 py-1 text-xs">{nodeLabel(edge.source)} -&gt; {text(edge.relation)} -&gt; {nodeLabel(edge.target)}</div>) : <p className="text-xs text-slate-500">No prerequisite flag gates detected.</p>}</div>
    <div><div className="mb-1 text-xs font-semibold uppercase text-slate-500">Aftermath</div>{rows(value.aftermath).length ? rows(value.aftermath).map((edge) => <div key={text(edge.id)} className="mb-1 rounded border border-emerald-200 px-2 py-1 text-xs">{nodeLabel(edge.source)} -&gt; unlocks -&gt; {nodeLabel(edge.target)}</div>) : <p className="text-xs text-slate-500">No downstream content is currently unlocked by this quest.</p>}</div>
    {edges.some((edge) => !text(edge.source) || !text(edge.target)) && <p className="text-sm text-red-600">Broken dependency context detected.</p>}
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
  const allFlags = useReferenceOptions("flags");
  const allInteractionProfiles = useReferenceOptions("interaction_profiles");
  const questFlags = rows(packet.flags).length ? rows(packet.flags) : allFlags;
  const interactionProfiles = rows(packet.interaction_profiles).length ? rows(packet.interaction_profiles) : allInteractionProfiles;
  const hasRewards = numberValue(quest.xp_reward) !== 0 || rows(quest.item_rewards).length > 0 || rows(quest.currency_rewards).length > 0 || rows(quest.reputation_rewards).length > 0;
  const objectiveIssues = rows(quest.objectives).filter((objective) => !text(objective.objective_id) || !text(objective.description)).length;
  const save = async () => { const response = await apiFetch("/api/ui/quests/bundle", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(packet) }); const data = await response.json(); if (response.ok) { setPacket(data); setOriginal(JSON.stringify(data)); if (isNew) navigate(`/author/quests/${encodeURIComponent(text(data.quest.id))}`, { replace: true }); } };
  return <Shell title="Quest Journey Board" subtitle="Compose invitation, ordered objectives, completion, payoff, and aftermath." dirty={dirty} onSave={save} onReset={() => setPacket(JSON.parse(original))}><div className="grid gap-4 xl:grid-cols-2">
    <section className={panelClass}><h2 className="mb-3 font-semibold">Invitation</h2><div className="space-y-3"><label className="block text-sm">Title<input className={`${inputClass} mt-1`} value={text(quest.title)} onChange={(event) => update("title", event.target.value)} /></label><label className="block text-sm">Slug<input className={`${inputClass} mt-1`} value={text(quest.slug)} onChange={(event) => update("slug", event.target.value)} /></label><label className="block text-sm">Description<textarea className={`${inputClass} mt-1 min-h-24`} value={text(quest.description)} onChange={(event) => update("description", event.target.value)} /></label><ReferenceChipPicker label="Quest Unlock Requirement" value={quest.requirements_id} reference="requirements" onChange={(requirements_id) => update("requirements_id", requirements_id)} /><MultiReferencePicker label="Quest Givers" values={packet.quest_giver_profile_ids} options={interactionProfiles} onChange={(quest_giver_profile_ids) => setPacket({ ...packet, quest_giver_profile_ids })} /><EditableTagList tags={quest.tags} onChange={(tags) => update("tags", tags)} /></div></section>
    <section className={panelClass}><div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Journey Health</h2><span className={`rounded-full px-2 py-1 text-xs font-semibold ${rows(quest.objectives).length && !objectiveIssues ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{rows(quest.objectives).length && !objectiveIssues ? "Ready to review" : "Needs attention"}</span></div><div className="space-y-2 text-sm">{rows(quest.objectives).length === 0 && <p className="rounded border border-amber-200 p-2 text-amber-800">Add at least one objective.</p>}{objectiveIssues > 0 && <p className="rounded border border-amber-200 p-2 text-amber-800">{objectiveIssues} objective(s) need both an ID and player-facing description.</p>}{strings(quest.flags_set_on_completion).length === 0 && <p className="rounded border border-slate-200 p-2 text-slate-600">No completion flag is set, so this quest cannot directly unlock flag-gated content.</p>}{!hasRewards && <p className="rounded border border-amber-200 p-2 text-amber-800">Quest has no authored payoff.</p>}{strings(packet.quest_giver_profile_ids).length === 0 && <p className="rounded border border-slate-200 p-2 text-slate-600">No quest giver currently offers this quest.</p>}</div></section>
    <section className={`${panelClass} xl:col-span-2`}><h2 className="mb-3 font-semibold">Ordered Objectives</h2><ObjectiveBoard objectives={quest.objectives} flags={questFlags} onChange={(objectives) => update("objectives", objectives)} /></section>
    <section className={panelClass}><h2 className="mb-3 font-semibold">Completion & Payoff</h2><div className="space-y-4"><MultiReferencePicker label="Completion Flags" values={quest.flags_set_on_completion} options={questFlags} onChange={(flags) => update("flags_set_on_completion", flags)} /><label className="block text-xs font-semibold uppercase text-slate-500">Experience Reward<input className={`${inputClass} mt-1`} type="number" value={text(quest.xp_reward)} onChange={(event) => update("xp_reward", Number(event.target.value))} /></label><RewardRows label="Item Reward" rowsValue={quest.item_rewards} reference="items" idKey="item_id" amountKey="quantity" onChange={(value) => update("item_rewards", value)} /><RewardRows label="Currency Reward" rowsValue={quest.currency_rewards} reference="currencies" idKey="currency_id" amountKey="amount" onChange={(value) => update("currency_rewards", value)} /><RewardRows label="Reputation Reward" rowsValue={quest.reputation_rewards} reference="factions" idKey="faction_id" amountKey="amount" onChange={(value) => update("reputation_rewards", value)} /></div></section>
    <section className={panelClass}><h2 className="mb-3 font-semibold">Walkthrough & Aftermath</h2><DependencyContext context={packet.dependency_context} packet={packet} /><Link className="mt-4 inline-block text-sm font-semibold text-primary" to="/author/dependencies">Open Dependency Map</Link></section>
    {!isNew && text(quest.id) && <section className="xl:col-span-2"><StoryPlacementPanel entityKind="quest" entityId={text(quest.id)} entityLabel={text(quest.title) || text(quest.id)} entity={quest} /></section>}
    <section className={`${panelClass} xl:col-span-2`}><details><summary className="cursor-pointer font-semibold">Advanced Arc & Branch Data</summary><div className="mt-3"><JsonEditor label="Arc selection and branches" value={packet.arc} onChange={(value) => setPacket({ ...packet, arc: value })} /></div></details></section>
  </div></Shell>;
}

export function LegacyDependencyMapPage() {
  const [index, setIndex] = useState<EntryRecord>({ nodes: [], edges: [], health: {} });
  const [focus, setFocus] = useState("");
  useEffect(() => { apiFetch("/api/ui/dependencies").then((response) => response.json()).then(setIndex); }, []);
  const nodes = rows(index.nodes);
  const edges = rows(index.edges).filter((edge) => !focus || edge.source === focus || edge.target === focus);
  return <div className="space-y-5 p-5"><header><h1 className="text-2xl font-semibold">Adventure Dependency Map</h1><p className="text-sm text-slate-500">Solid relationships are stored; dashed relationships are inferred.</p></header><select className={inputClass} value={focus} onChange={(event) => setFocus(event.target.value)}><option value="">All nodes</option>{nodes.map((node) => <option key={text(node.id)} value={text(node.id)}>{text(node.kind)}: {text(node.label)}</option>)}</select><div className="grid gap-4 lg:grid-cols-3"><section className={panelClass}><h2 className="font-semibold">Health Lenses</h2><pre className="mt-3 max-h-[32rem] overflow-auto text-xs">{JSON.stringify(index.health, null, 2)}</pre></section><section className={`${panelClass} lg:col-span-2`}><h2 className="font-semibold">Focused Relationships</h2><div className="mt-3 space-y-2">{edges.map((edge) => <div key={text(edge.id)} className={`rounded-md border p-2 text-xs ${edge.explicit ? "border-solid" : "border-dashed"}`}>{text(edge.source)} → {text(edge.relation)} → {text(edge.target)}</div>)}</div></section></div></div>;
}

export function DependencyMapPage() {
  const [index, setIndex] = useState<EntryRecord>({ nodes: [], edges: [], health: {} });
  const [focus, setFocus] = useState("");
  const [lens, setLens] = useState<DependencyLens>("all");
  const [search, setSearch] = useState("");
  useEffect(() => { apiFetch("/api/ui/dependencies").then((response) => response.json()).then(setIndex); }, []);
  const nodes = useMemo(() => rows(index.nodes), [index.nodes]);
  const allEdges = useMemo(() => rows(index.edges), [index.edges]);
  const nodeById = useMemo(() => new Map(nodes.map((node) => [text(node.id), node])), [nodes]);
  const health = useMemo(() => typeof index.health === "object" && index.health !== null && !Array.isArray(index.health) ? index.health as EntryRecord : {}, [index.health]);
  const brokenEdges = useMemo(() => allEdges.filter((edge) => !nodeById.has(text(edge.source)) || !nodeById.has(text(edge.target))), [allEdges, nodeById]);
  const issueNodeIds = useMemo(() => {
    const ids = new Set<string>();
    ["dead_flags", "unused_flags", "contradictions", "impossible_gates"].forEach((key) => rows(health[key]).forEach((node) => ids.add(text(node.id))));
    const cycles = Array.isArray(health.cycles) ? health.cycles : [];
    cycles.forEach((cycle) => { if (Array.isArray(cycle)) cycle.forEach((id) => ids.add(text(id))); });
    brokenEdges.forEach((edge) => { ids.add(text(edge.source)); ids.add(text(edge.target)); });
    return ids;
  }, [brokenEdges, health]);
  const visibleEdges = allEdges.filter((edge) => {
    if (focus && edge.source !== focus && edge.target !== focus) return false;
    if (!dependencyLensMatches(edge, lens)) return false;
    if (!search.trim()) return true;
    const haystack = [edge.relation, edge.path, nodeById.get(text(edge.source))?.label, nodeById.get(text(edge.target))?.label, edge.source, edge.target].map(text).join(" ").toLowerCase();
    return haystack.includes(search.trim().toLowerCase());
  });
  return <div className="space-y-5 p-5">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-semibold">Adventure Dependency Map</h1><p className="text-sm text-slate-500">Trace prerequisites, flags, unlocks, and branches. Solid relationships are stored; dashed relationships are inferred.</p></div><div className="flex gap-2 text-xs"><span className="rounded-full bg-slate-100 px-2 py-1 dark:bg-slate-800">{nodes.length} nodes</span><span className="rounded-full bg-slate-100 px-2 py-1 dark:bg-slate-800">{allEdges.length} relationships</span><span className={`rounded-full px-2 py-1 ${issueNodeIds.size ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>{issueNodeIds.size} issue nodes</span></div></header>
    <section className={panelClass}><div className="grid gap-3 lg:grid-cols-2"><label className="block text-xs font-semibold uppercase text-slate-500">Focus Node<select className={`${inputClass} mt-1`} value={focus} onChange={(event) => setFocus(event.target.value)}><option value="">All nodes</option>{nodes.map((node) => <option key={text(node.id)} value={text(node.id)}>{text(node.kind)}: {text(node.label)}</option>)}</select></label><label className="block text-xs font-semibold uppercase text-slate-500">Search Relationships<input className={`${inputClass} mt-1`} value={search} placeholder="Search node, relation, or field..." onChange={(event) => setSearch(event.target.value)} /></label></div><div className="mt-3 flex flex-wrap gap-2">{dependencyLenses.map((value) => <button key={value} type="button" className={`rounded-full border px-3 py-1 text-xs font-semibold ${lens === value ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 dark:border-slate-700"}`} onClick={() => setLens(value)}>{dependencyLensLabel(value)}</button>)}{(focus || search || lens !== "all") && <button type="button" className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold" onClick={() => { setFocus(""); setSearch(""); setLens("all"); }}>Clear Filters</button>}</div></section>
    <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
      <section className={panelClass}><h2 className="font-semibold">Actionable Health</h2><p className="mt-1 text-xs text-slate-500">Select an issue to focus its relationships, then open the affected record.</p><div className="mt-3 space-y-4"><HealthIssueGroup title="Impossible Gates" description="A requirement depends on a flag that nothing currently sets." severity="error" nodes={rows(health.impossible_gates)} onFocus={setFocus} /><HealthIssueGroup title="Dead Flags" description="These flags are consumed but have no producer." severity="error" nodes={rows(health.dead_flags)} onFocus={setFocus} /><HealthIssueGroup title="Contradictions" description="A requirement both requires and forbids the same flag." severity="error" nodes={rows(health.contradictions)} onFocus={setFocus} /><CycleIssueGroup cycles={Array.isArray(health.cycles) ? health.cycles : []} nodeById={nodeById} onFocus={setFocus} /><HealthIssueGroup title="Unused Flags" description="These flags are produced but never consumed." severity="warning" nodes={rows(health.unused_flags)} onFocus={setFocus} /><BrokenEdgeGroup edges={brokenEdges} nodeById={nodeById} onFocus={setFocus} />{issueNodeIds.size === 0 && <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">No dependency health issues detected.</p>}</div></section>
      <section className={panelClass}><div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold">Relationships</h2><p className="text-xs text-slate-500">{visibleEdges.length} shown. Click either endpoint to focus it.</p></div>{focus && <NodeLink node={nodeById.get(focus)} compact />}</div><div className="mt-3 space-y-2">{visibleEdges.map((edge) => <DependencyEdgeCard key={text(edge.id)} edge={edge} source={nodeById.get(text(edge.source))} target={nodeById.get(text(edge.target))} issueNodeIds={issueNodeIds} onFocus={setFocus} />)}{visibleEdges.length === 0 && <p className="rounded-md border border-slate-200 p-4 text-sm text-slate-500 dark:border-slate-800">No relationships match the current focus and lens.</p>}</div></section>
    </div>
  </div>;
}

type DependencyLens = "all" | "prerequisites" | "unlocks" | "flags" | "branches" | "explicit" | "inferred";
const dependencyLenses: DependencyLens[] = ["all", "prerequisites", "unlocks", "flags", "branches", "explicit", "inferred"];

function dependencyLensLabel(lens: DependencyLens): string {
  return lens[0].toUpperCase() + lens.slice(1);
}

function dependencyLensMatches(edge: EntryRecord, lens: DependencyLens): boolean {
  const relation = text(edge.relation);
  if (lens === "all") return true;
  if (lens === "prerequisites") return ["required_by", "forbidden_by", "gates"].includes(relation);
  if (lens === "unlocks") return relation === "unlocks";
  if (lens === "flags") return ["sets", "required_by", "forbidden_by"].includes(relation);
  if (lens === "branches") return ["branches_to", "next", "contains"].includes(relation);
  if (lens === "explicit") return Boolean(edge.explicit);
  return !edge.explicit;
}

function nodePath(node: EntryRecord | undefined): string {
  if (!node) return "";
  const schema = text(node.schema_name);
  const id = encodeURIComponent(text(node.entry_id));
  if (schema === "quests") return `/author/quests/${id}`;
  if (schema === "encounters") return `/author/encounters/${id}`;
  if (schema === "dialogues") return `/author/dialogues/${id}`;
  if (schema === "abilities") return `/author/abilities/${id}`;
  if (schema === "characters") return `/author/characters/${id}`;
  if (schema === "locations") return `/author/locations/${id}`;
  const routeBySchema: Record<string, string> = { flags: "flags", requirements: "requirements", events: "events", interaction_profiles: "interaction-profiles", dialogue_nodes: "dialogue-nodes", story_arcs: "story-arcs" };
  const route = routeBySchema[schema] || schema.replace(/_/g, "-");
  return route ? `/${route}?selected=${id}` : "";
}

function NodeLink({ node, compact = false }: { node: EntryRecord | undefined; compact?: boolean }) {
  if (!node) return <span className="text-red-600">Missing node</span>;
  const className = compact ? "max-w-52 rounded border border-blue-200 px-2 py-1 text-xs text-blue-700 dark:border-blue-900 dark:text-blue-300" : "block min-w-0 rounded-md border border-slate-200 bg-white p-2 text-left text-xs text-blue-700 hover:border-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-blue-300";
  return <Link className={className} to={nodePath(node)}><span className="block text-[10px] font-semibold uppercase text-slate-500">{text(node.kind)}</span><span className="block truncate font-semibold">{text(node.label) || text(node.entry_id)}</span></Link>;
}

function DependencyEdgeCard({ edge, source, target, issueNodeIds, onFocus }: { edge: EntryRecord; source: EntryRecord | undefined; target: EntryRecord | undefined; issueNodeIds: Set<string>; onFocus: (id: string) => void }) {
  const sourceId = text(edge.source);
  const targetId = text(edge.target);
  const issue = issueNodeIds.has(sourceId) || issueNodeIds.has(targetId);
  return <article className={`grid gap-2 rounded-lg border p-3 md:grid-cols-[1fr_150px_1fr] ${edge.explicit ? "border-solid" : "border-dashed"} ${issue ? "border-amber-400 bg-amber-50/40 dark:bg-amber-950/20" : "border-slate-200 dark:border-slate-800"}`}><div className="min-w-0"><NodeLink node={source} /><button type="button" className="mt-1 text-[10px] text-slate-500" onClick={() => onFocus(sourceId)}>Focus source</button></div><div className="self-center text-center"><div className="text-xs font-semibold">{text(edge.relation)}</div><div className="truncate text-[10px] text-slate-500">{edge.explicit ? "Stored" : "Inferred"}{text(edge.path) ? ` / ${text(edge.path)}` : ""}</div></div><div className="min-w-0"><NodeLink node={target} /><button type="button" className="mt-1 text-[10px] text-slate-500" onClick={() => onFocus(targetId)}>Focus target</button></div></article>;
}

function HealthIssueGroup({ title, description, severity, nodes, onFocus }: { title: string; description: string; severity: "error" | "warning"; nodes: EntryRecord[]; onFocus: (id: string) => void }) {
  if (!nodes.length) return null;
  const classes = severity === "error" ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30" : "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30";
  return <div><div className="mb-1 flex items-center justify-between"><h3 className="text-sm font-semibold">{title}</h3><span className="rounded-full bg-white px-2 py-0.5 text-xs dark:bg-slate-900">{nodes.length}</span></div><p className="mb-2 text-xs text-slate-500">{description}</p><div className="space-y-1">{nodes.map((node) => <div key={text(node.id)} className={`flex items-center justify-between gap-2 rounded border p-2 ${classes}`}><button type="button" className="min-w-0 flex-1 text-left text-xs font-semibold" onClick={() => onFocus(text(node.id))}>{text(node.label) || text(node.entry_id)}</button><NodeLink node={node} compact /></div>)}</div></div>;
}

function CycleIssueGroup({ cycles, nodeById, onFocus }: { cycles: unknown[]; nodeById: Map<string, EntryRecord>; onFocus: (id: string) => void }) {
  const valid = cycles.filter((cycle): cycle is unknown[] => Array.isArray(cycle));
  if (!valid.length) return null;
  return <div><div className="mb-1 flex items-center justify-between"><h3 className="text-sm font-semibold">Cycles</h3><span className="rounded-full bg-white px-2 py-0.5 text-xs dark:bg-slate-900">{valid.length}</span></div><p className="mb-2 text-xs text-slate-500">Event chains or quest branches loop back into themselves.</p><div className="space-y-1">{valid.map((cycle, index) => <button key={index} type="button" className="block w-full rounded border border-red-200 bg-red-50 p-2 text-left text-xs dark:border-red-900 dark:bg-red-950/30" onClick={() => onFocus(text(cycle[0]))}>{cycle.map((id) => text(nodeById.get(text(id))?.label) || text(id)).join(" -> ")}</button>)}</div></div>;
}

function BrokenEdgeGroup({ edges, nodeById, onFocus }: { edges: EntryRecord[]; nodeById: Map<string, EntryRecord>; onFocus: (id: string) => void }) {
  if (!edges.length) return null;
  return <div><div className="mb-1 flex items-center justify-between"><h3 className="text-sm font-semibold">Broken References</h3><span className="rounded-full bg-white px-2 py-0.5 text-xs dark:bg-slate-900">{edges.length}</span></div><p className="mb-2 text-xs text-slate-500">A relationship endpoint does not exist in the dependency index.</p><div className="space-y-1">{edges.map((edge) => { const focusId = nodeById.has(text(edge.source)) ? text(edge.source) : text(edge.target); return <button key={text(edge.id)} type="button" className="block w-full rounded border border-red-200 bg-red-50 p-2 text-left text-xs dark:border-red-900 dark:bg-red-950/30" onClick={() => onFocus(focusId)}>{text(edge.source)} -&gt; {text(edge.relation)} -&gt; {text(edge.target)}</button>; })}</div></div>;
}
