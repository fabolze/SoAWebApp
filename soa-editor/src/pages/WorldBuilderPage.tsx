import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type MouseEvent, type PointerEvent, type ReactNode, type SetStateAction } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import StoryPlacementPanel from "../components/storyPlacement/StoryPlacementPanel";
import ScopedGateSection from "../components/authoring/ScopedGateSection";
import { AuthoringPageShell, AuthoringPanel, EmptyState, StatusNotice } from "../components/authoringUi";
import ThenComposer from "../components/authoring/ThenComposer";
import {
  packetStoryPlacementWarningRecords,
  parseEntityTrackOccurrences,
  type StoryOccurrence,
} from "../authoring/storyPlacement";
import { apiFetch } from "../lib/api";
import { responseErrorMessage } from "../lib/apiErrors";
import { CommaSeparatedInput } from "../authoringViews/controls";
import { buildProjectHealthSummary, healthIssueTarget, type HealthIssue } from "../health/projectHealth";
import { generateSlug, generateUlid } from "../utils/generateId";
import { BUTTON_CLASSES, BUTTON_SIZES } from "../styles/uiTokens";
import {
  coordinatesFromEntry,
  coordinatesFromPointer,
  createLocationDraftAt,
  createRouteDraft,
  readDrafts,
  removeDraft,
  roundedCoordinate,
  writeDraft,
  type MapCoordinates,
} from "../authoringViews/worldAuthoringDrafts";

type EntryRecord = Record<string, unknown>;
type MapMode = "select" | "sketch" | "connect" | "move";
type LayerMode = "all" | "danger" | "story" | "state" | "issues";
type StoryFilter = "all" | "main" | "side" | "branch" | "locked";

const WORLD_RETURN = "/author/world";

interface WorldBuilderPayload {
  locations: EntryRecord[];
  routes: EntryRecord[];
  pois: EntryRecord[];
  encounter_tables: EntryRecord[];
  route_event_bindings: EntryRecord[];
  travel_tuning: EntryRecord[];
  creative_briefs: EntryRecord[];
  events: EntryRecord[];
  encounters: EntryRecord[];
  characters: EntryRecord[];
  adventure_beats: EntryRecord[];
  quests: EntryRecord[];
  story_arcs: EntryRecord[];
  dialogues: EntryRecord[];
  warnings: EntryRecord[];
}
type WorldBundlePatch = Partial<Pick<WorldBuilderPayload, "locations" | "routes" | "pois" | "encounter_tables" | "route_event_bindings" | "travel_tuning" | "creative_briefs">> & {
  deletions?: Partial<Record<"pois" | "encounter_tables" | "creative_briefs", string[]>>;
};

interface DragState {
  id: string;
  startedAt: MapCoordinates;
  latest: MapCoordinates;
  moved: boolean;
}

interface RouteHoverState {
  routeId: string;
  x: number;
  y: number;
}

interface StoryBeat {
  id: string;
  kind: "event" | "dialogue" | "quest" | "arc" | "route_event";
  label: string;
  editorPath: string;
  arcType: string;
  locked: boolean;
  branch: boolean;
}

function isRecord(value: unknown): value is EntryRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  const rendered = String(value).trim();
  return rendered || fallback;
}

function editableText(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function numberValue(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function label(entry: EntryRecord | undefined, fallback = "Untitled"): string {
  if (!entry) return fallback;
  return text(entry.name, text(entry.title, text(entry.slug, text(entry.id, fallback))));
}

function entryId(entry: EntryRecord | undefined): string {
  return text(entry?.id);
}

function withReturnTo(path: string): string {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}returnTo=${encodeURIComponent(WORLD_RETURN)}`;
}

function levelRangeLabel(value: unknown): string {
  if (!isRecord(value)) return "No level";
  const min = text(value.min);
  const max = text(value.max);
  if (!min && !max) return "No level";
  if (min && max) return `${min}-${max}`;
  return min || max;
}

function getTags(entry: EntryRecord | undefined): string[] {
  return Array.isArray(entry?.tags) ? entry.tags.map((tag) => text(tag)).filter(Boolean) : [];
}

function getEnvironmentTags(entry: EntryRecord | undefined): string[] {
  return Array.isArray(entry?.environment_tags) ? entry.environment_tags.map((tag) => text(tag)).filter(Boolean) : [];
}

function childrenOf(locations: EntryRecord[], parentId: string): EntryRecord[] {
  return locations
    .filter((location) => text(location.parent_location_id) === parentId)
    .sort((a, b) => numberValue(a.sort_order) - numberValue(b.sort_order) || label(a).localeCompare(label(b)));
}

function routeMatchesLocation(route: EntryRecord, locationId: string): boolean {
  return text(route.from_location_id) === locationId || text(route.to_location_id) === locationId;
}

function routeReferences(route: EntryRecord, ids: Set<string>): boolean {
  return ids.has(text(route.from_location_id)) && ids.has(text(route.to_location_id));
}

function otherEndpoint(route: EntryRecord, locationId: string): string {
  const fromId = text(route.from_location_id);
  const toId = text(route.to_location_id);
  return fromId === locationId ? toId : fromId;
}

function effectiveBiome(location: EntryRecord | undefined): string {
  return text(location?.effective_biome, text(location?.biome));
}

function uniqueOptions(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function locationSearchText(location: EntryRecord): string {
  return [
    location.name,
    location.slug,
    location.region,
    location.location_type,
    location.place_kind,
    effectiveBiome(location),
    ...getEnvironmentTags(location),
    ...getTags(location),
  ].map((value) => text(value).toLowerCase()).join(" ");
}

function hasStoryContent(locationId: string, payload: WorldBuilderPayload | null, routes: EntryRecord[]): boolean {
  if (!payload) return false;
  const routeIds = new Set(routes.map(entryId));
  return payload.pois.some((poi) => text(poi.location_id) === locationId)
    || payload.encounter_tables.some((table) => text(table.location_id) === locationId)
    || payload.creative_briefs.some((brief) => text(brief.location_id) === locationId)
    || payload.route_event_bindings.some((binding) => routeIds.has(text(binding.route_id)));
}

function dangerScore(location: EntryRecord, encounterCount: number): number {
  const range = isRecord(location.level_range) ? location.level_range : {};
  return Math.max(numberValue(range.max), numberValue(range.min)) + encounterCount * 2;
}

function locationPointClass(location: EntryRecord, selected: boolean, layer: LayerMode, issueCount: number, story: boolean, danger: number, lifecycle: string): string {
  if (selected) return "border-blue-700 bg-blue-700 text-white ring-2 ring-blue-300";
  if (layer === "issues" && issueCount > 0) return "border-red-500 bg-red-50 text-red-900 dark:border-red-400 dark:bg-red-950 dark:text-red-100";
  if (layer === "state" && lifecycle) return locationStateClass(lifecycle);
  if (layer === "story" && story) return "border-violet-400 bg-violet-50 text-violet-900 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-100";
  if (layer === "danger" && danger >= 8) return "border-amber-500 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100";
  switch (text(location.place_kind)) {
    case "Settlement":
      return "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100";
    case "Dungeon":
      return "border-violet-300 bg-violet-50 text-violet-900 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-100";
    case "Interior":
    case "Road":
      return "border-slate-300 bg-slate-50 text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";
    case "Waterway":
      return "border-cyan-300 bg-cyan-50 text-cyan-900 dark:border-cyan-800 dark:bg-cyan-950 dark:text-cyan-100";
    default:
      return "border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100";
  }
}

function locationEncounterNames(locationId: string, tables: EntryRecord[], encountersById: Map<string, EntryRecord>): string[] {
  const names: string[] = [];
  tables
    .filter((table) => text(table.location_id) === locationId)
    .forEach((table) => {
      encounterEntries(table).forEach((entry) => {
        const encounter = encountersById.get(text(entry.encounter_id));
        if (encounter) names.push(label(encounter));
      });
    });
  return uniqueOptions(names);
}

function routeLineClass(route: EntryRecord, selected: boolean): string {
  if (selected) return "stroke-blue-700 dark:stroke-blue-300";
  if (route.is_hidden) return "stroke-slate-400 dark:stroke-slate-600";
  if (text(route.requirements_id)) return "stroke-amber-600 dark:stroke-amber-400";
  if (route.is_fast_travel_enabled) return "stroke-emerald-600 dark:stroke-emerald-400";
  return "stroke-slate-500 dark:stroke-slate-500";
}

function routeLabel(route: EntryRecord, locationsById: Map<string, EntryRecord>): string {
  const from = locationsById.get(text(route.from_location_id));
  const to = locationsById.get(text(route.to_location_id));
  return `${from ? label(from) : text(route.from_location_id, "Unknown")} -> ${to ? label(to) : text(route.to_location_id, "Unknown")}`;
}

function encounterEntries(table: EntryRecord): EntryRecord[] {
  return Array.isArray(table.encounter_entries) ? table.encounter_entries.filter(isRecord) : [];
}

function routeHasEncounterEvent(bindings: EntryRecord[], eventsById: Map<string, EntryRecord>): boolean {
  return bindings.some((binding) => {
    const event = eventsById.get(text(binding.event_id));
    return text(event?.type) === "Encounter" && text(event?.encounter_id);
  });
}

function arrayText(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => text(item)).filter(Boolean) : [];
}

function tokenSet(entry: EntryRecord | undefined): Set<string> {
  return new Set([
    text(entry?.id),
    text(entry?.slug),
    ...arrayText(entry?.tags),
    ...arrayText(entry?.flags_set),
    ...arrayText(entry?.flags_set_on_completion),
  ].filter(Boolean).map((item) => item.toLowerCase()));
}

function intersects(a: Set<string>, b: Set<string>): boolean {
  for (const item of a) {
    if (b.has(item)) return true;
  }
  return false;
}

function arcForQuest(quest: EntryRecord, storyArcs: EntryRecord[]): EntryRecord | undefined {
  const questId = entryId(quest);
  return storyArcs.find((arc) => text(arc.id) === text(quest.story_arc_id) || arrayText(arc.related_quests).includes(questId));
}

function storyArcType(arc: EntryRecord | undefined): string {
  return text(arc?.type, "Unassigned");
}

function questMatchesEntry(quest: EntryRecord, entry: EntryRecord): boolean {
  const questTokens = tokenSet(quest);
  const entryTokens = tokenSet(entry);
  if (intersects(questTokens, entryTokens)) return true;
  const objectiveFlags = Array.isArray(quest.objectives)
    ? quest.objectives.filter(isRecord).flatMap((objective) => arrayText(objective.flags_set))
    : [];
  return objectiveFlags.some((flag) => entryTokens.has(flag.toLowerCase()));
}

function storyBeatAllowed(beat: StoryBeat, filter: StoryFilter): boolean {
  if (filter === "all") return true;
  if (filter === "main") return beat.arcType === "Main Story";
  if (filter === "side") return beat.arcType === "Side Arc" || beat.arcType === "Faction Arc" || beat.arcType === "DLC Arc";
  if (filter === "branch") return beat.branch;
  if (filter === "locked") return beat.locked;
  return true;
}

function occurrenceLifecycle(occurrence: StoryOccurrence): string {
  const stateLabel = text(occurrence.state_label).toLowerCase();
  if (stateLabel === "occupied") return "occupied";
  return text(occurrence.change_type, "active").toLowerCase();
}

const lifecycleRank: Record<string, number> = {
  destroyed: 80,
  unavailable: 70,
  transformed: 65,
  occupied: 60,
  restored: 55,
  changed: 50,
  introduced: 40,
  active: 30,
  none: 10,
};

function mostImportantLifecycle(occurrences: StoryOccurrence[]): string {
  return occurrences
    .map(occurrenceLifecycle)
    .sort((a, b) => (lifecycleRank[b] ?? 20) - (lifecycleRank[a] ?? 20) || a.localeCompare(b))[0] || "";
}

function locationStateClass(lifecycle: string): string {
  switch (lifecycle) {
    case "introduced":
      return "border-emerald-500 bg-emerald-50 text-emerald-950 dark:border-emerald-500 dark:bg-emerald-950 dark:text-emerald-100";
    case "destroyed":
      return "border-red-600 bg-red-50 text-red-950 dark:border-red-500 dark:bg-red-950 dark:text-red-100";
    case "unavailable":
      return "border-orange-500 bg-orange-50 text-orange-950 dark:border-orange-500 dark:bg-orange-950 dark:text-orange-100";
    case "restored":
      return "border-cyan-500 bg-cyan-50 text-cyan-950 dark:border-cyan-500 dark:bg-cyan-950 dark:text-cyan-100";
    case "transformed":
      return "border-fuchsia-500 bg-fuchsia-50 text-fuchsia-950 dark:border-fuchsia-500 dark:bg-fuchsia-950 dark:text-fuchsia-100";
    case "occupied":
    case "changed":
      return "border-indigo-500 bg-indigo-50 text-indigo-950 dark:border-indigo-500 dark:bg-indigo-950 dark:text-indigo-100";
    case "active":
      return "border-blue-500 bg-blue-50 text-blue-950 dark:border-blue-500 dark:bg-blue-950 dark:text-blue-100";
    default:
      return "border-slate-300 bg-slate-50 text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";
  }
}

function occurrenceMatchesStoryScope(occurrence: StoryOccurrence, timelineId: string, storyArcId: string, lifecycle: string): boolean {
  return (!timelineId || occurrence.timeline_id === timelineId)
    && (!storyArcId || occurrence.story_arc_id === storyArcId)
    && (!lifecycle || occurrenceLifecycle(occurrence) === lifecycle);
}

export default function WorldBuilderPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const boardRef = useRef<HTMLDivElement | null>(null);
  const [payload, setPayload] = useState<WorldBuilderPayload | null>(null);
  const [storyPacket, setStoryPacket] = useState<EntryRecord | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [expandPlaceOpen, setExpandPlaceOpen] = useState(false);
  const [healthIssues, setHealthIssues] = useState<HealthIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [mode, setMode] = useState<MapMode>("select");
  const [selectedRouteId, setSelectedRouteId] = useState("");
  const [routeHover, setRouteHover] = useState<RouteHoverState | null>(null);
  const [locationDrafts, setLocationDrafts] = useState<EntryRecord[]>([]);
  const [pendingRouteSourceId, setPendingRouteSourceId] = useState("");
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [search, setSearch] = useState("");
  const [regionFilter, setRegionFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [placeKindFilter, setPlaceKindFilter] = useState("");
  const [biomeFilter, setBiomeFilter] = useState("");
  const [routeTypeFilter, setRouteTypeFilter] = useState("");
  const [routeFlagFilter, setRouteFlagFilter] = useState("");
  const [nodeFlagFilter, setNodeFlagFilter] = useState("");
  const [layer, setLayer] = useState<LayerMode>("all");
  const [storyFilter, setStoryFilter] = useState<StoryFilter>("all");
  const [timelineFilter, setTimelineFilter] = useState("");
  const [storyArcFilter, setStoryArcFilter] = useState("");
  const [lifecycleFilter, setLifecycleFilter] = useState("");
  const [showRouteLabels, setShowRouteLabels] = useState(true);
  const requestedSelectedId = searchParams.get("selected") || "";

  const refreshLocationDrafts = useCallback(() => {
    setLocationDrafts(readDrafts("locations"));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [worldRes, health] = await Promise.all([
        apiFetch("/api/ui/world_builder"),
        buildProjectHealthSummary().catch(() => null),
      ]);
      const storyRes = await apiFetch("/api/ui/adventure-timeline").catch(() => null);
      const data = await worldRes.json();
      if (!worldRes.ok || !isRecord(data)) throw new Error("World builder data failed to load.");
      const storyData = storyRes && storyRes.ok ? await storyRes.json() : null;
      const nextPayload: WorldBuilderPayload = {
        locations: Array.isArray(data.locations) ? data.locations.filter(isRecord) : [],
        routes: Array.isArray(data.routes) ? data.routes.filter(isRecord) : [],
        pois: Array.isArray(data.pois) ? data.pois.filter(isRecord) : [],
        encounter_tables: Array.isArray(data.encounter_tables) ? data.encounter_tables.filter(isRecord) : [],
        route_event_bindings: Array.isArray(data.route_event_bindings) ? data.route_event_bindings.filter(isRecord) : [],
        travel_tuning: Array.isArray(data.travel_tuning) ? data.travel_tuning.filter(isRecord) : [],
        creative_briefs: Array.isArray(data.creative_briefs) ? data.creative_briefs.filter(isRecord) : [],
        events: Array.isArray(data.events) ? data.events.filter(isRecord) : [],
        encounters: Array.isArray(data.encounters) ? data.encounters.filter(isRecord) : [],
        characters: Array.isArray(data.characters) ? data.characters.filter(isRecord) : [],
        adventure_beats: Array.isArray(data.adventure_beats) ? data.adventure_beats.filter(isRecord) : [],
        quests: Array.isArray(data.quests) ? data.quests.filter(isRecord) : [],
        story_arcs: Array.isArray(data.story_arcs) ? data.story_arcs.filter(isRecord) : [],
        dialogues: Array.isArray(data.dialogues) ? data.dialogues.filter(isRecord) : [],
        warnings: Array.isArray(data.warnings) ? data.warnings.filter(isRecord) : [],
      };
      setPayload(nextPayload);
      setStoryPacket(isRecord(storyData) ? storyData : null);
      setHealthIssues(health?.issues.filter((issue) => issue.category === "world") ?? []);
      if (nextPayload.locations.length > 0) {
        setSelectedId((current) => {
          if (requestedSelectedId && nextPayload.locations.some((location) => entryId(location) === requestedSelectedId)) {
            return requestedSelectedId;
          }
          return current || entryId(nextPayload.locations[0]);
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "World builder failed to load.");
    } finally {
      setLoading(false);
    }
  }, [requestedSelectedId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    refreshLocationDrafts();
  }, [refreshLocationDrafts]);

  const locations = useMemo(() => payload?.locations ?? [], [payload]);
  const routes = useMemo(() => payload?.routes ?? [], [payload]);
  const locationsById = useMemo(() => new Map(locations.map((location) => [entryId(location), location])), [locations]);
  const routesById = useMemo(() => new Map(routes.map((route) => [entryId(route), route])), [routes]);
  const eventsById = useMemo(() => new Map((payload?.events ?? []).map((event) => [entryId(event), event])), [payload]);
  const encountersById = useMemo(() => new Map((payload?.encounters ?? []).map((encounter) => [entryId(encounter), encounter])), [payload]);
  const questsById = useMemo(() => new Map((payload?.quests ?? []).map((quest) => [entryId(quest), quest])), [payload]);
  const selected = useMemo(() => locationsById.get(selectedId), [locationsById, selectedId]);
  const locationDraftIds = useMemo(() => new Set(locationDrafts.map(entryId)), [locationDrafts]);
  const selectedLocationDraft = useMemo(() => locationDrafts.find((draft) => entryId(draft) === selectedId), [locationDrafts, selectedId]);
  const selectedLocation = selected ?? selectedLocationDraft;
  const selectedIsDraft = Boolean(selectedLocationDraft && !selected);
  const selectedRoute = useMemo(() => routesById.get(selectedRouteId), [routesById, selectedRouteId]);
  const selectedRoutes = useMemo(() => selectedIsDraft ? [] : routes.filter((route) => routeMatchesLocation(route, selectedId)), [routes, selectedId, selectedIsDraft]);
  const selectedPois = useMemo(() => selectedIsDraft ? [] : (payload?.pois ?? []).filter((poi) => text(poi.location_id) === selectedId), [payload, selectedId, selectedIsDraft]);
  const selectedEncounterTables = useMemo(() => selectedIsDraft ? [] : (payload?.encounter_tables ?? []).filter((table) => text(table.location_id) === selectedId), [payload, selectedId, selectedIsDraft]);
  const selectedBriefs = useMemo(() => selectedIsDraft ? [] : (payload?.creative_briefs ?? []).filter((brief) => text(brief.location_id) === selectedId), [payload, selectedId, selectedIsDraft]);
  const selectedRouteIds = useMemo(() => new Set(selectedRoutes.map(entryId)), [selectedRoutes]);
  const selectedRouteEvents = useMemo(() => (payload?.route_event_bindings ?? []).filter((binding) => selectedRouteIds.has(text(binding.route_id))), [payload, selectedRouteIds]);
  const selectedRouteBindings = useMemo(() => (payload?.route_event_bindings ?? []).filter((binding) => text(binding.route_id) === selectedRouteId), [payload, selectedRouteId]);
  const locationOccurrences = useMemo(() => parseEntityTrackOccurrences(storyPacket).filter((occurrence) => occurrence.entity_kind === "location"), [storyPacket]);
  const locationOccurrencesById = useMemo(() => {
    const map = new Map<string, StoryOccurrence[]>();
    locationOccurrences.forEach((occurrence) => {
      map.set(occurrence.entity_id, [...(map.get(occurrence.entity_id) ?? []), occurrence]);
    });
    return map;
  }, [locationOccurrences]);
  const scopedLocationOccurrencesById = useMemo(() => {
    const map = new Map<string, StoryOccurrence[]>();
    locationOccurrencesById.forEach((occurrences, locationId) => {
      const scoped = occurrences.filter((occurrence) => occurrenceMatchesStoryScope(occurrence, timelineFilter, storyArcFilter, lifecycleFilter));
      if (scoped.length > 0) map.set(locationId, scoped);
    });
    return map;
  }, [lifecycleFilter, locationOccurrencesById, storyArcFilter, timelineFilter]);
  const locationWarningsById = useMemo(() => {
    const map = new Map<string, EntryRecord[]>();
    locations.forEach((location) => {
      const locationId = entryId(location);
      const warnings = packetStoryPlacementWarningRecords(storyPacket, "location", locationId);
      if (warnings.length > 0) map.set(locationId, warnings);
    });
    return map;
  }, [locations, storyPacket]);
  const selectedLocationOccurrences = useMemo(() => (locationOccurrencesById.get(selectedId) ?? [])
    .filter((occurrence) => occurrenceMatchesStoryScope(occurrence, timelineFilter, storyArcFilter, lifecycleFilter)), [lifecycleFilter, locationOccurrencesById, selectedId, storyArcFilter, timelineFilter]);
  const selectedLocationWarnings = useMemo(() => locationWarningsById.get(selectedId) ?? [], [locationWarningsById, selectedId]);
  const storyTimelines = useMemo(() => Array.isArray(storyPacket?.timelines) ? storyPacket.timelines.filter(isRecord) : [], [storyPacket]);
  const storyArcs = useMemo(() => Array.isArray(storyPacket?.story_arcs) ? storyPacket.story_arcs.filter(isRecord) : [], [storyPacket]);
  const lifecycleOptions = useMemo(() => uniqueOptions([
    "introduced",
    "active",
    "changed",
    "occupied",
    "unavailable",
    "destroyed",
    "restored",
    "transformed",
    ...locationOccurrences.map(occurrenceLifecycle),
  ]), [locationOccurrences]);
  const storyByLocation = useMemo(() => {
    const map = new Map<string, StoryBeat[]>();
    const add = (locationId: string, beat: StoryBeat) => {
      if (!locationId) return;
      const next = map.get(locationId) ?? [];
      if (!next.some((item) => item.id === beat.id && item.kind === beat.kind)) next.push(beat);
      map.set(locationId, next);
    };
    const quests = payload?.quests ?? [];
    const arcs = payload?.story_arcs ?? [];
    (payload?.events ?? []).forEach((event) => {
      const matchingQuest = quests.find((quest) => questMatchesEntry(quest, event));
      const arc = matchingQuest ? arcForQuest(matchingQuest, arcs) : undefined;
      const locationId = text(event.location_id);
      add(locationId, {
        id: entryId(event),
        kind: "event",
        label: label(event),
        editorPath: withReturnTo(`/events?selected=${encodeURIComponent(entryId(event))}`),
        arcType: storyArcType(arc),
        locked: Boolean(text(event.requirements_id)),
        branch: Boolean(text(event.next_event_id)),
      });
      if (matchingQuest) {
        add(locationId, {
          id: entryId(matchingQuest),
          kind: "quest",
          label: label(matchingQuest),
          editorPath: withReturnTo(`/quests?selected=${encodeURIComponent(entryId(matchingQuest))}`),
          arcType: storyArcType(arc),
          locked: Boolean(text(matchingQuest.requirements_id)),
          branch: false,
        });
      }
    });
    (payload?.dialogues ?? []).forEach((dialogue) => {
      const matchingQuest = quests.find((quest) => questMatchesEntry(quest, dialogue));
      const arc = matchingQuest ? arcForQuest(matchingQuest, arcs) : undefined;
      add(text(dialogue.location_id), {
        id: entryId(dialogue),
        kind: "dialogue",
        label: label(dialogue),
        editorPath: withReturnTo(`/dialogues?selected=${encodeURIComponent(entryId(dialogue))}`),
        arcType: storyArcType(arc),
        locked: false,
        branch: false,
      });
    });
    arcs.forEach((arc) => {
      const relatedQuests = arrayText(arc.related_quests).map((questId) => questsById.get(questId)).filter(Boolean) as EntryRecord[];
      relatedQuests.forEach((quest) => {
        const matchingEvents = (payload?.events ?? []).filter((event) => questMatchesEntry(quest, event));
        matchingEvents.forEach((event) => add(text(event.location_id), {
          id: entryId(arc),
          kind: "arc",
          label: label(arc),
          editorPath: withReturnTo(`/story-arcs?selected=${encodeURIComponent(entryId(arc))}`),
          arcType: storyArcType(arc),
          locked: arrayText(arc.required_flags).length > 0,
          branch: Array.isArray(arc.branching) && arc.branching.length > 0,
        }));
      });
    });
    return map;
  }, [payload, questsById]);
  const storyByRoute = useMemo(() => {
    const map = new Map<string, StoryBeat[]>();
    (payload?.route_event_bindings ?? []).forEach((binding) => {
      const event = eventsById.get(text(binding.event_id));
      const matchingQuest = event ? (payload?.quests ?? []).find((quest) => questMatchesEntry(quest, event)) : undefined;
      const arc = matchingQuest ? arcForQuest(matchingQuest, payload?.story_arcs ?? []) : undefined;
      const beat: StoryBeat = {
        id: entryId(binding),
        kind: "route_event",
        label: event ? label(event) : label(binding),
        editorPath: withReturnTo(`/route-event-bindings?selected=${encodeURIComponent(entryId(binding))}`),
        arcType: storyArcType(arc),
        locked: Boolean(text(binding.requirements_id) || text(event?.requirements_id)),
        branch: Boolean(text(event?.next_event_id)),
      };
      const routeId = text(binding.route_id);
      map.set(routeId, [...(map.get(routeId) ?? []), beat]);
    });
    return map;
  }, [eventsById, payload]);
  const selectedLocationStoryBeats = useMemo(() => (storyByLocation.get(selectedId) ?? []).filter((beat) => storyBeatAllowed(beat, storyFilter)), [selectedId, storyByLocation, storyFilter]);
  const selectedRouteStoryBeats = useMemo(() => (storyByRoute.get(selectedRouteId) ?? []).filter((beat) => storyBeatAllowed(beat, storyFilter)), [selectedRouteId, storyByRoute, storyFilter]);
  const selectedTuning = useMemo(() => {
    const routeTypes = new Set(selectedRoutes.map((route) => text(route.route_type)).filter(Boolean));
    const placeKind = text(selected?.place_kind);
    const biome = effectiveBiome(selected);
    return (payload?.travel_tuning ?? []).filter((row) => {
      const rowRouteType = text(row.route_type);
      const rowPlaceKind = text(row.place_kind);
      const rowBiome = text(row.biome);
      return (!rowRouteType || routeTypes.has(rowRouteType)) && (!rowPlaceKind || rowPlaceKind === placeKind) && (!rowBiome || rowBiome === biome);
    });
  }, [payload, selected, selectedRoutes]);
  const selectedIssues = useMemo(() => healthIssues.filter((issue) => issue.entryId === selectedId || issue.path.includes(selectedId)), [healthIssues, selectedId]);
  const issueCounts = useMemo(() => {
    const counts = new Map<string, number>();
    healthIssues.forEach((issue) => {
      if (issue.entryId) counts.set(issue.entryId, (counts.get(issue.entryId) ?? 0) + 1);
    });
    return counts;
  }, [healthIssues]);
  const encounterCounts = useMemo(() => {
    const counts = new Map<string, number>();
    (payload?.encounter_tables ?? []).forEach((table) => {
      const id = text(table.location_id);
      if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
    });
    return counts;
  }, [payload]);

  const regions = useMemo(() => uniqueOptions(locations.map((location) => text(location.region))), [locations]);
  const locationTypes = useMemo(() => uniqueOptions(locations.map((location) => text(location.location_type))), [locations]);
  const placeKinds = useMemo(() => uniqueOptions(locations.map((location) => text(location.place_kind))), [locations]);
  const biomes = useMemo(() => uniqueOptions(locations.map(effectiveBiome)), [locations]);
  const routeTypes = useMemo(() => uniqueOptions(routes.map((route) => text(route.route_type))), [routes]);

  useEffect(() => {
    if (loading) return;
    if (requestedSelectedId && locationDraftIds.has(requestedSelectedId) && selectedId !== requestedSelectedId) {
      setSelectedId(requestedSelectedId);
      setSelectedRouteId("");
      return;
    }
    if (selectedId && (locationsById.has(selectedId) || locationDraftIds.has(selectedId))) return;
    const fallback = locations[0] ? entryId(locations[0]) : locationDrafts[0] ? entryId(locationDrafts[0]) : "";
    if (fallback !== selectedId) setSelectedId(fallback);
  }, [loading, locationDraftIds, locationDrafts, locations, locationsById, requestedSelectedId, selectedId]);

  const filteredLocations = useMemo(() => locations.filter((location) => {
    const id = entryId(location);
    const storyBeats = (storyByLocation.get(id) ?? []).filter((beat) => storyBeatAllowed(beat, storyFilter));
    const canonicalOccurrences = scopedLocationOccurrencesById.get(id) ?? [];
    const matchesSearch = locationSearchText(location).includes(search.trim().toLowerCase());
    const matchesRegion = !regionFilter || text(location.region) === regionFilter;
    const matchesType = !typeFilter || text(location.location_type) === typeFilter;
    const matchesPlace = !placeKindFilter || text(location.place_kind) === placeKindFilter;
    const matchesBiome = !biomeFilter || effectiveBiome(location) === biomeFilter;
    const matchesNodeFlag = !nodeFlagFilter
      || (nodeFlagFilter === "safe" && location.is_safe_zone)
      || (nodeFlagFilter === "respawn" && location.has_respawn_point)
      || (nodeFlagFilter === "fast" && location.is_fast_travel_point)
      || (nodeFlagFilter === "playable" && location.is_playable_space !== false)
      || (nodeFlagFilter === "map" && location.is_world_map_node !== false);
    const matchesLayer = (layer !== "issues" || (issueCounts.get(id) ?? 0) > 0)
      && (layer !== "story" || storyBeats.length > 0 || canonicalOccurrences.length > 0)
      && (layer !== "state" || canonicalOccurrences.length > 0);
    return matchesSearch && matchesRegion && matchesType && matchesPlace && matchesBiome && matchesNodeFlag && matchesLayer;
  }), [biomeFilter, issueCounts, layer, locations, nodeFlagFilter, placeKindFilter, regionFilter, scopedLocationOccurrencesById, search, storyByLocation, storyFilter, typeFilter]);

  const visibleLocationIds = useMemo(() => new Set(filteredLocations.map(entryId)), [filteredLocations]);
  const filteredRoutes = useMemo(() => routes.filter((route) => {
    if (!routeReferences(route, visibleLocationIds)) return false;
    if (routeTypeFilter && text(route.route_type) !== routeTypeFilter) return false;
    if (routeFlagFilter === "hidden" && !route.is_hidden) return false;
    if (routeFlagFilter === "locked" && !text(route.requirements_id)) return false;
    if (routeFlagFilter === "fast" && !route.is_fast_travel_enabled) return false;
    if (layer === "story" && !(storyByRoute.get(entryId(route)) ?? []).some((beat) => storyBeatAllowed(beat, storyFilter))) return false;
    return true;
  }), [layer, routes, routeFlagFilter, routeTypeFilter, storyByRoute, storyFilter, visibleLocationIds]);

  const updateLocationCoordinates = useCallback((id: string, coordinates: MapCoordinates) => {
    setPayload((current) => {
      if (!current) return current;
      return {
        ...current,
        locations: current.locations.map((location) => entryId(location) === id
          ? { ...location, coordinates: { ...coordinatesFromEntry(location), x: coordinates.x, y: coordinates.y } }
          : location),
      };
    });
  }, []);

  const saveLocationCoordinates = useCallback(async (id: string, coordinates: MapCoordinates) => {
    const location = locationsById.get(id);
    if (!location) return;
    const next = { ...location, coordinates: { ...coordinatesFromEntry(location), x: coordinates.x, y: coordinates.y } };
    const response = await apiFetch("/api/ui/world_builder/bundle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locations: [next] }),
    });
    if (!response.ok) {
      setNotice(`Could not save map placement: ${await responseErrorMessage(response, "World bundle failed to save.")}`);
      await load();
      return;
    }
    setNotice("Map placement saved.");
  }, [load, locationsById]);

  const quickSaveLocation = useCallback(async (next: EntryRecord) => {
    const id = entryId(next);
    const wasDraft = locationDrafts.some((draft) => entryId(draft) === id);
    const response = await apiFetch("/api/ui/world_builder/bundle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locations: [next] }),
    });
    if (!response.ok) {
      setNotice(`Could not save quick edit changes: ${await responseErrorMessage(response, "World bundle failed to save.")}`);
      return;
    }
    if (wasDraft) {
      removeDraft("locations", id);
      refreshLocationDrafts();
    }
    setNotice("Location quick edit saved.");
    await load();
  }, [load, locationDrafts, refreshLocationDrafts]);

  const saveWorldPacket = useCallback(async (patch: WorldBundlePatch): Promise<boolean> => {
    const response = await apiFetch("/api/ui/world_builder/bundle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!response.ok) {
      setNotice(`Could not save location packet: ${await responseErrorMessage(response, "World bundle failed to save.")}`);
      return false;
    }
    setNotice("Location packet saved.");
    await load();
    return true;
  }, [load]);

  const createSketchLocation = useCallback((coordinates: MapCoordinates) => {
    const draft = createLocationDraftAt(coordinates);
    writeDraft("locations", draft);
    refreshLocationDrafts();
    setSelectedId(entryId(draft));
    setSelectedRouteId("");
    setNotice("Sketch location draft added to the map.");
  }, [refreshLocationDrafts]);

  const createRouteBetween = useCallback((fromId: string, toId: string) => {
    const from = locationsById.get(fromId);
    const to = locationsById.get(toId);
    if (!from || !to || fromId === toId) return;
    const draft = createRouteDraft(from, to);
    writeDraft("location_routes", draft);
    localStorage.setItem("soa.workspace.location_routes", JSON.stringify({ search: "", searchField: "__all__", showEditor: true, selectedEntryId: text(draft.id) }));
    navigate(withReturnTo(`/location-routes?selected=${encodeURIComponent(text(draft.id))}`));
  }, [locationsById, navigate]);

  const createRouteEncounterEventDraft = useCallback((route: EntryRecord) => {
    const routeName = routeLabel(route, locationsById);
    const eventId = generateUlid();
    const bindingId = generateUlid();
    const eventDraft = {
      id: eventId,
      slug: generateSlug(`${routeName} Encounter Event`),
      title: `${routeName} Encounter`,
      type: "Encounter",
      location_id: "",
      encounter_id: "",
      item_rewards: [],
      currency_rewards: [],
      reputation_rewards: [],
      flags_set: [],
      tags: ["route", "encounter"],
    };
    const bindingDraft = {
      id: bindingId,
      slug: generateSlug(`${routeName} Encounter Binding`),
      route_id: entryId(route),
      event_id: eventId,
      trigger_mode: "RandomChance",
      chance: 100,
      priority: 0,
      cooldown: 0,
      description: "",
      tags: ["route", "encounter"],
    };
    writeDraft("events", eventDraft);
    writeDraft("route_event_bindings", bindingDraft);
    localStorage.setItem("soa.workspace.route_event_bindings", JSON.stringify({ search: "", searchField: "__all__", showEditor: true, selectedEntryId: bindingId }));
    navigate(withReturnTo(`/route-event-bindings?selected=${encodeURIComponent(bindingId)}`));
  }, [locationsById, navigate]);

  const createPoiDraft = useCallback((location: EntryRecord) => {
    const id = generateUlid();
    const locationName = label(location, "Location");
    const draft = {
      id,
      slug: generateSlug(`${locationName} POI ${id.slice(-4)}`),
      location_id: entryId(location),
      name: `${locationName} POI`,
      description: "",
      poi_type: "DiscoveryPoint",
      coordinates: { x: 50, y: 50 },
      placement_notes: "",
      is_discoverable: true,
      discovery_hint: "",
      tags: [],
    };
    writeDraft("location_pois", draft);
    localStorage.setItem("soa.workspace.location_pois", JSON.stringify({ search: "", searchField: "__all__", showEditor: true, selectedEntryId: id }));
    navigate(withReturnTo(`/location-pois?selected=${encodeURIComponent(id)}`));
  }, [navigate]);

  const openLocationDraft = useCallback((draft: EntryRecord) => {
    navigate(withReturnTo(`/author/locations/${encodeURIComponent(entryId(draft))}`));
  }, [navigate]);

  const discardLocationDraft = useCallback((draft: EntryRecord) => {
    const id = entryId(draft);
    removeDraft("locations", id);
    refreshLocationDrafts();
    if (selectedId === id) setSelectedId(locations[0] ? entryId(locations[0]) : "");
    setNotice("Sketch location draft discarded.");
  }, [locations, refreshLocationDrafts, selectedId]);

  const handleBoardClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || mode !== "sketch") return;
    createSketchLocation(coordinatesFromPointer(event.clientX, event.clientY, event.currentTarget));
  };

  const handleNodeClick = (event: MouseEvent<HTMLButtonElement>, location: EntryRecord) => {
    event.stopPropagation();
    const id = entryId(location);
    if (mode === "connect") {
      if (!pendingRouteSourceId) {
        setPendingRouteSourceId(id);
        setSelectedId(id);
        setNotice("Select another saved location to create a route draft.");
        return;
      }
      createRouteBetween(pendingRouteSourceId, id);
      setPendingRouteSourceId("");
      return;
    }
    if (mode !== "move") {
      setSelectedId(id);
      setSelectedRouteId("");
    }
  };

  const handleRouteClick = (event: MouseEvent<SVGLineElement>, route: EntryRecord) => {
    event.stopPropagation();
    if (mode !== "select") return;
    setSelectedRouteId(entryId(route));
    setSelectedId("");
  };

  const handleNodePointerDown = (event: PointerEvent<HTMLButtonElement>, location: EntryRecord) => {
    if (mode !== "move") return;
    event.preventDefault();
    event.stopPropagation();
    const board = boardRef.current;
    if (!board) return;
    const coordinates = coordinatesFromPointer(event.clientX, event.clientY, board);
    const id = entryId(location);
    setSelectedId(id);
    setSelectedRouteId("");
    setDragState({ id, startedAt: coordinatesFromEntry(location), latest: coordinates, moved: false });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleBoardPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragState || mode !== "move") return;
    const coordinates = coordinatesFromPointer(event.clientX, event.clientY, event.currentTarget);
    const moved = dragState.moved
      || Math.abs(coordinates.x - dragState.startedAt.x) > 0.2
      || Math.abs(coordinates.y - dragState.startedAt.y) > 0.2;
    setDragState({ ...dragState, latest: coordinates, moved });
    updateLocationCoordinates(dragState.id, coordinates);
  };

  const finishDrag = async () => {
    if (!dragState) return;
    const finished = dragState;
    setDragState(null);
    if (finished.moved) {
      await saveLocationCoordinates(finished.id, {
        x: roundedCoordinate(finished.latest.x),
        y: roundedCoordinate(finished.latest.y),
      });
    }
  };

  const startRouteFromSelected = () => {
    if (!selectedId) return;
    setMode("connect");
    setPendingRouteSourceId(selectedId);
    setNotice("Select another saved location to create a route draft.");
  };

  if (loading) return <AuthoringPageShell><StatusNotice>Loading world builder...</StatusNotice></AuthoringPageShell>;
  if (error) return <AuthoringPageShell><StatusNotice tone="error">{error}</StatusNotice></AuthoringPageShell>;

  return (
    <AuthoringPageShell>
      <div className="space-y-4">
        <AuthoringPanel
          id="world-workspace"
          title="Interactive World Workspace"
          subtitle="World Builder"
          help="Use this workspace to inspect locations, routes, POIs, encounters, travel tuning, story placement, and validation issues together before opening a focused editor."
          status={
              <div className="flex flex-wrap gap-2 text-xs text-slate-600 dark:text-slate-400">
                <Badge>{locations.length} locations</Badge>
                <Badge>{payload?.pois.length ?? 0} POIs</Badge>
                <Badge>{payload?.encounter_tables.length ?? 0} encounter tables</Badge>
                <Badge>{healthIssues.length} world issues</Badge>
              </div>
          }
          actions={
            <>
              <Link className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800" to={withReturnTo("/author/locations/new")}>New Location</Link>
              <Link className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800" to="/author/locations/map">Inspect Atlas Viewer</Link>
              <Link className="rounded-md bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-800" to="/locations">Inspect Generic Editors</Link>
            </>
          }
        >
          {notice && <StatusNotice>{notice}</StatusNotice>}
          {(payload?.warnings.length ?? 0) > 0 && <StatusNotice className="mt-3" tone="warning">{payload?.warnings.length} world packet warning{payload?.warnings.length === 1 ? "" : "s"} found.</StatusNotice>}
        </AuthoringPanel>

        <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)] 2xl:grid-cols-[240px_minmax(440px,1fr)_minmax(500px,0.75fr)]">
          <section id="world-hierarchy" className="scroll-mt-4 rounded-md border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Hierarchy</div>
            <div className="max-h-[760px] overflow-y-auto pr-1">
              {locations.filter((location) => !text(location.parent_location_id)).map((location) => (
                <HierarchyNode key={entryId(location)} location={location} locations={locations} selectedId={selectedId} onSelect={(id) => { setSelectedId(id); setSelectedRouteId(""); }} depth={0} />
              ))}
              {locations.length === 0 && <EmptyState variant="compact" title="No locations yet">Create a location to start building the world hierarchy and map.</EmptyState>}
            </div>
          </section>

          <section id="world-map" className="min-w-0 scroll-mt-4 rounded-md border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-200 p-3 dark:border-slate-800">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-2">
                  {(["select", "sketch", "connect", "move"] as MapMode[]).map((item) => (
                    <button key={item} type="button" className={mode === item ? activeButton : inactiveButton} onClick={() => { setMode(item); if (item !== "connect") setPendingRouteSourceId(""); }}>
                      {item[0].toUpperCase() + item.slice(1)}
                    </button>
                  ))}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {mode === "sketch" && "Click empty map space to sketch a location draft."}
                  {mode === "connect" && (pendingRouteSourceId ? `Routing from ${label(locationsById.get(pendingRouteSourceId))}` : "Select a source location.")}
                  {mode === "move" && "Drag saved nodes to update placement."}
                  {mode === "select" && "Select nodes to inspect the world packet."}
                </div>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                <input className={inputClass} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search world" />
                <Select value={regionFilter} onChange={setRegionFilter} options={regions} empty="All regions" />
                <Select value={typeFilter} onChange={setTypeFilter} options={locationTypes} empty="All hierarchy" />
                <Select value={placeKindFilter} onChange={setPlaceKindFilter} options={placeKinds} empty="All place kinds" />
                <Select value={biomeFilter} onChange={setBiomeFilter} options={biomes} empty="All biomes" />
                <Select value={routeTypeFilter} onChange={setRouteTypeFilter} options={routeTypes} empty="All route types" />
                <select className={inputClass} value={routeFlagFilter} onChange={(event) => setRouteFlagFilter(event.target.value)}>
                  <option value="">All route states</option>
                  <option value="hidden">Hidden routes</option>
                  <option value="locked">Locked routes</option>
                  <option value="fast">Fast travel routes</option>
                </select>
                <select className={inputClass} value={nodeFlagFilter} onChange={(event) => setNodeFlagFilter(event.target.value)}>
                  <option value="">All node states</option>
                  <option value="safe">Safe zones</option>
                  <option value="respawn">Respawn points</option>
                  <option value="fast">Fast travel points</option>
                  <option value="playable">Playable spaces</option>
                  <option value="map">World map nodes</option>
                </select>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(["all", "danger", "story", "state", "issues"] as LayerMode[]).map((item) => (
                  <button key={item} type="button" className={layer === item ? activeButton : inactiveButton} onClick={() => setLayer(item)}>
                    {item[0].toUpperCase() + item.slice(1)}
                  </button>
                ))}
                <select className={inputClass} value={storyFilter} onChange={(event) => setStoryFilter(event.target.value as StoryFilter)}>
                  <option value="all">All story</option>
                  <option value="main">Main story</option>
                  <option value="side">Side/optional</option>
                  <option value="branch">Branches</option>
                  <option value="locked">Locked/reveal gated</option>
                </select>
                <select aria-label="Timeline Filter" className={inputClass} value={timelineFilter} onChange={(event) => { setTimelineFilter(event.target.value); setStoryArcFilter(""); }}>
                  <option value="">All timelines</option>
                  {storyTimelines.map((timeline) => <option key={entryId(timeline)} value={entryId(timeline)}>{label(timeline)}</option>)}
                </select>
                <select aria-label="Story Arc Filter" className={inputClass} value={storyArcFilter} onChange={(event) => setStoryArcFilter(event.target.value)}>
                  <option value="">All arcs</option>
                  {storyArcs
                    .filter((arc) => !timelineFilter || text(arc.timeline_id) === timelineFilter)
                    .map((arc) => <option key={entryId(arc)} value={entryId(arc)}>{label(arc)}</option>)}
                </select>
                <select aria-label="Lifecycle Filter" className={inputClass} value={lifecycleFilter} onChange={(event) => setLifecycleFilter(event.target.value)}>
                  <option value="">All lifecycle</option>
                  {lifecycleOptions.map((option) => <option key={option} value={option}>{option[0].toUpperCase() + option.slice(1)}</option>)}
                </select>
                <button type="button" className={showRouteLabels ? activeButton : inactiveButton} onClick={() => setShowRouteLabels((current) => !current)}>
                  Route Labels
                </button>
              </div>
            </div>

            <div
              ref={boardRef}
              data-testid="world-map-board"
              className="relative h-[680px] overflow-hidden bg-white dark:bg-slate-950"
              onClick={handleBoardClick}
              onPointerMove={handleBoardPointerMove}
              onPointerUp={() => void finishDrag()}
              onPointerCancel={() => void finishDrag()}
            >
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(148,163,184,.18)_1px,transparent_1px),linear-gradient(rgba(148,163,184,.18)_1px,transparent_1px)] bg-[size:40px_40px]" />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-sky-50 via-emerald-50 to-amber-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950" />
              <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                {filteredRoutes.map((route) => {
                  const from = locationsById.get(text(route.from_location_id));
                  const to = locationsById.get(text(route.to_location_id));
                  if (!from || !to) return null;
                  const fromCoordinates = coordinatesFromEntry(from);
                  const toCoordinates = coordinatesFromEntry(to);
                  const isSelected = selectedRouteIds.has(entryId(route)) || selectedRouteId === entryId(route);
                  return (
                    <line
                      key={entryId(route)}
                      x1={fromCoordinates.x}
                      y1={fromCoordinates.y}
                      x2={toCoordinates.x}
                      y2={toCoordinates.y}
                      className={`pointer-events-auto cursor-pointer ${routeLineClass(route, isSelected)}`}
                      strokeWidth={isSelected ? 1.2 : 0.8}
                      strokeDasharray={route.is_hidden ? "4 4" : text(route.requirements_id) ? "8 3" : undefined}
                      vectorEffect="non-scaling-stroke"
                      onClick={(event) => handleRouteClick(event, route)}
                      onPointerEnter={(event) => setRouteHover({ routeId: entryId(route), x: event.clientX, y: event.clientY })}
                      onPointerMove={(event) => setRouteHover({ routeId: entryId(route), x: event.clientX, y: event.clientY })}
                      onPointerLeave={() => setRouteHover(null)}
                    />
                  );
                })}
              </svg>
              {showRouteLabels && filteredRoutes.map((route) => {
                const from = locationsById.get(text(route.from_location_id));
                const to = locationsById.get(text(route.to_location_id));
                if (!from || !to) return null;
                const fromCoordinates = coordinatesFromEntry(from);
                const toCoordinates = coordinatesFromEntry(to);
                const x = (fromCoordinates.x + toCoordinates.x) / 2;
                const y = (fromCoordinates.y + toCoordinates.y) / 2;
                const routeStories = storyByRoute.get(entryId(route)) ?? [];
                return (
                  <div
                    key={`label-${entryId(route)}`}
                    className="pointer-events-none absolute max-w-[150px] -translate-x-1/2 -translate-y-1/2 truncate rounded bg-white/85 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 shadow dark:bg-slate-900/85 dark:text-slate-200"
                    style={{ left: `${x}%`, top: `${y}%` }}
                    title={routeLabel(route, locationsById)}
                  >
                    {routeStories.length > 0 ? "Story" : text(route.route_type, "Route")}
                  </div>
                );
              })}
              {filteredLocations.length === 0 ? (
                <div className="absolute left-4 top-4 max-w-sm"><EmptyState title="No locations match the current filters">Clear a search, region, route, story, or state filter to restore map nodes.</EmptyState></div>
              ) : filteredLocations.map((location) => {
                const id = entryId(location);
                const coordinates = coordinatesFromEntry(location);
                const selectedNode = id === selectedId;
                const issueCount = issueCounts.get(id) ?? 0;
                const connectedRoutes = routes.filter((route) => routeMatchesLocation(route, id));
                const storyBeats = (storyByLocation.get(id) ?? []).filter((beat) => storyBeatAllowed(beat, storyFilter));
                const canonicalOccurrences = scopedLocationOccurrencesById.get(id) ?? [];
                const lifecycle = mostImportantLifecycle(canonicalOccurrences);
                const story = hasStoryContent(id, payload, connectedRoutes) || storyBeats.length > 0 || canonicalOccurrences.length > 0;
                const danger = dangerScore(location, encounterCounts.get(id) ?? 0);
                const encounterNames = locationEncounterNames(id, payload?.encounter_tables ?? [], encountersById).slice(0, 3);
                return (
                  <button
                    key={id}
                    type="button"
                    className={`absolute flex max-w-[190px] -translate-x-1/2 -translate-y-1/2 items-center gap-1 truncate rounded-full border px-2 py-1 text-xs font-semibold shadow transition ${mode === "move" ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"} ${pendingRouteSourceId === id ? "ring-2 ring-amber-400" : ""} ${locationPointClass(location, selectedNode, layer, issueCount, story, danger, lifecycle)}`}
                    style={{ left: `${coordinates.x}%`, top: `${coordinates.y}%` }}
                    title={`${label(location)} / ${text(location.place_kind, "Unclassified")} / ${effectiveBiome(location) || "No biome"} / ${levelRangeLabel(location.level_range)}${lifecycle ? ` / Story state: ${lifecycle}` : ""}${encounterNames.length ? ` / Encounters: ${encounterNames.join(", ")}` : ""}`}
                    onClick={(event) => handleNodeClick(event, location)}
                    onPointerDown={(event) => handleNodePointerDown(event, location)}
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full bg-current opacity-70" />
                    <span className="truncate">{label(location)}</span>
                    {storyBeats.length > 0 && <span className="rounded bg-white/25 px-1 text-[10px]">S</span>}
                    {canonicalOccurrences.length > 0 && <span className="rounded bg-white/25 px-1 text-[10px]">{lifecycle || canonicalOccurrences.length}</span>}
                  </button>
                );
              })}
              {locationDrafts.map((draft) => {
                const id = entryId(draft);
                const coordinates = coordinatesFromEntry(draft);
                return (
                  <div
                    key={`draft-${id}`}
                    className={`absolute flex max-w-[230px] -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full border border-dashed px-2 py-1 text-xs font-semibold shadow ${selectedId === id ? "border-blue-700 bg-blue-700 text-white ring-2 ring-blue-300" : "border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100"}`}
                    style={{ left: `${coordinates.x}%`, top: `${coordinates.y}%` }}
                    title="Unsaved sketch location"
                  >
                    <button type="button" className="min-w-0 truncate" onClick={() => { setSelectedId(id); setSelectedRouteId(""); }}>{label(draft, "Sketch Location")}</button>
                    <button type="button" className="rounded bg-white/25 px-1 text-[10px]" onClick={() => openLocationDraft(draft)}>Open</button>
                    <button type="button" className="rounded bg-white/25 px-1 text-[10px]" onClick={() => discardLocationDraft(draft)}>Discard</button>
                  </div>
                );
              })}
              {routeHover && (
                <RouteHoverCard
                  route={routesById.get(routeHover.routeId)}
                  bindings={(payload?.route_event_bindings ?? []).filter((binding) => text(binding.route_id) === routeHover.routeId)}
                  locationsById={locationsById}
                  eventsById={eventsById}
                  encountersById={encountersById}
                  position={{ x: routeHover.x, y: routeHover.y }}
                />
              )}
            </div>
          </section>

          <section id="world-details" className="space-y-4 scroll-mt-4 rounded-md border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 xl:col-span-2 2xl:col-span-1">
            {selectedRoute ? (
              <RouteDetails
                route={selectedRoute}
                bindings={selectedRouteBindings}
                locationsById={locationsById}
                eventsById={eventsById}
                encountersById={encountersById}
                storyBeats={selectedRouteStoryBeats}
                onCreateEncounterEvent={() => createRouteEncounterEventDraft(selectedRoute)}
                onRequirementCommitted={(requirements_id) => setPayload((current) => current ? { ...current, routes: current.routes.map((route) => entryId(route) === entryId(selectedRoute) ? { ...route, requirements_id } : route) } : current)}
              />
            ) : selectedLocation ? (
              <div className="grid grid-cols-[repeat(auto-fit,minmax(360px,1fr))] gap-4">
                <AuthoringPanel title="Give this place a story" subtitle="Narrative Creation Flow" help="Capture lore prose, idea cards, creative relationships, and playable next steps as browser-local work before deciding which canonical records they need."><p className="text-sm text-slate-600 dark:text-slate-300">Start from {label(selectedLocation)} and keep the selected place as the protected return context.</p><button type="button" className={`${BUTTON_CLASSES.violet} ${BUTTON_SIZES.sm} mt-3`} onClick={() => setExpandPlaceOpen(true)}>Expand this place</button></AuthoringPanel>
                {!selectedIsDraft && (
                  <StoryPlacementPanel
                    entityKind="location"
                    entityId={entryId(selectedLocation)}
                    entityLabel={label(selectedLocation)}
                    entity={selectedLocation}
                    storyPacket={storyPacket}
                    onStoryPacketChange={setStoryPacket}
                  />
                )}
                <LocationDetails
                  location={selectedLocation}
                  isDraft={selectedIsDraft}
                  routes={selectedRoutes}
                  locationsById={locationsById}
                  encountersById={encountersById}
                  characters={payload?.characters ?? []}
                  adventureBeats={payload?.adventure_beats ?? []}
                  pois={selectedPois}
                  encounterTables={selectedEncounterTables}
                  routeEvents={selectedRouteEvents}
                  tuning={selectedTuning}
                  briefs={selectedBriefs}
                  issues={selectedIssues}
                  storyBeats={selectedLocationStoryBeats}
                  storyOccurrences={selectedLocationOccurrences}
                  storyWarnings={selectedLocationWarnings}
                  timelines={storyTimelines}
                  storyArcs={storyArcs}
                  onQuickSave={quickSaveLocation}
                  onSavePacket={saveWorldPacket}
                  onCreateRoute={startRouteFromSelected}
                  onCreatePoi={() => selected && createPoiDraft(selected)}
                  onChainCreated={load}
                  onPoiRequirementCommitted={(poiId, requirements_id) => setPayload((current) => current ? { ...current, pois: current.pois.map((poi) => entryId(poi) === poiId ? { ...poi, requirements_id } : poi) } : current)}
                />
              </div>
            ) : (
              <div className="text-sm text-slate-600 dark:text-slate-300">Select a location to inspect its world-building packet.</div>
            )}
          </section>
        </div>
      </div>
      {expandPlaceOpen && selectedLocation && <ThenComposer open mode="expand" origin={{ ref: { kind: "location", ...(selectedIsDraft ? { draftId: entryId(selectedLocation) } : { canonicalId: entryId(selectedLocation) }), label: label(selectedLocation) } }} originLabel={label(selectedLocation)} returnFrame={{ workspace: "world-builder", context: { kind: "location", ...(selectedIsDraft ? { draftId: entryId(selectedLocation) } : { canonicalId: entryId(selectedLocation) }), label: label(selectedLocation) }, selectedId: entryId(selectedLocation), localViewState: { mode, layer } }} onClose={() => setExpandPlaceOpen(false)} />}
    </AuthoringPageShell>
  );
}

const inputClass = "rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";
const activeButton = "rounded-md border border-blue-700 bg-blue-700 px-3 py-2 text-sm font-semibold text-white";
const inactiveButton = "rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-blue-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200";

function RouteHoverCard({
  route,
  bindings,
  locationsById,
  eventsById,
  encountersById,
  position,
}: {
  route: EntryRecord | undefined;
  bindings: EntryRecord[];
  locationsById: Map<string, EntryRecord>;
  eventsById: Map<string, EntryRecord>;
  encountersById: Map<string, EntryRecord>;
  position: { x: number; y: number };
}) {
  if (!route) return null;
  const left = Math.min(window.innerWidth - 340, position.x + 14);
  const top = Math.min(window.innerHeight - 260, position.y + 14);
  return (
    <div className="pointer-events-none fixed z-50 w-[320px] rounded-md border border-slate-200 bg-white p-3 text-sm shadow-xl dark:border-slate-700 dark:bg-slate-900" style={{ left: Math.max(8, left), top: Math.max(8, top) }}>
      <div className="font-semibold text-slate-950 dark:text-slate-100">{routeLabel(route, locationsById)}</div>
      <div className="mt-1 flex flex-wrap gap-1 text-xs text-slate-600 dark:text-slate-300">
        <Badge>{text(route.route_type, "Route")}</Badge>
        <Badge>{numberValue(route.travel_time)} time</Badge>
        <Badge>{numberValue(route.travel_cost)} cost</Badge>
        {Boolean(route.is_hidden) && <Badge>Hidden</Badge>}
        {Boolean(route.is_fast_travel_enabled) && <Badge>Fast Travel</Badge>}
        {text(route.requirements_id) && <Badge>Locked</Badge>}
      </div>
      <div className="mt-3 space-y-2">
        {bindings.length === 0 ? (
          <EmptyState variant="compact" title="No route events">Add route event bindings when travel on this route should trigger events, encounters, or story beats.</EmptyState>
        ) : bindings.slice(0, 4).map((binding) => {
          const event = eventsById.get(text(binding.event_id));
          const encounter = encountersById.get(text(event?.encounter_id));
          return (
            <div key={entryId(binding)} className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5 dark:border-slate-800 dark:bg-slate-950">
              <div className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">{event ? label(event) : text(binding.event_id, "Missing event")}</div>
              <div className="mt-0.5 truncate text-[11px] text-slate-600 dark:text-slate-400">
                {text(event?.type, "Event")} / {text(binding.trigger_mode, "Trigger")} / {numberValue(binding.chance, 100)}%
              </div>
              {encounter && <div className="mt-0.5 truncate text-[11px] text-violet-700 dark:text-violet-300">{label(encounter)}</div>}
            </div>
          );
        })}
        {bindings.length > 4 && <div className="text-[11px] text-slate-500 dark:text-slate-400">+{bindings.length - 4} more route events</div>}
      </div>
    </div>
  );
}

function RouteDetails({
  route,
  bindings,
  locationsById,
  eventsById,
  encountersById,
  storyBeats,
  onCreateEncounterEvent,
  onRequirementCommitted,
}: {
  route: EntryRecord;
  bindings: EntryRecord[];
  locationsById: Map<string, EntryRecord>;
  eventsById: Map<string, EntryRecord>;
  encountersById: Map<string, EntryRecord>;
  storyBeats: StoryBeat[];
  onCreateEncounterEvent: () => void;
  onRequirementCommitted: (requirementsId: string) => void;
}) {
  const id = entryId(route);
  const hasEncounter = routeHasEncounterEvent(bindings, eventsById);
  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Route / {text(route.route_type, "Unclassified")}</div>
        <h2 className="mt-1 text-xl font-semibold text-slate-950 dark:text-slate-100">{routeLabel(route, locationsById)}</h2>
        <div className="mt-2 flex flex-wrap gap-1">
          <Badge>{numberValue(route.travel_time)} time</Badge>
          <Badge>{numberValue(route.travel_cost)} cost</Badge>
          {Boolean(route.bidirectional) && <Badge>Bidirectional</Badge>}
          {Boolean(route.is_hidden) && <Badge>Hidden</Badge>}
          {Boolean(route.is_fast_travel_enabled) && <Badge>Fast Travel</Badge>}
          {text(route.requirements_id) && <Badge>Locked</Badge>}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Link className={inactiveButton} to={withReturnTo(`/location-routes?selected=${encodeURIComponent(id)}`)}>Edit Route</Link>
        <button type="button" className={inactiveButton} onClick={onCreateEncounterEvent}>{hasEncounter ? "Add Encounter Event" : "Create Encounter Event"}</button>
      </div>

      {text(route.description) && <Panel title="Route Notes"><p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">{text(route.description)}</p></Panel>}

      <StoryBeatPanel beats={storyBeats} />

      <ScopedGateSection
        targetSchema="location_routes"
        targetId={id}
        targetLabel={routeLabel(route, locationsById)}
        requirementId={text(route.requirements_id)}
        title="Route Access Gate"
        subtitle="Create or reuse the player-state requirement that controls travel along this route."
        tag="route-gate"
        onRequirementCommitted={onRequirementCommitted}
      />

      <Panel title="Route Events" link={withReturnTo("/route-event-bindings")}>
        {bindings.length === 0 ? <EmptyState variant="compact" title="No route events">Add a route event binding when this route should trigger events, encounters, or story beats.</EmptyState> : (
          <div className="space-y-2">
            {bindings.map((binding) => {
              const event = eventsById.get(text(binding.event_id));
              const encounter = encountersById.get(text(event?.encounter_id));
              return (
                <div key={entryId(binding)} className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{event ? label(event) : text(binding.event_id, "Missing event")}</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <Badge>{text(event?.type, "Event")}</Badge>
                        <Badge>{text(binding.trigger_mode, "Trigger")}</Badge>
                        <Badge>{numberValue(binding.chance, 100)}%</Badge>
                        <Badge>Priority {numberValue(binding.priority)}</Badge>
                      </div>
                      {encounter && <div className="mt-2 text-sm text-violet-700 dark:text-violet-300">Encounter: {label(encounter)}</div>}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-1">
                      <Link className="text-xs font-medium text-blue-700 dark:text-blue-300" to={withReturnTo(`/route-event-bindings?selected=${encodeURIComponent(entryId(binding))}`)}>Binding</Link>
                      {event && <Link className="text-xs font-medium text-blue-700 dark:text-blue-300" to={withReturnTo(`/events?selected=${encodeURIComponent(entryId(event))}`)}>Event</Link>}
                      {encounter && <Link className="text-xs font-medium text-blue-700 dark:text-blue-300" to={withReturnTo(`/encounters?selected=${encodeURIComponent(entryId(encounter))}`)}>Encounter</Link>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}

function Select({ value, onChange, options, empty }: { value: string; onChange: (value: string) => void; options: string[]; empty: string }) {
  return (
    <select className={inputClass} value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">{empty}</option>
      {options.map((option) => <option key={option} value={option}>{option}</option>)}
    </select>
  );
}

function LocationStoryStatePanel({
  locationId,
  occurrences,
  warnings,
  timelines,
  storyArcs,
}: {
  locationId: string;
  occurrences: StoryOccurrence[];
  warnings: EntryRecord[];
  timelines: EntryRecord[];
  storyArcs: EntryRecord[];
}) {
  const timelinesById = new Map(timelines.map((timeline) => [entryId(timeline), timeline]));
  const arcsById = new Map(storyArcs.map((arc) => [entryId(arc), arc]));
  const sorted = [...occurrences].sort((a, b) =>
    (a.timeline_id || "").localeCompare(b.timeline_id || "")
    || (a.story_arc_id || "").localeCompare(b.story_arc_id || "")
    || a.order - b.order
    || a.source_label.localeCompare(b.source_label)
  );
  return (
    <Panel title="Story / State Overlay">
      <div className="space-y-2" data-testid="location-story-state-panel">
        <div className="flex flex-wrap gap-1 text-xs">
          <Badge>{sorted.length} canonical occurrence{sorted.length === 1 ? "" : "s"}</Badge>
          <Badge>{warnings.length} warning{warnings.length === 1 ? "" : "s"}</Badge>
          <Link className="rounded bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-900 hover:bg-blue-200 dark:bg-blue-950 dark:text-blue-100 dark:hover:bg-blue-900" to={`/author/story-timeline?track=location&entity=${encodeURIComponent(locationId)}`} target="_blank" rel="noreferrer">Inspect Timeline in New Tab</Link>
        </div>
        {warnings.map((warning, index) => (
          <div key={`${text(warning.code)}-${text(warning.entry_id)}-${index}`} className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
            {text(warning.message, "Story placement needs review.")}
          </div>
        ))}
        {sorted.length === 0 ? (
          <EmptyState variant="compact" title="No story-state placements match">Clear map story filters or add story placement when this location should appear on the timeline.</EmptyState>
        ) : (
          <div className="grid gap-2">
            {sorted.map((occurrence) => {
              const timeline = timelinesById.get(occurrence.timeline_id);
              const arc = arcsById.get(occurrence.story_arc_id);
              const lifecycle = occurrenceLifecycle(occurrence);
              return (
                <div key={occurrence.id} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{occurrence.source_label || "Untitled story moment"}</div>
                      <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                        {label(timeline, "Unassigned timeline")} / {label(arc, "Unassigned arc")}
                      </div>
                    </div>
                    <span className={`rounded border px-2 py-0.5 text-[11px] font-semibold ${locationStateClass(lifecycle)}`}>{lifecycle || "active"}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1 text-[11px]">
                    {occurrence.role && <Badge>{occurrence.role}</Badge>}
                    {occurrence.occurrence_kind && <Badge>{occurrence.occurrence_kind}</Badge>}
                    {occurrence.importance && <Badge>{occurrence.importance}</Badge>}
                    {occurrence.state_label && <Badge>{occurrence.state_label}</Badge>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Panel>
  );
}

function StoryBeatPanel({ beats }: { beats: StoryBeat[] }) {
  return (
    <Panel title="Story Path">
      {beats.length === 0 ? <EmptyState variant="compact" title="No inferred story beats">Add story placements, route events, quests, dialogues, or encounters when this selection should appear in story flow.</EmptyState> : (
        <div className="space-y-2">
          {beats.map((beat, index) => (
            <Link key={`${beat.kind}-${beat.id}-${index}`} className="block rounded-md border border-slate-200 bg-slate-50 px-3 py-2 hover:border-blue-300 dark:border-slate-800 dark:bg-slate-950" to={beat.editorPath}>
              <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{beat.label}</div>
              <div className="mt-1 flex flex-wrap gap-1">
                <Badge>{beat.kind}</Badge>
                <Badge>{beat.arcType}</Badge>
                {beat.locked && <Badge>Locked</Badge>}
                {beat.branch && <Badge>Branch</Badge>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </Panel>
  );
}

function HierarchyNode({ location, locations, selectedId, onSelect, depth }: { location: EntryRecord; locations: EntryRecord[]; selectedId: string; onSelect: (id: string) => void; depth: number }) {
  const id = entryId(location);
  const children = childrenOf(locations, id);
  return (
    <div>
      <button
        type="button"
        className={`mb-1 flex w-full items-center justify-between gap-2 rounded-md border px-2 py-2 text-left text-sm ${id === selectedId ? "border-blue-500 bg-blue-50 text-blue-950 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-100" : "border-slate-200 bg-slate-50 text-slate-800 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"}`}
        style={{ marginLeft: depth * 14 }}
        onClick={() => onSelect(id)}
      >
        <span className="min-w-0 truncate">{label(location)}</span>
        <span className="shrink-0 rounded bg-slate-900/10 px-1.5 py-0.5 text-[10px] font-semibold dark:bg-white/10">{text(location.place_kind, text(location.location_type, "Zone"))}</span>
      </button>
      {children.map((child) => <HierarchyNode key={entryId(child)} location={child} locations={locations} selectedId={selectedId} onSelect={onSelect} depth={depth + 1} />)}
    </div>
  );
}

function LocationQuickEdit({ location, onSave }: { location: EntryRecord; onSave: (next: EntryRecord) => void }) {
  const [draft, setDraft] = useState<EntryRecord>(location);
  const [tagsText, setTagsText] = useState(() => getTags(location).join(", "));

  useEffect(() => {
    setDraft(location);
    setTagsText(getTags(location).join(", "));
  }, [location]);

  const range = isRecord(draft.level_range) ? draft.level_range : {};
  const setField = (key: string, value: unknown) => setDraft((current) => ({ ...current, [key]: value }));
  const setRange = (key: "min" | "max", value: string) => {
    const numeric = value === "" ? 0 : Number(value);
    setDraft((current) => ({ ...current, level_range: { ...(isRecord(current.level_range) ? current.level_range : {}), [key]: numeric } }));
  };
  const save = () => {
    const tags = tagsText.split(",").map((tag) => tag.trim()).filter(Boolean);
    onSave({ ...draft, tags });
  };

  return (
    <Panel title="Quick Edit">
      <div className="space-y-2">
        <input className={inputClass} value={editableText(draft.name)} onChange={(event) => setField("name", event.target.value)} placeholder="Location name" />
        <div className="grid gap-2 sm:grid-cols-2">
          <select className={inputClass} value={text(draft.place_kind)} onChange={(event) => setField("place_kind", event.target.value)}>
            {["Wilderness", "Settlement", "Dungeon", "Interior", "Road", "Waterway", "Landmark", "AbstractRegion", "Other"].map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
          <input className={inputClass} value={editableText(draft.region)} onChange={(event) => setField("region", event.target.value)} placeholder="Region" />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <input className={inputClass} type="number" value={editableText(range.min)} onChange={(event) => setRange("min", event.target.value)} placeholder="Min level" />
          <input className={inputClass} type="number" value={editableText(range.max)} onChange={(event) => setRange("max", event.target.value)} placeholder="Max level" />
        </div>
        <input className={inputClass} value={tagsText} onChange={(event) => setTagsText(event.target.value)} placeholder="Tags, comma separated" />
        <textarea className={`${inputClass} min-h-24 w-full`} value={editableText(draft.description)} onChange={(event) => setField("description", event.target.value)} placeholder="Notes or description" />
        <button type="button" className={activeButton} onClick={save}>Save Quick Edit</button>
      </div>
    </Panel>
  );
}

function InlineWorldPacketEditor({
  location,
  pois,
  encounterTables,
  briefs,
  encountersById,
  onSave,
  onPoiRequirementCommitted,
}: {
  location: EntryRecord;
  pois: EntryRecord[];
  encounterTables: EntryRecord[];
  briefs: EntryRecord[];
  encountersById: Map<string, EntryRecord>;
  onSave: (patch: WorldBundlePatch) => Promise<boolean>;
  onPoiRequirementCommitted: (poiId: string, requirementsId: string) => void;
}) {
  const [poiDrafts, setPoiDrafts] = useState<EntryRecord[]>(pois);
  const [tableDrafts, setTableDrafts] = useState<EntryRecord[]>(encounterTables);
  const [briefDrafts, setBriefDrafts] = useState<EntryRecord[]>(briefs);
  const [deletions, setDeletions] = useState<WorldBundlePatch["deletions"]>({});
  const [saving, setSaving] = useState(false);
  const [gatePoiId, setGatePoiId] = useState("");
  const [flowPoi, setFlowPoi] = useState<EntryRecord | null>(null);
  const original = JSON.stringify({ pois, encounterTables, briefs });
  const dirty = JSON.stringify({ pois: poiDrafts, encounterTables: tableDrafts, briefs: briefDrafts }) !== original || Object.values(deletions || {}).some((ids) => ids && ids.length > 0);
  const locationId = entryId(location);

  useEffect(() => {
    setPoiDrafts(pois);
    setTableDrafts(encounterTables);
    setBriefDrafts(briefs);
    setDeletions({});
  }, [briefs, encounterTables, locationId, pois]);

  const updateRow = (setter: Dispatch<SetStateAction<EntryRecord[]>>, index: number, patch: EntryRecord) => {
    setter((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  };
  const addPoi = () => {
    const name = `${label(location)} POI`;
    setPoiDrafts((current) => [...current, {
      id: generateUlid(), slug: generateSlug(name), location_id: locationId, name, poi_type: "Interactable",
      description: "", placement_notes: "", is_discoverable: false, discovery_hint: "", tags: [],
    }]);
  };
  const addTable = () => {
    const name = `${label(location)} Encounters`;
    setTableDrafts((current) => [...current, {
      id: generateUlid(), slug: generateSlug(name), location_id: locationId, name, description: "", spawn_rules: "",
      environmental_modifiers: [], encounter_entries: [], tags: [],
    }]);
  };
  const addBrief = () => {
    setBriefDrafts((current) => [...current, {
      id: generateUlid(), slug: generateSlug(`${label(location)} creative brief`), location_id: locationId,
      mood: "", visual_ideas: "", concept_refs: [], ambience_ideas: "", music_state: "", vfx_ideas: "",
      asset_ideas: "", landmarks: [], story_notes: "", tags: [],
    }]);
  };
  const reset = () => {
    setPoiDrafts(pois);
    setTableDrafts(encounterTables);
    setBriefDrafts(briefs);
    setDeletions({});
  };
  const removeOwnedRow = (
    key: "pois" | "encounter_tables" | "creative_briefs",
    row: EntryRecord,
    setter: Dispatch<SetStateAction<EntryRecord[]>>,
  ) => {
    if (!window.confirm(`Delete ${label(row)} when this packet is saved?`)) return;
    const id = entryId(row);
    setter((current) => current.filter((entry) => entryId(entry) !== id));
    const existed = key === "pois" ? pois.some((entry) => entryId(entry) === id)
      : key === "encounter_tables" ? encounterTables.some((entry) => entryId(entry) === id)
        : briefs.some((entry) => entryId(entry) === id);
    if (existed) setDeletions((current) => ({ ...current, [key]: [...(current?.[key] || []), id] }));
  };
  const save = async () => {
    setSaving(true);
    const saved = await onSave({ pois: poiDrafts, encounter_tables: tableDrafts, creative_briefs: briefDrafts, deletions });
    if (saved) reset();
    setSaving(false);
  };

  return (
    <Panel title="Inline Location Packet">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
        <span>Edit linked placement and creative records without leaving the selected location.</span>
        <div className="flex gap-2">
          <button type="button" className={inactiveButton} disabled={!dirty || saving} onClick={reset}>Reset Packet</button>
          <button type="button" className={activeButton} disabled={!dirty || saving} onClick={() => void save()}>{saving ? "Saving..." : "Save Packet"}</button>
        </div>
      </div>

      <details className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
        <summary className="cursor-pointer text-sm font-semibold">POIs / Interactables ({poiDrafts.length})</summary>
        <div className="mt-3 grid gap-3">
          {poiDrafts.map((poi, index) => (
            <div key={entryId(poi)} className="grid gap-2 rounded-md bg-slate-50 p-3 dark:bg-slate-950 sm:grid-cols-2">
              <input className={inputClass} value={editableText(poi.name)} onChange={(event) => updateRow(setPoiDrafts, index, { name: event.target.value })} placeholder="POI name" />
              <select className={inputClass} value={text(poi.poi_type, "Interactable")} onChange={(event) => updateRow(setPoiDrafts, index, { poi_type: event.target.value })}>
                {["Door", "Shrine", "LootNode", "QuestMarker", "NPCPlacement", "DiscoveryPoint", "RestPoint", "ResourceNode", "Hazard", "Interactable", "Other"].map((value) => <option key={value}>{value}</option>)}
              </select>
              <textarea className={`${inputClass} min-h-20 sm:col-span-2`} value={editableText(poi.placement_notes)} onChange={(event) => updateRow(setPoiDrafts, index, { placement_notes: event.target.value })} placeholder="Placement notes" />
              <input className={inputClass} value={editableText(poi.discovery_hint)} onChange={(event) => updateRow(setPoiDrafts, index, { discovery_hint: event.target.value })} placeholder="Discovery hint" />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(poi.is_discoverable)} onChange={(event) => updateRow(setPoiDrafts, index, { is_discoverable: event.target.checked })} /> Discoverable</label>
              <button type="button" className="text-left text-xs font-medium text-red-600 dark:text-red-300" onClick={() => removeOwnedRow("pois", poi, setPoiDrafts)}>Delete POI on save</button>
              {pois.some((savedPoi) => entryId(savedPoi) === entryId(poi)) && <button type="button" className="text-left text-xs font-medium text-blue-700 dark:text-blue-300" onClick={() => setGatePoiId(entryId(poi))}>Edit Access Gate</button>}
              {pois.some((savedPoi) => entryId(savedPoi) === entryId(poi)) && <button type="button" className="text-left text-xs font-medium text-violet-700 dark:text-violet-300" onClick={() => setFlowPoi(poi)}>On interaction, then…</button>}
            </div>
          ))}
          <button type="button" className={inactiveButton} onClick={addPoi}>Add POI</button>
          {gatePoiId && (() => {
            const poi = poiDrafts.find((row) => entryId(row) === gatePoiId);
            return poi ? <ScopedGateSection
              targetSchema="location_pois"
              targetId={gatePoiId}
              targetLabel={label(poi, gatePoiId)}
              requirementId={text(poi.requirements_id)}
              title="POI Access Gate"
              subtitle="Create or reuse the player-state requirement that controls this point of interest."
              tag="poi-gate"
              onRequirementCommitted={(requirements_id) => {
                setPoiDrafts((current) => current.map((row) => entryId(row) === gatePoiId ? { ...row, requirements_id } : row));
                onPoiRequirementCommitted(gatePoiId, requirements_id);
              }}
            /> : null;
          })()}
        </div>
      </details>
      {flowPoi && <ThenComposer open mode="then" origin={{ ref: { kind: "location_poi", canonicalId: entryId(flowPoi), label: label(flowPoi) } }} originLabel={label(flowPoi)} returnFrame={{ workspace: "world-builder", context: { kind: "location_poi", canonicalId: entryId(flowPoi), label: label(flowPoi) }, selectedId: entryId(flowPoi), localViewState: { ownerLocationId: locationId, outcome: "interaction_closed" } }} onClose={() => setFlowPoi(null)} />}

      <details className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
        <summary className="cursor-pointer text-sm font-semibold">Encounter Placement Tables ({tableDrafts.length})</summary>
        <div className="mt-3 grid gap-3">
          {tableDrafts.map((table, tableIndex) => (
            <div key={entryId(table)} className="grid gap-2 rounded-md bg-slate-50 p-3 dark:bg-slate-950">
              <input className={inputClass} value={editableText(table.name)} onChange={(event) => updateRow(setTableDrafts, tableIndex, { name: event.target.value })} placeholder="Table name" />
              <textarea className={`${inputClass} min-h-20`} value={editableText(table.spawn_rules)} onChange={(event) => updateRow(setTableDrafts, tableIndex, { spawn_rules: event.target.value })} placeholder="Spawn rules" />
              <CommaSeparatedInput className={inputClass} values={table.environmental_modifiers} onChange={(environmental_modifiers) => updateRow(setTableDrafts, tableIndex, { environmental_modifiers })} placeholder="Environmental modifiers, comma separated" />
              {encounterEntries(table).map((entry, entryIndex) => (
                <div key={`${entryId(table)}-${entryIndex}`} className="grid gap-2 rounded border border-slate-200 p-2 dark:border-slate-800 sm:grid-cols-4">
                  <select
                    className={`${inputClass} sm:col-span-2`}
                    value={text(entry.encounter_id)}
                    onChange={(event) => {
                      const rows = encounterEntries(table).map((row, index) => index === entryIndex ? { ...row, encounter_id: event.target.value } : row);
                      updateRow(setTableDrafts, tableIndex, { encounter_entries: rows });
                    }}
                  >
                    <option value="">Select encounter</option>
                    {[...encountersById.values()].map((encounter) => <option key={entryId(encounter)} value={entryId(encounter)}>{label(encounter)}</option>)}
                  </select>
                  {(["weight", "min_count", "max_count"] as const).map((field) => (
                    <input
                      key={field}
                      className={inputClass}
                      type="number"
                      value={numberValue(entry[field], field === "weight" ? 1 : 1)}
                      title={field}
                      onChange={(event) => {
                        const rows = encounterEntries(table).map((row, index) => index === entryIndex ? { ...row, [field]: Number(event.target.value) } : row);
                        updateRow(setTableDrafts, tableIndex, { encounter_entries: rows });
                      }}
                    />
                  ))}
                  <button
                    type="button"
                    className="text-left text-xs font-medium text-red-600 dark:text-red-300"
                    onClick={() => updateRow(setTableDrafts, tableIndex, { encounter_entries: encounterEntries(table).filter((_, index) => index !== entryIndex) })}
                  >
                    Remove placement row
                  </button>
                </div>
              ))}
              <button type="button" className={inactiveButton} onClick={() => updateRow(setTableDrafts, tableIndex, { encounter_entries: [...encounterEntries(table), { encounter_id: "", weight: 1, min_count: 1, max_count: 1 }] })}>Add Encounter Row</button>
              <button type="button" className="text-left text-xs font-medium text-red-600 dark:text-red-300" onClick={() => removeOwnedRow("encounter_tables", table, setTableDrafts)}>Delete encounter table on save</button>
            </div>
          ))}
          <button type="button" className={inactiveButton} onClick={addTable}>Add Encounter Table</button>
        </div>
      </details>

      <details className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
        <summary className="cursor-pointer text-sm font-semibold">Creative Briefs ({briefDrafts.length})</summary>
        <div className="mt-3 grid gap-3">
          {briefDrafts.map((brief, index) => (
            <div key={entryId(brief)} className="grid gap-2 rounded-md bg-slate-50 p-3 dark:bg-slate-950 sm:grid-cols-2">
              {(["mood", "music_state"] as const).map((field) => <input key={field} className={inputClass} value={editableText(brief[field])} onChange={(event) => updateRow(setBriefDrafts, index, { [field]: event.target.value })} placeholder={field.replace("_", " ")} />)}
              {(["visual_ideas", "ambience_ideas", "vfx_ideas", "asset_ideas", "story_notes"] as const).map((field) => <textarea key={field} className={`${inputClass} min-h-20`} value={editableText(brief[field])} onChange={(event) => updateRow(setBriefDrafts, index, { [field]: event.target.value })} placeholder={field.replace("_", " ")} />)}
              {(["concept_refs", "landmarks"] as const).map((field) => <CommaSeparatedInput key={field} className={inputClass} values={brief[field]} onChange={(values) => updateRow(setBriefDrafts, index, { [field]: values })} placeholder={`${field.replace("_", " ")}, comma separated`} />)}
              <button type="button" className="text-left text-xs font-medium text-red-600 dark:text-red-300" onClick={() => removeOwnedRow("creative_briefs", brief, setBriefDrafts)}>Delete creative brief on save</button>
            </div>
          ))}
          <button type="button" className={inactiveButton} onClick={addBrief}>Add Creative Brief</button>
        </div>
      </details>
    </Panel>
  );
}

function CombatChainCreator({
  location,
  characters,
  adventureBeats,
  onCreated,
}: {
  location: EntryRecord;
  characters: EntryRecord[];
  adventureBeats: EntryRecord[];
  onCreated: () => void;
}) {
  const locationId = entryId(location);
  const locationName = label(location, "Location");
  const [participantId, setParticipantId] = useState("");
  const [enemyCharacterId, setEnemyCharacterId] = useState("");
  const [encounterName, setEncounterName] = useState(`${locationName} Combat`);
  const [enemyName, setEnemyName] = useState(`${locationName} Enemy`);
  const [storyBeatTitle, setStoryBeatTitle] = useState(`${locationName} Combat`);
  const [adventureBeatId, setAdventureBeatId] = useState("");
  const [createStoryBeat, setCreateStoryBeat] = useState(true);
  const [createPoi, setCreatePoi] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const enemyOptions = useMemo(() => characters.filter((character) => Boolean(character.is_enemy_candidate)), [characters]);
  const selectedEnemy = useMemo(() => enemyOptions.find((character) => entryId(character) === enemyCharacterId), [enemyCharacterId, enemyOptions]);

  useEffect(() => {
    setParticipantId("");
    setEnemyCharacterId("");
    setEncounterName(`${locationName} Combat`);
    setEnemyName(`${locationName} Enemy`);
    setStoryBeatTitle(`${locationName} Combat`);
    setAdventureBeatId("");
    setCreateStoryBeat(true);
    setCreatePoi(true);
    setNotice("");
  }, [locationId, locationName]);

  useEffect(() => {
    if (participantId && participantId === enemyCharacterId) setEnemyCharacterId("");
  }, [enemyCharacterId, participantId]);

  const submit = async () => {
    setSaving(true);
    setNotice("");
    try {
      const response = await apiFetch("/api/ui/world_builder/combat-chain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location_id: locationId,
          participant_character_id: participantId,
          enemy_character_id: enemyCharacterId,
          encounter_name: encounterName,
          enemy_name: enemyCharacterId ? "" : enemyName,
          story_beat_title: storyBeatTitle,
          adventure_beat_id: createStoryBeat ? "" : adventureBeatId,
          create_story_beat: createStoryBeat,
          create_poi: createPoi,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !isRecord(body)) throw new Error(isRecord(body) ? text(body.message, "Combat chain failed to save.") : "Combat chain failed to save.");
      const chain = isRecord(body.chain) ? body.chain : {};
      setNotice(`${enemyCharacterId ? "Reused" : "Created"} enemy ${text(chain.enemy_id)} and created encounter ${text(chain.encounter_id)}, event ${text(chain.event_id)}, and story beat ${text(chain.adventure_beat_id)}.`);
      onCreated();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Combat chain failed to save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel title="Combat Chain Creator">
      <div className="mb-3 text-xs text-slate-600 dark:text-slate-400">
        Create a first-pass encounter package for this location: enemy, combat profile, placement, event trigger, and story links.
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <div className="mb-1 text-[11px] font-semibold uppercase text-slate-500">Specific Character</div>
          <select className={inputClass} value={participantId} onChange={(event) => setParticipantId(event.target.value)}>
            <option value="">No friendly participant</option>
            {characters.map((character) => <option key={entryId(character)} value={entryId(character)}>{label(character, entryId(character))}</option>)}
          </select>
        </label>
        <label className="block">
          <div className="mb-1 text-[11px] font-semibold uppercase text-slate-500">Enemy</div>
          <select className={inputClass} value={enemyCharacterId} onChange={(event) => setEnemyCharacterId(event.target.value)}>
            <option value="">Create new enemy</option>
            {enemyOptions.map((enemy) => {
              const details = [text(enemy.enemy_type), text(enemy.aggression), text(enemy.home_location_id) === locationId ? "here" : ""].filter(Boolean).join(" / ");
              return <option key={entryId(enemy)} value={entryId(enemy)} disabled={entryId(enemy) === participantId}>{label(enemy, entryId(enemy))}{details ? ` (${details})` : ""}</option>;
            })}
          </select>
        </label>
        <label className="block">
          <div className="mb-1 text-[11px] font-semibold uppercase text-slate-500">Encounter Name</div>
          <input className={inputClass} value={encounterName} onChange={(event) => setEncounterName(event.target.value)} />
        </label>
        <label className="block">
          <div className="mb-1 text-[11px] font-semibold uppercase text-slate-500">Enemy Name</div>
          <input className={inputClass} value={enemyCharacterId ? label(selectedEnemy, enemyCharacterId) : enemyName} disabled={Boolean(enemyCharacterId)} onChange={(event) => setEnemyName(event.target.value)} />
        </label>
        <label className="flex items-center gap-2 self-end text-sm text-slate-700 dark:text-slate-200">
          <input type="checkbox" checked={createPoi} onChange={(event) => setCreatePoi(event.target.checked)} />
          Create POI trigger
        </label>
      </div>
      <div className="mt-3 rounded-md border border-slate-200 p-3 dark:border-slate-800">
        <label className="mb-3 flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
          <input type="checkbox" checked={createStoryBeat} onChange={(event) => setCreateStoryBeat(event.target.checked)} />
          Create new story beat
        </label>
        {createStoryBeat ? (
          <label className="block">
            <div className="mb-1 text-[11px] font-semibold uppercase text-slate-500">Story Beat Title</div>
            <input className={inputClass} value={storyBeatTitle} onChange={(event) => setStoryBeatTitle(event.target.value)} />
          </label>
        ) : (
          <label className="block">
            <div className="mb-1 text-[11px] font-semibold uppercase text-slate-500">Existing Story Beat</div>
            <select className={inputClass} value={adventureBeatId} onChange={(event) => setAdventureBeatId(event.target.value)}>
              <option value="">Select story beat</option>
              {adventureBeats.map((beat) => <option key={entryId(beat)} value={entryId(beat)}>{label(beat, entryId(beat))}</option>)}
            </select>
          </label>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" className={activeButton} disabled={saving || !encounterName.trim() || (!enemyCharacterId && !enemyName.trim()) || (!createStoryBeat && !adventureBeatId)} onClick={() => void submit()}>
          {saving ? "Creating..." : "Create Combat Chain"}
        </button>
        {notice && <span className="text-xs text-slate-600 dark:text-slate-300">{notice}</span>}
      </div>
    </Panel>
  );
}

function LocationDetails({
  location,
  isDraft = false,
  routes,
  locationsById,
  encountersById,
  characters,
  adventureBeats,
  pois,
  encounterTables,
  routeEvents,
  tuning,
  briefs,
  issues,
  storyBeats,
  storyOccurrences,
  storyWarnings,
  timelines,
  storyArcs,
  onQuickSave,
  onSavePacket,
  onCreateRoute,
  onCreatePoi,
  onChainCreated,
  onPoiRequirementCommitted,
}: {
  location: EntryRecord;
  isDraft?: boolean;
  routes: EntryRecord[];
  locationsById: Map<string, EntryRecord>;
  encountersById: Map<string, EntryRecord>;
  characters: EntryRecord[];
  adventureBeats: EntryRecord[];
  pois: EntryRecord[];
  encounterTables: EntryRecord[];
  routeEvents: EntryRecord[];
  tuning: EntryRecord[];
  briefs: EntryRecord[];
  issues: HealthIssue[];
  storyBeats: StoryBeat[];
  storyOccurrences: StoryOccurrence[];
  storyWarnings: EntryRecord[];
  timelines: EntryRecord[];
  storyArcs: EntryRecord[];
  onQuickSave: (next: EntryRecord) => void;
  onSavePacket: (patch: WorldBundlePatch) => Promise<boolean>;
  onCreateRoute: () => void;
  onCreatePoi: () => void;
  onChainCreated: () => void;
  onPoiRequirementCommitted: (poiId: string, requirementsId: string) => void;
}) {
  const id = entryId(location);
  const coordinates = coordinatesFromEntry(location);
  const biome = effectiveBiome(location);
  const encounterNames = locationEncounterNames(id, encounterTables, encountersById);
  const detailTags = [biome, text(location.biome_inheritance, text(location.resolved_biome_inheritance)), text(location.region), levelRangeLabel(location.level_range), ...getEnvironmentTags(location), ...getTags(location)].filter(Boolean).slice(0, 12);
  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{text(location.location_type, "Location")} / {text(location.place_kind, "Unclassified")}</div>
        <h2 className="mt-1 text-xl font-semibold text-slate-950 dark:text-slate-100">{label(location)}</h2>
        <div className="mt-2 flex flex-wrap gap-1">
          {detailTags.map((tag) => <Badge key={tag}>{tag}</Badge>)}
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {Boolean(location.is_safe_zone) && <Badge>Safe</Badge>}
          {Boolean(location.is_fast_travel_point) && <Badge>Fast Travel</Badge>}
          {Boolean(location.has_respawn_point) && <Badge>Respawn</Badge>}
          {location.is_playable_space !== false && <Badge>Playable</Badge>}
          {location.is_world_map_node !== false && <Badge>Map Node</Badge>}
        </div>
        {isDraft && (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
            Unsaved sketch location. Use Quick Edit to name and save it into the world bundle.
          </div>
        )}
      </div>

      <LocationQuickEdit location={location} onSave={onQuickSave} />
      {!isDraft && (
        <InlineWorldPacketEditor
          location={location}
          pois={pois}
          encounterTables={encounterTables}
          briefs={briefs}
          encountersById={encountersById}
          onSave={onSavePacket}
          onPoiRequirementCommitted={onPoiRequirementCommitted}
        />
      )}
      {!isDraft && (
        <CombatChainCreator
          location={location}
          characters={characters}
          adventureBeats={adventureBeats}
          onCreated={onChainCreated}
        />
      )}
      <LocationStoryStatePanel
        locationId={id}
        occurrences={storyOccurrences}
        warnings={storyWarnings}
        timelines={timelines}
        storyArcs={storyArcs}
      />
      <StoryBeatPanel beats={storyBeats} />

      <div className="grid gap-2 sm:grid-cols-2">
        <Link className={inactiveButton} to={withReturnTo(`/author/locations/${encodeURIComponent(id)}`)}>Edit Location</Link>
        <button type="button" className={inactiveButton} disabled={isDraft} onClick={onCreateRoute}>Create Route</button>
        <button type="button" className={inactiveButton} disabled={isDraft} onClick={onCreatePoi}>Create POI</button>
        <Link className={inactiveButton} to={withReturnTo("/location-creative-briefs")}>Open Briefs</Link>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Fact label="Routes" value={String(routes.length)} />
        <Fact label="POIs" value={String(pois.length)} />
        <Fact label="Encounters" value={String(encounterNames.length)} />
        <Fact label="Issues" value={String(issues.length)} />
        <Fact label="Map" value={`${coordinates.x.toFixed(1)}, ${coordinates.y.toFixed(1)}`} />
      </div>

      {text(location.description) && <Panel title="Overview"><p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">{text(location.description)}</p></Panel>}

      <Panel title="Routes And Route Events" link={withReturnTo("/location-routes")}>
        <EntryList
          entries={routes}
          empty="No connected routes."
          detail={(entry) => {
            const other = locationsById.get(otherEndpoint(entry, id));
            return `${text(entry.route_type, "Route")} to ${other ? label(other) : "missing location"} / ${numberValue(entry.travel_time)} time`;
          }}
        />
        {routeEvents.length > 0 && <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-800"><EntryList entries={routeEvents} empty="" detail={(entry) => `${text(entry.trigger_mode)} / ${numberValue(entry.chance, 100)}%`} /></div>}
      </Panel>

      <Panel title="POIs / Interactables" link={withReturnTo("/location-pois")}>
        <EntryList entries={pois} empty="No POIs for this location." detail={(entry) => {
          const links = [
            text(entry.event_id) && "event",
            text(entry.dialogue_id) && "dialogue",
            text(entry.encounter_id) && "encounter",
            text(entry.item_id) && "item",
            text(entry.requirements_id) && "locked",
          ].filter(Boolean);
          return `${text(entry.poi_type)}${links.length ? ` / ${links.join(", ")}` : ""}${text(entry.placement_notes) ? ` / ${text(entry.placement_notes)}` : ""}`;
        }} />
      </Panel>

      <Panel title="Encounter Placement" link={withReturnTo("/location-encounter-tables")}>
        {encounterTables.length === 0 ? <EmptyState variant="compact" title="No encounter tables">Add an encounter table when this location should produce combat or encounter options.</EmptyState> : (
          <div className="space-y-2">
            {encounterTables.map((table) => (
              <div key={entryId(table)} className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{label(table)}</div>
                    <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">{encounterEntries(table).length} weighted entries</div>
                  </div>
                  <Link className="text-xs font-medium text-blue-700 dark:text-blue-300" to={withReturnTo(`/location-encounter-tables?selected=${encodeURIComponent(entryId(table))}`)}>Edit Table</Link>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {encounterEntries(table).slice(0, 6).map((entry, index) => {
                    const encounter = encountersById.get(text(entry.encounter_id));
                    return encounter ? (
                      <Link key={`${entryId(encounter)}-${index}`} className="rounded bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-900 hover:bg-violet-200 dark:bg-violet-950 dark:text-violet-100 dark:hover:bg-violet-900" to={withReturnTo(`/encounters?selected=${encodeURIComponent(entryId(encounter))}`)}>
                        {label(encounter)}
                      </Link>
                    ) : (
                      <Badge key={`missing-${index}`}>{text(entry.encounter_id, "Missing encounter")}</Badge>
                    );
                  })}
                </div>
                {(text(table.spawn_rules) || arrayText(table.environmental_modifiers).length > 0 || text(table.requirements_id)) && (
                  <div className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                    {text(table.spawn_rules) && <div>Rules: {text(table.spawn_rules)}</div>}
                    {arrayText(table.environmental_modifiers).length > 0 && <div>Modifiers: {arrayText(table.environmental_modifiers).join(", ")}</div>}
                    {text(table.requirements_id) && <div>Requirement: {text(table.requirements_id)}</div>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Travel Tuning" link="/travel-tuning">
        <EntryList entries={tuning} empty="No matching travel tuning rows." detail={(entry) => `${text(entry.route_type, "Any route")} / ${text(entry.place_kind, "Any place")} / ${text(entry.biome, "Any biome")} / encounter ${numberValue(entry.encounter_chance)}% / time x${numberValue(entry.travel_time_multiplier, 1)} / cost x${numberValue(entry.travel_cost_multiplier, 1)} / safe x${numberValue(entry.safe_zone_multiplier, 1)} / fatigue ${numberValue(entry.fatigue_cost)} / risk ${numberValue(entry.risk_score)}`} />
      </Panel>

      <Panel title="Creative Brief" link={withReturnTo("/location-creative-briefs")}>
        {briefs.length === 0 ? <EmptyState variant="compact" title="No creative brief">Add a creative brief when this location needs art, ambience, music, landmark, or story direction.</EmptyState> : briefs.map((brief) => (
          <div key={entryId(brief)} className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
            {text(brief.mood) && <p><span className="font-semibold">Mood:</span> {text(brief.mood)}</p>}
            {text(brief.visual_ideas) && <p><span className="font-semibold">Visual:</span> {text(brief.visual_ideas)}</p>}
            {text(brief.ambience_ideas) && <p><span className="font-semibold">Ambience:</span> {text(brief.ambience_ideas)}</p>}
            {text(brief.music_state) && <p><span className="font-semibold">Music:</span> {text(brief.music_state)}</p>}
            {arrayText(brief.concept_refs).length > 0 && <p><span className="font-semibold">Refs:</span> {arrayText(brief.concept_refs).join(", ")}</p>}
            {text(brief.vfx_ideas) && <p><span className="font-semibold">VFX:</span> {text(brief.vfx_ideas)}</p>}
            {text(brief.asset_ideas) && <p><span className="font-semibold">Assets:</span> {text(brief.asset_ideas)}</p>}
            {arrayText(brief.landmarks).length > 0 && <p><span className="font-semibold">Landmarks:</span> {arrayText(brief.landmarks).join(", ")}</p>}
            {text(brief.story_notes) && <p><span className="font-semibold">Story:</span> {text(brief.story_notes)}</p>}
          </div>
        ))}
      </Panel>

      <Panel title="Validation Issues">
        {issues.length === 0 ? (
          <EmptyState variant="compact" title="No world validation issues">This location has no current world-map issues. Continue drafting or inspect connected records for deeper validation.</EmptyState>
        ) : (
          <div className="grid gap-2">
            {issues.map((issue) => (
              <Link
                key={issue.id}
                className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100 dark:hover:bg-amber-900"
                to={healthIssueTarget(issue)}
              >
                <div className="font-semibold">{issue.title}</div>
                <div className="mt-1 text-xs">{issue.detail}</div>
                <div className="mt-1 font-mono text-[11px] opacity-75">{issue.schemaName}.{issue.path}</div>
              </Link>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function EntryList({ entries, empty, detail }: { entries: EntryRecord[]; empty: string; detail: (entry: EntryRecord) => string }) {
  if (entries.length === 0) return <EmptyState variant="compact" title={empty}>{worldEmptyHelp(empty)}</EmptyState>;
  return (
    <div className="grid gap-2">
      {entries.map((entry, index) => (
        <div key={entryId(entry) || index} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
          <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{label(entry, text(entry.title, "Entry"))}</div>
          <div className="mt-1 truncate text-xs text-slate-600 dark:text-slate-400">{detail(entry)}</div>
        </div>
      ))}
    </div>
  );
}

function Panel({ title, link, children }: { title: string; link?: string; children: ReactNode }) {
  return (
    <AuthoringPanel
      title={title}
      help={worldPanelHelp(title)}
      actions={link && <Link className="text-xs font-medium text-blue-700 dark:text-blue-300" to={link}>Inspect Source Records</Link>}
    >
      {children}
    </AuthoringPanel>
  );
}

function worldPanelHelp(title: string): string {
  if (title === "Story / State Overlay") return "Shows canonical story placements and warnings for this location without leaving the world map.";
  if (title === "Story Path") return "Shows inferred story beats connected to the selected location or route.";
  if (title === "Routes And Route Events") return "Shows connected routes and any events that trigger from those routes.";
  if (title === "POIs / Interactables") return "Shows points of interest and interactable content placed at this location.";
  if (title === "Encounter Placement") return "Shows encounter tables that can spawn or present encounters at this location.";
  if (title === "Travel Tuning") return "Shows travel cost, time, risk, and encounter tuning rows that apply here.";
  if (title === "Creative Brief") return "Shows art, ambience, audio, landmark, and story notes for this location.";
  if (title === "Validation Issues") return "Shows world validation issues that point to records needing attention.";
  return "Inspect this part of the selected world record.";
}

function worldEmptyHelp(empty: string): string {
  if (empty.includes("connected routes")) return "Create a route when this location should connect to another saved location.";
  if (empty.includes("POIs")) return "Create a POI when this location needs an interactable, item, event, dialogue, or encounter hook.";
  if (empty.includes("travel tuning")) return "Add travel tuning when this location or route type needs custom cost, time, risk, or encounter chances.";
  return "That can be fine while drafting; add source records when this part of the world needs authored content.";
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
      <div className="text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold text-slate-950 dark:text-slate-100" title={value}>{value}</div>
    </div>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return <span className="rounded bg-slate-900/10 px-2 py-0.5 text-[11px] font-semibold text-current dark:bg-white/10">{children}</span>;
}
