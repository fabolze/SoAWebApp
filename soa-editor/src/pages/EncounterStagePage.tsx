import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { deriveEncounterAftermathRows, type EncounterAftermathRow } from "../authoring/encounterAftermath";
import { emptyScopedGatePacket, type ScopedGatePacket } from "../authoring/scopedGate";
import ScopedGateBuilder from "../components/authoring/ScopedGateBuilder";
import StoryPlacementPanel from "../components/storyPlacement/StoryPlacementPanel";
import { useEntityStoryPlacement } from "../components/storyPlacement/useEntityStoryPlacement";
import { useDirtyState } from "../components/useDirtyState";
import { apiFetch } from "../lib/api";
import { formatApiError } from "../lib/apiErrors";
import { DEFAULT_SIMULATION_SCENARIO_ID, getSimulationScenarioById, loadSimulationDatasets, SIMULATION_SCENARIOS, simulateEntity, type SimulationDatasets } from "../simulation";
import { BUTTON_CLASSES, BUTTON_SIZES } from "../styles/uiTokens";
import type { EntryRecord } from "../types/editorQol";
import { generateSlug, generateUlid } from "../utils/generateId";
import { EditableTagList, ReferenceManageLink, displayText, editableText, isRecord, rowLabel } from "../authoringViews/controls";

type Side = "Friendly" | "Neutral" | "Hostile";
type CharacterPacket = { character: EntryRecord; combat_profile: EntryRecord | null; interaction_profile: EntryRecord | null };
type Placement = { table_id: string; entry: EntryRecord };

interface EncounterPacket {
  encounter: EntryRecord;
  requirement: EntryRecord | null;
  requirement_usages: EntryRecord[];
  encounters: EntryRecord[];
  characters: CharacterPacket[];
  requirements: EntryRecord[];
  requirement_usages_by_id: Record<string, EntryRecord[]>;
  items: EntryRecord[];
  currencies: EntryRecord[];
  factions: EntryRecord[];
  flags: EntryRecord[];
  encounter_tables: EntryRecord[];
  placements: Placement[];
  context: { pois: EntryRecord[]; events: EntryRecord[] };
}

const SIDES: Side[] = ["Friendly", "Neutral", "Hostile"];
const inputClass = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";
const emptyContext = { pois: [], events: [] };

function rows(value: unknown): EntryRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function stable(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function emptyEncounter(): EntryRecord {
  const id = generateUlid();
  return {
    id,
    slug: generateSlug(`new-encounter-${id.slice(-6)}`),
    name: "New Encounter",
    description: "",
    encounter_type: "Combat",
    requirements_id: "",
    participants: [],
    rewards: { xp: 0, items: [], currencies: [], reputation: [], flags_set: [] },
    tags: [],
  };
}

function emptyPacket(): EncounterPacket {
  return {
    encounter: emptyEncounter(),
    requirement: null,
    requirement_usages: [],
    encounters: [],
    characters: [],
    requirements: [],
    requirement_usages_by_id: {},
    items: [],
    currencies: [],
    factions: [],
    flags: [],
    encounter_tables: [],
    placements: [],
    context: emptyContext,
  };
}

function draftKey(id: string): string {
  return `soa.encounter-stage.${id}`;
}

function characterId(packet: CharacterPacket): string {
  return displayText(packet.character.id);
}

function rewardObject(encounter: EntryRecord): EntryRecord {
  return isRecord(encounter.rewards) ? encounter.rewards : {};
}

function cleanPacket(packet: EncounterPacket): EncounterPacket {
  return {
    ...packet,
    encounter: Object.fromEntries(Object.entries(packet.encounter).filter(([key]) => !key.startsWith("__"))),
  };
}

function health(packet: EncounterPacket): { blockers: string[]; warnings: string[] } {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const encounter = packet.encounter;
  const participants = rows(encounter.participants);
  const ids = participants.map((row) => displayText(row.character_id));
  const characters = new Map(packet.characters.map((entry) => [characterId(entry), entry]));
  const itemIds = new Set(packet.items.map((entry) => displayText(entry.id)));
  const currencyIds = new Set(packet.currencies.map((entry) => displayText(entry.id)));
  const factionIds = new Set(packet.factions.map((entry) => displayText(entry.id)));
  const flagIds = new Set(packet.flags.map((entry) => displayText(entry.id)));
  if (!displayText(encounter.id)) blockers.push("Encounter ID is required.");
  if (!displayText(encounter.slug)) blockers.push("Slug is required.");
  if (!displayText(encounter.name)) blockers.push("Name is required.");
  if (!["Combat", "Dialogue", "Event"].includes(displayText(encounter.encounter_type))) blockers.push("Encounter type is invalid.");
  if (ids.some((id) => !id || !characters.has(id))) blockers.push("Every participant must reference an existing character.");
  if (new Set(ids).size !== ids.length) blockers.push("A character can appear only once.");
  participants.forEach((participant) => {
    const id = displayText(participant.character_id);
    const profile = characters.get(id);
    const contexts = strings(participant.contexts);
    if (contexts.some((context) => !["Combat", "Interaction"].includes(context))) blockers.push(`${rowLabel(profile?.character || {}, id)} has an invalid context.`);
    if (!SIDES.includes(displayText(participant.combat_side) as Side)) blockers.push(`${rowLabel(profile?.character || {}, id)} has an invalid side.`);
    if (contexts.includes("Combat") && !profile?.combat_profile) warnings.push(`${rowLabel(profile?.character || {}, id)} uses Combat without a combat profile.`);
    if (contexts.includes("Interaction") && !profile?.interaction_profile) warnings.push(`${rowLabel(profile?.character || {}, id)} uses Interaction without an interaction profile.`);
  });
  packet.placements.forEach((placement) => {
    const entry = placement.entry;
    if (!packet.encounter_tables.some((table) => displayText(table.id) === placement.table_id)) blockers.push("A placement references a missing encounter table.");
    if (Number(entry.weight) < 0 || Number(entry.min_count) < 0 || Number(entry.max_count) < Number(entry.min_count)) blockers.push("Placement weights and counts are invalid.");
  });
  const rewards = rewardObject(encounter);
  rows(rewards.items).forEach((row) => { if (!itemIds.has(displayText(row.item_id))) blockers.push("Every item reward must reference an existing item."); });
  rows(rewards.currencies).forEach((row) => { if (!currencyIds.has(displayText(row.currency_id))) blockers.push("Every currency reward must reference an existing currency."); });
  rows(rewards.reputation).forEach((row) => { if (!factionIds.has(displayText(row.faction_id))) blockers.push("Every reputation reward must reference an existing faction."); });
  strings(rewards.flags_set).forEach((id) => { if (!flagIds.has(id)) blockers.push("Every reward flag must reference an existing flag."); });
  if (displayText(encounter.requirements_id) && !packet.requirement) blockers.push("Linked requirement could not be loaded.");
  if (packet.requirement) {
    strings(packet.requirement.required_flags).forEach((id) => { if (!flagIds.has(id)) blockers.push("Every required flag must reference an existing flag."); });
    strings(packet.requirement.forbidden_flags).forEach((id) => { if (!flagIds.has(id)) blockers.push("Every forbidden flag must reference an existing flag."); });
    rows(packet.requirement.min_faction_reputation).forEach((row) => { if (!factionIds.has(displayText(row.faction_id))) blockers.push("Every requirement reputation row must reference an existing faction."); });
  }
  if (displayText(encounter.encounter_type) === "Combat") {
    const sides = new Set(participants.map((row) => displayText(row.combat_side)));
    if (!sides.has("Friendly")) warnings.push("Combat encounter has no Friendly side.");
    if (!sides.has("Hostile")) warnings.push("Combat encounter has no Hostile side.");
  }
  if (packet.placements.length === 0) warnings.push("Encounter is not placed in any location encounter table.");
  if (packet.requirement && packet.requirement_usages.length > 0) warnings.push(`Linked requirement is shared by ${packet.requirement_usages.length} other reference(s).`);
  return { blockers: [...new Set(blockers)], warnings: [...new Set(warnings)] };
}

export default function EncounterStagePage() {
  const { id = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const isNew = id === "new" || location.pathname.endsWith("/new");
  const [packet, setPacket] = useState<EncounterPacket>(emptyPacket);
  const [original, setOriginal] = useState<EncounterPacket | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [selectedCharacter, setSelectedCharacter] = useState("");
  const [restored, setRestored] = useState(false);
  const [gatePacket, setGatePacket] = useState<ScopedGatePacket>(emptyScopedGatePacket);
  const [gateDraftFlags, setGateDraftFlags] = useState<EntryRecord[]>([]);
  const [gateRequirementDraft, setGateRequirementDraft] = useState<EntryRecord | null>(null);
  const [gateSelectedRequirementId, setGateSelectedRequirementId] = useState("");
  const [gateTargetSchema, setGateTargetSchema] = useState("encounters");
  const [gateTargetId, setGateTargetId] = useState("");
  const dirtySource = useRef(`encounter-stage-${id}`);
  const { setDirty } = useDirtyState();
  const serialized = stable(cleanPacket(packet));
  const originalSerialized = stable(original ? cleanPacket(original) : null);
  const dirty = original !== null && serialized !== originalSerialized;
  const issues = useMemo(() => health(packet), [packet]);
  const storyPlacement = useEntityStoryPlacement({
    entityKind: "encounter",
    entityId: displayText(packet.encounter.id),
    entity: packet.encounter,
  });
  const aftermathRows = useMemo(() => deriveEncounterAftermathRows({
    encounter: packet.encounter,
    characters: packet.characters.map((entry) => entry.character),
    items: packet.items,
    currencies: packet.currencies,
    factions: packet.factions,
    flags: packet.flags,
    timelinePacket: storyPlacement.packet,
  }), [packet, storyPlacement.packet]);

  useEffect(() => {
    const source = dirtySource.current;
    setDirty(source, dirty);
    return () => setDirty(source, false);
  }, [dirty, setDirty]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const endpoint = isNew ? "/api/ui/encounters" : `/api/ui/encounters/${encodeURIComponent(id)}`;
    Promise.all([apiFetch(endpoint), apiFetch("/api/ui/scoped-gates")]).then(async ([response, gateResponse]) => {
      const payload = await response.json();
      const gatePayload = await gateResponse.json();
      if (!response.ok || !isRecord(payload)) throw new Error(formatApiError(payload, "Encounter Stage failed to load."));
      if (!gateResponse.ok || !isRecord(gatePayload)) throw new Error(formatApiError(gatePayload, "Scoped gates failed to load."));
      const base = isNew
        ? { ...emptyPacket(), ...payload, encounter: emptyEncounter(), placements: [], requirement: null, requirement_usages: [], context: emptyContext }
        : payload as unknown as EncounterPacket;
      const stored = localStorage.getItem(draftKey(displayText(base.encounter.id)));
      let next = base as EncounterPacket;
      if (stored) {
        try {
          const draft = JSON.parse(stored);
          if (draft?.packet && isRecord(draft.packet)) {
            next = draft.packet as EncounterPacket;
            setRestored(true);
          }
        } catch {
          localStorage.removeItem(draftKey(displayText(base.encounter.id)));
        }
      }
      if (!cancelled) {
        setPacket(next);
        setOriginal(base as EncounterPacket);
        setGatePacket({ ...emptyScopedGatePacket, ...gatePayload } as ScopedGatePacket);
        setGateSelectedRequirementId(displayText(next.encounter.requirements_id));
        setGateTargetSchema("encounters");
        setGateTargetId(displayText(next.encounter.id));
      }
    }).catch((error) => setNotice(error instanceof Error ? error.message : "Encounter Stage failed to load."))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id, isNew]);

  useEffect(() => {
    if (!dirty || !original) return;
    const timer = window.setTimeout(() => localStorage.setItem(draftKey(displayText(packet.encounter.id)), JSON.stringify({ packet, ts: Date.now() })), 300);
    return () => window.clearTimeout(timer);
  }, [dirty, original, packet]);

  const updateEncounter = (patch: EntryRecord) => setPacket((current) => ({ ...current, encounter: { ...current.encounter, ...patch } }));

  const save = async () => {
    setSaving(true);
    setNotice("");
    try {
      const response = await apiFetch("/api/ui/encounters/bundle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          encounter: packet.encounter,
          requirement: packet.requirement,
          placements: packet.placements,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !isRecord(body)) throw new Error(formatApiError(body, "Encounter bundle failed to save."));
      const saved = body as unknown as EncounterPacket;
      localStorage.removeItem(draftKey(displayText(packet.encounter.id)));
      setPacket(saved);
      setOriginal(saved);
      setRestored(false);
      setNotice("Encounter bundle saved.");
      if (isNew) navigate(`/author/encounters/${encodeURIComponent(displayText(saved.encounter.id))}`, { replace: true });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Encounter bundle failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    if (!original) return;
    localStorage.removeItem(draftKey(displayText(packet.encounter.id)));
    setPacket(original);
    setRestored(false);
    setNotice("Unsaved Encounter Stage changes reset.");
  };

  const applyGateCommit = (nextGatePacket: ScopedGatePacket, requirementId: string) => {
    const requirement = nextGatePacket.requirements.find((entry) => displayText(entry.id) === requirementId) || null;
    const requirementUsages = requirementId
      ? (nextGatePacket.requirement_usages_by_id[requirementId] || []).filter((usage) => !(displayText(usage.schema_name) === "encounters" && displayText(usage.entry_id) === displayText(packet.encounter.id)))
      : [];
    const patch = (current: EncounterPacket): EncounterPacket => ({
      ...current,
      requirements: nextGatePacket.requirements,
      requirement_usages_by_id: nextGatePacket.requirement_usages_by_id,
      flags: nextGatePacket.flags,
      encounter: { ...current.encounter, requirements_id: requirementId },
      requirement,
      requirement_usages: requirementUsages,
    });
    setGatePacket(nextGatePacket);
    setGateSelectedRequirementId(requirementId);
    setPacket((current) => patch(current));
    setOriginal((current) => current ? patch(current) : current);
    setNotice("Encounter gate committed.");
  };

  if (loading) return <div className="p-6 text-sm text-slate-600 dark:text-slate-300">Loading Encounter Stage...</div>;

  return (
    <div className="min-h-full bg-slate-100 p-4 dark:bg-slate-950">
      <div className="mx-auto max-w-[1600px] space-y-4">
        <Header packet={packet} dirty={dirty} saving={saving} blockers={issues.blockers} onSave={() => void save()} onReset={reset} />
        {(notice || restored) && <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200">{restored ? "Restored unsaved Encounter Stage draft. " : ""}{notice}</div>}
        <EncounterSelector packet={packet} />
        <div className="grid gap-4 2xl:grid-cols-[1fr_360px]">
          <div className="space-y-4">
            <IdentityPanel packet={packet} setPacket={setPacket} updateEncounter={updateEncounter} showInlineGate={isNew} />
            {!isNew && <ScopedGateBuilder
              packet={gatePacket}
              baseName={displayText(packet.encounter.name, "encounter")}
              draftFlags={gateDraftFlags}
              setDraftFlags={setGateDraftFlags}
              requirementDraft={gateRequirementDraft}
              setRequirementDraft={setGateRequirementDraft}
              selectedRequirementId={gateSelectedRequirementId}
              setSelectedRequirementId={setGateSelectedRequirementId}
              targetSchema={gateTargetSchema}
              setTargetSchema={setGateTargetSchema}
              targetId={gateTargetId}
              setTargetId={setGateTargetId}
              directCommit
              title="Encounter Gate"
              subtitle="Create or reuse flags and requirements, then attach the saved encounter gate atomically."
              tag="encounter-stage"
              onCommitted={(nextPacket, requirementId) => applyGateCommit(nextPacket, requirementId)}
            />}
            <Stage packet={packet} setPacket={setPacket} selectedCharacter={selectedCharacter} setSelectedCharacter={setSelectedCharacter} />
            <RewardPanel packet={packet} updateEncounter={updateEncounter} />
            <AftermathPanel rows={aftermathRows} loading={storyPlacement.loading} error={storyPlacement.error} />
            <PlacementPanel packet={packet} setPacket={setPacket} />
            {!isNew && displayText(packet.encounter.id) && <StoryPlacementPanel entityKind="encounter" entityId={displayText(packet.encounter.id)} entityLabel={displayText(packet.encounter.name, displayText(packet.encounter.id))} entity={packet.encounter} enableCrossEntityConsequenceActions storyPacket={storyPlacement.packet} onStoryPacketChange={storyPlacement.setPacket} />}
            <SimulationComparison packet={packet} />
          </div>
          <div className="space-y-4">
            <HealthPanel issues={issues} />
            <Dossier packet={packet} selectedCharacter={selectedCharacter} />
            <WorldContext packet={packet} />
          </div>
        </div>
        <div className="sticky bottom-3 flex justify-end gap-2 rounded-md border border-slate-200 bg-white/95 p-3 shadow dark:border-slate-800 dark:bg-slate-900/95">
          <Link className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.sm}`} to={`/encounters?selected=${encodeURIComponent(displayText(packet.encounter.id))}`}>Generic Editor</Link>
          <button className={`${BUTTON_CLASSES.secondary} ${BUTTON_SIZES.sm}`} disabled={!dirty || saving} onClick={reset}>Reset</button>
          <button className={`${BUTTON_CLASSES.primary} ${BUTTON_SIZES.sm}`} disabled={saving || issues.blockers.length > 0} onClick={() => void save()}>{saving ? "Saving..." : "Save All"}</button>
        </div>
      </div>
    </div>
  );
}

function Header({ packet, dirty, saving, blockers, onSave, onReset }: { packet: EncounterPacket; dirty: boolean; saving: boolean; blockers: string[]; onSave: () => void; onReset: () => void }) {
  return <Panel title={displayText(packet.encounter.name, "Encounter Stage")} subtitle={`${displayText(packet.encounter.encounter_type, "Encounter")} / ${rows(packet.encounter.participants).length} participants / ${packet.placements.length} placements`}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="text-xs text-slate-500">{dirty ? "Unsaved bundle changes" : "Bundle saved"}</div>
      <div className="flex gap-2"><button className={`${BUTTON_CLASSES.secondary} ${BUTTON_SIZES.sm}`} disabled={!dirty || saving} onClick={onReset}>Reset</button><button className={`${BUTTON_CLASSES.primary} ${BUTTON_SIZES.sm}`} disabled={saving || blockers.length > 0} onClick={onSave}>{saving ? "Saving..." : "Save All"}</button></div>
    </div>
  </Panel>;
}

function EncounterSelector({ packet }: { packet: EncounterPacket }) {
  const navigate = useNavigate();
  return <Panel title="Encounter Selector" subtitle="Open an existing encounter or create a new staged bundle.">
    <div className="flex gap-2">
      <select className={inputClass} value={displayText(packet.encounter.id)} onChange={(event) => navigate(`/author/encounters/${encodeURIComponent(event.target.value)}`)}>
        <option value={displayText(packet.encounter.id)}>{rowLabel(packet.encounter, "Current Encounter")}</option>
        {packet.encounters.filter((entry) => displayText(entry.id) !== displayText(packet.encounter.id)).map((entry) => <option key={displayText(entry.id)} value={displayText(entry.id)}>{rowLabel(entry, displayText(entry.id))}</option>)}
      </select>
      <Link className={`${BUTTON_CLASSES.primary} ${BUTTON_SIZES.sm} whitespace-nowrap`} to="/author/encounters/new">New Encounter</Link>
    </div>
  </Panel>;
}

function IdentityPanel({ packet, setPacket, updateEncounter, showInlineGate }: { packet: EncounterPacket; setPacket: React.Dispatch<React.SetStateAction<EncounterPacket>>; updateEncounter: (patch: EntryRecord) => void; showInlineGate: boolean }) {
  const encounter = packet.encounter;
  const selectRequirement = (id: string) => {
    const requirement = packet.requirements.find((entry) => displayText(entry.id) === id) || null;
    setPacket((current) => ({ ...current, encounter: { ...current.encounter, requirements_id: id }, requirement, requirement_usages: current.requirement_usages_by_id[id] || [] }));
  };
  const createRequirement = () => {
    const id = generateUlid();
    const requirement = { id, slug: generateSlug(`${displayText(encounter.name, "encounter")}-gate`), required_flags: [], forbidden_flags: [], min_faction_reputation: [], tags: [] };
    setPacket((current) => ({ ...current, encounter: { ...current.encounter, requirements_id: id }, requirement, requirement_usages: [] }));
  };
  return <Panel title="Identity And Gate" subtitle="Define the encounter and its reusable entry requirement.">
    <div className="grid gap-3 md:grid-cols-2">
      <Field label="Name" value={encounter.name} onChange={(name) => updateEncounter({ name, slug: displayText(encounter.slug) || generateSlug(name) })} />
      <Field label="Slug" value={encounter.slug} onChange={(slug) => updateEncounter({ slug })} />
      <label className="block"><Caption>Encounter Type</Caption><select className={inputClass} value={displayText(encounter.encounter_type)} onChange={(event) => updateEncounter({ encounter_type: event.target.value })}>{["Combat", "Dialogue", "Event"].map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="block"><Caption>Requirement Gate</Caption><select className={inputClass} value={displayText(encounter.requirements_id)} onChange={(event) => selectRequirement(event.target.value)}><option value="">Unassigned</option>{packet.requirements.map((entry) => <option key={displayText(entry.id)} value={displayText(entry.id)}>{rowLabel(entry, displayText(entry.id))}</option>)}</select></label>
      <label className="block md:col-span-2"><Caption>Description</Caption><textarea className={`${inputClass} min-h-24`} value={editableText(encounter.description)} onChange={(event) => updateEncounter({ description: event.target.value })} /></label>
      <div className="md:col-span-2"><EditableTagList tags={encounter.tags} onChange={(tags) => updateEncounter({ tags })} /></div>
    </div>
    {showInlineGate && !packet.requirement && <button className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.sm} mt-3`} onClick={createRequirement}>Create Encounter Requirement</button>}
    {showInlineGate && packet.requirement && <RequirementEditor packet={packet} setPacket={setPacket} />}
  </Panel>;
}

function RequirementEditor({ packet, setPacket }: { packet: EncounterPacket; setPacket: React.Dispatch<React.SetStateAction<EncounterPacket>> }) {
  const requirement = packet.requirement as EntryRecord;
  const update = (patch: EntryRecord) => setPacket((current) => ({ ...current, requirement: { ...(current.requirement || {}), ...patch } }));
  return <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
    <div className="mb-3 flex flex-wrap justify-between gap-2"><div><div className="text-sm font-semibold">Linked Requirement</div><div className="text-xs text-slate-600 dark:text-slate-400">Editing this record is included in the atomic save.</div></div><button className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`} onClick={() => setPacket((current) => ({ ...current, encounter: { ...current.encounter, requirements_id: "" }, requirement: null, requirement_usages: [] }))}>Clear Link</button></div>
    {packet.requirement_usages.length > 0 && <div className="mb-3 rounded border border-amber-300 bg-amber-100 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-100">Shared-use impact: {packet.requirement_usages.map((usage) => `${displayText(usage.schema_name)} / ${displayText(usage.entry_label)} / ${displayText(usage.path)}`).join("; ")}</div>}
    <div className="grid gap-3 md:grid-cols-2"><Field label="Requirement Slug" value={requirement.slug} onChange={(slug) => update({ slug })} /><div><EditableTagList label="Requirement Tags" tags={requirement.tags} onChange={(tags) => update({ tags })} /></div><MultiSelect label="Required Flags" values={strings(requirement.required_flags)} options={packet.flags} onChange={(required_flags) => update({ required_flags })} /><MultiSelect label="Forbidden Flags" values={strings(requirement.forbidden_flags)} options={packet.flags} onChange={(forbidden_flags) => update({ forbidden_flags })} /></div>
    <RewardRows title="Minimum Faction Reputation" rows={rows(requirement.min_faction_reputation)} options={packet.factions} referenceKey="faction_id" numberKey="min" onChange={(min_faction_reputation) => update({ min_faction_reputation })} />
  </div>;
}

function Stage({ packet, setPacket, selectedCharacter, setSelectedCharacter }: { packet: EncounterPacket; setPacket: React.Dispatch<React.SetStateAction<EncounterPacket>>; selectedCharacter: string; setSelectedCharacter: (id: string) => void }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const assigned = new Set(rows(packet.encounter.participants).map((row) => displayText(row.character_id)));
  const updateParticipants = (participants: EntryRecord[]) => setPacket((current) => ({ ...current, encounter: { ...current.encounter, participants } }));
  const move = (id: string, side: Side) => {
    const current = rows(packet.encounter.participants);
    const existing = current.find((row) => displayText(row.character_id) === id);
    updateParticipants(existing
      ? current.map((row) => displayText(row.character_id) === id ? { ...row, combat_side: side } : row)
      : [...current, { character_id: id, contexts: [], combat_side: side }]);
    setSelectedCharacter(id);
  };
  const dragEnd = (event: DragEndEvent) => {
    if (event.over && SIDES.includes(String(event.over.id) as Side)) move(String(event.active.id), String(event.over.id) as Side);
  };
  return <Panel title="Encounter Stage" subtitle="Drag characters from the cast into a side. Position within a side is visual only.">
    <DndContext sensors={sensors} onDragEnd={dragEnd}>
      <div className="mb-3 flex flex-wrap gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
        {packet.characters.filter((entry) => !assigned.has(characterId(entry))).map((entry) => <CastChip key={characterId(entry)} entry={entry} onAdd={() => move(characterId(entry), "Neutral")} />)}
        {packet.characters.length === assigned.size && <div className="text-xs text-slate-500">Every character is already on the stage.</div>}
      </div>
      <div className="grid gap-3 xl:grid-cols-3">
        {SIDES.map((side) => <SideZone key={side} side={side} packet={packet} selectedCharacter={selectedCharacter} setSelectedCharacter={setSelectedCharacter} updateParticipants={updateParticipants} />)}
      </div>
    </DndContext>
  </Panel>;
}

function CastChip({ entry, onAdd }: { entry: CharacterPacket; onAdd: () => void }) {
  const id = characterId(entry);
  const draggable = useDraggable({ id });
  return <button ref={draggable.setNodeRef} {...draggable.listeners} {...draggable.attributes} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-left text-xs shadow-sm dark:border-slate-700 dark:bg-slate-900" onClick={onAdd}><div className="font-semibold">{rowLabel(entry.character, id)}</div><div className="text-slate-500">Level {Number(entry.character.level || 0)} / {entry.combat_profile ? "Combat" : "No combat"} / {entry.interaction_profile ? "Interaction" : "No interaction"}</div></button>;
}

function SideZone({ side, packet, selectedCharacter, setSelectedCharacter, updateParticipants }: { side: Side; packet: EncounterPacket; selectedCharacter: string; setSelectedCharacter: (id: string) => void; updateParticipants: (rows: EntryRecord[]) => void }) {
  const droppable = useDroppable({ id: side });
  const participants = rows(packet.encounter.participants).filter((row) => displayText(row.combat_side) === side);
  const characters = new Map(packet.characters.map((entry) => [characterId(entry), entry]));
  const update = (id: string, patch: EntryRecord) => updateParticipants(rows(packet.encounter.participants).map((row) => displayText(row.character_id) === id ? { ...row, ...patch } : row));
  const remove = (id: string) => updateParticipants(rows(packet.encounter.participants).filter((row) => displayText(row.character_id) !== id));
  return <div ref={droppable.setNodeRef} className={`min-h-52 rounded-md border-2 border-dashed p-3 ${droppable.isOver ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30" : "border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-950"}`}>
    <div className="mb-2 text-sm font-semibold">{side} ({participants.length})</div>
    <div className="space-y-2">{participants.map((participant) => {
      const id = displayText(participant.character_id);
      const character = characters.get(id);
      return <ParticipantCard key={id} id={id} participant={participant} packet={character} selected={selectedCharacter === id} onSelect={() => setSelectedCharacter(id)} onChange={(patch) => update(id, patch)} onRemove={() => remove(id)} />;
    })}</div>
  </div>;
}

function ParticipantCard({ id, participant, packet, selected, onSelect, onChange, onRemove }: { id: string; participant: EntryRecord; packet?: CharacterPacket; selected: boolean; onSelect: () => void; onChange: (patch: EntryRecord) => void; onRemove: () => void }) {
  const draggable = useDraggable({ id });
  const contexts = strings(participant.contexts);
  const toggle = (context: string) => onChange({ contexts: contexts.includes(context) ? contexts.filter((item) => item !== context) : [...contexts, context] });
  return <div ref={draggable.setNodeRef} className={`rounded-md border bg-white p-3 shadow-sm dark:bg-slate-900 ${selected ? "border-blue-500" : "border-slate-200 dark:border-slate-800"}`} onClick={onSelect}>
    <div className="flex items-start justify-between gap-2"><button {...draggable.listeners} {...draggable.attributes} className="cursor-grab text-left"><div className="text-sm font-semibold">{rowLabel(packet?.character || {}, id)}</div><div className="text-xs text-slate-500">Level {Number(packet?.character.level || 0)}</div></button><button className="text-xs font-semibold text-red-600" onClick={(event) => { event.stopPropagation(); onRemove(); }}>Remove</button></div>
    <div className="mt-2 flex gap-1">{["Combat", "Interaction"].map((context) => <button key={context} className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${contexts.includes(context) ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 dark:border-slate-700"}`} onClick={(event) => { event.stopPropagation(); toggle(context); }}>{context}{context === "Combat" && !packet?.combat_profile ? " !" : context === "Interaction" && !packet?.interaction_profile ? " !" : ""}</button>)}</div>
  </div>;
}

function RewardPanel({ packet, updateEncounter }: { packet: EncounterPacket; updateEncounter: (patch: EntryRecord) => void }) {
  const rewards = rewardObject(packet.encounter);
  const update = (patch: EntryRecord) => updateEncounter({ rewards: { ...rewards, ...patch } });
  return <Panel title="Rewards" subtitle="Shape the payoff and progression consequences.">
    <div className="grid gap-3 md:grid-cols-2"><NumberField label="XP" value={rewards.xp} onChange={(xp) => update({ xp })} /><MultiSelect label="Flags Set" values={strings(rewards.flags_set)} options={packet.flags} onChange={(flags_set) => update({ flags_set })} /></div>
    <div className="grid gap-3 xl:grid-cols-3"><RewardRows title="Item Rewards" rows={rows(rewards.items)} options={packet.items} referenceKey="item_id" numberKey="quantity" onChange={(items) => update({ items })} /><RewardRows title="Currency Rewards" rows={rows(rewards.currencies)} options={packet.currencies} referenceKey="currency_id" numberKey="amount" onChange={(currencies) => update({ currencies })} /><RewardRows title="Reputation Rewards" rows={rows(rewards.reputation)} options={packet.factions} referenceKey="faction_id" numberKey="amount" onChange={(reputation) => update({ reputation })} /></div>
  </Panel>;
}

function RewardRows({ title, rows: value, options, referenceKey, numberKey, onChange }: { title: string; rows: EntryRecord[]; options: EntryRecord[]; referenceKey: string; numberKey: string; onChange: (rows: EntryRecord[]) => void }) {
  const reference = ({ item_id: "items", currency_id: "currencies", faction_id: "factions" } as Record<string, string>)[referenceKey];
  return <div className="mt-3 rounded-md border border-slate-200 p-3 dark:border-slate-800"><div className="mb-2"><div className="text-xs font-semibold uppercase text-slate-500">{title}</div>{reference && <ReferenceManageLink reference={reference} onCreated={(id) => onChange([...value, { [referenceKey]: id, [numberKey]: 0 }])} />}</div><div className="space-y-2">{value.map((row, index) => <div key={index} className="grid grid-cols-[1fr_100px_auto] gap-2"><select className={inputClass} value={displayText(row[referenceKey])} onChange={(event) => onChange(value.map((entry, rowIndex) => rowIndex === index ? { ...entry, [referenceKey]: event.target.value } : entry))}><option value="">Select</option>{options.map((option) => <option key={displayText(option.id)} value={displayText(option.id)}>{rowLabel(option, displayText(option.id))}</option>)}</select><input className={inputClass} type="number" value={Number(row[numberKey] || 0)} onChange={(event) => onChange(value.map((entry, rowIndex) => rowIndex === index ? { ...entry, [numberKey]: Number(event.target.value) } : entry))} /><button className="text-xs font-semibold text-red-600" onClick={() => onChange(value.filter((_, rowIndex) => rowIndex !== index))}>Remove</button></div>)}</div><button className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs} mt-2`} onClick={() => onChange([...value, { [referenceKey]: "", [numberKey]: 0 }])}>Add Row</button></div>;
}

function AftermathPanel({ rows: aftermathRows, loading, error }: { rows: EncounterAftermathRow[]; loading: boolean; error: string }) {
  const groupLabels: Record<EncounterAftermathRow["group"], string> = {
    payoff: "Draft Payoff",
    participants: "Participant Impact",
    story: "Saved Story Consequences",
  };
  const grouped = {
    payoff: aftermathRows.filter((row) => row.group === "payoff"),
    participants: aftermathRows.filter((row) => row.group === "participants"),
    story: aftermathRows.filter((row) => row.group === "story"),
  };
  return <Panel title="Encounter Aftermath" subtitle="Preview what changes because this encounter happens. Draft rewards are local; story consequences are saved placements.">
    {loading && <div className="mb-3 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">Loading story consequences...</div>}
    {error && <Issue tone="amber">{error}</Issue>}
    <div className="grid gap-3 lg:grid-cols-3">
      {(Object.keys(grouped) as Array<EncounterAftermathRow["group"]>).map((group) => (
        <div key={group} className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
          <div className="mb-2 text-xs font-semibold uppercase text-slate-500">{groupLabels[group]}</div>
          <div className="space-y-2">
            {grouped[group].length === 0 && <div className="text-xs text-slate-500">None.</div>}
            {grouped[group].map((row) => (
              <div key={row.id} className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-950">
                <div className="font-semibold text-slate-900 dark:text-slate-100">{row.route ? <Link className="text-blue-700 hover:underline dark:text-blue-300" to={row.route}>{row.label}</Link> : row.label}</div>
                <div className="mt-1 text-slate-600 dark:text-slate-400">{row.detail}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  </Panel>;
}

function PlacementPanel({ packet, setPacket }: { packet: EncounterPacket; setPacket: React.Dispatch<React.SetStateAction<EncounterPacket>> }) {
  const placed = new Set(packet.placements.map((placement) => placement.table_id));
  const add = (tableId: string) => setPacket((current) => ({ ...current, placements: [...current.placements, { table_id: tableId, entry: { encounter_id: current.encounter.id, weight: 1, spawn_group: "", min_count: 1, max_count: 1, spawn_notes: "" } }] }));
  const update = (index: number, patch: EntryRecord) => setPacket((current) => ({ ...current, placements: current.placements.map((placement, rowIndex) => rowIndex === index ? { ...placement, entry: { ...placement.entry, ...patch } } : placement) }));
  return <Panel title="World Placement" subtitle="Place this encounter into existing location encounter tables.">
    <div className="space-y-3">{packet.placements.map((placement, index) => {
      const table = packet.encounter_tables.find((entry) => displayText(entry.id) === placement.table_id);
      const location = isRecord(table?.location) ? table.location : {};
      return <div key={placement.table_id} className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950"><div className="mb-2 flex justify-between gap-2"><div><div className="text-sm font-semibold">{rowLabel(table || {}, placement.table_id)}</div><div className="text-xs text-slate-500">{rowLabel(location, displayText(table?.location_id))}</div></div><button className="text-xs font-semibold text-red-600" onClick={() => setPacket((current) => ({ ...current, placements: current.placements.filter((_, rowIndex) => rowIndex !== index) }))}>Remove</button></div><div className="grid gap-2 md:grid-cols-4"><NumberField label="Weight" value={placement.entry.weight} onChange={(weight) => update(index, { weight })} /><NumberField label="Min Count" value={placement.entry.min_count} onChange={(min_count) => update(index, { min_count })} /><NumberField label="Max Count" value={placement.entry.max_count} onChange={(max_count) => update(index, { max_count })} /><Field label="Spawn Group" value={placement.entry.spawn_group} onChange={(spawn_group) => update(index, { spawn_group })} /><label className="block md:col-span-4"><Caption>Spawn Notes</Caption><textarea className={`${inputClass} min-h-16`} value={editableText(placement.entry.spawn_notes)} onChange={(event) => update(index, { spawn_notes: event.target.value })} /></label></div></div>;
    })}</div>
    <select className={`${inputClass} mt-3`} value="" onChange={(event) => event.target.value && add(event.target.value)}><option value="">Add existing encounter table...</option>{packet.encounter_tables.filter((table) => !placed.has(displayText(table.id))).map((table) => <option key={displayText(table.id)} value={displayText(table.id)}>{rowLabel(table, displayText(table.id))}</option>)}</select><ReferenceManageLink reference="location_encounter_tables" onCreated={add} />
  </Panel>;
}

function SimulationComparison({ packet }: { packet: EncounterPacket }) {
  const [datasets, setDatasets] = useState<SimulationDatasets | null>(null);
  const [scenarioId, setScenarioId] = useState(DEFAULT_SIMULATION_SCENARIO_ID);
  useEffect(() => { void loadSimulationDatasets(false).then(setDatasets); }, []);
  const result = useMemo(() => {
    if (!datasets) return null;
    const overlay = { ...datasets, encounters: [...datasets.encounters.filter((entry) => displayText(entry.id) !== displayText(packet.encounter.id)), packet.encounter] };
    const scenario = getSimulationScenarioById(scenarioId);
    const current = simulateEntity({ schemaName: "encounters", entity: packet.encounter, datasets: overlay, scenario, runs: 400, seed: 42 });
    const placedLocations = new Set(packet.placements.map((placement) => displayText(packet.encounter_tables.find((table) => displayText(table.id) === placement.table_id)?.location_id)).filter(Boolean));
    const peers = packet.encounters.filter((entry) => displayText(entry.id) !== displayText(packet.encounter.id) && displayText(entry.encounter_type) === displayText(packet.encounter.encounter_type)).map((entry) => {
      const metrics = simulateEntity({ schemaName: "encounters", entity: entry, datasets: overlay, scenario, runs: 400, seed: 42 }).metrics;
      const sharesLocation = packet.encounter_tables.some((table) => placedLocations.has(displayText(table.location_id)) && rows(table.encounter_entries).some((row) => displayText(row.encounter_id) === displayText(entry.id)));
      return { entry, metrics, sharesLocation };
    }).sort((a, b) => Number(b.sharesLocation) - Number(a.sharesLocation) || Math.abs(a.metrics.power - current.metrics.power) - Math.abs(b.metrics.power - current.metrics.power)).slice(0, 5);
    const values = peers.map((peer) => peer.metrics.value).sort((a, b) => a - b);
    const median = values.length ? values[Math.floor(values.length / 2)] : 0;
    return { current, peers, poorReward: median > 0 && current.metrics.value < median * 0.6 };
  }, [datasets, packet, scenarioId]);
  return <Panel title="Simulation And Comparison" subtitle="Compare the current draft against same-type encounters using the existing simulation.">
    <label className="block max-w-sm"><Caption>Scenario</Caption><select className={inputClass} value={scenarioId} onChange={(event) => setScenarioId(event.target.value)}>{SIMULATION_SCENARIOS.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.label}</option>)}</select></label>
    {!result ? <div className="mt-3 text-sm text-slate-500">Loading simulation datasets...</div> : <><div className="mt-3 grid gap-2 sm:grid-cols-3"><Metric label="Power" value={result.current.metrics.power} /><Metric label="Value" value={result.current.metrics.value} /><Metric label="Influence" value={result.current.metrics.influence} /></div>{result.current.warnings.map((warning) => <div key={warning} className="mt-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">{warning}</div>)}{result.poorReward && <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">Reward value is below 60% of the comparison-peer median.</div>}<div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="text-xs uppercase text-slate-500"><th className="p-2">Peer</th><th>Nearby</th><th>Power</th><th>Value</th><th>Influence</th></tr></thead><tbody>{result.peers.map((peer) => <tr key={displayText(peer.entry.id)} className="border-t border-slate-200 dark:border-slate-800"><td className="p-2 font-semibold">{rowLabel(peer.entry, displayText(peer.entry.id))}</td><td>{peer.sharesLocation ? "Same location" : "-"}</td><td>{peer.metrics.power.toFixed(0)}</td><td>{peer.metrics.value.toFixed(0)}</td><td>{peer.metrics.influence.toFixed(0)}</td></tr>)}</tbody></table></div></>}
  </Panel>;
}

function HealthPanel({ issues }: { issues: { blockers: string[]; warnings: string[] } }) {
  return <Panel title="Encounter Health" subtitle={`${issues.blockers.length} blockers / ${issues.warnings.length} warnings`}>
    {issues.blockers.map((issue) => <Issue key={issue} tone="red">{issue}</Issue>)}
    {issues.warnings.map((issue) => <Issue key={issue} tone="amber">{issue}</Issue>)}
    {issues.blockers.length + issues.warnings.length === 0 && <div className="text-sm text-slate-500">No encounter health issues.</div>}
  </Panel>;
}

function Dossier({ packet, selectedCharacter }: { packet: EncounterPacket; selectedCharacter: string }) {
  const entry = packet.characters.find((candidate) => characterId(candidate) === selectedCharacter);
  if (!entry) return <Panel title="Participant Dossier" subtitle="Select a participant card to inspect it."><div className="text-sm text-slate-500">No participant selected.</div></Panel>;
  const combat = entry.combat_profile;
  const interaction = entry.interaction_profile;
  return <Panel title="Participant Dossier" subtitle={rowLabel(entry.character, selectedCharacter)}>
    <div className="grid gap-2 sm:grid-cols-2"><Fact label="Level" value={String(Number(entry.character.level || 0))} /><Fact label="Class" value={displayText(entry.character.class_id, "Unassigned")} /><Fact label="Faction" value={displayText(entry.character.faction_id, "Unassigned")} /><Fact label="Home" value={displayText(entry.character.home_location_id, "Unassigned")} /></div>
    <div className="mt-3 rounded-md border border-slate-200 p-3 text-xs dark:border-slate-800"><div className="font-semibold">Combat Profile</div>{combat ? <div className="mt-1 space-y-1 text-slate-600 dark:text-slate-400"><div>{displayText(combat.enemy_type)} / {displayText(combat.aggression)}</div><div>{strings(combat.custom_abilities).length} abilities / {rows(combat.custom_stats).length} stats</div><div>{rows(combat.loot_table).length} loot rows / {Number(combat.xp_reward || 0)} XP</div></div> : <div className="mt-1 text-amber-700">Missing combat profile.</div>}</div>
    <div className="mt-3 rounded-md border border-slate-200 p-3 text-xs dark:border-slate-800"><div className="font-semibold">Interaction Profile</div>{interaction ? <div className="mt-1 space-y-1 text-slate-600 dark:text-slate-400"><div>{displayText(interaction.role)}</div><div>{strings(interaction.available_quests).length} quests / {rows(interaction.inventory).length} inventory rows</div></div> : <div className="mt-1 text-amber-700">Missing interaction profile.</div>}</div>
    <Link className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs} mt-3`} to={`/author/characters/${encodeURIComponent(selectedCharacter)}`}>Open Character Creator</Link>
  </Panel>;
}

function WorldContext({ packet }: { packet: EncounterPacket }) {
  return <Panel title="Direct World Context" subtitle="POIs and events that directly invoke this encounter."><ContextList title="POIs" entries={packet.context.pois} /><ContextList title="Events" entries={packet.context.events} /></Panel>;
}

function ContextList({ title, entries }: { title: string; entries: EntryRecord[] }) {
  return <div className="mb-3"><div className="mb-1 text-xs font-semibold uppercase text-slate-500">{title}</div>{entries.length === 0 ? <div className="text-xs text-slate-500">None.</div> : entries.map((entry) => <div key={displayText(entry.id)} className="rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-800">{rowLabel(entry, displayText(entry.id))}</div>)}</div>;
}

function MultiSelect({ label, values, options, onChange }: { label: string; values: string[]; options: EntryRecord[]; onChange: (values: string[]) => void }) {
  return <label className="block"><Caption>{label}</Caption><select multiple className={`${inputClass} min-h-24`} value={values} onChange={(event) => onChange(Array.from(event.target.selectedOptions).map((option) => option.value))}>{options.map((option) => <option key={displayText(option.id)} value={displayText(option.id)}>{rowLabel(option, displayText(option.id))}</option>)}</select><ReferenceManageLink reference="flags" onCreated={(id) => onChange(values.includes(id) ? values : [...values, id])} /></label>;
}

function Field({ label, value, onChange }: { label: string; value: unknown; onChange: (value: string) => void }) {
  return <label className="block"><Caption>{label}</Caption><input className={inputClass} value={editableText(value)} onChange={(event) => onChange(event.target.value)} /></label>;
}

function NumberField({ label, value, onChange }: { label: string; value: unknown; onChange: (value: number) => void }) {
  return <label className="block"><Caption>{label}</Caption><input className={inputClass} type="number" value={Number(value || 0)} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function Caption({ children }: { children: ReactNode }) {
  return <div className="mb-1 text-[11px] font-semibold uppercase text-slate-500">{children}</div>;
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return <section className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><div className="mb-3"><h2 className="text-sm font-semibold text-slate-950 dark:text-slate-100">{title}</h2>{subtitle && <div className="mt-1 text-xs text-slate-500">{subtitle}</div>}</div>{children}</section>;
}

function Issue({ tone, children }: { tone: "red" | "amber"; children: ReactNode }) {
  return <div className={`mb-2 rounded border px-3 py-2 text-xs ${tone === "red" ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200" : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"}`}>{children}</div>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950"><div className="text-[11px] font-semibold uppercase text-slate-500">{label}</div><div className="mt-1 truncate text-sm font-semibold" title={value}>{value}</div></div>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 text-xl font-semibold">{value.toFixed(1)}</div></div>;
}
