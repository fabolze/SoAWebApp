import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import SchemaForm from "../components/SchemaForm";
import { AuthoringPageShell, AuthoringPanel, EmptyState } from "../components/authoringUi";
import { useDirtyState } from "../components/useDirtyState";
import SimulationWorkbench from "../components/simulation/SimulationWorkbench";
import { apiFetch } from "../lib/api";
import { formatApiError } from "../lib/apiErrors";
import { BUTTON_CLASSES, BUTTON_SIZES } from "../styles/uiTokens";
import { getSimulationScenarioById, loadSimulationDatasets, simulateEntity, type SimulationDatasets } from "../simulation";
import type { SchemaDefinition } from "../components/schemaForm/types";
import type { EntryRecord } from "../types/editorQol";
import { generateSlug, generateUlid } from "../utils/generateId";
import {
  EditableTagList,
  InlineField,
  InlineFieldGrid,
  ReferenceChipPicker,
  ReferenceManageLink,
  SelectBadgeGroup,
  displayText,
  isRecord,
  rowLabel,
  useReferenceOptions,
} from "./controls";

type CreatorMode = "creator" | "advanced";
type Profile = EntryRecord | null;

interface WorldPresence {
  encounters: EntryRecord[];
  dialogues: EntryRecord[];
  shops: EntryRecord[];
}

interface CharacterBundle {
  character: EntryRecord;
  combat_profile: Profile;
  interaction_profile: Profile;
  world_presence: WorldPresence;
}

interface Starter {
  id: string;
  label: string;
  summary: string;
  tags?: string[];
  combat?: EntryRecord;
  interaction?: EntryRecord;
}

const EMPTY_PRESENCE: WorldPresence = { encounters: [], dialogues: [], shops: [] };
const STARTERS: Starter[] = [
  { id: "civilian", label: "Civilian", summary: "Background world character.", interaction: { role: "Background" } },
  { id: "questgiver", label: "Quest Giver", summary: "Offers quests and story direction.", interaction: { role: "Questgiver" } },
  { id: "merchant", label: "Merchant", summary: "Trades items with the player.", interaction: { role: "Merchant" } },
  { id: "trainer", label: "Trainer", summary: "Supports progression and learning.", interaction: { role: "Trainer" } },
  { id: "companion", label: "Companion", summary: "Friendly interactive combatant.", combat: { enemy_type: "humanoid", aggression: "Friendly" }, interaction: { role: "Companion" }, tags: ["companion"] },
  { id: "friendly", label: "Friendly Combatant", summary: "Friendly character ready for combat.", combat: { enemy_type: "humanoid", aggression: "Friendly" } },
  { id: "enemy", label: "Standard Enemy", summary: "Standard hostile combatant.", combat: { enemy_type: "humanoid", aggression: "Hostile" }, tags: ["enemy"] },
  { id: "elite", label: "Elite Enemy", summary: "Stronger hostile combatant.", combat: { enemy_type: "humanoid", aggression: "Hostile" }, tags: ["enemy", "elite"] },
  { id: "boss", label: "Boss", summary: "Major hostile combatant.", combat: { enemy_type: "boss", aggression: "Hostile" }, tags: ["enemy", "boss"] },
];

function stable(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function emptyCharacter(): EntryRecord {
  return { id: generateUlid(), slug: "", name: "", title: "", description: "", level: 1, tags: [] };
}

function emptyCombat(characterId: string): EntryRecord {
  return {
    id: generateUlid(), character_id: characterId, enemy_type: "humanoid", aggression: "Neutral",
    custom_stats: [], custom_abilities: [], loot_table: [], currency_rewards: [], reputation_rewards: [],
    related_quests: [], companion_config: {}, tags: [],
  };
}

function emptyInteraction(characterId: string): EntryRecord {
  return {
    id: generateUlid(), character_id: characterId, role: "Story", dialogue_tree_id: "",
    available_quests: [], inventory: [], flags_set_on_interaction: [], tags: [],
  };
}

function fillEmpty(base: EntryRecord, patch: EntryRecord): EntryRecord {
  const next = { ...base };
  Object.entries(patch).forEach(([key, value]) => {
    const current = next[key];
    if (current === null || current === undefined || current === "" || (Array.isArray(current) && current.length === 0)) next[key] = value;
  });
  return next;
}

function arrayRows(value: unknown): EntryRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function hasEncounterPlacement(bundle: CharacterBundle): boolean {
  const characterId = displayText(bundle.character.id);
  return bundle.world_presence.encounters.some((encounter) =>
    arrayRows(encounter.participants).some((row) => displayText(row.character_id) === characterId)
  );
}

function missingRowValue(rows: EntryRecord[], keys: string[]): boolean {
  return rows.some((row) => keys.some((key) => {
    const value = row[key];
    return value === null || value === undefined || value === "";
  }));
}

function invalidChance(rows: EntryRecord[]): boolean {
  return rows.some((row) => row.drop_chance !== undefined && (Number(row.drop_chance) < 0 || Number(row.drop_chance) > 100));
}

function creatorRole(bundle: CharacterBundle): string {
  const tags = new Set(stringArray(bundle.character.tags).map((tag) => tag.toLowerCase()));
  if (tags.has("boss")) return "Boss";
  if (tags.has("elite")) return "Elite Enemy";
  if (tags.has("enemy")) return "Standard Enemy";
  const role = displayText(bundle.interaction_profile?.role);
  if (role) return role;
  if (bundle.combat_profile) return displayText(bundle.combat_profile.aggression) === "Friendly" ? "Friendly Combatant" : "Combatant";
  return "Unassigned";
}

function healthIssues(bundle: CharacterBundle): string[] {
  const issues: string[] = [];
  const combat = bundle.combat_profile;
  const interaction = bundle.interaction_profile;
  const tags = stringArray(bundle.character.tags).map((tag) => tag.toLowerCase());
  const isEnemy = tags.some((tag) => ["enemy", "elite", "boss"].includes(tag));
  if (combat && !displayText(bundle.character.class_id)) issues.push("Combat character needs a class.");
  if (combat && Number(bundle.character.level || 0) <= 0) issues.push("Combat character needs a level above zero.");
  if (combat && stringArray(combat.custom_abilities).length === 0) issues.push("Combat profile has no abilities.");
  if (isEnemy && !combat) issues.push("Enemy needs a combat profile.");
  if (isEnemy && !hasEncounterPlacement(bundle)) issues.push("Enemy does not appear in an encounter.");
  if (displayText(interaction?.role) === "Merchant" && arrayRows(interaction?.inventory).length === 0 && bundle.world_presence.shops.length === 0) issues.push("Merchant has no inventory or shop.");
  if (displayText(interaction?.role) === "Questgiver" && stringArray(interaction?.available_quests).length === 0) issues.push("Quest giver offers no quests.");
  if (bundle.world_presence.dialogues.length > 0 && !interaction) issues.push("Character has dialogue but no interaction profile.");
  const placements = bundle.world_presence.encounters.flatMap((encounter) =>
    arrayRows(encounter.participants).filter((row) => displayText(row.character_id) === displayText(bundle.character.id))
  );
  if (!combat && placements.some((row) => stringArray(row.contexts).includes("Combat"))) issues.push("Combat encounter placement requires a combat profile.");
  if (!interaction && placements.some((row) => stringArray(row.contexts).includes("Interaction"))) issues.push("Interaction encounter placement requires an interaction profile.");
  if (missingRowValue(arrayRows(combat?.loot_table), ["item_id", "drop_chance"])) issues.push("Loot contains an incomplete item or drop chance.");
  if (missingRowValue(arrayRows(combat?.currency_rewards), ["currency_id", "amount"])) issues.push("Currency rewards contain incomplete references or amounts.");
  if (missingRowValue(arrayRows(combat?.reputation_rewards), ["faction_id", "amount"])) issues.push("Reputation rewards contain incomplete references or amounts.");
  if (missingRowValue(arrayRows(interaction?.inventory), ["item_id", "price"])) issues.push("Inventory contains incomplete item or price entries.");
  if (invalidChance([...arrayRows(combat?.loot_table), ...arrayRows(combat?.currency_rewards), ...arrayRows(combat?.reputation_rewards)])) issues.push("Reward drop chances must stay between 0 and 100.");
  return issues;
}

function saveBlockers(bundle: CharacterBundle): string[] {
  const blockers: string[] = [];
  if (!displayText(bundle.character.name)) blockers.push("Name is required.");
  if (!displayText(bundle.character.slug)) blockers.push("Slug is required.");
  if (bundle.combat_profile && !displayText(bundle.character.class_id)) blockers.push("Combat characters need a class before saving.");
  if (bundle.combat_profile && Number(bundle.character.level || 0) <= 0) blockers.push("Combat characters need a level above zero before saving.");
  return blockers;
}

export default function CharacterCreatorPage() {
  const { id = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const isNew = id === "new" || location.pathname.endsWith("/new");
  const [schema, setSchema] = useState<SchemaDefinition | null>(null);
  const [bundle, setBundle] = useState<CharacterBundle>(() => ({ character: emptyCharacter(), combat_profile: null, interaction_profile: null, world_presence: EMPTY_PRESENCE }));
  const [original, setOriginal] = useState<CharacterBundle | null>(null);
  const [mode, setMode] = useState<CreatorMode>("creator");
  const [pendingStarter, setPendingStarter] = useState<Starter | null>(null);
  const [changedEncounters, setChangedEncounters] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const dirtySource = useRef(`character-creator-${id}`);
  const { setDirty } = useDirtyState();

  const serialized = stable({ bundle, changed: [...changedEncounters].sort() });
  const originalSerialized = stable({ bundle: original, changed: [] });
  const dirty = original !== null && serialized !== originalSerialized;
  const issues = useMemo(() => healthIssues(bundle), [bundle]);
  const blockers = useMemo(() => saveBlockers(bundle), [bundle]);
  const simulationOverlays = useMemo<Partial<SimulationDatasets>>(
    () => ({ combat_profiles: bundle.combat_profile ? [bundle.combat_profile] : [] }),
    [bundle.combat_profile]
  );

  useEffect(() => {
    const source = dirtySource.current;
    setDirty(source, dirty);
    return () => setDirty(source, false);
  }, [dirty, setDirty]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      import("../../../backend/app/schemas/characters.json"),
      isNew ? Promise.resolve(null) : apiFetch(`/api/ui/characters/${encodeURIComponent(id)}`),
    ]).then(async ([schemaModule, response]) => {
      if (cancelled) return;
      setSchema((schemaModule.default || schemaModule) as SchemaDefinition);
      if (response && !response.ok) throw new Error(`Character ${id} failed to load.`);
      const next = response
        ? await response.json() as CharacterBundle
        : { character: emptyCharacter(), combat_profile: null, interaction_profile: null, world_presence: EMPTY_PRESENCE };
      setBundle(next);
      setOriginal(next);
    }).catch((err) => setNotice(err instanceof Error ? err.message : "Character creator failed to load."))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id, isNew]);

  const setCharacter = (character: EntryRecord) => setBundle((current) => ({ ...current, character }));
  const setCombat = (combat_profile: Profile) => setBundle((current) => ({ ...current, combat_profile }));
  const setInteraction = (interaction_profile: Profile) => setBundle((current) => ({ ...current, interaction_profile }));

  const applyStarter = (starter: Starter) => {
    setBundle((current) => {
      const characterId = displayText(current.character.id);
      const tags = Array.from(new Set([...stringArray(current.character.tags), ...(starter.tags || [])]));
      return {
        ...current,
        character: { ...current.character, tags },
        combat_profile: starter.combat
          ? current.combat_profile ? fillEmpty(current.combat_profile, starter.combat) : { ...emptyCombat(characterId), ...starter.combat }
          : current.combat_profile,
        interaction_profile: starter.interaction
          ? current.interaction_profile ? fillEmpty(current.interaction_profile, starter.interaction) : { ...emptyInteraction(characterId), ...starter.interaction }
          : current.interaction_profile,
      };
    });
    setPendingStarter(null);
  };

  const save = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const encounterPayload = bundle.world_presence.encounters
        .filter((entry) => changedEncounters.has(displayText(entry.id)))
        .map((entry) => entry.__new ? Object.fromEntries(Object.entries(entry).filter(([key]) => key !== "__new")) : ({ id: entry.id, participants: entry.participants }));
      const response = await apiFetch("/api/ui/characters/bundle", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ character: bundle.character, combat_profile: bundle.combat_profile, interaction_profile: bundle.interaction_profile, encounters: encounterPayload }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !isRecord(payload)) throw new Error(formatApiError(payload, "Character bundle failed to save."));
      const saved = payload as unknown as CharacterBundle;
      setBundle(saved);
      setOriginal(saved);
      setChangedEncounters(new Set());
      setNotice("Character bundle saved.");
      if (isNew) navigate(`/author/characters/${encodeURIComponent(displayText(saved.character.id))}`, { replace: true });
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !schema) return <div className="p-6 text-sm text-slate-600 dark:text-slate-300">Loading character creator...</div>;

  return (
    <AuthoringPageShell>
        <CreatorHeader bundle={bundle} mode={mode} setMode={setMode} dirty={dirty} saving={saving} blockers={blockers} onSave={() => void save()} onReset={() => { if (original) setBundle(original); setChangedEncounters(new Set()); }} />
        {notice && <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200">{notice}</div>}
        {mode === "advanced" ? (
          <Panel title="Advanced Character Form" subtitle="Schema-complete fallback for the underlying character record.">
            <SchemaForm schema={schema} schemaName="characters" data={bundle.character} onChange={setCharacter} />
          </Panel>
        ) : (
          <>
            <StarterCards pending={pendingStarter} onPreview={setPendingStarter} onApply={applyStarter} onCancel={() => setPendingStarter(null)} />
            <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
              <IdentityPanel schema={schema} character={bundle.character} onChange={setCharacter} />
              <CreatorHealth issues={issues} />
            </div>
            <CombatPanel characterId={displayText(bundle.character.id)} combat={bundle.combat_profile} onChange={setCombat} />
            <InteractionPanel characterId={displayText(bundle.character.id)} interaction={bundle.interaction_profile} onChange={setInteraction} />
            <WorldPresencePanel bundle={bundle} changedEncounters={changedEncounters} onBundleChange={setBundle} onEncounterChanged={(encounterId) => setChangedEncounters((current) => new Set(current).add(encounterId))} />
            <ComparisonPanel bundle={bundle} />
            <SimulationWorkbench fixedSchemaName="characters" draftEntity={bundle.character} datasetOverlays={simulationOverlays} title="Bundled Character Simulation" />
          </>
        )}
        <div className="sticky bottom-3 flex justify-end gap-2 rounded-md border border-slate-200 bg-white/95 p-3 shadow dark:border-slate-800 dark:bg-slate-900/95">
          <Link className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.sm}`} to={`/characters?selected=${encodeURIComponent(displayText(bundle.character.id))}`}>Generic Editor</Link>
          <button className={`${BUTTON_CLASSES.secondary} ${BUTTON_SIZES.sm}`} disabled={!dirty || saving} onClick={() => { if (original) setBundle(original); setChangedEncounters(new Set()); }}>Reset</button>
          <button className={`${BUTTON_CLASSES.primary} ${BUTTON_SIZES.sm}`} disabled={saving || blockers.length > 0} onClick={() => void save()}>{saving ? "Saving..." : "Save All"}</button>
        </div>
    </AuthoringPageShell>
  );
}

function CreatorHeader({ bundle, mode, setMode, dirty, saving, blockers, onSave, onReset }: { bundle: CharacterBundle; mode: CreatorMode; setMode: (mode: CreatorMode) => void; dirty: boolean; saving: boolean; blockers: string[]; onSave: () => void; onReset: () => void }) {
  return <Panel title={displayText(bundle.character.name, "New Character")} subtitle={`${creatorRole(bundle)} / Level ${Number(bundle.character.level || 1)}`}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex gap-2">{(["creator", "advanced"] as CreatorMode[]).map((item) => <button key={item} className={`${item === mode ? BUTTON_CLASSES.primary : BUTTON_CLASSES.outline} ${BUTTON_SIZES.sm}`} onClick={() => setMode(item)}>{item === "creator" ? "Creator" : "Advanced Form"}</button>)}</div>
      <div className="flex gap-2"><button className={`${BUTTON_CLASSES.secondary} ${BUTTON_SIZES.sm}`} disabled={!dirty || saving} onClick={onReset}>Reset</button><button className={`${BUTTON_CLASSES.primary} ${BUTTON_SIZES.sm}`} disabled={saving || blockers.length > 0} onClick={onSave}>{saving ? "Saving..." : "Save All"}</button></div>
    </div>
    {blockers.length > 0 && <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950">{blockers.join(" ")}</div>}
  </Panel>;
}

function StarterCards({ pending, onPreview, onApply, onCancel }: { pending: Starter | null; onPreview: (starter: Starter) => void; onApply: (starter: Starter) => void; onCancel: () => void }) {
  return <Panel title="Start With A Role" subtitle="Role starters fill empty values once and never remove authored work.">
    <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-5">{STARTERS.map((starter) => <button key={starter.id} className="rounded-md border border-slate-200 bg-slate-50 p-3 text-left hover:border-blue-400 dark:border-slate-800 dark:bg-slate-950" onClick={() => onPreview(starter)}><div className="text-sm font-semibold">{starter.label}</div><div className="mt-1 text-xs text-slate-500">{starter.summary}</div></button>)}</div>
    {pending && <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm dark:border-blue-900 dark:bg-blue-950"><span>Apply <strong>{pending.label}</strong> defaults to empty fields?</span><div className="flex gap-2"><button className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`} onClick={onCancel}>Cancel</button><button className={`${BUTTON_CLASSES.primary} ${BUTTON_SIZES.xs}`} onClick={() => onApply(pending)}>Apply Defaults</button></div></div>}
  </Panel>;
}

function IdentityPanel({ schema, character, onChange }: { schema: SchemaDefinition; character: EntryRecord; onChange: (next: EntryRecord) => void }) {
  return <Panel title="Identity" subtitle="The character record shared by every role.">
    <div className="space-y-3"><InlineFieldGrid><InlineField schema={schema} data={character} fieldKey="name" onChange={(next) => onChange({ ...next, slug: displayText(character.slug) ? next.slug : generateSlug(displayText(next.name)) })} /><InlineField schema={schema} data={character} fieldKey="title" onChange={onChange} /><InlineField schema={schema} data={character} fieldKey="slug" onChange={onChange} /><InlineField schema={schema} data={character} fieldKey="level" kind="number" onChange={onChange} /></InlineFieldGrid><InlineField schema={schema} data={character} fieldKey="image_path" onChange={onChange} /><InlineField schema={schema} data={character} fieldKey="description" kind="textarea" onChange={onChange} /><div className="grid gap-3 sm:grid-cols-3"><ReferenceChipPicker label="Class" value={character.class_id} reference="characterclasses" onChange={(class_id) => onChange({ ...character, class_id })} /><ReferenceChipPicker label="Faction" value={character.faction_id} reference="factions" onChange={(faction_id) => onChange({ ...character, faction_id })} /><ReferenceChipPicker label="Home" value={character.home_location_id} reference="locations" onChange={(home_location_id) => onChange({ ...character, home_location_id })} /></div><EditableTagList tags={character.tags} onChange={(tags) => onChange({ ...character, tags })} /></div>
  </Panel>;
}

function CombatPanel({ characterId, combat, onChange }: { characterId: string; combat: Profile; onChange: (next: Profile) => void }) {
  const abilities = useReferenceOptions("abilities");
  const stats = useReferenceOptions("stats");
  const items = useReferenceOptions("items");
  const currencies = useReferenceOptions("currencies");
  const factions = useReferenceOptions("factions");
  const quests = useReferenceOptions("quests");
  if (!combat) return <Panel title="Combat Loadout" subtitle="Add combat capabilities only when this character needs them."><button className={`${BUTTON_CLASSES.primary} ${BUTTON_SIZES.sm}`} onClick={() => onChange(emptyCombat(characterId))}>Add Combat Profile</button></Panel>;
  const abilityMap = new Map(abilities.map((entry) => [displayText(entry.id), entry]));
  const customAbilities = stringArray(combat.custom_abilities);
  const companion = isRecord(combat.companion_config) ? combat.companion_config : {};
  const progression = isRecord(companion.progression) ? companion.progression : {};
  const updateCompanion = (patch: EntryRecord) => onChange({ ...combat, companion_config: { ...companion, ...patch } });
  const updateProgression = (patch: EntryRecord) => updateCompanion({ progression: { ...progression, ...patch } });
  return <Panel title="Combat Loadout" subtitle="Shape behavior, power, and rewards without leaving the character.">
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2"><SelectBadgeGroup label="Enemy Type" value={combat.enemy_type} options={["beast","undead","humanoid","elemental","machine","boss","demon","dragon","giant","spirit","emanation","other"]} onChange={(enemy_type) => onChange({ ...combat, enemy_type })} /><SelectBadgeGroup label="Aggression" value={combat.aggression} options={["Hostile","Neutral","Friendly"]} onChange={(aggression) => onChange({ ...combat, aggression })} /></div>
      <AbilityLoadout values={customAbilities} abilityMap={abilityMap} onChange={(custom_abilities) => onChange({ ...combat, custom_abilities })} />
      <RowEditor title="Custom Stats" rows={arrayRows(combat.custom_stats)} options={stats} referenceKey="stat_id" numberKey="value" onChange={(custom_stats) => onChange({ ...combat, custom_stats })} />
      <StatBars rows={arrayRows(combat.custom_stats)} labels={new Map(stats.map((entry) => [displayText(entry.id), rowLabel(entry, displayText(entry.id))]))} />
      <RowEditor title="Loot Tray" rows={arrayRows(combat.loot_table)} options={items} referenceKey="item_id" numberKey="drop_chance" onChange={(loot_table) => onChange({ ...combat, loot_table })} />
      <div className="grid gap-4 lg:grid-cols-3"><InlineNumber label="XP Reward" value={combat.xp_reward} onChange={(xp_reward) => onChange({ ...combat, xp_reward })} /><RowEditor title="Currency Rewards" rows={arrayRows(combat.currency_rewards)} options={currencies} referenceKey="currency_id" numberKey="amount" secondaryNumberKey="drop_chance" onChange={(currency_rewards) => onChange({ ...combat, currency_rewards })} /><RowEditor title="Reputation Rewards" rows={arrayRows(combat.reputation_rewards)} options={factions} referenceKey="faction_id" numberKey="amount" secondaryNumberKey="drop_chance" onChange={(reputation_rewards) => onChange({ ...combat, reputation_rewards })} /></div>
      <MultiPicker label="Related Quests" values={stringArray(combat.related_quests)} options={quests} onChange={(related_quests) => onChange({ ...combat, related_quests })} />
      <div className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
        <Caption>Companion Overrides</Caption>
        <div className="grid gap-3 sm:grid-cols-2"><ReferenceChipPicker label="Companion Class" value={companion.class_id} reference="characterclasses" onChange={(class_id) => updateCompanion({ class_id })} /><InlineNumber label="Companion Level" value={companion.level} onChange={(level) => updateCompanion({ level })} /><InlineNumber label="Level Cap" value={progression.level_cap} onChange={(level_cap) => updateProgression({ level_cap })} /><InlineNumber label="XP Multiplier" value={progression.xp_multiplier} step="0.1" onChange={(xp_multiplier) => updateProgression({ xp_multiplier })} /></div>
        <div className="mt-3 space-y-3"><MultiPicker label="Companion Abilities" values={stringArray(companion.custom_abilities)} options={abilities} onChange={(custom_abilities) => updateCompanion({ custom_abilities })} /><RowEditor title="Companion Stats" rows={arrayRows(companion.custom_stats)} options={stats} referenceKey="stat_id" numberKey="value" onChange={(custom_stats) => updateCompanion({ custom_stats })} /><RowEditor title="Companion Stat Growth" rows={arrayRows(progression.stat_growth)} options={stats} referenceKey="stat_id" numberKey="value" onChange={(stat_growth) => updateProgression({ stat_growth })} /></div>
      </div>
      <div><Caption>Combat Profile Tags</Caption><EditableTagList tags={combat.tags} onChange={(tags) => onChange({ ...combat, tags })} /></div>
    </div>
  </Panel>;
}

function AbilityLoadout({ values, abilityMap, onChange }: { values: string[]; abilityMap: Map<string, EntryRecord>; onChange: (next: string[]) => void }) {
  const [pick, setPick] = useState("");
  const sensors = useSensors(useSensor(PointerSensor));
  const dragEnd = (event: DragEndEvent) => {
    if (!event.over || event.active.id === event.over.id) return;
    onChange(arrayMove(values, values.indexOf(String(event.active.id)), values.indexOf(String(event.over.id))));
  };
  return <div><Caption>Ability Loadout</Caption><div className="flex gap-2"><select className={inputClass} value={pick} onChange={(event) => setPick(event.target.value)}><option value="">Choose ability</option>{[...abilityMap.entries()].filter(([id]) => !values.includes(id)).map(([id, entry]) => <option key={id} value={id}>{rowLabel(entry, id)}</option>)}</select><button className={`${BUTTON_CLASSES.primary} ${BUTTON_SIZES.sm}`} disabled={!pick} onClick={() => { onChange([...values, pick]); setPick(""); }}>Add</button></div><DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={dragEnd}><SortableContext items={values} strategy={verticalListSortingStrategy}><div className="mt-2 grid gap-2">{values.map((id) => <SortableAbility key={id} id={id} label={rowLabel(abilityMap.get(id) || {}, id)} onRemove={() => onChange(values.filter((value) => value !== id))} />)}</div></SortableContext></DndContext></div>;
}

function SortableAbility({ id, label, onRemove }: { id: string; label: string; onRemove: () => void }) {
  const sortable = useSortable({ id });
  return <div ref={sortable.setNodeRef} style={{ transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition }} className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950"><button className="cursor-grab text-left text-sm font-semibold" {...sortable.attributes} {...sortable.listeners}>{label}</button><button className="text-xs text-red-600" onClick={onRemove}>Remove</button></div>;
}

function InteractionPanel({ characterId, interaction, onChange }: { characterId: string; interaction: Profile; onChange: (next: Profile) => void }) {
  const quests = useReferenceOptions("quests");
  const items = useReferenceOptions("items");
  const flags = useReferenceOptions("flags");
  if (!interaction) return <Panel title="Interaction Role" subtitle="Add dialogue, quests, or trade when this character interacts with the player."><button className={`${BUTTON_CLASSES.primary} ${BUTTON_SIZES.sm}`} onClick={() => onChange(emptyInteraction(characterId))}>Add Interaction Profile</button></Panel>;
  return <Panel title="Interaction Role" subtitle="Configure the character's player-facing function."><div className="space-y-4"><SelectBadgeGroup label="Role" value={interaction.role} options={["Questgiver","Merchant","Trainer","Companion","Story","Background"]} onChange={(role) => onChange({ ...interaction, role })} /><ReferenceChipPicker label="Dialogue" value={interaction.dialogue_tree_id} reference="dialogues" onChange={(dialogue_tree_id) => onChange({ ...interaction, dialogue_tree_id })} /><MultiPicker label="Offered Quests" values={stringArray(interaction.available_quests)} options={quests} onChange={(available_quests) => onChange({ ...interaction, available_quests })} /><RowEditor title="Interaction Inventory" rows={arrayRows(interaction.inventory)} options={items} referenceKey="item_id" numberKey="price" onChange={(inventory) => onChange({ ...interaction, inventory })} /><MultiPicker label="Flags Set On Interaction" values={stringArray(interaction.flags_set_on_interaction)} options={flags} onChange={(flags_set_on_interaction) => onChange({ ...interaction, flags_set_on_interaction })} /><div><Caption>Interaction Profile Tags</Caption><EditableTagList tags={interaction.tags} onChange={(tags) => onChange({ ...interaction, tags })} /></div></div></Panel>;
}

function WorldPresencePanel({ bundle, changedEncounters, onBundleChange, onEncounterChanged }: { bundle: CharacterBundle; changedEncounters: Set<string>; onBundleChange: (next: CharacterBundle) => void; onEncounterChanged: (id: string) => void }) {
  const characters = useReferenceOptions("characters");
  const addEncounter = () => {
    const encounterId = generateUlid();
    const context = bundle.combat_profile ? "Combat" : bundle.interaction_profile ? "Interaction" : "";
    const encounterType = context === "Combat" ? "Combat" : context === "Interaction" ? "Dialogue" : "Event";
    const encounter: EntryRecord = { id: encounterId, slug: generateSlug(`${displayText(bundle.character.name, "character")} encounter`), name: `${displayText(bundle.character.name, "Character")} Encounter`, encounter_type: encounterType, participants: [{ character_id: bundle.character.id, contexts: context ? [context] : [], combat_side: context === "Combat" ? displayText(bundle.combat_profile?.aggression) === "Friendly" ? "Friendly" : "Hostile" : "Neutral" }], rewards: { xp: 0, items: [], currencies: [], reputation: [], flags_set: [] }, tags: [], __new: true };
    onBundleChange({ ...bundle, world_presence: { ...bundle.world_presence, encounters: [...bundle.world_presence.encounters, encounter] } });
    onEncounterChanged(encounterId);
  };
  const updateEncounter = (index: number, participant: EntryRecord | null) => {
    const encounters = [...bundle.world_presence.encounters];
    const encounter = encounters[index];
    if (!participant && encounter.__new) {
      encounters.splice(index, 1);
      onBundleChange({ ...bundle, world_presence: { ...bundle.world_presence, encounters } });
      return;
    }
    const others = arrayRows(encounter.participants).filter((row) => displayText(row.character_id) !== displayText(bundle.character.id));
    encounters[index] = { ...encounter, participants: participant ? [...others, participant] : others };
    onBundleChange({ ...bundle, world_presence: { ...bundle.world_presence, encounters } });
    onEncounterChanged(displayText(encounter.id));
  };
  return <Panel title="World Presence" subtitle="Place this character in encounters and review existing world links."><div className="grid gap-4 lg:grid-cols-[1.3fr_.7fr]"><div><div className="mb-2 flex items-center justify-between"><Caption>Encounter Placement</Caption><button className={`${BUTTON_CLASSES.primary} ${BUTTON_SIZES.xs}`} onClick={addEncounter}>Create Encounter</button></div><div className="grid gap-2">{bundle.world_presence.encounters.map((encounter, index) => { const participant = arrayRows(encounter.participants).find((row) => displayText(row.character_id) === displayText(bundle.character.id)); return <div key={displayText(encounter.id)} className={`rounded-md border p-3 ${changedEncounters.has(displayText(encounter.id)) ? "border-blue-400 bg-blue-50 dark:bg-blue-950" : "border-slate-200 dark:border-slate-800"}`}><div className="flex justify-between gap-2"><strong className="text-sm">{displayText(encounter.name)}</strong><Link className="text-xs text-blue-700" to={`/encounters?selected=${encodeURIComponent(displayText(encounter.id))}`}>Inspect Encounter Record</Link></div><div className="mt-2 grid gap-2 sm:grid-cols-2"><select className={inputClass} value={displayText(participant?.combat_side, "Neutral")} onChange={(event) => updateEncounter(index, { ...(participant || { character_id: bundle.character.id, contexts: ["Combat"] }), combat_side: event.target.value })}>{["Hostile","Friendly","Neutral"].map((side) => <option key={side}>{side}</option>)}</select><select className={inputClass} value={stringArray(participant?.contexts).join(",")} onChange={(event) => updateEncounter(index, { ...(participant || { character_id: bundle.character.id }), contexts: event.target.value.split(",") })}><option value="Combat">Combat</option><option value="Interaction">Interaction</option><option value="Combat,Interaction">Combat + Interaction</option></select></div><button className="mt-2 text-xs text-red-600" onClick={() => updateEncounter(index, null)}>Remove Placement</button></div>; })}{bundle.world_presence.encounters.length === 0 && <EmptyState title="No encounter appearances yet." variant="compact">That is fine while drafting identity. Create an encounter placement when this character should appear in combat, dialogue, or world events.</EmptyState>}</div></div><div className="space-y-3"><PresenceList title="Dialogues" entries={bundle.world_presence.dialogues} path="dialogues" /><PresenceList title="Shops" entries={bundle.world_presence.shops} path="shops" /><div><Caption>Other Characters</Caption><div className="text-xs text-slate-500">{characters.length} available for encounter composition in the full encounter editor.</div></div></div></div></Panel>;
}

function ComparisonPanel({ bundle }: { bundle: CharacterBundle }) {
  const characters = useReferenceOptions("characters");
  const combatProfiles = useReferenceOptions("combat_profiles");
  const interactions = useReferenceOptions("interaction_profiles");
  const encounters = useReferenceOptions("encounters");
  const [simulationDatasets, setSimulationDatasets] = useState<SimulationDatasets | null>(null);
  useEffect(() => { void loadSimulationDatasets(false).then(setSimulationDatasets); }, []);
  const combatByCharacter = new Map(combatProfiles.map((entry) => [displayText(entry.character_id), entry]));
  const interactionByCharacter = new Map(interactions.map((entry) => [displayText(entry.character_id), entry]));
  const encounterUsage = new Map<string, number>();
  encounters.forEach((encounter) => arrayRows(encounter.participants).forEach((participant) => {
    const characterId = displayText(participant.character_id);
    if (characterId) encounterUsage.set(characterId, (encounterUsage.get(characterId) || 0) + 1);
  }));
  const currentLevel = Number(bundle.character.level || 0);
  const candidates = characters.filter((entry) => displayText(entry.id) !== displayText(bundle.character.id)).sort((a, b) => {
    const aProfile = bundle.combat_profile ? combatByCharacter.get(displayText(a.id)) : interactionByCharacter.get(displayText(a.id));
    const bProfile = bundle.combat_profile ? combatByCharacter.get(displayText(b.id)) : interactionByCharacter.get(displayText(b.id));
    const matchKey = bundle.combat_profile ? "enemy_type" : "role";
    const currentValue = displayText((bundle.combat_profile || bundle.interaction_profile)?.[matchKey]);
    const matchA = displayText(aProfile?.[matchKey]) === currentValue ? 0 : 1;
    const matchB = displayText(bProfile?.[matchKey]) === currentValue ? 0 : 1;
    return matchA - matchB || Math.abs(Number(a.level || 0) - currentLevel) - Math.abs(Number(b.level || 0) - currentLevel);
  }).slice(0, 5);
  const metric = (entry: EntryRecord, profile?: EntryRecord) => {
    if (!simulationDatasets) return null;
    const profiles = profile
      ? [...simulationDatasets.combat_profiles.filter((row) => displayText(row.character_id) !== displayText(entry.id)), profile]
      : simulationDatasets.combat_profiles;
    return simulateEntity({ schemaName: "characters", entity: entry, datasets: { ...simulationDatasets, combat_profiles: profiles }, scenario: getSimulationScenarioById("duel_baseline"), runs: 100, seed: 42 }).metrics;
  };
  return <Panel title="Comparison" subtitle="Closest characters by role and level, including baseline simulation metrics."><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="text-xs uppercase text-slate-500"><th className="p-2">Character</th><th>Level</th><th>Role</th><th>Abilities</th><th>Stats</th><th>Loot</th><th>XP</th><th>Encounters</th><th>Power</th><th>Value</th></tr></thead><tbody>{candidates.map((entry) => { const profile = combatByCharacter.get(displayText(entry.id)); const interaction = interactionByCharacter.get(displayText(entry.id)); const metrics = metric(entry, profile); return <tr key={displayText(entry.id)} className="border-t border-slate-200 dark:border-slate-800"><td className="p-2 font-semibold">{rowLabel(entry, displayText(entry.id))}</td><td>{Number(entry.level || 0)}</td><td>{displayText(profile?.enemy_type, displayText(interaction?.role, "-"))}</td><td>{stringArray(profile?.custom_abilities).length}</td><td>{arrayRows(profile?.custom_stats).length}</td><td>{arrayRows(profile?.loot_table).length}</td><td>{Number(profile?.xp_reward || 0)}</td><td>{encounterUsage.get(displayText(entry.id)) || 0}</td><td>{metrics ? metrics.power.toFixed(0) : "-"}</td><td>{metrics ? metrics.value.toFixed(0) : "-"}</td></tr>; })}</tbody></table></div></Panel>;
}

function CreatorHealth({ issues }: { issues: string[] }) {
  return <Panel title="Creator Health" subtitle="Contextual checks across the complete character bundle.">{issues.length === 0 ? <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950">No creator issues found.</div> : <ul className="grid gap-2">{issues.map((issue) => <li key={issue} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950">{issue}</li>)}</ul>}</Panel>;
}

function RowEditor({ title, rows, options, referenceKey, numberKey, secondaryNumberKey, onChange }: { title: string; rows: EntryRecord[]; options: EntryRecord[]; referenceKey: string; numberKey: string; secondaryNumberKey?: string; onChange: (rows: EntryRecord[]) => void }) {
  const addRow = () => onChange([...rows, { [referenceKey]: "", [numberKey]: 0, ...(secondaryNumberKey ? { [secondaryNumberKey]: 100 } : {}) }]);
  const columns = secondaryNumberKey ? "sm:grid-cols-[1fr_110px_110px_auto]" : "sm:grid-cols-[1fr_140px_auto]";
  const reference = ({ stat_id: "stats", item_id: "items", currency_id: "currencies", faction_id: "factions" } as Record<string, string>)[referenceKey];
  return <div><div className="mb-2 flex items-center justify-between"><div><Caption>{title}</Caption>{reference && <ReferenceManageLink reference={reference} onCreated={(id) => onChange([...rows, { [referenceKey]: id, [numberKey]: 0, ...(secondaryNumberKey ? { [secondaryNumberKey]: 100 } : {}) }])} />}</div><button className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`} onClick={addRow}>Add</button></div><div className="grid gap-2">{rows.map((row, index) => <div key={index} className={`grid gap-2 ${columns}`}><select className={inputClass} value={displayText(row[referenceKey])} onChange={(event) => onChange(rows.map((item, rowIndex) => rowIndex === index ? { ...item, [referenceKey]: event.target.value } : item))}><option value="">Select</option>{options.map((option) => <option key={displayText(option.id)} value={displayText(option.id)}>{rowLabel(option, displayText(option.id))}</option>)}</select><input className={inputClass} aria-label={numberKey} type="number" value={Number(row[numberKey] || 0)} onChange={(event) => onChange(rows.map((item, rowIndex) => rowIndex === index ? { ...item, [numberKey]: Number(event.target.value) } : item))} />{secondaryNumberKey && <input className={inputClass} aria-label={secondaryNumberKey} type="number" min="0" max="100" value={Number(row[secondaryNumberKey] ?? 100)} onChange={(event) => onChange(rows.map((item, rowIndex) => rowIndex === index ? { ...item, [secondaryNumberKey]: Number(event.target.value) } : item))} />}<button className="text-xs text-red-600" onClick={() => onChange(rows.filter((_, rowIndex) => rowIndex !== index))}>Remove</button></div>)}</div></div>;
}

function MultiPicker({ label, values, options, onChange }: { label: string; values: string[]; options: EntryRecord[]; onChange: (values: string[]) => void }) {
  const reference = label.includes("Ability") ? "abilities" : label.includes("Quest") ? "quests" : label.includes("Flag") ? "flags" : "";
  return <div><Caption>{label}</Caption>{reference && <ReferenceManageLink reference={reference} onCreated={(id) => onChange(values.includes(id) ? values : [...values, id])} />}<div className="mt-1 flex flex-wrap gap-1">{options.map((option) => { const id = displayText(option.id); const active = values.includes(id); return <button key={id} className={`rounded-full border px-2 py-1 text-xs ${active ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 dark:border-slate-700"}`} onClick={() => onChange(active ? values.filter((value) => value !== id) : [...values, id])}>{rowLabel(option, id)}</button>; })}</div></div>;
}

function StatBars({ rows, labels }: { rows: EntryRecord[]; labels: Map<string, string> }) {
  const max = Math.max(1, ...rows.map((row) => Math.abs(Number(row.value || 0))));
  return <div className="grid gap-2 sm:grid-cols-2">{rows.map((row, index) => <div key={index}><div className="flex justify-between text-xs"><span>{labels.get(displayText(row.stat_id)) || displayText(row.stat_id)}</span><strong>{Number(row.value || 0)}</strong></div><div className="mt-1 h-2 rounded bg-slate-200 dark:bg-slate-800"><div className="h-2 rounded bg-violet-500" style={{ width: `${Math.max(3, Math.abs(Number(row.value || 0)) / max * 100)}%` }} /></div></div>)}</div>;
}

function InlineNumber({ label, value, step, onChange }: { label: string; value: unknown; step?: string; onChange: (value: number) => void }) {
  return <label><Caption>{label}</Caption><input className={inputClass} type="number" step={step} value={Number(value || 0)} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function PresenceList({ title, entries, path }: { title: string; entries: EntryRecord[]; path: string }) {
  return <div><Caption>{title}</Caption><div className="grid gap-1">{entries.map((entry) => <Link key={displayText(entry.id)} className="rounded-md border border-slate-200 px-3 py-2 text-sm hover:border-blue-400 dark:border-slate-800" to={`/${path}?selected=${encodeURIComponent(displayText(entry.id))}`}>{rowLabel(entry, displayText(entry.id))}</Link>)}{entries.length === 0 && <Empty>None linked.</Empty>}</div></div>;
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return <AuthoringPanel title={title} subtitle={subtitle}>{children}</AuthoringPanel>;
}
function Caption({ children }: { children: ReactNode }) { return <div className="mb-1 text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">{children}</div>; }
function Empty({ children }: { children: ReactNode }) { return <EmptyState variant="plain">{children}</EmptyState>; }
const inputClass = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";
