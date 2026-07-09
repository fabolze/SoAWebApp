import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import SchemaForm from "../components/SchemaForm";
import BundleReview, { type BundleReviewResult } from "../components/authoring/BundleReview";
import CharacterPresenceTimeline from "../components/storyPlacement/CharacterPresenceTimeline";
import StoryPlacementPanel from "../components/storyPlacement/StoryPlacementPanel";
import { useEntityStoryPlacement } from "../components/storyPlacement/useEntityStoryPlacement";
import {
  AUTHORING_INPUT_CLASS,
  AuthoringPageShell,
  AuthoringPanel as Panel,
  EmptyState,
  FieldCaption as Caption,
  NumberField,
  SelectField,
  StatusNotice,
  TextAreaField as TextArea,
  TextField as Field,
} from "../components/authoringUi";
import SimulationWorkbench from "../components/simulation/SimulationWorkbench";
import { useDirtyState } from "../components/useDirtyState";
import { apiFetch } from "../lib/api";
import type { SchemaDefinition } from "../components/schemaForm/types";
import type { EntryRecord } from "../types/editorQol";
import { BUTTON_CLASSES, BUTTON_SIZES } from "../styles/uiTokens";
import { generateSlug, generateUlid } from "../utils/generateId";
import { EditableTagList, ReferenceChipPicker, displayText, editableText, isRecord, rowLabel } from "./controls";

type StudioMode = "individual" | "ensemble";
type CanvasMode = "select" | "place" | "connect" | "sketch" | "move";
type Lens = "presence" | "story" | "social" | "combat" | "issues";
type DockTab = "dossier" | "combat" | "interaction" | "story" | "presence" | "relationships" | "health" | "pending" | "advanced";

interface GraphNode { id: string; kind: string; entry_id: string; label: string; data: EntryRecord; metadata: EntryRecord }
interface GraphEdge { id: string; source: string; target: string; relation: string; explicit: boolean; editable: boolean; path: string; metadata: EntryRecord }
interface FlagCoverageGroup { matched: { flag_id: string; paths: string[] }[]; missing: string[] }
interface FlagCoverage { beat_id: string; source: { kind: string; id: string; route: string } | null; required: FlagCoverageGroup; forbidden: FlagCoverageGroup; outputs: FlagCoverageGroup; implementation_paths: Record<string,string[]>; warnings: string[] }
interface StudioPacket {
  navigator: EntryRecord[];
  character: EntryRecord;
  combat_profile: EntryRecord | null;
  interaction_profile: EntryRecord | null;
  story_profile: EntryRecord | null;
  relationships: EntryRecord[];
  story_beats: EntryRecord[];
  world_presence: Record<string, EntryRecord[]>;
  graph: { nodes: GraphNode[]; edges: GraphEdge[] };
  catalogs: Record<string, EntryRecord[]>;
  health: { blockers: string[]; warnings: string[] };
  flag_coverage: Record<string, FlagCoverage>;
  unplaced_presence: { kind: string; entry: EntryRecord }[];
}
const RELATION_PRESETS = ["Ally", "Rival", "Mentor", "Family", "Debt", "Enemy", "Friend", "Love", "Fear", "Duty"];
const STORY_FIELDS = ["public_face", "private_truth", "want", "need", "fear", "duty", "contradiction", "secret", "voice_notes", "arc_summary", "author_notes"];
const BEAT_TYPES = ["Entrance", "Decision", "Revelation", "Conflict", "Change", "Reaction", "Exit", "Other"];
const STARTERS = [
  { label: "Standard Enemy", aggression: "Hostile", tags: ["enemy"] },
  { label: "Quest Giver", role: "Questgiver", tags: ["questgiver"] },
  { label: "Merchant", role: "Merchant", tags: ["merchant"] },
];
const draftKey = (ids: string[], mode: StudioMode) => `soa.draft.character_studio.${mode}.${[...ids].sort().join(".") || "new"}`;
const layoutKey = (id: string) => `soa.character-studio.layout.${id}`;
const stable = (value: unknown) => JSON.stringify(value ?? null);
const rows = (value: unknown): EntryRecord[] => Array.isArray(value) ? value.filter(isRecord) : [];
const strings = (value: unknown): string[] => Array.isArray(value) ? value.map(String).filter(Boolean) : [];
const active = `${BUTTON_CLASSES.primary} ${BUTTON_SIZES.xs}`;
const inactive = `${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`;

function newProfile(characterId: string): EntryRecord {
  return { id: generateUlid(), character_id: characterId, public_face: "", private_truth: "", want: "", need: "", fear: "", duty: "", contradiction: "", secret: "", voice_notes: "", arc_summary: "", author_notes: "", tags: [] };
}
function newCombat(characterId: string): EntryRecord {
  return { id: generateUlid(), character_id: characterId, enemy_type: "humanoid", aggression: "Neutral", custom_stats: [], custom_abilities: [], loot_table: [], currency_rewards: [], reputation_rewards: [], related_quests: [], companion_config: {}, tags: [] };
}
function newInteraction(characterId: string): EntryRecord {
  return { id: generateUlid(), character_id: characterId, role: "Story", dialogue_tree_id: "", available_quests: [], inventory: [], flags_set_on_interaction: [], tags: [] };
}
function sourceField(kind: string): string {
  return `${kind === "story_arc" ? "story_arc" : kind}_id`;
}
function makeBeat(characterId: string, kind?: string, entry?: EntryRecord, order = 0): EntryRecord {
  const name = entry ? rowLabel(entry, displayText(entry.id)) : "New Story Beat";
  return { id: generateUlid(), character_id: characterId, title: name, beat_type: "Other", sort_order: order, ...(kind && entry ? { [sourceField(kind)]: entry.id } : {}), summary: "", state_before: "", state_after: "", player_impact: "", world_impact: "", required_flags: [], forbidden_flags: [], expected_output_flags: [], relationship_changes: [], tags: [] };
}
function emptyPacket(): StudioPacket {
  const id=generateUlid();const character={id,slug:`new-character-${id.slice(-6).toLowerCase()}`,name:"New Character",title:"",description:"",level:1,tags:[]};
  return {navigator:[],character,combat_profile:null,interaction_profile:null,story_profile:null,relationships:[],story_beats:[],world_presence:{encounters:[],dialogues:[],dialogue_nodes:[],shops:[],quests:[],locations:[]},graph:{nodes:[],edges:[]},catalogs:{characters:[],abilities:[],quests:[],dialogues:[],dialogue_nodes:[],encounters:[],shops:[],locations:[],factions:[],characterclasses:[],events:[],story_arcs:[],flags:[]},health:{blockers:[],warnings:[]},flag_coverage:{},unplaced_presence:[]};
}

export default function CharacterStudioPage() {
  const { id = "new" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const isNew = id === "new";
  const [schema, setSchema] = useState<SchemaDefinition | null>(null);
  const [profileSchemas, setProfileSchemas] = useState<Record<string,SchemaDefinition>>({});
  const [packet, setPacket] = useState<StudioPacket | null>(null);
  const [original, setOriginal] = useState<StudioPacket | null>(null);
  const [studioMode, setStudioMode] = useState<StudioMode>("individual");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [canvasMode, setCanvasMode] = useState<CanvasMode>("select");
  const [lens, setLens] = useState<Lens>("presence");
  const [tab, setTab] = useState<DockTab>("dossier");
  const [selectedNode, setSelectedNode] = useState("");
  const [connectSource, setConnectSource] = useState("");
  const [deletions, setDeletions] = useState<Record<string, string[]>>({});
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [review, setReview] = useState<BundleReviewResult | null>(null);
  const [previewMutation, setPreviewMutation] = useState<EntryRecord | null>(null);
  const [reviewError, setReviewError] = useState("");
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [search, setSearch] = useState("");
  const [libraryKind, setLibraryKind] = useState("characters");
  const [pendingStarter, setPendingStarter] = useState<(typeof STARTERS)[number] | null>(null);
  const dirtySource = useRef(`character-studio-${id}`);
  const { setDirty } = useDirtyState();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const storyPlacement = useEntityStoryPlacement({
    entityKind: "character",
    entityId: displayText(packet?.character?.id),
    entity: packet?.character,
  });

  const dirty = Boolean(packet && original && stable({ packet, deletions }) !== stable({ packet: original, deletions: {} }));
  useEffect(() => { const source=dirtySource.current;setDirty(source,dirty);return()=>setDirty(source,false); }, [dirty, setDirty]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      import("../../../backend/app/schemas/characters.json"),
      import("../../../backend/app/schemas/combat_profiles.json"),
      import("../../../backend/app/schemas/interaction_profiles.json"),
      import("../../../backend/app/schemas/character_story_profiles.json"),
      apiFetch(`/api/ui/character-studio/${isNew ? "new" : encodeURIComponent(id)}`).then((response) => response.json()),
    ]).then(([loadedSchema,combatSchema,interactionSchema,storySchema,loaded]) => {
      if (cancelled) return;
      const base = isRecord(loaded) ? loaded as unknown as StudioPacket : emptyPacket();
      const stored = localStorage.getItem(draftKey([displayText(base.character.id)], "individual"));
      let restored = base;
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (parsed.packet) {
            restored = parsed.packet;
            setDeletions(parsed.deletions || {});
            setNotice("Restored unsaved Character Studio draft.");
          }
        } catch { /* ignore malformed drafts */ }
      }
      setSchema((loadedSchema.default || loadedSchema) as SchemaDefinition);
      setProfileSchemas({combat_profiles:(combatSchema.default||combatSchema) as SchemaDefinition,interaction_profiles:(interactionSchema.default||interactionSchema) as SchemaDefinition,character_story_profiles:(storySchema.default||storySchema) as SchemaDefinition});
      setPacket(restored);
      setOriginal(base);
      setSelectedIds([displayText(base.character.id)]);
      try { setPositions(JSON.parse(localStorage.getItem(layoutKey(displayText(base.character.id))) || "{}")); } catch { setPositions({}); }
    }).catch((error) => setNotice(error instanceof Error ? error.message : "Character Studio failed to load."))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id, isNew]);

  useEffect(() => {
    if (!packet || !original || !dirty) return;
    const timer = window.setTimeout(() => localStorage.setItem(draftKey(selectedIds, studioMode), JSON.stringify({ packet, deletions, ts: Date.now() })), 300);
    return () => window.clearTimeout(timer);
  }, [deletions, dirty, original, packet, selectedIds, studioMode]);

  useEffect(() => {
    const handoff = new URLSearchParams(location.search).get("handoff");
    if (!handoff || !packet) return;
    try {
      const value = JSON.parse(localStorage.getItem(`soa.character-studio.handoff.${handoff}`) || "null");
      if (value?.kind && value?.entry) addBeat(value.kind, value.entry);
      localStorage.removeItem(`soa.character-studio.handoff.${handoff}`);
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, packet?.character.id]);

  const update = <K extends keyof StudioPacket>(key: K, value: StudioPacket[K]) => setPacket((current) => current ? { ...current, [key]: value } : current);
  const updateCharacter = (patch: EntryRecord) => packet && update("character", { ...packet.character, ...patch });
  const addBeat = (kind?: string, entry?: EntryRecord) => packet && update("story_beats", [...packet.story_beats, makeBeat(displayText(packet.character.id), kind, entry, packet.story_beats.length)]);
  const deleteOwned = (key: "relationships" | "story_beats" | "combat_profile" | "interaction_profile" | "story_profile", row: EntryRecord) => {
    const mapKey = key;
    if (original && (key === "relationships" ? original.relationships : key === "story_beats" ? original.story_beats : [original[key]]).filter(Boolean).some((item) => displayText((item as EntryRecord).id) === displayText(row.id))) {
      setDeletions((current) => ({ ...current, [mapKey]: [...(current[mapKey] || []), displayText(row.id)] }));
    }
    if (key === "relationships") update("relationships", packet!.relationships.filter((item) => item.id !== row.id));
    else if (key === "story_beats") update("story_beats", packet!.story_beats.filter((item) => item.id !== row.id));
    else update(key, null as StudioPacket[typeof key]);
  };

  const mutation = (acceptedWarningIds: string[] = []): EntryRecord => {
    if (!packet || !original) return {};
    const originalBy = (key: string) => new Map((original.catalogs[key] || []).map((row) => [displayText(row.id), row]));
    const changedRows = (current: EntryRecord[], before: EntryRecord[]) => {
      const beforeById = new Map(before.map((row) => [displayText(row.id), row]));
      return current.filter((row) => stable(row) !== stable(beforeById.get(displayText(row.id))))
        .map((row)=>{const previous=beforeById.get(displayText(row.id));return previous?{...row,expected_previous:previous}:row;});
    };
    const presence: Record<string, EntryRecord[]> = {};
    for (const [key, field] of [["dialogues", "character_id"], ["shops", "character_id"], ["dialogue_nodes", "speaker_character_id"]] as const) {
      const before = originalBy(key);
      presence[key] = (packet.catalogs[key] || []).filter((row) => displayText(row[field]) !== displayText(before.get(displayText(row.id))?.[field]))
        .map((row) => ({ id: row.id, expected_previous: before.get(displayText(row.id))?.[field] || null, value: row[field] || null }));
    }
    const encounterBefore = originalBy("encounters");
    presence.encounters = (packet.catalogs.encounters || []).filter((row) => stable(row.participants) !== stable(encounterBefore.get(displayText(row.id))?.participants))
      .map((row) => ({ id: row.id, expected_previous: encounterBefore.get(displayText(row.id))?.participants || [], participants: row.participants || [] }));
    const questLinks: EntryRecord[] = [];
    if (packet.interaction_profile && original.interaction_profile && stable(packet.interaction_profile.available_quests) !== stable(original.interaction_profile.available_quests)) {
      questLinks.push({ character_id: packet.character.id, link_type: "offered", expected_previous: original.interaction_profile.available_quests || [], value: packet.interaction_profile.available_quests || [] });
    }
    if (packet.combat_profile && original.combat_profile && stable(packet.combat_profile.related_quests) !== stable(original.combat_profile.related_quests)) {
      questLinks.push({ character_id: packet.character.id, link_type: "combat", expected_previous: original.combat_profile.related_quests || [], value: packet.combat_profile.related_quests || [] });
    }
    return {
      mode: studioMode, selected_character_ids: selectedIds, character: studioMode === "individual" ? packet.character : undefined,
      combat_profile: studioMode === "individual" ? packet.combat_profile : undefined,
      interaction_profile: studioMode === "individual" ? packet.interaction_profile : undefined,
      story_profile: studioMode === "individual" ? packet.story_profile : undefined,
      relationships: changedRows(packet.relationships, original.relationships),
      story_beats: changedRows(packet.story_beats, original.story_beats),
      deletions, presence, quest_links: questLinks,
      accepted_warning_ids: acceptedWarningIds,
    };
  };

  const preview = async () => {
    const nextMutation = mutation();
    setSaving(true); setNotice(""); setReviewError("");
    try {
      const response = await apiFetch("/api/ui/character-studio/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(nextMutation) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Preview failed.");
      setReview(payload as BundleReviewResult);
      setPreviewMutation(nextMutation);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Preview failed."); }
    finally { setSaving(false); }
  };
  const commit = async (acceptedWarningIds: string[]) => {
    if (!previewMutation) return;
    setSaving(true); setNotice(""); setReviewError("");
    try {
      const response = await apiFetch("/api/ui/character-studio/bundle", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...previewMutation, accepted_warning_ids: acceptedWarningIds }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Commit failed.");
      const next = payload.packet || payload.packets?.[0];
      if (next) { setPacket(next); setOriginal(next); setSelectedIds(payload.result.selected_character_ids); }
      setDeletions({}); setReview(null); setPreviewMutation(null);
      localStorage.removeItem(draftKey(selectedIds, studioMode));
      setNotice("Character Studio bundle committed.");
      if (isNew && next?.character?.id) navigate(`/author/characters/${encodeURIComponent(next.character.id)}`, { replace: true });
    } catch (error) { setReviewError(error instanceof Error ? error.message : "Commit failed."); }
    finally { setSaving(false); }
  };

  const reset = () => {
    if (!original) return;
    setPacket(original); setDeletions({}); setReview(null); setPreviewMutation(null); setReviewError("");setPendingStarter(null);setTab("combat");
    localStorage.removeItem(draftKey(selectedIds, studioMode));
    setNotice("Draft reset.");
  };

  const setCatalogEntry = (kind: string, idValue: string, patch: EntryRecord) => packet && update("catalogs", { ...packet.catalogs, [kind]: (packet.catalogs[kind] || []).map((row) => displayText(row.id) === idValue ? { ...row, ...patch } : row) });
  const applyStarter=()=>{if(!packet||!pendingStarter)return;update("character",{...packet.character,tags:Array.from(new Set([...strings(packet.character.tags),...pendingStarter.tags]))});if(pendingStarter.aggression)update("combat_profile",{...(packet.combat_profile||newCombat(displayText(packet.character.id))),aggression:pendingStarter.aggression});if(pendingStarter.role)update("interaction_profile",{...(packet.interaction_profile||newInteraction(displayText(packet.character.id))),role:pendingStarter.role});setNotice(pendingStarter.aggression&&!packet.character.class_id?"Combat characters need a class before saving.":`${pendingStarter.label} defaults staged.`);setPendingStarter(null);};
  const applyDrop = (kind: string, entry: EntryRecord, target: "character" | "trace") => {
    if (!packet) return;
    if (target === "trace") { addBeat(kind.replace(/s$/, ""), entry); return; }
    if (kind === "abilities") {
      const combat = packet.combat_profile || newCombat(displayText(packet.character.id));
      update("combat_profile", { ...combat, custom_abilities: Array.from(new Set([...strings(combat.custom_abilities), displayText(entry.id)])) });
    } else if (kind === "quests") {
      const interaction = packet.interaction_profile || newInteraction(displayText(packet.character.id));
      update("interaction_profile", { ...interaction, available_quests: Array.from(new Set([...strings(interaction.available_quests), displayText(entry.id)])) });
    } else if (kind === "dialogues") setCatalogEntry("dialogues", displayText(entry.id), { character_id: packet.character.id });
    else if (kind === "shops") setCatalogEntry("shops", displayText(entry.id), { character_id: packet.character.id });
    else if (kind === "encounters") {
      const participants = rows(entry.participants).filter((row) => displayText(row.character_id) !== displayText(packet.character.id));
      setCatalogEntry("encounters", displayText(entry.id), { participants: [...participants, { character_id: packet.character.id, contexts: [packet.combat_profile ? "Combat" : "Interaction"], combat_side: "Neutral" }] });
    } else if (kind === "characters" && displayText(entry.id)!==displayText(packet.character.id)) {
      update("relationships",[...packet.relationships,{id:generateUlid(),from_character_id:packet.character.id,to_character_id:entry.id,relationship_type:"Ally",summary:"",public_stance:"",private_stance:"",trust:0,tension:0,influence:0,is_secret:false,tags:[]}]);
    } else if (kind === "factions") updateCharacter({ faction_id: entry.id });
    else if (kind === "characterclasses") updateCharacter({ class_id: entry.id });
    else if (kind === "locations") updateCharacter({ home_location_id: entry.id });
    setTab(kind === "abilities" ? "combat" : kind === "quests" ? "interaction" : "pending");
  };
  const addEmptyBeat=()=>{addBeat();setTab("story");setNotice("New story beat staged in the Presence Trace.");};
  const onDragEnd = (event: DragEndEvent) => {
    if (!event.over) return;
    const data = event.active.data.current;
    if (data?.kind && data?.entry && ["character-drop", "trace-drop"].includes(String(event.over.id))) applyDrop(data.kind, data.entry, event.over.id === "trace-drop" ? "trace" : "character");
  };

  const connectCharacter = (targetId: string) => {
    if (!packet || targetId === packet.character.id) return;
    if (!connectSource) { setConnectSource(targetId); return; }
    if (connectSource === targetId) return;
    update("relationships", [...packet.relationships, { id: generateUlid(), from_character_id: connectSource, to_character_id: targetId, relationship_type: "Ally", summary: "", public_stance: "", private_stance: "", trust: 0, tension: 0, influence: 0, is_secret: false, tags: [] }]);
    setConnectSource(""); setTab("relationships");
  };
  const createFocusedDraft = (kind: string) => {
    if (!packet) return;
    const token = generateUlid();
    const returnTo = `/author/characters/${encodeURIComponent(displayText(packet.character.id))}?handoff=${encodeURIComponent(token)}`;
    const routes: Record<string, string> = { dialogues: "/author/dialogues/new", quests: "/author/quests/new", encounters: "/author/encounters/new", abilities: "/author/abilities/new", shops: "/author/shops/new", locations: "/author/locations/new", characters: "/author/characters/new" };
    localStorage.setItem(`soa.character-studio.handoff.${token}`, JSON.stringify({ focus_character_ids: selectedIds, intended_connection: kind }));
    navigate(`${routes[kind] || `/${kind}`}?returnTo=${encodeURIComponent(returnTo)}`);
  };

  if (loading || !packet || !schema || !original) return <AuthoringPageShell><StatusNotice>Loading Character Studio...</StatusNotice></AuthoringPageShell>;
  const filteredCast = packet.navigator.filter((entry) => `${entry.name || ""} ${entry.title || ""} ${entry.interaction_role || ""}`.toLowerCase().includes(search.toLowerCase()));
  const library = packet.catalogs[libraryKind] || [];

  return <DndContext sensors={sensors} onDragEnd={onDragEnd}>
    <AuthoringPageShell>
      <div className="space-y-4">
        <Panel
          title={displayText(packet.character.name, "New Character")}
          subtitle={`${dirty ? "Unsaved staged bundle" : "Bundle saved"} / ${packet.graph.nodes.length} web nodes / ${packet.story_beats.length} beats`}
          help="Use Character Studio to shape identity, story profile, combat/interaction roles, relationships, and presence beats as one staged bundle. Review opens the bundle preview before records are committed."
          actions={<div className="flex flex-wrap gap-2"><button className={studioMode === "individual" ? active : inactive} onClick={() => { setStudioMode("individual"); setSelectedIds([displayText(packet.character.id)]); }}>Individual</button><button className={studioMode === "ensemble" ? active : inactive} onClick={() => setStudioMode("ensemble")}>Ensemble</button><button className={inactive} disabled={!dirty || saving} onClick={reset}>Reset Draft</button><button className={active} disabled={!dirty || saving || Boolean(packet.combat_profile&&!packet.character.class_id)} onClick={() => void preview()}>Review Character Bundle</button></div>}
        >
          <div className="text-xs font-semibold uppercase text-violet-600">Character Studio</div>
          {notice && <div className="mt-3"><StatusNotice>{notice}</StatusNotice></div>}
        </Panel>
        <Panel title="Create This Character" help="These steps are shortcuts into the main authoring areas. They do not save automatically; they stage changes for the bundle review."><div className="grid gap-2 md:grid-cols-5"><QuickStep number="1" label="Identity" detail="Name, class, faction, home" done={Boolean(packet.character.name&&packet.character.class_id)} onClick={()=>setTab("dossier")}/><QuickStep number="2" label="Story Core" detail="Want, need, fear, secret" done={Boolean(packet.story_profile)} onClick={()=>{if(!packet.story_profile)update("story_profile",newProfile(displayText(packet.character.id)));setTab("story");}}/><QuickStep number="3" label="Role" detail="Combat or interaction profile" done={Boolean(packet.combat_profile||packet.interaction_profile)} onClick={()=>setTab(packet.combat_profile?"combat":"interaction")}/><QuickStep number="4" label="Story Beats" detail="Add entrances, decisions, changes" done={packet.story_beats.length>0} onClick={addEmptyBeat}/><QuickStep number="5" label="Review" detail="Inspect and commit staged work" done={!dirty} onClick={()=>setTab("pending")}/></div><p className="mt-3 text-xs text-slate-500">Everything is staged locally first. Use the visible Add buttons or drag existing content onto the character web. Review Character Bundle opens a complete bundle review before committing.</p></Panel>
        <div className="grid gap-4 xl:grid-cols-[280px_minmax(680px,1fr)_390px]">
          <aside className="space-y-4"><Panel title="Cast Navigator" help="Use this to switch the focused character, or select multiple characters when working in ensemble mode."><input className={AUTHORING_INPUT_CLASS} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search cast" /><div className="mt-2 max-h-72 space-y-1 overflow-auto">{filteredCast.map((entry) => { const idValue = displayText(entry.id); const chosen = selectedIds.includes(idValue); return <button key={idValue} className={`flex w-full items-center justify-between rounded border px-2 py-2 text-left text-xs ${chosen ? "border-violet-500 bg-violet-50 dark:bg-violet-950" : "border-slate-200 dark:border-slate-800"}`} onClick={() => { if (studioMode === "ensemble") setSelectedIds((current) => chosen ? current.filter((value) => value !== idValue) : current.length < 8 ? [...current, idValue] : current); else if (idValue !== packet.character.id) navigate(`/author/characters/${encodeURIComponent(idValue)}`); }}><span>{rowLabel(entry, idValue)}</span><span>{displayText(entry.encounter_count, "0")}E/{displayText(entry.dialogue_count, "0")}D</span></button>; })}{filteredCast.length===0&&<EmptyState variant="compact" title="No matching cast members.">Adjust the search or create another character before using ensemble mode.</EmptyState>}</div></Panel><Panel title="Starters" help="Starter presets fill common combat or interaction defaults. They stage changes locally and still require bundle review."><div className="flex flex-wrap gap-1">{STARTERS.map((starter)=><button key={starter.label} className={inactive} onClick={()=>setPendingStarter(starter)}>{starter.label}</button>)}</div>{pendingStarter&&<div className="mt-2 rounded border border-blue-200 p-2 text-xs"><div>Apply <strong>{pendingStarter.label}</strong> defaults?</div><div className="mt-2 flex gap-2"><button className={inactive} onClick={()=>setPendingStarter(null)}>Cancel</button><button className={active} onClick={applyStarter}>Apply Defaults</button></div></div>}</Panel>
          <Panel title="Content Library" help="Drag saved content onto the character web or presence trace to stage connections. Create New opens the relevant authoring page for missing content."><select className={AUTHORING_INPUT_CLASS} value={libraryKind} onChange={(event) => setLibraryKind(event.target.value)}>{["characters","abilities","quests","dialogues","encounters","shops","factions","characterclasses","locations","events","story_arcs"].map((kind) => <option key={kind}>{kind}</option>)}</select><p className="mt-2 text-xs text-slate-500">Use Connect to stage a sensible default connection, Add Beat to place content in the story, or drag it onto the canvas.</p><div className="mt-2 max-h-80 space-y-1 overflow-auto">{library.map((entry) => <DraggableCard key={displayText(entry.id)} kind={libraryKind} entry={entry} onAdd={["characters","abilities","quests","dialogues","encounters","shops","factions","characterclasses","locations"].includes(libraryKind)?()=>applyDrop(libraryKind,entry,"character"):undefined} onBeat={()=>applyDrop(libraryKind,entry,"trace")} />)}{library.length===0&&<EmptyState variant="compact" title={`No ${libraryKind.replace(/_/g," ")} exist yet.`}>Create one, then return to connect it to this character.</EmptyState>}</div><button className={`${active} mt-2 w-full`} onClick={() => createFocusedDraft(libraryKind)}>Create New {libraryKind.replace(/_/g," ")}</button></Panel></aside>
          <main className="space-y-4">
            <section className="overflow-hidden rounded-md border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"><div className="border-b border-slate-200 p-3 dark:border-slate-800"><div className="flex flex-wrap justify-between gap-2"><div className="flex flex-wrap gap-1">{(["select","place","connect","sketch","move"] as CanvasMode[]).map((value) => <button key={value} className={canvasMode === value ? active : inactive} onClick={() => { setCanvasMode(value); setConnectSource(""); }}>{value[0].toUpperCase()+value.slice(1)}</button>)}</div><div className="flex flex-wrap gap-1">{(["presence","story","social","combat","issues"] as Lens[]).map((value) => <button key={value} className={lens === value ? active : inactive} onClick={() => setLens(value)}>{value[0].toUpperCase()+value.slice(1)}</button>)}</div></div><p className="mt-2 text-xs text-slate-500">{canvasMode === "connect" ? "Select two character nodes to stage a directed relationship." : canvasMode === "sketch" ? "Use Story Profile cards in the dock to sketch the character's creative core." : "Drag library content onto the center character or Presence Trace."}</p></div>
              <CharacterWeb packet={packet} lens={lens} mode={canvasMode} positions={positions} setPositions={(next) => { setPositions(next); localStorage.setItem(layoutKey(displayText(packet.character.id)), JSON.stringify(next)); }} selectedNode={selectedNode} setSelectedNode={setSelectedNode} connectSource={connectSource} onConnect={connectCharacter} />
            </section>
            <PresenceTrace packet={packet} onChange={(story_beats) => update("story_beats", story_beats)} onDelete={(beat) => deleteOwned("story_beats", beat)} />
            <StoryPlacementPanel entityKind="character" entityId={displayText(packet.character.id)} entityLabel={displayText(packet.character.name, displayText(packet.character.id, "This character"))} entity={packet.character} enableCharacterConsequenceActions storyPacket={storyPlacement.packet} onStoryPacketChange={storyPlacement.setPacket} />
          </main>
          <aside><Panel title="Context Dock" help="Use the dock to edit the selected authoring area without leaving the character web. Advanced exposes the full schema fallback for the same staged records."><div className="mb-3 flex flex-wrap gap-1">{(["dossier","combat","interaction","story","presence","relationships","health","pending","advanced"] as DockTab[]).map((value) => <button key={value} className={tab === value ? active : inactive} onClick={() => setTab(value)}>{value === "story" ? "Story Profile" : value[0].toUpperCase()+value.slice(1)}</button>)}</div>
            {tab === "dossier" && <Dossier packet={packet} updateCharacter={updateCharacter} />}
            {tab === "combat" && <CombatDock packet={packet} onAdvanced={()=>setTab("advanced")} onChange={(value) => update("combat_profile", value)} onDelete={() => packet.combat_profile && deleteOwned("combat_profile", packet.combat_profile)} />}
            {tab === "interaction" && <InteractionDock packet={packet} onAdvanced={()=>setTab("advanced")} onChange={(value) => update("interaction_profile", value)} onDelete={() => packet.interaction_profile && deleteOwned("interaction_profile", packet.interaction_profile)} />}
            {tab === "story" && <StoryDock packet={packet} onChange={(value) => update("story_profile", value)} onDelete={() => packet.story_profile && deleteOwned("story_profile", packet.story_profile)} />}
            {tab === "presence" && (storyPlacement.loading ? <div className="text-xs text-slate-500">Loading story placements...</div> : storyPlacement.error ? <Issue tone="amber">{storyPlacement.error}</Issue> : <CharacterPresenceTimeline characterId={displayText(packet.character.id)} characterLabel={displayText(packet.character.name, displayText(packet.character.id, "This character"))} characterPacket={packet as unknown as EntryRecord} storyPacket={storyPlacement.packet} storyContext={storyPlacement.context} />)}
            {tab === "relationships" && <RelationshipsDock packet={packet} selectedIds={selectedIds} onChange={(value) => update("relationships", value)} onDelete={(row) => deleteOwned("relationships", row)} />}
            {tab === "health" && <HealthDock packet={packet} />}
            {tab === "pending" && <PendingDock mutation={mutation()} deletions={deletions} />}
            {tab === "advanced" && <div className="space-y-5"><div><Caption>Character</Caption><SchemaForm schema={schema} schemaName="characters" data={packet.character} onChange={(next) => update("character", next)} /></div>{packet.combat_profile&&profileSchemas.combat_profiles&&<div><Caption>Combat Profile</Caption><SchemaForm schema={profileSchemas.combat_profiles} schemaName="combat_profiles" data={packet.combat_profile} onChange={(next)=>update("combat_profile",next)}/></div>}{packet.interaction_profile&&profileSchemas.interaction_profiles&&<div><Caption>Interaction Profile</Caption><SchemaForm schema={profileSchemas.interaction_profiles} schemaName="interaction_profiles" data={packet.interaction_profile} onChange={(next)=>update("interaction_profile",next)}/></div>}{packet.story_profile&&profileSchemas.character_story_profiles&&<div><Caption>Story Profile</Caption><SchemaForm schema={profileSchemas.character_story_profiles} schemaName="character_story_profiles" data={packet.story_profile} onChange={(next)=>update("story_profile",next)}/></div>}</div>}
          </Panel></aside>
        </div>
      </div>
      {review && <BundleReview result={review} title="Character Bundle Review" description="Character records, narrative records, and presence changes will commit atomically." variant="modal" commitLabel="Commit Bundle" saving={saving} error={reviewError} warningAcknowledgement="required" onCancel={() => { setReview(null); setPreviewMutation(null); setReviewError(""); }} onCommit={(acceptedWarningIds) => void commit(acceptedWarningIds)} />}
    </AuthoringPageShell>
  </DndContext>;
}

function CharacterWeb({ packet, lens, mode, positions, setPositions, selectedNode, setSelectedNode, connectSource, onConnect }: { packet: StudioPacket; lens: Lens; mode: CanvasMode; positions: Record<string,{x:number;y:number}>; setPositions: (next: Record<string,{x:number;y:number}>) => void; selectedNode: string; setSelectedNode: (id:string)=>void; connectSource:string; onConnect:(id:string)=>void }) {
  const drop = useDroppable({ id: "character-drop" });
  const visible = packet.graph.nodes.filter((node) => lens === "presence" ? ["character","encounter","dialogue","shop","quest","location"].includes(node.kind) : lens === "story" ? ["character","story_beat","quest","dialogue","event","story_arc","location"].includes(node.kind) : lens === "social" ? ["character","faction","location"].includes(node.kind) : lens === "combat" ? ["character","class","ability","encounter","quest"].includes(node.kind) : true);
  const byId = new Map(visible.map((node) => [node.id,node]));
  const arranged = Object.fromEntries(visible.map((node,index) => [node.id, positions[node.id] || (node.kind === "character" && node.entry_id === packet.character.id ? {x:50,y:50} : {x:50+38*Math.cos(index/Math.max(1,visible.length-1)*Math.PI*2),y:50+38*Math.sin(index/Math.max(1,visible.length-1)*Math.PI*2)})]));
  const move = (id:string) => { if (mode !== "move") return; const current=arranged[id]; setPositions({...positions,[id]:{x:Math.max(8,Math.min(92,current.x+7)),y:Math.max(8,Math.min(92,current.y+5))}}); };
  return <div ref={drop.setNodeRef} data-testid="character-web" className={`relative h-[680px] overflow-hidden bg-slate-50 dark:bg-slate-950 ${drop.isOver ? "ring-4 ring-violet-300" : ""}`}><div className="absolute inset-0 bg-[radial-gradient(circle,rgba(139,92,246,.12)_1px,transparent_1px)] bg-[size:32px_32px]" />{lens==="issues"&&<div className="absolute left-3 top-3 z-10 max-h-40 w-80 space-y-1 overflow-auto rounded border border-amber-300 bg-amber-50/95 p-2 text-[10px] text-amber-900">{packet.health.warnings.map((warning)=><div key={warning}>{warning}</div>)}{packet.health.warnings.length===0&&<div>No warnings found.</div>}</div>}<svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">{packet.graph.edges.filter((edge)=>byId.has(edge.source)&&byId.has(edge.target)).map((edge)=><line key={edge.id} x1={arranged[edge.source].x} y1={arranged[edge.source].y} x2={arranged[edge.target].x} y2={arranged[edge.target].y} vectorEffect="non-scaling-stroke" strokeWidth={edge.explicit?2:1} strokeDasharray={edge.explicit?undefined:"5 4"} className={edge.explicit?"stroke-violet-500":"stroke-slate-400"} />)}</svg>{visible.map((node)=>{const p=arranged[node.id];const center=node.kind==="character"&&node.entry_id===packet.character.id;return <button key={node.id} type="button" data-testid={`character-web-node-${node.id}`} className={`absolute max-w-[150px] -translate-x-1/2 -translate-y-1/2 rounded-full border px-3 py-2 text-xs font-semibold shadow ${center?"border-violet-700 bg-violet-700 text-white":selectedNode===node.id||connectSource===node.entry_id?"border-blue-600 bg-blue-50 dark:bg-blue-950":"border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900"}`} style={{left:`${p.x}%`,top:`${p.y}%`}} onClick={()=>{if(mode==="connect"&&node.kind==="character")onConnect(node.entry_id);else if(mode==="move")move(node.id);else setSelectedNode(node.id)}}><span className="block text-[9px] uppercase opacity-70">{node.kind}</span>{node.label}</button>})}</div>;
}
function DraggableCard({ kind, entry, onAdd, onBeat }: { kind:string; entry:EntryRecord;onAdd?:()=>void;onBeat?:()=>void }) { const drag=useDraggable({id:`library:${kind}:${entry.id}`,data:{kind,entry}}); return <div className="rounded border border-slate-200 p-2 text-xs dark:border-slate-800"><button ref={drag.setNodeRef} {...drag.attributes} {...drag.listeners} className="block w-full cursor-grab text-left font-semibold">{rowLabel(entry,displayText(entry.id))}</button>{(onAdd||onBeat)&&<div className="mt-2 flex gap-1">{onAdd&&<button className={inactive} onClick={onAdd}>Connect</button>}{onBeat&&<button className={inactive} onClick={onBeat}>Add Beat</button>}</div>}</div>; }
function PresenceTrace({ packet, onChange, onDelete }: {packet:StudioPacket;onChange:(rows:EntryRecord[])=>void;onDelete:(row:EntryRecord)=>void}) {
  const drop=useDroppable({id:"trace-drop"});const sensors=useSensors(useSensor(PointerSensor));const ordered=[...packet.story_beats].sort((a,b)=>Number(a.sort_order)-Number(b.sort_order));const [cursor,setCursor]=useState(-1);const [editing,setEditing]=useState("");
  const relationshipState=new Map(packet.relationships.map((row)=>[displayText(row.id),{...row}]));
  ordered.slice(0,cursor+1).forEach((beat)=>rows(beat.relationship_changes).forEach((change)=>{const current=relationshipState.get(displayText(change.relationship_id));if(current)relationshipState.set(displayText(change.relationship_id),{...current,...change});}));
  const selected=ordered.find((beat)=>displayText(beat.id)===editing);const patch=(value:EntryRecord)=>onChange(packet.story_beats.map((beat)=>displayText(beat.id)===editing?{...beat,...value}:beat));
  const coverage=selected?(packet.flag_coverage||{})[displayText(selected.id)]:undefined;
  return <Panel title="Presence Trace" help="Use this to order the character's story milestones and describe expected state before and after each beat. Drag connected content here to turn it into a beat."><div className="mb-3 flex items-center justify-between gap-2"><p className="text-xs text-slate-500">Write and order milestones, then describe the runtime flags expected before and after each beat.</p><button className={active} onClick={()=>{const beat=makeBeat(displayText(packet.character.id),undefined,undefined,packet.story_beats.length);onChange([...packet.story_beats,beat]);setEditing(displayText(beat.id));}}>Add Story Beat</button></div><div ref={drop.setNodeRef} data-testid="presence-trace" className={`rounded border border-dashed p-3 ${drop.isOver?"border-violet-500 bg-violet-50 dark:bg-violet-950":"border-slate-300 dark:border-slate-700"}`}><DndContext sensors={sensors} onDragEnd={(event)=>{if(!event.over)return;const old=ordered.findIndex((r)=>r.id===event.active.id);const next=ordered.findIndex((r)=>r.id===event.over?.id);if(old<0||next<0)return;onChange(arrayMove(ordered,old,next).map((row,index)=>({...row,sort_order:index})));}}><SortableContext items={ordered.map((row)=>displayText(row.id))} strategy={horizontalListSortingStrategy}><div className="flex min-h-24 gap-2 overflow-x-auto">{ordered.map((beat,index)=><SortableBeat key={displayText(beat.id)} beat={beat} active={cursor===index} onEdit={()=>setEditing(displayText(beat.id))} onPlay={()=>setCursor(index)} onDelete={()=>onDelete(beat)} />)}{ordered.length===0&&<EmptyState variant="compact" title="No story beats yet.">Use Add Story Beat or add existing content from the library when this character needs a visible story milestone.</EmptyState>}</div></SortableContext></DndContext>{packet.unplaced_presence.length>0&&<div className="mt-3"><Caption>Connected Content Without A Beat</Caption><div className="flex gap-2 overflow-x-auto">{packet.unplaced_presence.map(({kind,entry})=><DraggableCard key={`${kind}:${entry.id}`} kind={`${kind}s`} entry={entry} onBeat={()=>onChange([...packet.story_beats,makeBeat(displayText(packet.character.id),kind,entry,packet.story_beats.length)])}/>)}</div></div>}{selected&&<div className="mt-3 grid gap-3 rounded border border-violet-200 bg-violet-50 p-3 dark:border-violet-900 dark:bg-violet-950 md:grid-cols-2"><Field label="Beat Title" value={selected.title} onChange={(title)=>patch({title})}/><SelectField label="Beat Type" value={selected.beat_type} options={BEAT_TYPES} onChange={(beat_type)=>patch({beat_type})}/><div className="md:col-span-2"><TextArea label="Summary" value={selected.summary} onChange={(summary)=>patch({summary})}/></div><TextArea label="State Before" value={selected.state_before} onChange={(state_before)=>patch({state_before})}/><TextArea label="State After" value={selected.state_after} onChange={(state_after)=>patch({state_after})}/><TextArea label="Player Impact" value={selected.player_impact} onChange={(player_impact)=>patch({player_impact})}/><TextArea label="World Impact" value={selected.world_impact} onChange={(world_impact)=>patch({world_impact})}/><div className="md:col-span-2 grid gap-3 rounded border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 md:grid-cols-3"><FlagFlowPicker label="Required Before" values={strings(selected.required_flags)} options={packet.catalogs.flags||[]} coverage={coverage?.required} onChange={(required_flags)=>patch({required_flags})}/><FlagFlowPicker label="Must Not Be True" values={strings(selected.forbidden_flags)} options={packet.catalogs.flags||[]} coverage={coverage?.forbidden} onChange={(forbidden_flags)=>patch({forbidden_flags})}/><FlagFlowPicker label="Expected After" values={strings(selected.expected_output_flags)} options={packet.catalogs.flags||[]} coverage={coverage?.outputs} onChange={(expected_output_flags)=>patch({expected_output_flags})}/><div className="md:col-span-3 text-xs text-slate-500">{coverage?.source?<Link className="text-blue-700 underline" to={coverage.source.route}>Inspect Linked {coverage.source.kind} Source</Link>:"Link a quest, dialogue, encounter, event, location, or story arc to check implementation coverage."}{coverage?.warnings.map((warning)=><Issue key={warning} tone="amber">{warning}</Issue>)}</div></div></div>}{cursor>=0&&<div className="mt-3 rounded border border-blue-200 bg-blue-50 p-2 text-xs dark:border-blue-900 dark:bg-blue-950"><div className="font-semibold">Authoring preview after: {displayText(ordered[cursor]?.title)}</div>{[...relationshipState.values()].map((row)=><div key={displayText(row.id)} className="mt-1">{displayText(row.relationship_type)}: trust {displayText(row.trust,"0")}, tension {displayText(row.tension,"0")}, influence {displayText(row.influence,"0")}</div>)}{relationshipState.size===0&&<div className="mt-1 text-slate-500">No relationship state to preview.</div>}</div>}</div></Panel>;
}
function SortableBeat({beat,active,onEdit,onPlay,onDelete}:{beat:EntryRecord;active:boolean;onEdit:()=>void;onPlay:()=>void;onDelete:()=>void}){const s=useSortable({id:displayText(beat.id)});return <div ref={s.setNodeRef} style={{transform:CSS.Transform.toString(s.transform),transition:s.transition}} className={`min-w-56 rounded border bg-white p-2 text-xs dark:bg-slate-900 ${active?"border-blue-600 ring-2 ring-blue-200":"border-violet-300"}`}><div className="mb-2 flex items-center gap-1 text-[10px]"><span className="rounded bg-amber-100 px-1 text-amber-800">{strings(beat.required_flags).length+strings(beat.forbidden_flags).length} inputs</span><span>→</span><span className="font-semibold">{displayText(beat.beat_type)}</span><span>→</span><span className="rounded bg-emerald-100 px-1 text-emerald-800">{strings(beat.expected_output_flags).length} outputs</span></div><button className="w-full cursor-grab text-left font-semibold" {...s.attributes} {...s.listeners}>{displayText(beat.title)}</button><div className="mt-2 flex flex-wrap gap-2"><button className="text-violet-700" onClick={onEdit}>Edit</button><button className="text-blue-700" onClick={onPlay}>Preview</button><button className="text-red-600" onClick={onDelete}>Remove</button></div></div>}

function Dossier({packet,updateCharacter}:{packet:StudioPacket;updateCharacter:(patch:EntryRecord)=>void}){return <div className="space-y-3"><p className="rounded border border-blue-200 bg-blue-50 p-2 text-xs text-blue-800 dark:border-blue-900 dark:bg-blue-950">Start here. References can only select records that already exist; use the create links when the project has none.</p><Field label="Name" value={packet.character.name} onChange={(name)=>updateCharacter({name,slug:displayText(packet.character.slug)||generateSlug(name)})}/><Field label="Title" value={packet.character.title} onChange={(title)=>updateCharacter({title})}/><Field label="Slug" value={packet.character.slug} onChange={(slug)=>updateCharacter({slug})}/><NumberField label="Level" value={packet.character.level} emptyValue="zero" onChange={(level)=>updateCharacter({level})}/><TextArea label="Bio / Notes" value={packet.character.description} onChange={(description)=>updateCharacter({description})}/><ReferenceChipPicker label="Class" reference="characterclasses" value={packet.character.class_id} onChange={(class_id)=>updateCharacter({class_id})}/><ReferenceChipPicker label="Faction" reference="factions" value={packet.character.faction_id} onChange={(faction_id)=>updateCharacter({faction_id})}/><ReferenceChipPicker label="Home" reference="locations" value={packet.character.home_location_id} onChange={(home_location_id)=>updateCharacter({home_location_id})}/><div className="flex flex-wrap gap-2 text-xs"><Link className="text-blue-700 underline" to="/characterclasses">Create class</Link><Link className="text-blue-700 underline" to="/factions">Create faction</Link><Link className="text-blue-700 underline" to="/author/locations/new">Create location</Link></div><EditableTagList tags={packet.character.tags} onChange={(tags)=>updateCharacter({tags})}/></div>}
function CombatDock({packet,onAdvanced,onChange,onDelete}:{packet:StudioPacket;onAdvanced:()=>void;onChange:(value:EntryRecord|null)=>void;onDelete:()=>void}){const profile=packet.combat_profile;if(!profile)return <div><p className="mb-2 text-xs text-slate-500">Add this only if the character fights, can become a companion, or grants combat rewards.</p><button className={active} onClick={()=>onChange(newCombat(displayText(packet.character.id)))}>Add Combat Profile</button></div>;return <div className="space-y-3"><SelectField label="Aggression" value={profile.aggression} options={["Hostile","Neutral","Friendly"]} onChange={(aggression)=>onChange({...profile,aggression})}/><SelectField label="Enemy Type" value={profile.enemy_type} options={["humanoid","beast","undead","elemental","machine","boss","other"]} onChange={(enemy_type)=>onChange({...profile,enemy_type})}/><ChipPicker label="Abilities" values={strings(profile.custom_abilities)} options={packet.catalogs.abilities} onChange={(custom_abilities)=>onChange({...profile,custom_abilities})}/><ChipPicker label="Combat-Related Quests" values={strings(profile.related_quests)} options={packet.catalogs.quests} onChange={(related_quests)=>onChange({...profile,related_quests})}/><button className={`${inactive} w-full`} onClick={onAdvanced}>Edit Stats, Loot, Rewards, Companion Data, And All Fields</button><button className="text-xs text-red-600" onClick={onDelete}>Delete Combat Profile On Save</button><details><summary className="cursor-pointer text-xs font-semibold">Simulation</summary><SimulationWorkbench fixedSchemaName="characters" draftEntity={packet.character} datasetOverlays={{combat_profiles:[profile]}} title="Character Simulation"/></details></div>}
function InteractionDock({packet,onAdvanced,onChange,onDelete}:{packet:StudioPacket;onAdvanced:()=>void;onChange:(value:EntryRecord|null)=>void;onDelete:()=>void}){const profile=packet.interaction_profile;if(!profile)return <div><p className="mb-2 text-xs text-slate-500">Add this when the player can talk to, trade with, recruit, or receive quests from the character.</p><button className={active} onClick={()=>onChange(newInteraction(displayText(packet.character.id)))}>Add Interaction Profile</button></div>;return <div className="space-y-3"><SelectField label="Role" value={profile.role} options={["Questgiver","Merchant","Trainer","Companion","Story","Background"]} onChange={(role)=>onChange({...profile,role})}/><ChipPicker label="Offered Quests" values={strings(profile.available_quests)} options={packet.catalogs.quests} onChange={(available_quests)=>onChange({...profile,available_quests})}/><ReferenceChipPicker label="Primary Dialogue" reference="dialogues" value={profile.dialogue_tree_id} onChange={(dialogue_tree_id)=>onChange({...profile,dialogue_tree_id})}/><button className={`${inactive} w-full`} onClick={onAdvanced}>Edit Inventory, Interaction Flags, Tags, And All Fields</button><button className="text-xs text-red-600" onClick={onDelete}>Delete Interaction Profile On Save</button></div>}
function StoryDock({packet,onChange,onDelete}:{packet:StudioPacket;onChange:(value:EntryRecord|null)=>void;onDelete:()=>void}){const profile=packet.story_profile;if(!profile)return <button className={active} onClick={()=>onChange(newProfile(displayText(packet.character.id)))}>Add Story Profile</button>;return <div className="space-y-3">{STORY_FIELDS.map((key)=><TextArea key={key} label={key.replace(/_/g," ")} value={profile[key]} onChange={(value)=>onChange({...profile,[key]:value})}/>) }<EditableTagList tags={profile.tags} onChange={(tags)=>onChange({...profile,tags})}/><button className="text-xs text-red-600" onClick={onDelete}>Delete Story Profile On Save</button></div>}
function RelationshipsDock({packet,selectedIds,onChange,onDelete}:{packet:StudioPacket;selectedIds:string[];onChange:(rows:EntryRecord[])=>void;onDelete:(row:EntryRecord)=>void}){const add=()=>{const from=selectedIds[0]||displayText(packet.character.id);const toId=selectedIds.find((id)=>id!==from)||displayText(packet.catalogs.characters.find((c)=>displayText(c.id)!==from)?.id);if(toId)onChange([...packet.relationships,{id:generateUlid(),from_character_id:from,to_character_id:toId,relationship_type:"Ally",summary:"",public_stance:"",private_stance:"",trust:0,tension:0,influence:0,is_secret:false,tags:[]}]);};const visible=packet.relationships.filter((r)=>selectedIds.includes(displayText(r.from_character_id))||selectedIds.includes(displayText(r.to_character_id)));const replace=(id:string,patch:EntryRecord)=>onChange(packet.relationships.map((row)=>displayText(row.id)===id?{...row,...patch}:row));return <div><button className={active} disabled={packet.catalogs.characters.filter((row)=>displayText(row.id)!==displayText(packet.character.id)).length===0} onClick={add}>Add Directed Relationship</button>{packet.catalogs.characters.filter((row)=>displayText(row.id)!==displayText(packet.character.id)).length===0&&<p className="mt-2 rounded border border-dashed border-slate-300 p-2 text-xs text-slate-500">A relationship needs another saved character. <Link className="text-blue-700 underline" to="/author/characters/new">Create another character</Link>, then return here.</p>}<div className="mt-3 space-y-3">{visible.map((row)=>{const id=displayText(row.id);return <div key={id} className="rounded border border-slate-200 p-2 dark:border-slate-800"><SelectReference label="From" value={row.from_character_id} options={packet.catalogs.characters} onChange={(from_character_id)=>replace(id,{from_character_id})}/><SelectReference label="To" value={row.to_character_id} options={packet.catalogs.characters} onChange={(to_character_id)=>replace(id,{to_character_id})}/><label className="block text-xs"><Caption>Relationship Type</Caption><input className={AUTHORING_INPUT_CLASS} list="relationship-presets" value={editableText(row.relationship_type)} onChange={(e)=>replace(id,{relationship_type:e.target.value})}/><datalist id="relationship-presets">{RELATION_PRESETS.map((v)=><option key={v}>{v}</option>)}</datalist></label><TextArea label="Summary" value={row.summary} onChange={(summary)=>replace(id,{summary})}/><TextArea label="Public Stance" value={row.public_stance} onChange={(public_stance)=>replace(id,{public_stance})}/><TextArea label="Private Stance" value={row.private_stance} onChange={(private_stance)=>replace(id,{private_stance})}/><div className="grid grid-cols-3 gap-2"><NumberField label="Trust" value={row.trust} emptyValue="zero" onChange={(trust)=>replace(id,{trust})}/><NumberField label="Tension" value={row.tension} emptyValue="zero" onChange={(tension)=>replace(id,{tension})}/><NumberField label="Influence" value={row.influence} emptyValue="zero" onChange={(influence)=>replace(id,{influence})}/></div><button className="mt-2 text-xs text-red-600" onClick={()=>onDelete(row)}>Remove Relationship</button></div>})}</div></div>}
function HealthDock({packet}:{packet:StudioPacket}){return <div className="space-y-2">{packet.health.blockers.map((v)=><Issue key={v} tone="red">{v}</Issue>)}{packet.health.warnings.map((v)=><Issue key={v} tone="amber">{v}</Issue>)}{!packet.health.blockers.length&&!packet.health.warnings.length&&<Issue tone="green">No issues found.</Issue>}</div>}
function PendingDock({mutation,deletions}:{mutation:EntryRecord;deletions:Record<string,string[]>}){return <div className="space-y-2 text-xs"><Fact label="Relationships" value={String(rows(mutation.relationships).length)}/><Fact label="Story Beats" value={String(rows(mutation.story_beats).length)}/><Fact label="Presence Changes" value={String(Object.values((mutation.presence as Record<string,unknown[]>)||{}).reduce((sum,value)=>sum+value.length,0))}/><Fact label="Deletions" value={String(Object.values(deletions).reduce((sum,value)=>sum+value.length,0))}/></div>}
function QuickStep({number,label,detail,done,onClick}:{number:string;label:string;detail:string;done:boolean;onClick:()=>void}){return <button className={`rounded border p-3 text-left ${done?"border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950":"border-slate-300 bg-white hover:border-violet-400 dark:border-slate-700 dark:bg-slate-900"}`} onClick={onClick}><span className="text-[10px] font-bold uppercase text-slate-500">Step {number} {done?"Complete":""}</span><strong className="mt-1 block text-sm">{label}</strong><span className="mt-1 block text-xs text-slate-500">{detail}</span></button>}
function SelectReference({label,value,options,onChange}:{label:string;value:unknown;options:EntryRecord[];onChange:(v:string)=>void}){return <label className="block"><Caption>{label}</Caption><select aria-label={label} className={AUTHORING_INPUT_CLASS} value={displayText(value)} onChange={(e)=>onChange(e.target.value)}>{options.map((v)=><option key={displayText(v.id)} value={displayText(v.id)}>{rowLabel(v,displayText(v.id))}</option>)}</select></label>}
function ChipPicker({label,values,options,onChange}:{label:string;values:string[];options:EntryRecord[];onChange:(v:string[])=>void}){return <div><Caption>{label}</Caption><div className="flex flex-wrap gap-1">{options.map((option)=>{const id=displayText(option.id);const chosen=values.includes(id);return <button key={id} className={chosen?active:inactive} onClick={()=>onChange(chosen?values.filter((v)=>v!==id):[...values,id])}>{rowLabel(option,id)}</button>})}</div></div>}
function FlagFlowPicker({label,values,options,coverage,onChange}:{label:string;values:string[];options:EntryRecord[];coverage?:FlagCoverageGroup;onChange:(v:string[])=>void}){const matched=new Map((coverage?.matched||[]).map((row)=>[row.flag_id,row.paths]));const missing=new Set(coverage?.missing||[]);return <div><ChipPicker label={label} values={values} options={options} onChange={onChange}/><div className="mt-2 space-y-1">{values.map((id)=>{const flag=options.find((option)=>displayText(option.id)===id);const paths=matched.get(id);return <div key={id} className={`rounded border px-2 py-1 text-[10px] ${paths?"border-emerald-300 bg-emerald-50 text-emerald-800":missing.has(id)?"border-amber-300 bg-amber-50 text-amber-800":"border-slate-200 text-slate-500"}`}><strong>{rowLabel(flag||{id},id)}</strong><span className="block">{paths?`Implemented: ${paths.join(", ")}`:missing.has(id)?"Missing in linked source":"Coverage refreshes after save"}</span></div>})}</div></div>}
function Issue({tone,children}:{tone:"red"|"amber"|"green";children:ReactNode}){const color=tone==="red"?"border-red-300 bg-red-50 text-red-800":tone==="amber"?"border-amber-300 bg-amber-50 text-amber-800":"border-emerald-300 bg-emerald-50 text-emerald-800";return <div className={`rounded border p-2 text-xs ${color}`}>{children}</div>}
function Fact({label,value}:{label:string;value:string}){return <div className="rounded border border-slate-200 p-2 dark:border-slate-800"><Caption>{label}</Caption><strong>{value}</strong></div>}
