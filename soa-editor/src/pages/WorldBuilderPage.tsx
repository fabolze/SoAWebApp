import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { buildProjectHealthSummary, type HealthIssue } from "../health/projectHealth";
import { generateSlug, generateUlid } from "../utils/generateId";
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
type LayerMode = "all" | "danger" | "story" | "issues";
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
  quests: EntryRecord[];
  story_arcs: EntryRecord[];
  dialogues: EntryRecord[];
  warnings: EntryRecord[];
}

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

function locationPointClass(location: EntryRecord, selected: boolean, layer: LayerMode, issueCount: number, story: boolean, danger: number): string {
  if (selected) return "border-blue-700 bg-blue-700 text-white ring-2 ring-blue-300";
  if (layer === "issues" && issueCount > 0) return "border-red-500 bg-red-50 text-red-900 dark:border-red-400 dark:bg-red-950 dark:text-red-100";
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

export default function WorldBuilderPage() {
  const navigate = useNavigate();
  const boardRef = useRef<HTMLDivElement | null>(null);
  const [payload, setPayload] = useState<WorldBuilderPayload | null>(null);
  const [selectedId, setSelectedId] = useState("");
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
  const [showRouteLabels, setShowRouteLabels] = useState(true);

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
      const data = await worldRes.json();
      if (!worldRes.ok || !isRecord(data)) throw new Error("World builder data failed to load.");
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
        quests: Array.isArray(data.quests) ? data.quests.filter(isRecord) : [],
        story_arcs: Array.isArray(data.story_arcs) ? data.story_arcs.filter(isRecord) : [],
        dialogues: Array.isArray(data.dialogues) ? data.dialogues.filter(isRecord) : [],
        warnings: Array.isArray(data.warnings) ? data.warnings.filter(isRecord) : [],
      };
      setPayload(nextPayload);
      setHealthIssues(health?.issues.filter((issue) => issue.category === "world") ?? []);
      if (nextPayload.locations.length > 0) {
        setSelectedId((current) => current || entryId(nextPayload.locations[0]));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "World builder failed to load.");
    } finally {
      setLoading(false);
    }
  }, []);

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
  const selectedRoute = useMemo(() => routesById.get(selectedRouteId), [routesById, selectedRouteId]);
  const selectedRoutes = useMemo(() => routes.filter((route) => routeMatchesLocation(route, selectedId)), [routes, selectedId]);
  const selectedPois = useMemo(() => (payload?.pois ?? []).filter((poi) => text(poi.location_id) === selectedId), [payload, selectedId]);
  const selectedEncounterTables = useMemo(() => (payload?.encounter_tables ?? []).filter((table) => text(table.location_id) === selectedId), [payload, selectedId]);
  const selectedBriefs = useMemo(() => (payload?.creative_briefs ?? []).filter((brief) => text(brief.location_id) === selectedId), [payload, selectedId]);
  const selectedRouteIds = useMemo(() => new Set(selectedRoutes.map(entryId)), [selectedRoutes]);
  const selectedRouteEvents = useMemo(() => (payload?.route_event_bindings ?? []).filter((binding) => selectedRouteIds.has(text(binding.route_id))), [payload, selectedRouteIds]);
  const selectedRouteBindings = useMemo(() => (payload?.route_event_bindings ?? []).filter((binding) => text(binding.route_id) === selectedRouteId), [payload, selectedRouteId]);
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

  const filteredLocations = useMemo(() => locations.filter((location) => {
    const id = entryId(location);
    const storyBeats = (storyByLocation.get(id) ?? []).filter((beat) => storyBeatAllowed(beat, storyFilter));
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
      && (layer !== "story" || storyBeats.length > 0);
    return matchesSearch && matchesRegion && matchesType && matchesPlace && matchesBiome && matchesNodeFlag && matchesLayer;
  }), [biomeFilter, issueCounts, layer, locations, nodeFlagFilter, placeKindFilter, regionFilter, search, storyByLocation, storyFilter, typeFilter]);

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
    const response = await apiFetch("/api/locations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    if (!response.ok) {
      setNotice("Could not save map placement. Reloading last saved world data.");
      await load();
      return;
    }
    setNotice("Map placement saved.");
  }, [load, locationsById]);

  const quickSaveLocation = useCallback(async (next: EntryRecord) => {
    const response = await apiFetch("/api/locations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    if (!response.ok) {
      setNotice("Could not save quick edit changes.");
      return;
    }
    setNotice("Location quick edit saved.");
    await load();
  }, [load]);

  const createSketchLocation = useCallback((coordinates: MapCoordinates) => {
    const draft = createLocationDraftAt(coordinates);
    writeDraft("locations", draft);
    refreshLocationDrafts();
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
    removeDraft("locations", entryId(draft));
    refreshLocationDrafts();
    setNotice("Sketch location draft discarded.");
  }, [refreshLocationDrafts]);

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

  if (loading) return <div className="p-6 text-sm text-slate-600 dark:text-slate-300">Loading world builder...</div>;
  if (error) return <div className="p-6 text-sm text-red-700 dark:text-red-300">{error}</div>;

  return (
    <div className="min-h-full bg-slate-100 p-4 dark:bg-slate-950">
      <div className="mx-auto max-w-7xl space-y-4">
        <section className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">World Builder</div>
              <h1 className="mt-1 text-2xl font-semibold text-slate-950 dark:text-slate-100">Interactive World Workspace</h1>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600 dark:text-slate-400">
                <Badge>{locations.length} locations</Badge>
                <Badge>{payload?.pois.length ?? 0} POIs</Badge>
                <Badge>{payload?.encounter_tables.length ?? 0} encounter tables</Badge>
                <Badge>{healthIssues.length} world issues</Badge>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800" to={withReturnTo("/author/locations/new")}>New Location</Link>
              <Link className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800" to="/author/locations/map">Atlas Viewer</Link>
              <Link className="rounded-md bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-800" to="/locations">Generic Editors</Link>
            </div>
          </div>
          {notice && <div className="mt-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">{notice}</div>}
          {(payload?.warnings.length ?? 0) > 0 && <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">{payload?.warnings.length} world packet warning{payload?.warnings.length === 1 ? "" : "s"} found.</div>}
        </section>

        <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_360px]">
          <section className="rounded-md border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Hierarchy</div>
            <div className="max-h-[760px] overflow-y-auto pr-1">
              {locations.filter((location) => !text(location.parent_location_id)).map((location) => (
                <HierarchyNode key={entryId(location)} location={location} locations={locations} selectedId={selectedId} onSelect={(id) => { setSelectedId(id); setSelectedRouteId(""); }} depth={0} />
              ))}
              {locations.length === 0 && <div className="text-sm text-slate-500 dark:text-slate-400">No locations yet.</div>}
            </div>
          </section>

          <section className="min-w-0 rounded-md border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
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
                {(["all", "danger", "story", "issues"] as LayerMode[]).map((item) => (
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
                <button type="button" className={showRouteLabels ? activeButton : inactiveButton} onClick={() => setShowRouteLabels((current) => !current)}>
                  Route Labels
                </button>
              </div>
            </div>

            <div
              ref={boardRef}
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
                <div className="absolute left-4 top-4 rounded bg-white/90 px-3 py-2 text-sm text-slate-600 shadow dark:bg-slate-900/90 dark:text-slate-300">No locations match the current filters.</div>
              ) : filteredLocations.map((location) => {
                const id = entryId(location);
                const coordinates = coordinatesFromEntry(location);
                const selectedNode = id === selectedId;
                const issueCount = issueCounts.get(id) ?? 0;
                const connectedRoutes = routes.filter((route) => routeMatchesLocation(route, id));
                const storyBeats = (storyByLocation.get(id) ?? []).filter((beat) => storyBeatAllowed(beat, storyFilter));
                const story = hasStoryContent(id, payload, connectedRoutes) || storyBeats.length > 0;
                const danger = dangerScore(location, encounterCounts.get(id) ?? 0);
                const encounterNames = locationEncounterNames(id, payload?.encounter_tables ?? [], encountersById).slice(0, 3);
                return (
                  <button
                    key={id}
                    type="button"
                    className={`absolute flex max-w-[190px] -translate-x-1/2 -translate-y-1/2 items-center gap-1 truncate rounded-full border px-2 py-1 text-xs font-semibold shadow transition ${mode === "move" ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"} ${pendingRouteSourceId === id ? "ring-2 ring-amber-400" : ""} ${locationPointClass(location, selectedNode, layer, issueCount, story, danger)}`}
                    style={{ left: `${coordinates.x}%`, top: `${coordinates.y}%` }}
                    title={`${label(location)} / ${text(location.place_kind, "Unclassified")} / ${effectiveBiome(location) || "No biome"} / ${levelRangeLabel(location.level_range)}${encounterNames.length ? ` / Encounters: ${encounterNames.join(", ")}` : ""}`}
                    onClick={(event) => handleNodeClick(event, location)}
                    onPointerDown={(event) => handleNodePointerDown(event, location)}
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full bg-current opacity-70" />
                    <span className="truncate">{label(location)}</span>
                    {storyBeats.length > 0 && <span className="rounded bg-white/25 px-1 text-[10px]">S</span>}
                  </button>
                );
              })}
              {locationDrafts.map((draft) => {
                const id = entryId(draft);
                const coordinates = coordinatesFromEntry(draft);
                return (
                  <div
                    key={`draft-${id}`}
                    className="absolute flex max-w-[190px] -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full border border-dashed border-amber-500 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-900 shadow dark:bg-amber-950 dark:text-amber-100"
                    style={{ left: `${coordinates.x}%`, top: `${coordinates.y}%` }}
                    title="Unsaved sketch location"
                  >
                    <button type="button" className="min-w-0 truncate" onClick={() => openLocationDraft(draft)}>{label(draft, "Sketch Location")}</button>
                    <button type="button" className="rounded bg-amber-200 px-1 text-[10px] text-amber-950 dark:bg-amber-800 dark:text-amber-50" onClick={() => discardLocationDraft(draft)}>Discard</button>
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

          <section className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            {selectedRoute ? (
              <RouteDetails
                route={selectedRoute}
                bindings={selectedRouteBindings}
                locationsById={locationsById}
                eventsById={eventsById}
                encountersById={encountersById}
                storyBeats={selectedRouteStoryBeats}
                onCreateEncounterEvent={() => createRouteEncounterEventDraft(selectedRoute)}
              />
            ) : selected ? (
              <LocationDetails
                location={selected}
                routes={selectedRoutes}
                locationsById={locationsById}
                encountersById={encountersById}
                pois={selectedPois}
                encounterTables={selectedEncounterTables}
                routeEvents={selectedRouteEvents}
                tuning={selectedTuning}
                briefs={selectedBriefs}
                issues={selectedIssues}
                storyBeats={selectedLocationStoryBeats}
                onQuickSave={quickSaveLocation}
                onCreateRoute={startRouteFromSelected}
                onCreatePoi={() => createPoiDraft(selected)}
              />
            ) : (
              <div className="text-sm text-slate-600 dark:text-slate-300">Select a location to inspect its world-building packet.</div>
            )}
          </section>
        </div>
      </div>
    </div>
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
          <div className="text-xs text-slate-500 dark:text-slate-400">No route events.</div>
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
}: {
  route: EntryRecord;
  bindings: EntryRecord[];
  locationsById: Map<string, EntryRecord>;
  eventsById: Map<string, EntryRecord>;
  encountersById: Map<string, EntryRecord>;
  storyBeats: StoryBeat[];
  onCreateEncounterEvent: () => void;
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

      <Panel title="Route Events" link={withReturnTo("/route-event-bindings")}>
        {bindings.length === 0 ? <div className="text-sm text-slate-500 dark:text-slate-400">No events trigger on this route.</div> : (
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

function StoryBeatPanel({ beats }: { beats: StoryBeat[] }) {
  return (
    <Panel title="Story Path">
      {beats.length === 0 ? <div className="text-sm text-slate-500 dark:text-slate-400">No inferred story beats for this selection.</div> : (
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

function LocationDetails({
  location,
  routes,
  locationsById,
  encountersById,
  pois,
  encounterTables,
  routeEvents,
  tuning,
  briefs,
  issues,
  storyBeats,
  onQuickSave,
  onCreateRoute,
  onCreatePoi,
}: {
  location: EntryRecord;
  routes: EntryRecord[];
  locationsById: Map<string, EntryRecord>;
  encountersById: Map<string, EntryRecord>;
  pois: EntryRecord[];
  encounterTables: EntryRecord[];
  routeEvents: EntryRecord[];
  tuning: EntryRecord[];
  briefs: EntryRecord[];
  issues: HealthIssue[];
  storyBeats: StoryBeat[];
  onQuickSave: (next: EntryRecord) => void;
  onCreateRoute: () => void;
  onCreatePoi: () => void;
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
      </div>

      <LocationQuickEdit location={location} onSave={onQuickSave} />
      <StoryBeatPanel beats={storyBeats} />

      <div className="grid gap-2 sm:grid-cols-2">
        <Link className={inactiveButton} to={withReturnTo(`/author/locations/${encodeURIComponent(id)}`)}>Edit Location</Link>
        <button type="button" className={inactiveButton} onClick={onCreateRoute}>Create Route</button>
        <button type="button" className={inactiveButton} onClick={onCreatePoi}>Create POI</button>
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
        <EntryList entries={pois} empty="No POIs for this location." detail={(entry) => text(entry.poi_type)} />
      </Panel>

      <Panel title="Encounter Placement" link={withReturnTo("/location-encounter-tables")}>
        {encounterTables.length === 0 ? <div className="text-sm text-slate-500 dark:text-slate-400">No encounter tables for this location.</div> : (
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
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Travel Tuning" link="/travel-tuning">
        <EntryList entries={tuning} empty="No matching travel tuning rows." detail={(entry) => `${text(entry.route_type, "Any route")} / ${text(entry.place_kind, "Any place")} / ${text(entry.biome, "Any biome")} / risk ${numberValue(entry.risk_score)}`} />
      </Panel>

      <Panel title="Creative Brief" link={withReturnTo("/location-creative-briefs")}>
        {briefs.length === 0 ? <div className="text-sm text-slate-500 dark:text-slate-400">No creative brief for this location.</div> : briefs.map((brief) => (
          <div key={entryId(brief)} className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
            {text(brief.mood) && <p><span className="font-semibold">Mood:</span> {text(brief.mood)}</p>}
            {text(brief.visual_ideas) && <p><span className="font-semibold">Visual:</span> {text(brief.visual_ideas)}</p>}
            {text(brief.ambience_ideas) && <p><span className="font-semibold">Ambience:</span> {text(brief.ambience_ideas)}</p>}
            {text(brief.music_state) && <p><span className="font-semibold">Music:</span> {text(brief.music_state)}</p>}
          </div>
        ))}
      </Panel>

      <Panel title="Validation Issues">
        <EntryList entries={issues as unknown as EntryRecord[]} empty="No world validation issues for this location." detail={(entry) => text(entry.detail)} />
      </Panel>
    </div>
  );
}

function EntryList({ entries, empty, detail }: { entries: EntryRecord[]; empty: string; detail: (entry: EntryRecord) => string }) {
  if (entries.length === 0) return <div className="text-sm text-slate-500 dark:text-slate-400">{empty}</div>;
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
    <section className="rounded-md border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
        {link && <Link className="text-xs font-medium text-blue-700 dark:text-blue-300" to={link}>Open editor</Link>}
      </div>
      {children}
    </section>
  );
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
