import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import BundleReview, { type BundleReviewResult } from "../components/authoring/BundleReview";
import {
  AUTHORING_INPUT_CLASS,
  AuthoringHealthSummary,
  AuthoringPageShell,
  AuthoringPanel as Panel,
  EmptyState,
  FieldCaption as Caption,
  NumberField,
  SelectField,
  TextAreaField as TextArea,
  TextField as Field,
  StatusNotice,
} from "../components/authoringUi";
import StoryPlacementPanel from "../components/storyPlacement/StoryPlacementPanel";
import { useDirtyState } from "../components/useDirtyState";
import { apiFetch } from "../lib/api";
import { formatApiError } from "../lib/apiErrors";
import { BUTTON_CLASSES, BUTTON_SIZES } from "../styles/uiTokens";
import type { EntryRecord } from "../types/editorQol";
import { generateSlug, generateUlid } from "../utils/generateId";
import { EditableTagList, ReferenceManageLink, displayText, isRecord, mergeReferenceOptions, rowLabel } from "../authoringViews/controls";

type CreaturePacket = {
  navigator: EntryRecord[];
  creature: EntryRecord;
  combat_profile: EntryRecord | null;
  appearances: EntryRecord[];
  habitats: { table: EntryRecord; entry: EntryRecord }[];
  catalogs: Record<string, EntryRecord[]>;
  health: { blockers: string[]; warnings: string[] };
  boss_payoff?: {
    character_occurrences: EntryRecord[];
    encounter_occurrences: EntryRecord[];
    story_warnings: EntryRecord[];
    encounters: EntryRecord[];
  };
};

const ENEMY_TYPES = ["humanoid", "beast", "undead", "elemental", "machine", "boss", "demon", "dragon", "giant", "spirit", "emanation", "other"];
const AGGRESSION = ["Hostile", "Neutral", "Friendly"];
const SIDES = ["Friendly", "Neutral", "Hostile"];
const stable = (value: unknown) => JSON.stringify(value ?? null);
const rows = (value: unknown): EntryRecord[] => Array.isArray(value) ? value.filter(isRecord) : [];
const strings = (value: unknown): string[] => Array.isArray(value) ? value.map(String).filter(Boolean) : [];

function emptyCreature(): EntryRecord {
  const id = generateUlid();
  return { id, slug: `new-creature-${id.slice(-6).toLowerCase()}`, name: "New Creature", title: "", description: "", level: 1, tags: ["creature", "enemy"] };
}

function emptyPacket(): CreaturePacket {
  return {
    navigator: [],
    creature: emptyCreature(),
    combat_profile: null,
    appearances: [],
    habitats: [],
    catalogs: { abilities: [], characterclasses: [], currencies: [], encounters: [], encounter_tables: [], factions: [], items: [], locations: [], stats: [] },
    health: { blockers: [], warnings: [] },
    boss_payoff: { character_occurrences: [], encounter_occurrences: [], story_warnings: [], encounters: [] },
  };
}

function newCombat(characterId: string): EntryRecord {
  return {
    id: generateUlid(),
    character_id: characterId,
    enemy_type: "beast",
    aggression: "Hostile",
    custom_stats: [],
    custom_abilities: [],
    status_rules: [],
    loot_table: [],
    currency_rewards: [],
    reputation_rewards: [],
    xp_reward: 0,
    related_quests: [],
    companion_config: {},
    tags: ["creature"],
  };
}

function cleanCreature(creature: EntryRecord): EntryRecord {
  const allowed = ["id", "slug", "name", "title", "description", "image_path", "level", "class_id", "faction_id", "home_location_id", "tags"];
  return Object.fromEntries(Object.entries(creature).filter(([key]) => allowed.includes(key)));
}

function cleanCombat(profile: EntryRecord | null): EntryRecord | null {
  if (!profile) return null;
  const allowed = [
    "id", "character_id", "enemy_type", "aggression", "custom_stats", "custom_abilities", "status_rules", "loot_table",
    "currency_rewards", "reputation_rewards", "xp_reward", "related_quests", "companion_config", "tags",
  ];
  return Object.fromEntries(Object.entries(profile).filter(([key]) => allowed.includes(key)));
}

function participantUsesCreature(encounter: EntryRecord, creatureId: string): boolean {
  return rows(encounter.participants).some((row) => displayText(row.character_id) === creatureId);
}

type CreatureComparison = { creature: EntryRecord; familyScore: number; nearbyScore: number; reasons: string[] };
type BehaviorRhythm = { signal: string; threat: string; response: string; consequence: string; recovery: string };
const EMPTY_RHYTHM: BehaviorRhythm = { signal: "", threat: "", response: "", consequence: "", recovery: "" };

function intersection(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  return [...new Set(left.filter((value) => rightSet.has(value)))];
}

function deriveCreatureComparisons(packet: CreaturePacket, appearances: EntryRecord[], habitats: { table: EntryRecord; entry: EntryRecord }[]): CreatureComparison[] {
  const currentId = displayText(packet.creature.id);
  const currentType = displayText(packet.combat_profile?.enemy_type);
  const currentFaction = displayText(packet.creature.faction_id);
  const currentHome = displayText(packet.creature.home_location_id);
  const currentTags = strings(packet.creature.tags).map((value) => value.toLowerCase());
  const currentAbilities = strings(packet.combat_profile?.custom_abilities);
  const currentEncounterIds = appearances.map((entry) => displayText(entry.id));
  const currentHabitatIds = habitats.map(({ table }) => displayText(table.location_id)).filter(Boolean);
  return packet.navigator.filter((candidate) => displayText(candidate.id) !== currentId).map((candidate) => {
    const sharedTags = intersection(currentTags, strings(candidate.tags).map((value) => value.toLowerCase())).filter((tag) => !["creature", "enemy"].includes(tag));
    const sharedAbilities = intersection(currentAbilities, strings(candidate.custom_abilities));
    const sharedEncounters = intersection(currentEncounterIds, strings(candidate.encounter_ids));
    const sharedHabitats = intersection(currentHabitatIds, strings(candidate.habitat_location_ids));
    let familyScore = sharedTags.length + sharedAbilities.length * 2;
    let nearbyScore = sharedEncounters.length * 3 + sharedHabitats.length * 4;
    const reasons: string[] = [];
    if (currentType && currentType === displayText(candidate.enemy_type)) { familyScore += 3; reasons.push(`same ${currentType} type`); }
    if (currentFaction && currentFaction === displayText(candidate.faction_id)) { familyScore += 2; reasons.push("same faction"); }
    if (sharedTags.length) reasons.push(`shared tags: ${sharedTags.join(", ")}`);
    if (sharedAbilities.length) reasons.push(`${sharedAbilities.length} shared abilities`);
    if (sharedEncounters.length) reasons.push(`${sharedEncounters.length} shared encounters`);
    if (sharedHabitats.length) reasons.push(`${sharedHabitats.length} shared habitats`);
    if (currentHome && currentHome === displayText(candidate.home_location_id)) { nearbyScore += 2; reasons.push("same home location"); }
    const levelGap = Math.abs(Number(packet.creature.level || 0) - Number(candidate.level || 0));
    if (levelGap <= 3) { nearbyScore += 1; reasons.push(`level gap ${levelGap}`); }
    return { creature: candidate, familyScore, nearbyScore, reasons };
  }).filter((row) => row.familyScore > 0 || row.nearbyScore > 1)
    .sort((a, b) => Math.max(b.familyScore, b.nearbyScore) - Math.max(a.familyScore, a.nearbyScore) || rowLabel(a.creature, displayText(a.creature.id)).localeCompare(rowLabel(b.creature, displayText(b.creature.id))));
}

function draftKey(id: string): string {
  return `soa.creature-workshop.${id}`;
}

export default function CreatureWorkshopPage() {
  const { id = "new" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isNew = id === "new" || location.pathname.endsWith("/new");
  const [packet, setPacket] = useState<CreaturePacket>(emptyPacket);
  const [original, setOriginal] = useState<CreaturePacket | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [review, setReview] = useState<BundleReviewResult | null>(null);
  const [reviewMutation, setReviewMutation] = useState<EntryRecord | null>(null);
  const [reviewError, setReviewError] = useState("");
  const [selectedEncounter, setSelectedEncounter] = useState("");
  const [selectedTable, setSelectedTable] = useState("");
  const dirtySource = useRef(`creature-workshop-${id}`);
  const { setDirty } = useDirtyState();

  const creatureId = displayText(packet.creature.id);
  const currentAppearances = useMemo(() => rows(packet.catalogs.encounters).filter((encounter) => participantUsesCreature(encounter, creatureId)), [creatureId, packet.catalogs.encounters]);
  const currentEncounterIds = useMemo(() => new Set(currentAppearances.map((encounter) => displayText(encounter.id))), [currentAppearances]);
  const currentHabitats = useMemo(() => rows(packet.catalogs.encounter_tables).flatMap((table) =>
    rows(table.encounter_entries)
      .filter((entry) => currentEncounterIds.has(displayText(entry.encounter_id)))
      .map((entry) => ({ table, entry }))
  ), [currentEncounterIds, packet.catalogs.encounter_tables]);
  const comparisons = useMemo(() => deriveCreatureComparisons(packet, currentAppearances, currentHabitats), [currentAppearances, currentHabitats, packet]);
  const localHealth = useMemo(() => deriveHealth(packet, currentAppearances, currentHabitats), [packet, currentAppearances, currentHabitats]);
  const dirty = Boolean(original && stable(packet) !== stable(original));

  useEffect(() => {
    const source = dirtySource.current;
    setDirty(source, dirty);
    return () => setDirty(source, false);
  }, [dirty, setDirty]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    const endpoint = isNew ? "/api/ui/creatures/new" : `/api/ui/creatures/${encodeURIComponent(id)}`;
    apiFetch(endpoint)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !isRecord(payload)) throw new Error(formatApiError(payload, "Creature Workshop failed to load."));
        const base = payload as unknown as CreaturePacket;
        const stored = localStorage.getItem(draftKey(displayText(base.creature.id)));
        let next = base;
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            if (parsed?.packet && isRecord(parsed.packet)) {
              next = parsed.packet as CreaturePacket;
              setNotice("Restored unsaved Creature Workshop draft.");
            }
          } catch {
            localStorage.removeItem(draftKey(displayText(base.creature.id)));
          }
        }
        const handoffEncounterId = searchParams.get("encounter") || "";
        const handoffRole = (searchParams.get("role") || "").trim();
        const handoffSide = SIDES.includes(searchParams.get("side") || "") ? searchParams.get("side")! : "Hostile";
        const handoffContext = searchParams.get("context") === "Interaction" ? "Interaction" : "Combat";
        if (isNew && handoffEncounterId && handoffRole && !stored) {
          const creatureId = displayText(next.creature.id);
          const handoffEncounter = rows(next.catalogs.encounters).find((encounter) => displayText(encounter.id) === handoffEncounterId);
          next = {
            ...next,
            creature: {
              ...next.creature,
              name: handoffRole.replace(/\b\w/g, (letter) => letter.toUpperCase()),
              title: `Encounter role: ${handoffRole}`,
              description: `Created to fill the ${handoffRole} role in ${rowLabel(handoffEncounter || {}, handoffEncounterId)}.`,
              tags: [...new Set([...strings(next.creature.tags), "creature", "enemy", "encounter-handoff"])]
            },
            combat_profile: handoffContext === "Combat" ? newCombat(creatureId) : next.combat_profile,
            catalogs: {
              ...next.catalogs,
              encounters: rows(next.catalogs.encounters).map((encounter) => displayText(encounter.id) === handoffEncounterId
                ? { ...encounter, participants: [...rows(encounter.participants), { character_id: creatureId, contexts: [handoffContext], combat_side: handoffSide }] }
                : encounter),
            },
          };
          setSelectedEncounter(handoffEncounterId);
          setNotice(`Staged missing role '${handoffRole}' for ${rowLabel(handoffEncounter || {}, handoffEncounterId)}.`);
        }
        if (!cancelled) {
          setPacket(next);
          setOriginal(base);
        }
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "Creature Workshop failed to load.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, isNew, searchParams]);

  useEffect(() => {
    if (!dirty || !original) return;
    const timer = window.setTimeout(() => localStorage.setItem(draftKey(creatureId), JSON.stringify({ packet, ts: Date.now() })), 300);
    return () => window.clearTimeout(timer);
  }, [creatureId, dirty, original, packet]);

  useEffect(() => {
    const refreshCatalog = (event: Event) => {
      const detail = (event as CustomEvent<{ reference?: string; data?: EntryRecord }>).detail;
      if (!detail?.reference || !detail.data || !isRecord(detail.data)) return;
      const catalogKey = detail.reference === "location_encounter_tables" ? "encounter_tables" : detail.reference;
      setPacket((current) => ({
        ...current,
        catalogs: {
          ...current.catalogs,
          [catalogKey]: mergeReferenceOptions(rows(current.catalogs[catalogKey]), [detail.data as EntryRecord]),
        },
      }));
      setOriginal((current) => current ? ({
        ...current,
        catalogs: {
          ...current.catalogs,
          [catalogKey]: mergeReferenceOptions(rows(current.catalogs[catalogKey]), [detail.data as EntryRecord]),
        },
      }) : current);
    };
    window.addEventListener("soa:reference-created", refreshCatalog as EventListener);
    return () => window.removeEventListener("soa:reference-created", refreshCatalog as EventListener);
  }, []);

  const updateCreature = (patch: EntryRecord) => setPacket((current) => ({ ...current, creature: { ...current.creature, ...patch } }));
  const updateCombat = (patch: EntryRecord) => setPacket((current) => {
    const combat = current.combat_profile || newCombat(displayText(current.creature.id));
    return { ...current, combat_profile: { ...combat, ...patch } };
  });
  const updateCatalog = (key: string, entries: EntryRecord[]) => setPacket((current) => ({ ...current, catalogs: { ...current.catalogs, [key]: entries } }));

  const mutation = (): EntryRecord => {
    const originalEncounters = new Map(rows(original?.catalogs.encounters).map((entry) => [displayText(entry.id), entry]));
    const originalTables = new Map(rows(original?.catalogs.encounter_tables).map((entry) => [displayText(entry.id), entry]));
    return {
      creature: cleanCreature(packet.creature),
      combat_profile: cleanCombat(packet.combat_profile),
      encounter_changes: rows(packet.catalogs.encounters)
        .filter((entry) => stable(entry.participants) !== stable(originalEncounters.get(displayText(entry.id))?.participants))
        .map((entry) => ({
          id: entry.id,
          expected_previous: rows(originalEncounters.get(displayText(entry.id))?.participants),
          participants: rows(entry.participants),
        })),
      encounter_table_changes: rows(packet.catalogs.encounter_tables)
        .filter((entry) => stable(entry.encounter_entries) !== stable(originalTables.get(displayText(entry.id))?.encounter_entries))
        .map((entry) => ({
          id: entry.id,
          expected_previous: rows(originalTables.get(displayText(entry.id))?.encounter_entries),
          encounter_entries: rows(entry.encounter_entries),
        })),
    };
  };

  const preview = async () => {
    const nextMutation = mutation();
    setSaving(true);
    setReviewError("");
    setNotice("");
    try {
      const response = await apiFetch("/api/ui/creatures/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextMutation),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(formatApiError(payload, "Creature Workshop preview failed."));
      setReview(payload as BundleReviewResult);
      setReviewMutation(nextMutation);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Creature Workshop preview failed.");
    } finally {
      setSaving(false);
    }
  };

  const commit = async () => {
    if (!reviewMutation) return;
    setSaving(true);
    setReviewError("");
    try {
      const response = await apiFetch("/api/ui/creatures/bundle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reviewMutation),
      });
      const payload = await response.json();
      if (!response.ok || !isRecord(payload)) throw new Error(formatApiError(payload, "Creature Workshop commit failed."));
      const next = payload.packet as unknown as CreaturePacket;
      setPacket(next);
      setOriginal(next);
      setReview(null);
      setReviewMutation(null);
      localStorage.removeItem(draftKey(creatureId));
      setNotice("Creature Workshop bundle committed.");
      if (isNew) navigate(`/author/creatures/${encodeURIComponent(displayText(next.creature.id))}`, { replace: true });
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : "Creature Workshop commit failed.");
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    if (!original) return;
    setPacket(original);
    setReview(null);
    setReviewMutation(null);
    setReviewError("");
    localStorage.removeItem(draftKey(creatureId));
    setNotice("Creature Workshop draft reset.");
  };

  if (loading) return <AuthoringPageShell><StatusNotice>Loading Creature Workshop...</StatusNotice></AuthoringPageShell>;
  if (loadError) return <AuthoringPageShell><StatusNotice tone="error" action={<button type="button" className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`} onClick={() => window.location.reload()}>Try Again</button>}>{loadError} Retry after the authoring service is available.</StatusNotice></AuthoringPageShell>;

  return (
    <AuthoringPageShell>
      <div className="space-y-4">
        <Panel
          id="creature-header"
          title={displayText(packet.creature.name, "Creature Workshop")}
          subtitle={`${displayText(packet.combat_profile?.enemy_type, "untyped")} / ${currentAppearances.length} encounters / ${currentHabitats.length} habitats`}
          help="Use this workspace to author a creature's identity, combat kit, encounter appearances, and habitat placement as one reviewed bundle. Nothing writes to the project until you commit the review."
          actions={<div className="flex gap-2"><button className={`${BUTTON_CLASSES.secondary} ${BUTTON_SIZES.sm}`} disabled={!dirty || saving} onClick={reset}>Reset Draft</button><button className={`${BUTTON_CLASSES.primary} ${BUTTON_SIZES.sm}`} disabled={saving || localHealth.blockers.length > 0 || !dirty} onClick={() => void preview()}>{saving ? "Reviewing..." : "Review Creature Bundle"}</button></div>}
        >
          <AuthoringHealthSummary dirty={dirty} saving={saving} blockers={localHealth.blockers.length} warnings={localHealth.warnings.length} />
        </Panel>
        {notice && <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200">{notice}</div>}
        <BundleReview
          result={review}
          title="Review Creature Workshop Bundle"
          description="Preview the character, combat profile, encounter, and habitat rows that will be written."
          variant="inline"
          commitLabel="Commit Creature Bundle"
          saving={saving}
          error={reviewError}
          onCancel={() => { setReview(null); setReviewMutation(null); setReviewError(""); }}
          onCommit={() => void commit()}
        />
        <div className="grid gap-4 2xl:grid-cols-[300px_1fr_360px]">
          <div className="space-y-4">
            <Navigator packet={packet} />
            <HealthPanel issues={localHealth} />
          </div>
          <div className="space-y-4">
            <IdentityPanel packet={packet} updateCreature={updateCreature} />
            <CombatPanel packet={packet} updateCombat={updateCombat} />
            <BehaviorRhythmPanel creatureId={creatureId} creatureLabel={displayText(packet.creature.name, creatureId)} />
            <EncounterPanel packet={packet} selectedEncounter={selectedEncounter} setSelectedEncounter={setSelectedEncounter} updateCatalog={updateCatalog} />
            <HabitatPanel packet={packet} appearances={currentAppearances} selectedTable={selectedTable} setSelectedTable={setSelectedTable} updateCatalog={updateCatalog} />
            {!isNew && creatureId && <StoryPlacementPanel entityKind="character" entityId={creatureId} entityLabel={displayText(packet.creature.name, creatureId)} entity={packet.creature} />}
          </div>
          <div className="space-y-4">
            <CreatureComparisonPanel comparisons={comparisons} />
            <BossPayoffPanel packet={packet} />
            <ContextPanel appearances={currentAppearances} habitats={currentHabitats} />
            <AdvancedPanel creatureId={creatureId} />
          </div>
        </div>
      </div>
    </AuthoringPageShell>
  );
}

function CreatureComparisonPanel({ comparisons }: { comparisons: CreatureComparison[] }) {
  return <Panel id="creature-comparison" title="Family And Nearby Threats" subtitle="Derived peers from combat identity, abilities, encounters, level, faction, and habitat overlap." help="Use this read-only comparison to spot repetition and ecosystem neighbors. Scores are inferred from saved records and never create family or ecology metadata." collapsible storageKey="authoring:creature:comparison" collapsedSummary={`${comparisons.length} related threats`}>
    <div className="space-y-2">
      {comparisons.slice(0, 8).map(({ creature, familyScore, nearbyScore, reasons }) => <Link key={displayText(creature.id)} to={`/author/creatures/${encodeURIComponent(displayText(creature.id))}`} className="block rounded-md border border-slate-200 bg-slate-50 p-3 hover:border-blue-300 dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-start justify-between gap-2"><div className="text-sm font-semibold">{rowLabel(creature, displayText(creature.id))}</div><div className="flex gap-1 text-[10px] font-semibold"><span className="rounded bg-violet-100 px-2 py-1 text-violet-800 dark:bg-violet-950 dark:text-violet-200">family {familyScore}</span><span className="rounded bg-amber-100 px-2 py-1 text-amber-800 dark:bg-amber-950 dark:text-amber-200">nearby {nearbyScore}</span></div></div>
        <div className="mt-1 text-xs text-slate-500">{reasons.join(" / ") || "Similar level"}</div>
      </Link>)}
      {comparisons.length === 0 && <EmptyState variant="compact" title="No inferred family or nearby threats">Add combat classification, meaningful tags, encounter placement, or habitats to make comparison evidence visible.</EmptyState>}
    </div>
  </Panel>;
}

function BehaviorRhythmPanel({ creatureId, creatureLabel }: { creatureId: string; creatureLabel: string }) {
  const storageKey = `soa.creature-rhythm.${creatureId}`;
  const [rhythm, setRhythm] = useState<BehaviorRhythm>(EMPTY_RHYTHM);
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || "null");
      setRhythm(isRecord(stored) ? { ...EMPTY_RHYTHM, ...stored } as BehaviorRhythm : EMPTY_RHYTHM);
    } catch { setRhythm(EMPTY_RHYTHM); }
  }, [storageKey]);
  useEffect(() => {
    if (Object.values(rhythm).some(Boolean)) localStorage.setItem(storageKey, JSON.stringify(rhythm));
    else localStorage.removeItem(storageKey);
  }, [rhythm, storageKey]);
  const fields: Array<[keyof BehaviorRhythm, string, string]> = [
    ["signal", "Signal", "What readable tell warns the player?"],
    ["threat", "Threat", "What pressure or attack follows?"],
    ["response", "Response Window", "What can the player do, and for how long?"],
    ["consequence", "Consequence", "What happens if the player fails or succeeds?"],
    ["recovery", "Recovery", "What opening or reset follows?"],
  ];
  const applyTemplate = (kind: "skirmisher" | "boss") => setRhythm(kind === "boss" ? {
    signal: "Distinct animation, arena cue, and audio tell.", threat: "Escalating signature attack that changes positioning.", response: "Move to safety, interrupt, or exploit the telegraphed counter.", consequence: "Heavy damage or arena-state change; successful response creates advantage.", recovery: "Clear punish window before the boss resets or transitions."
  } : {
    signal: "Brief stance or movement tell.", threat: "Fast pressure that forces repositioning.", response: "Dodge, block, interrupt, or close distance.", consequence: "Chip damage and lost position; counterplay staggers the creature.", recovery: "Short vulnerable pause before it seeks a new angle."
  });
  return <Panel id="creature-rhythm" title="Behavior Rhythm Sketch" subtitle={`Local Signal → Threat → Response → Consequence → Recovery sketch for ${creatureLabel}.`} help="This is browser-local design planning. It is deliberately excluded from the canonical creature bundle until the data model owns behavior rhythms." collapsible storageKey={`authoring:creature:${creatureId}:rhythm`} collapsedSummary={Object.values(rhythm).filter(Boolean).length ? "local rhythm drafted" : "no local rhythm"}>
    <div className="mb-3 flex flex-wrap gap-2"><button type="button" className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`} onClick={() => applyTemplate("skirmisher")}>Skirmisher Template</button><button type="button" className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`} onClick={() => applyTemplate("boss")}>Boss Template</button><button type="button" className={`${BUTTON_CLASSES.danger} ${BUTTON_SIZES.xs}`} onClick={() => setRhythm(EMPTY_RHYTHM)}>Clear Local Sketch</button></div>
    <div className="grid gap-2">{fields.map(([key, label, placeholder]) => <label key={key} className="block"><Caption>{label}</Caption><textarea className={`${AUTHORING_INPUT_CLASS} min-h-16`} value={rhythm[key]} placeholder={placeholder} onChange={(event) => setRhythm((current) => ({ ...current, [key]: event.target.value }))} /></label>)}</div>
    <div className="mt-3 rounded border border-dotted border-violet-300 px-3 py-2 text-xs text-violet-800 dark:border-violet-800 dark:text-violet-200">Local planning only — not included in preview or commit.</div>
  </Panel>;
}

function deriveHealth(packet: CreaturePacket, appearances: EntryRecord[], habitats: { table: EntryRecord; entry: EntryRecord }[]) {
  const blockers: string[] = [];
  const warnings = new Set(packet.health.warnings || []);
  const creature = packet.creature;
  const combat = packet.combat_profile;
  if (!displayText(creature.name)) blockers.push("Name is required.");
  if (!displayText(creature.slug)) blockers.push("Slug is required.");
  if (combat && !displayText(creature.class_id) && !displayText((combat.companion_config as EntryRecord | undefined)?.class_id)) warnings.add("Combat profile needs a class on the creature or companion override.");
  if (combat && strings(combat.custom_abilities).length === 0) warnings.add("Combat profile has no abilities.");
  if (combat && (rows(combat.loot_table).length || rows(combat.currency_rewards).length || rows(combat.reputation_rewards).length) && appearances.length === 0) warnings.add("Creature has rewards but no encounter placement.");
  if (appearances.length > 0 && habitats.length === 0) warnings.add("Creature appears in encounters that are not placed in a location encounter table.");
  const tags = strings(creature.tags).map((tag) => tag.toLowerCase());
  const isBoss = tags.includes("boss") || displayText(combat?.enemy_type).toLowerCase() === "boss";
  const payoff = packet.boss_payoff;
  if (isBoss && (payoff?.character_occurrences.length || 0) > 0 && appearances.length === 0) warnings.add("Story-placed boss has no encounter implementation.");
  if (isBoss && appearances.length > 0 && !(payoff?.encounters || []).some((encounter) => Boolean(encounter.has_any_payoff))) warnings.add("Boss encounters have no canonical reward or state payoff.");
  (payoff?.story_warnings || []).forEach((warning) => warnings.add(displayText(warning.message, "Boss payoff story placement needs review.")));
  return { blockers, warnings: [...warnings] };
}

function BossPayoffPanel({ packet }: { packet: CreaturePacket }) {
  const payoff = packet.boss_payoff || { character_occurrences: [], encounter_occurrences: [], story_warnings: [], encounters: [] };
  const tags = strings(packet.creature.tags).map((tag) => tag.toLowerCase());
  const isBoss = tags.includes("boss") || displayText(packet.combat_profile?.enemy_type).toLowerCase() === "boss";
  if (!isBoss) return <Panel id="creature-boss-payoff" title="Boss Payoff Trace" subtitle="Available for creatures classified as bosses." help="Tag this creature as boss or set its combat enemy type to boss when story and reward payoff coherence should be traced." collapsible defaultCollapsed storageKey="authoring:creature:boss-payoff" collapsedSummary="not classified as boss"><EmptyState variant="compact" title="Not a boss-level creature">Ordinary creatures use encounter, habitat, and loot coverage instead of a story payoff trace.</EmptyState></Panel>;
  return <Panel id="creature-boss-payoff" title="Boss Payoff Trace" subtitle="Cross-check story presence, encounter implementation, canonical rewards, and important-item journey evidence." help="This is derived from saved character and encounter story placements plus encounter rewards. Important-item warnings use the shared story-timeline coherence rules." collapsible storageKey="authoring:creature:boss-payoff" collapsedSummary={`${payoff.character_occurrences.length} story / ${payoff.encounters.length} encounters / ${payoff.story_warnings.length} warnings`}>
    <div className="grid gap-2 sm:grid-cols-3"><Fact label="Boss Story Moments" value={String(payoff.character_occurrences.length)} /><Fact label="Encounter Story Moments" value={String(payoff.encounter_occurrences.length)} /><Fact label="Payoff Warnings" value={String(payoff.story_warnings.length)} /></div>
    <div className="mt-3 space-y-2">{payoff.encounters.map((encounter) => <div key={displayText(encounter.id)} className="rounded border border-slate-200 p-3 text-xs dark:border-slate-800"><div className="font-semibold">{displayText(encounter.name, displayText(encounter.id))}</div><div className="mt-1 flex flex-wrap gap-1"><span>{encounter.story_placed ? "story placed" : "not story placed"}</span><span>·</span><span>{encounter.has_any_payoff ? "has payoff" : "no payoff"}</span><span>·</span><span>{strings(encounter.important_reward_item_ids).length} important item rewards</span></div></div>)}</div>
    {payoff.encounters.length === 0 && <EmptyState variant="compact" title="No boss encounter implementation">Place this boss into an encounter before evaluating its payoff.</EmptyState>}
    <div className="mt-3 space-y-2">{payoff.story_warnings.map((warning, index) => <Issue key={`${displayText(warning.code)}-${index}`} tone="amber">{displayText(warning.message)}</Issue>)}</div>
  </Panel>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className="rounded border border-slate-200 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-950"><div className="text-[10px] font-semibold uppercase text-slate-500">{label}</div><div className="mt-1 text-sm font-semibold">{value}</div></div>;
}

function Navigator({ packet }: { packet: CreaturePacket }) {
  const navigate = useNavigate();
  return <Panel id="creature-navigator" title="Creature Navigator" subtitle="Switch between enemy-like characters in the current project." help="Use this to change the creature being edited or begin a new creature draft. Switching records leaves the current workspace, so review unsaved changes first.">
    <select className={AUTHORING_INPUT_CLASS} value={displayText(packet.creature.id)} onChange={(event) => navigate(`/author/creatures/${encodeURIComponent(event.target.value)}`)}>
      <option value={displayText(packet.creature.id)}>{rowLabel(packet.creature, "Current Creature")}</option>
      {packet.navigator.filter((entry) => displayText(entry.id) !== displayText(packet.creature.id)).map((entry) => <option key={displayText(entry.id)} value={displayText(entry.id)}>{rowLabel(entry, displayText(entry.id))}</option>)}
    </select>
    <Link className={`${BUTTON_CLASSES.primary} ${BUTTON_SIZES.sm} mt-3 inline-flex`} to="/author/creatures/new">New Creature</Link>
  </Panel>;
}

function IdentityPanel({ packet, updateCreature }: { packet: CreaturePacket; updateCreature: (patch: EntryRecord) => void }) {
  return <Panel id="creature-identity" title="Identity And Role" subtitle="Define the creature authors and players recognize." help="Use this for the creature's name, level, classification, world anchors, and notes. Combat behavior and placement are edited in the panels below.">
    <div className="grid gap-3 md:grid-cols-2">
      <Field label="Name" value={packet.creature.name} onChange={(name) => updateCreature({ name, slug: displayText(packet.creature.slug) || generateSlug(name) })} />
      <Field label="Slug" value={packet.creature.slug} onChange={(slug) => updateCreature({ slug })} />
      <Field label="Title" value={packet.creature.title} onChange={(title) => updateCreature({ title })} />
      <NumberField label="Level" value={packet.creature.level} emptyValue="zero" onChange={(level) => updateCreature({ level })} />
      <ReferenceSelect label="Class" value={packet.creature.class_id} options={packet.catalogs.characterclasses} onChange={(class_id) => updateCreature({ class_id })} />
      <ReferenceSelect label="Home / Habitat Anchor" value={packet.creature.home_location_id} options={packet.catalogs.locations} onChange={(home_location_id) => updateCreature({ home_location_id })} />
      <ReferenceSelect label="Faction" value={packet.creature.faction_id} options={packet.catalogs.factions} onChange={(faction_id) => updateCreature({ faction_id })} />
      <div><EditableTagList tags={packet.creature.tags} onChange={(tags) => updateCreature({ tags })} /></div>
      <TextArea className="md:col-span-2" label="Creature Notes" value={packet.creature.description} onChange={(description) => updateCreature({ description })} />
    </div>
  </Panel>;
}

function CombatPanel({ packet, updateCombat }: { packet: CreaturePacket; updateCombat: (patch: EntryRecord) => void }) {
  const combat = packet.combat_profile;
  if (!combat) return <Panel id="creature-combat" title="Combat Kit" subtitle="Creature Workshop expects enemies to have a combat profile." help="Add a combat profile when this creature should participate in fights. It owns abilities, stat overrides, rewards, and combat behavior.">
    <EmptyState variant="compact" title="No combat kit yet" action={<button className={`${BUTTON_CLASSES.primary} ${BUTTON_SIZES.sm}`} onClick={() => updateCombat(newCombat(displayText(packet.creature.id)))}>Add Combat Profile</button>}>That is okay for a non-combat draft. Add one before placing this creature as a hostile encounter participant.</EmptyState>
  </Panel>;
  return <Panel id="creature-combat" title="Combat Kit" subtitle="Shape how this creature fights and what it drops." help="Use this for combat classification, abilities, stat overrides, and rewards. Encounter and habitat panels decide where the creature appears.">
    <div className="grid gap-3 md:grid-cols-2">
      <SelectField label="Enemy Type" value={combat.enemy_type} options={ENEMY_TYPES} onChange={(enemy_type) => updateCombat({ enemy_type })} />
      <SelectField label="Aggression" value={combat.aggression} options={AGGRESSION} onChange={(aggression) => updateCombat({ aggression })} />
      <NumberField label="XP Reward" value={combat.xp_reward} emptyValue="zero" onChange={(xp_reward) => updateCombat({ xp_reward })} />
      <div><EditableTagList tags={combat.tags} label="Combat Tags" onChange={(tags) => updateCombat({ tags })} /></div>
    </div>
    <MultiSelect label="Abilities" values={strings(combat.custom_abilities)} options={packet.catalogs.abilities} onChange={(custom_abilities) => updateCombat({ custom_abilities })} />
    <StatRows rows={rows(combat.custom_stats)} options={packet.catalogs.stats} onChange={(custom_stats) => updateCombat({ custom_stats })} />
    <div className="grid gap-3 xl:grid-cols-3">
      <RewardRows title="Loot" rows={rows(combat.loot_table)} options={packet.catalogs.items} referenceKey="item_id" numberKey="drop_chance" numberLabel="Drop %" onChange={(loot_table) => updateCombat({ loot_table })} />
      <RewardRows title="Currency" rows={rows(combat.currency_rewards)} options={packet.catalogs.currencies} referenceKey="currency_id" numberKey="amount" numberLabel="Amount" onChange={(currency_rewards) => updateCombat({ currency_rewards })} />
      <RewardRows title="Reputation" rows={rows(combat.reputation_rewards)} options={packet.catalogs.factions} referenceKey="faction_id" numberKey="amount" numberLabel="Delta" onChange={(reputation_rewards) => updateCombat({ reputation_rewards })} />
    </div>
  </Panel>;
}

function EncounterPanel({ packet, selectedEncounter, setSelectedEncounter, updateCatalog }: { packet: CreaturePacket; selectedEncounter: string; setSelectedEncounter: (value: string) => void; updateCatalog: (key: string, entries: EntryRecord[]) => void }) {
  const creatureId = displayText(packet.creature.id);
  const appearances = rows(packet.catalogs.encounters).filter((encounter) => participantUsesCreature(encounter, creatureId));
  const add = () => {
    if (!selectedEncounter) return;
    updateCatalog("encounters", rows(packet.catalogs.encounters).map((encounter) => {
      if (displayText(encounter.id) !== selectedEncounter || participantUsesCreature(encounter, creatureId)) return encounter;
      return { ...encounter, participants: [...rows(encounter.participants), { character_id: creatureId, contexts: ["Combat"], combat_side: "Hostile" }] };
    }));
    setSelectedEncounter("");
  };
  const updateParticipant = (encounterId: string, patch: EntryRecord) => updateCatalog("encounters", rows(packet.catalogs.encounters).map((encounter) => {
    if (displayText(encounter.id) !== encounterId) return encounter;
    return { ...encounter, participants: rows(encounter.participants).map((row) => displayText(row.character_id) === creatureId ? { ...row, ...patch } : row) };
  }));
  const remove = (encounterId: string) => updateCatalog("encounters", rows(packet.catalogs.encounters).map((encounter) => {
    if (displayText(encounter.id) !== encounterId) return encounter;
    return { ...encounter, participants: rows(encounter.participants).filter((row) => displayText(row.character_id) !== creatureId) };
  }));
  return <Panel id="creature-world" title="Encounter Appearances" subtitle="Place the creature into existing encounters as a participant." help="Use this to add or remove the creature from saved encounters and choose its side and contexts. These encounter changes stay in this bundle until review and commit.">
    <div className="space-y-2">
      {appearances.map((encounter) => {
        const participant = rows(encounter.participants).find((row) => displayText(row.character_id) === creatureId) || {};
        return <div key={displayText(encounter.id)} className="rounded border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
          <div className="mb-2 flex items-start justify-between gap-2"><div><div className="text-sm font-semibold">{rowLabel(encounter, displayText(encounter.id))}</div><div className="text-xs text-slate-500">{displayText(encounter.encounter_type, "Encounter")}</div></div><button className="text-xs font-semibold text-red-600" onClick={() => remove(displayText(encounter.id))}>Remove</button></div>
          <div className="grid gap-2 md:grid-cols-2">
            <SelectField label="Side" value={participant.combat_side} options={SIDES} onChange={(combat_side) => updateParticipant(displayText(encounter.id), { combat_side })} />
            <ContextToggle values={strings(participant.contexts)} onChange={(contexts) => updateParticipant(displayText(encounter.id), { contexts })} />
          </div>
        </div>;
      })}
      {appearances.length === 0 && <EmptyState variant="compact" title="No encounter appearances yet">That is okay while designing the creature. Add it to an encounter when it should appear in play.</EmptyState>}
    </div>
    <div className="mt-3 flex gap-2">
      <select className={AUTHORING_INPUT_CLASS} value={selectedEncounter} onChange={(event) => setSelectedEncounter(event.target.value)}>
        <option value="">Add to existing encounter...</option>
        {rows(packet.catalogs.encounters).filter((encounter) => !participantUsesCreature(encounter, creatureId)).map((encounter) => <option key={displayText(encounter.id)} value={displayText(encounter.id)}>{rowLabel(encounter, displayText(encounter.id))}</option>)}
      </select>
      <button className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.sm} whitespace-nowrap`} disabled={!selectedEncounter} onClick={add}>Add</button>
    </div>
    <Link className="mt-2 inline-flex text-xs font-medium text-blue-700 underline dark:text-blue-300" to="/author/encounters/new">Create encounter</Link>
  </Panel>;
}

function HabitatPanel({ packet, appearances, selectedTable, setSelectedTable, updateCatalog }: { packet: CreaturePacket; appearances: EntryRecord[]; selectedTable: string; setSelectedTable: (value: string) => void; updateCatalog: (key: string, entries: EntryRecord[]) => void }) {
  const [selectedAppearance, setSelectedAppearance] = useState("");
  const encounterIds = new Set(appearances.map((encounter) => displayText(encounter.id)));
  useEffect(() => {
    if (!selectedAppearance && appearances[0]) setSelectedAppearance(displayText(appearances[0].id));
  }, [appearances, selectedAppearance]);
  const habitatRows = rows(packet.catalogs.encounter_tables).flatMap((table) => rows(table.encounter_entries).map((entry, index) => ({ table, entry, index })).filter((row) => encounterIds.has(displayText(row.entry.encounter_id))));
  const add = () => {
    if (!selectedTable || !selectedAppearance) return;
    updateCatalog("encounter_tables", rows(packet.catalogs.encounter_tables).map((table) => {
      if (displayText(table.id) !== selectedTable) return table;
      if (rows(table.encounter_entries).some((entry) => displayText(entry.encounter_id) === selectedAppearance)) return table;
      return { ...table, encounter_entries: [...rows(table.encounter_entries), { encounter_id: selectedAppearance, weight: 1, spawn_group: "", min_count: 1, max_count: 1, spawn_notes: "" }] };
    }));
    setSelectedTable("");
  };
  const update = (tableId: string, index: number, patch: EntryRecord) => updateCatalog("encounter_tables", rows(packet.catalogs.encounter_tables).map((table) => {
    if (displayText(table.id) !== tableId) return table;
    return { ...table, encounter_entries: rows(table.encounter_entries).map((entry, rowIndex) => rowIndex === index ? { ...entry, ...patch } : entry) };
  }));
  const remove = (tableId: string, index: number) => updateCatalog("encounter_tables", rows(packet.catalogs.encounter_tables).map((table) => {
    if (displayText(table.id) !== tableId) return table;
    return { ...table, encounter_entries: rows(table.encounter_entries).filter((_, rowIndex) => rowIndex !== index) };
  }));
  return <Panel id="creature-habitats" title="Habitat And Spawn Tables" subtitle="Place creature encounters into location encounter tables." help="Use this after the creature appears in an encounter. Adding that encounter to a location table controls where and how often the creature can be encountered." collapsible storageKey={`authoring:creature:${displayText(packet.creature.id)}:habitats`} collapsedSummary={`${habitatRows.length} habitat placement${habitatRows.length === 1 ? "" : "s"}`}>
    <div className="space-y-2">
      {habitatRows.map(({ table, entry, index }) => <div key={`${displayText(table.id)}:${index}`} className="rounded border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
        <div className="mb-2 flex items-start justify-between gap-2"><div><div className="text-sm font-semibold">{rowLabel(table, displayText(table.id))}</div><div className="text-xs text-slate-500">{rowLabel(isRecord(table.location) ? table.location : {}, displayText(table.location_id))}</div></div><button className="text-xs font-semibold text-red-600" onClick={() => remove(displayText(table.id), index)}>Remove</button></div>
        <div className="grid gap-2 md:grid-cols-4">
          <NumberField label="Weight" value={entry.weight} emptyValue="zero" onChange={(weight) => update(displayText(table.id), index, { weight })} />
          <NumberField label="Min Count" value={entry.min_count} emptyValue="zero" onChange={(min_count) => update(displayText(table.id), index, { min_count })} />
          <NumberField label="Max Count" value={entry.max_count} emptyValue="zero" onChange={(max_count) => update(displayText(table.id), index, { max_count })} />
          <Field label="Spawn Group" value={entry.spawn_group} onChange={(spawn_group) => update(displayText(table.id), index, { spawn_group })} />
          <TextArea className="md:col-span-4" label="Spawn Notes" value={entry.spawn_notes} onChange={(spawn_notes) => update(displayText(table.id), index, { spawn_notes })} />
        </div>
      </div>)}
      {habitatRows.length === 0 && <EmptyState variant="compact" title="No habitat placements yet">First add the creature to an encounter, then place that encounter in a location table when it should spawn in the world.</EmptyState>}
    </div>
    <div className="mt-3 grid gap-2 md:grid-cols-[1fr_1fr_auto]">
      <select className={AUTHORING_INPUT_CLASS} value={selectedAppearance} onChange={(event) => setSelectedAppearance(event.target.value)}>
        <option value="">Select creature encounter...</option>
        {appearances.map((encounter) => <option key={displayText(encounter.id)} value={displayText(encounter.id)}>{rowLabel(encounter, displayText(encounter.id))}</option>)}
      </select>
      <select className={AUTHORING_INPUT_CLASS} value={selectedTable} onChange={(event) => setSelectedTable(event.target.value)}>
        <option value="">Add to encounter table...</option>
        {rows(packet.catalogs.encounter_tables).map((table) => <option key={displayText(table.id)} value={displayText(table.id)}>{rowLabel(table, displayText(table.id))}</option>)}
      </select>
      <button className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.sm}`} disabled={!selectedAppearance || !selectedTable} onClick={add}>Add</button>
    </div>
    <ReferenceManageLink reference="location_encounter_tables" onCreated={(tableId) => setSelectedTable(tableId)} />
  </Panel>;
}

function HealthPanel({ issues }: { issues: { blockers: string[]; warnings: string[] } }) {
  return <Panel id="creature-health" title="Creature Health" subtitle={`${issues.blockers.length} blockers / ${issues.warnings.length} warnings`} help="Review blockers before commit and warnings before playtesting. A warning can be acceptable for an early draft; blockers prevent a safe bundle commit." collapsible storageKey="authoring:creature:health" collapsedSummary={`${issues.blockers.length} blockers / ${issues.warnings.length} warnings`}>
    {issues.blockers.map((issue) => <Issue key={issue} tone="red">{issue}</Issue>)}
    {issues.warnings.map((issue) => <Issue key={issue} tone="amber">{issue}</Issue>)}
    {issues.blockers.length + issues.warnings.length === 0 && <EmptyState variant="compact" title="No creature health issues">The current draft passes the local creature checks. Bundle review will still validate the records before commit.</EmptyState>}
  </Panel>;
}

function ContextPanel({ appearances, habitats }: { appearances: EntryRecord[]; habitats: { table: EntryRecord; entry: EntryRecord }[] }) {
  return <Panel id="creature-context" title="Usage Summary" subtitle="Where this enemy currently participates." help="Use this read-only summary to understand the creature's current encounter and habitat reach before changing shared combat or placement details." collapsible storageKey="authoring:creature:usage" collapsedSummary={`${appearances.length} encounters / ${habitats.length} habitats`}>
    <ContextList title="Encounters" entries={appearances} />
    <div className="mt-3">
      <Caption>Habitats</Caption>
      <div className="space-y-1">{habitats.map(({ table, entry }, index) => <div key={`${displayText(table.id)}:${index}`} className="rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-800">{rowLabel(table, displayText(table.id))} / {displayText(entry.encounter_id)} / weight {displayText(entry.weight, "0")}</div>)}</div>
      {habitats.length === 0 && <EmptyState variant="compact" title="No habitat usage yet">Place one of this creature's encounters in a location table when it needs a world habitat.</EmptyState>}
    </div>
  </Panel>;
}

function AdvancedPanel({ creatureId }: { creatureId: string }) {
  return <Panel id="creature-advanced" title="Advanced Details" subtitle="Schema-complete fallback editors for uncommon fields." help="Use these technical editors only when the focused Creature Workshop does not expose a field you need. They edit the same saved records." collapsible defaultCollapsed storageKey="authoring:creature:advanced" collapsedSummary="Technical fallback editors">
    <div className="flex flex-wrap gap-2">
      <Link className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`} to={`/characters?selected=${encodeURIComponent(creatureId)}`}>Inspect Character Details</Link>
      <Link className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`} to="/combat-profiles">Inspect Combat Profiles</Link>
      <Link className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`} to="/location-encounter-tables">Inspect Encounter Tables</Link>
    </div>
  </Panel>;
}

function ContextList({ title, entries }: { title: string; entries: EntryRecord[] }) {
  return <div><Caption>{title}</Caption><div className="space-y-1">{entries.map((entry) => <div key={displayText(entry.id)} className="rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-800">{rowLabel(entry, displayText(entry.id))}</div>)}</div>{entries.length === 0 && <EmptyState variant="compact" title={`No ${title.toLowerCase()} yet`}>Add placement in the matching workspace panel when this creature should be used there.</EmptyState>}</div>;
}

function ReferenceSelect({ label, value, options, onChange }: { label: string; value: unknown; options: EntryRecord[]; onChange: (value: string) => void }) {
  return <label className="block"><Caption>{label}</Caption><select className={AUTHORING_INPUT_CLASS} value={displayText(value)} onChange={(event) => onChange(event.target.value)}><option value="">Unassigned</option>{options.map((option) => <option key={displayText(option.id)} value={displayText(option.id)}>{rowLabel(option, displayText(option.id))}</option>)}</select></label>;
}

function MultiSelect({ label, values, options, onChange }: { label: string; values: string[]; options: EntryRecord[]; onChange: (values: string[]) => void }) {
  return <div className="mt-3"><Caption>{label}</Caption><div className="flex flex-wrap gap-1">{options.map((option) => {
    const id = displayText(option.id);
    const chosen = values.includes(id);
    return <button key={id} className={`${chosen ? BUTTON_CLASSES.primary : BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`} onClick={() => onChange(chosen ? values.filter((value) => value !== id) : [...values, id])}>{rowLabel(option, id)}</button>;
  })}</div></div>;
}

function ContextToggle({ values, onChange }: { values: string[]; onChange: (values: string[]) => void }) {
  return <div><Caption>Contexts</Caption><div className="flex gap-1">{["Combat", "Interaction"].map((context) => {
    const chosen = values.includes(context);
    return <button key={context} className={`${chosen ? BUTTON_CLASSES.primary : BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`} onClick={() => onChange(chosen ? values.filter((value) => value !== context) : [...values, context])}>{context}</button>;
  })}</div></div>;
}

function StatRows({ rows: value, options, onChange }: { rows: EntryRecord[]; options: EntryRecord[]; onChange: (rows: EntryRecord[]) => void }) {
  return <div className="mt-3 rounded-md border border-slate-200 p-3 dark:border-slate-800"><Caption>Stat Overrides</Caption><div className="space-y-2">{value.map((row, index) => <div key={index} className="grid grid-cols-[1fr_100px_auto] gap-2"><select className={AUTHORING_INPUT_CLASS} value={displayText(row.stat_id)} onChange={(event) => onChange(value.map((entry, rowIndex) => rowIndex === index ? { ...entry, stat_id: event.target.value } : entry))}><option value="">Select stat</option>{options.map((option) => <option key={displayText(option.id)} value={displayText(option.id)}>{rowLabel(option, displayText(option.id))}</option>)}</select><input className={AUTHORING_INPUT_CLASS} type="number" value={Number(row.value || 0)} onChange={(event) => onChange(value.map((entry, rowIndex) => rowIndex === index ? { ...entry, value: Number(event.target.value) } : entry))} /><button className="text-xs font-semibold text-red-600" onClick={() => onChange(value.filter((_, rowIndex) => rowIndex !== index))}>Remove</button></div>)}</div><button className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs} mt-2`} onClick={() => onChange([...value, { stat_id: "", value: 0 }])}>Add Stat</button></div>;
}

function RewardRows({ title, rows: value, options, referenceKey, numberKey, numberLabel, onChange }: { title: string; rows: EntryRecord[]; options: EntryRecord[]; referenceKey: string; numberKey: string; numberLabel: string; onChange: (rows: EntryRecord[]) => void }) {
  return <div className="mt-3 rounded-md border border-slate-200 p-3 dark:border-slate-800"><Caption>{title}</Caption><div className="space-y-2">{value.map((row, index) => <div key={index} className="grid grid-cols-[1fr_100px_auto] gap-2"><select className={AUTHORING_INPUT_CLASS} value={displayText(row[referenceKey])} onChange={(event) => onChange(value.map((entry, rowIndex) => rowIndex === index ? { ...entry, [referenceKey]: event.target.value } : entry))}><option value="">Select</option>{options.map((option) => <option key={displayText(option.id)} value={displayText(option.id)}>{rowLabel(option, displayText(option.id))}</option>)}</select><input aria-label={numberLabel} className={AUTHORING_INPUT_CLASS} type="number" value={Number(row[numberKey] || 0)} onChange={(event) => onChange(value.map((entry, rowIndex) => rowIndex === index ? { ...entry, [numberKey]: Number(event.target.value) } : entry))} /><button className="text-xs font-semibold text-red-600" onClick={() => onChange(value.filter((_, rowIndex) => rowIndex !== index))}>Remove</button></div>)}</div><button className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs} mt-2`} onClick={() => onChange([...value, { [referenceKey]: "", [numberKey]: 0 }])}>Add Row</button></div>;
}

function Issue({ tone, children }: { tone: "red" | "amber"; children: ReactNode }) {
  return <div className={`mb-2 rounded border px-3 py-2 text-xs ${tone === "red" ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200" : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"}`}>{children}</div>;
}
