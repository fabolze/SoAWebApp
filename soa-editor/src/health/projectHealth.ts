import { EDITOR_DATASETS, findDatasetBySchema, type EditorDatasetConfig } from "../config/editorDatasets";
import { apiFetch } from "../lib/api";
import { resolveReferenceFromOptionsSource } from "../components/schemaForm/helpers";
import type { EntryRecord } from "../types/editorQol";

type Severity = "error" | "warning" | "info";
type HealthCategory = "reference" | "duplicate" | "required" | "empty" | "reward" | "world";

interface SchemaFieldConfig {
  type?: string;
  required?: string[];
  properties?: Record<string, SchemaFieldConfig>;
  items?: SchemaFieldConfig;
  ui?: {
    label?: string;
    reference?: string;
    options_source?: unknown;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface SchemaDefinition {
  required?: string[];
  properties?: Record<string, SchemaFieldConfig>;
}

interface DatasetBundle {
  dataset: EditorDatasetConfig;
  schema: SchemaDefinition;
  entries: EntryRecord[];
}

export interface HealthIssue {
  id: string;
  severity: Severity;
  category: HealthCategory;
  schemaName: string;
  schemaLabel: string;
  routePath: string;
  apiPath: string;
  entryId: string;
  entryLabel: string;
  path: string;
  title: string;
  detail: string;
}

export interface HealthSummary {
  generatedAt: number;
  datasetCount: number;
  entryCount: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  issues: HealthIssue[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (isRecord(value)) return Object.keys(value).length === 0;
  return false;
}

function toEntryArray(value: unknown): EntryRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function entryId(entry: EntryRecord): string {
  const raw = entry.id;
  return typeof raw === "string" && raw.trim() ? raw.trim() : "";
}

function entryLabel(entry: EntryRecord): string {
  for (const key of ["name", "title", "slug", "id"]) {
    const value = entry[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "Untitled entry";
}

function labelForField(key: string, config?: SchemaFieldConfig): string {
  const explicit = config?.ui?.label;
  return typeof explicit === "string" && explicit.trim() ? explicit.trim() : key.replace(/_/g, " ");
}

function normalizeRefType(refType: string): string {
  const byApiPath = EDITOR_DATASETS.find((dataset) => dataset.apiPath === refType);
  if (byApiPath) return byApiPath.schemaName;
  return refType;
}

function refSchemaName(config: SchemaFieldConfig): string | null {
  if (typeof config.ui?.reference === "string" && config.ui.reference.trim()) {
    return normalizeRefType(config.ui.reference.trim());
  }
  const fromOptions = resolveReferenceFromOptionsSource(config.ui?.options_source);
  return fromOptions ? normalizeRefType(fromOptions) : null;
}

function addIssue(issues: HealthIssue[], issue: Omit<HealthIssue, "id">) {
  issues.push({
    ...issue,
    id: `${issue.schemaName}:${issue.entryId}:${issue.category}:${issue.path}:${issues.length}`,
  });
}

async function loadSchema(schemaName: string): Promise<SchemaDefinition> {
  const module = await import(`../../../backend/app/schemas/${schemaName}.json`);
  return (module.default || module) as SchemaDefinition;
}

async function loadDataset(dataset: EditorDatasetConfig): Promise<DatasetBundle> {
  const [schema, res] = await Promise.all([
    loadSchema(dataset.schemaName),
    apiFetch(`/api/${dataset.apiPath}`),
  ]);
  const payload = await res.json().catch(() => []);
  return { dataset, schema, entries: toEntryArray(payload) };
}

function buildIdIndexes(bundles: DatasetBundle[]): Map<string, Set<string>> {
  const indexes = new Map<string, Set<string>>();
  for (const bundle of bundles) {
    indexes.set(bundle.dataset.schemaName, new Set(bundle.entries.map(entryId).filter(Boolean)));
  }
  return indexes;
}

function scanRequiredFields(bundle: DatasetBundle, issues: HealthIssue[]) {
  const required = Array.isArray(bundle.schema.required) ? bundle.schema.required : [];
  if (required.length === 0) return;
  for (const entry of bundle.entries) {
    const id = entryId(entry);
    if (!id) continue;
    for (const field of required) {
      if (!isEmptyValue(entry[field])) continue;
      addIssue(issues, {
        severity: "error",
        category: "required",
        schemaName: bundle.dataset.schemaName,
        schemaLabel: bundle.dataset.label,
        routePath: bundle.dataset.routePath,
        apiPath: bundle.dataset.apiPath,
        entryId: id,
        entryLabel: entryLabel(entry),
        path: field,
        title: "Missing required field",
        detail: `${labelForField(field, bundle.schema.properties?.[field])} is required but empty.`,
      });
    }
  }
}

function scanDuplicates(bundle: DatasetBundle, issues: HealthIssue[]) {
  for (const key of ["id", "slug"]) {
    const seen = new Map<string, EntryRecord[]>();
    for (const entry of bundle.entries) {
      const value = entry[key];
      if (typeof value !== "string" || !value.trim()) continue;
      const normalized = value.trim();
      const group = seen.get(normalized) || [];
      group.push(entry);
      seen.set(normalized, group);
    }
    for (const [value, entries] of seen.entries()) {
      if (entries.length < 2) continue;
      for (const entry of entries) {
        const id = entryId(entry);
        if (!id) continue;
        addIssue(issues, {
          severity: "error",
          category: "duplicate",
          schemaName: bundle.dataset.schemaName,
          schemaLabel: bundle.dataset.label,
          routePath: bundle.dataset.routePath,
          apiPath: bundle.dataset.apiPath,
          entryId: id,
          entryLabel: entryLabel(entry),
          path: key,
          title: `Duplicate ${key}`,
          detail: `${entries.length} ${bundle.dataset.label} entries share ${key} "${value}".`,
        });
      }
    }
  }
}

function scanReferencesInValue(
  bundle: DatasetBundle,
  entry: EntryRecord,
  config: SchemaFieldConfig,
  value: unknown,
  path: string,
  indexes: Map<string, Set<string>>,
  issues: HealthIssue[]
) {
  const id = entryId(entry);
  if (!id) return;

  const targetSchema = refSchemaName(config);
  if (targetSchema) {
    const validIds = indexes.get(targetSchema);
    const values = Array.isArray(value) ? value : [value];
    values.forEach((candidate, index) => {
      if (typeof candidate !== "string" || !candidate.trim()) return;
      if (validIds?.has(candidate)) return;
      const targetDataset = findDatasetBySchema(targetSchema);
      addIssue(issues, {
        severity: "error",
        category: "reference",
        schemaName: bundle.dataset.schemaName,
        schemaLabel: bundle.dataset.label,
        routePath: bundle.dataset.routePath,
        apiPath: bundle.dataset.apiPath,
        entryId: id,
        entryLabel: entryLabel(entry),
        path: Array.isArray(value) ? `${path}[${index}]` : path,
        title: "Broken reference",
        detail: `${labelForField(path.split(".").pop() || path, config)} points to missing ${targetDataset?.label || targetSchema} entry "${candidate}".`,
      });
    });
  }

  if (config.type === "array" && config.items?.properties && Array.isArray(value)) {
    value.forEach((row, index) => {
      if (!isRecord(row)) return;
      scanObjectFields(bundle, entry, config.items?.properties || {}, row, `${path}[${index}]`, indexes, issues);
    });
    return;
  }

  if ((config.type === "object" || config.properties) && config.properties && isRecord(value)) {
    scanObjectFields(bundle, entry, config.properties, value, path, indexes, issues);
  }
}

function scanObjectFields(
  bundle: DatasetBundle,
  entry: EntryRecord,
  properties: Record<string, SchemaFieldConfig>,
  source: Record<string, unknown>,
  basePath: string,
  indexes: Map<string, Set<string>>,
  issues: HealthIssue[]
) {
  for (const [key, config] of Object.entries(properties)) {
    const nextPath = basePath ? `${basePath}.${key}` : key;
    scanReferencesInValue(bundle, entry, config, source[key], nextPath, indexes, issues);
  }
}

function scanReferences(bundle: DatasetBundle, indexes: Map<string, Set<string>>, issues: HealthIssue[]) {
  const properties = bundle.schema.properties || {};
  for (const entry of bundle.entries) {
    scanObjectFields(bundle, entry, properties, entry, "", indexes, issues);
  }
}

function scanEmptyImportantArrays(bundle: DatasetBundle, issues: HealthIssue[]) {
  const important = new Set(["participants", "choices", "effects", "required_flags", "available_quests", "inventory", "loot_table"]);
  for (const entry of bundle.entries) {
    const id = entryId(entry);
    if (!id) continue;
    for (const [key, config] of Object.entries(bundle.schema.properties || {})) {
      if (config.type !== "array" || !important.has(key)) continue;
      if (Array.isArray(entry[key]) && entry[key].length > 0) continue;
      addIssue(issues, {
        severity: "warning",
        category: "empty",
        schemaName: bundle.dataset.schemaName,
        schemaLabel: bundle.dataset.label,
        routePath: bundle.dataset.routePath,
        apiPath: bundle.dataset.apiPath,
        entryId: id,
        entryLabel: entryLabel(entry),
        path: key,
        title: "Important list is empty",
        detail: `${labelForField(key, config)} is empty; verify this is intentional.`,
      });
    }
  }
}

function scanRewardValues(bundle: DatasetBundle, issues: HealthIssue[]) {
  const rewardPathPattern = /(reward|rewards|loot|price|cost|amount|quantity|drop_chance|xp_reward)/i;
  const visit = (entry: EntryRecord, value: unknown, path: string) => {
    if (Array.isArray(value)) {
      value.forEach((row, index) => visit(entry, row, `${path}[${index}]`));
      return;
    }
    if (isRecord(value)) {
      Object.entries(value).forEach(([key, nested]) => visit(entry, nested, path ? `${path}.${key}` : key));
      return;
    }
    if (typeof value !== "number" || !Number.isFinite(value)) return;
    if (!rewardPathPattern.test(path)) return;
    const isChance = /chance/i.test(path);
    const invalidChance = isChance && (value < 0 || value > 100);
    const invalidAmount = !isChance && /(amount|quantity|price|cost|xp_reward)/i.test(path) && value < 0;
    if (!invalidChance && !invalidAmount) return;
    const id = entryId(entry);
    if (!id) return;
    addIssue(issues, {
      severity: "warning",
      category: "reward",
      schemaName: bundle.dataset.schemaName,
      schemaLabel: bundle.dataset.label,
      routePath: bundle.dataset.routePath,
      apiPath: bundle.dataset.apiPath,
      entryId: id,
      entryLabel: entryLabel(entry),
      path,
      title: isChance ? "Invalid chance value" : "Invalid reward value",
      detail: isChance ? `${path} should usually stay between 0 and 100.` : `${path} should not be negative.`,
    });
  };
  bundle.entries.forEach((entry) => visit(entry, entry, ""));
}

function getBundle(bundles: DatasetBundle[], schemaName: string): DatasetBundle | undefined {
  return bundles.find((bundle) => bundle.dataset.schemaName === schemaName);
}

function getString(entry: EntryRecord | undefined, key: string): string {
  const value = entry?.[key];
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function getNumber(entry: EntryRecord, key: string, fallback = 0): number {
  const value = Number(entry[key]);
  return Number.isFinite(value) ? value : fallback;
}

const PLACE_KIND_VALUES = new Set(["Wilderness", "Settlement", "Dungeon", "Interior", "Road", "Waterway", "Landmark", "AbstractRegion", "Other"]);

function autoBiomeMode(location: EntryRecord): string {
  const explicit = getString(location, "biome_inheritance");
  if (explicit) return explicit;
  const type = getString(location, "location_type");
  if (["World", "Continent", "Region"].includes(type)) return "None";
  if (["Room", "Interior"].includes(type)) return "InheritFromParent";
  return "Own";
}

function effectiveBiome(location: EntryRecord, locationsById: Map<string, EntryRecord>): string {
  const mode = autoBiomeMode(location);
  const ownBiome = getString(location, "biome");
  if (mode === "Own" || mode === "Mixed") return ownBiome;
  if (mode === "None") return "";
  let parentId = getString(location, "parent_location_id");
  const visited = new Set<string>([entryId(location)]);
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = locationsById.get(parentId);
    if (!parent) return "";
    const parentBiome = getString(parent, "biome");
    if (parentBiome) return parentBiome;
    parentId = getString(parent, "parent_location_id");
  }
  return "";
}

function addWorldIssue(issues: HealthIssue[], bundle: DatasetBundle, entry: EntryRecord, severity: Severity, path: string, title: string, detail: string) {
  const id = entryId(entry);
  if (!id) return;
  addIssue(issues, {
    severity,
    category: "world",
    schemaName: bundle.dataset.schemaName,
    schemaLabel: bundle.dataset.label,
    routePath: bundle.dataset.routePath,
    apiPath: bundle.dataset.apiPath,
    entryId: id,
    entryLabel: entryLabel(entry),
    path,
    title,
    detail,
  });
}

function scanWorldDesign(bundles: DatasetBundle[], indexes: Map<string, Set<string>>, issues: HealthIssue[]) {
  const locationsBundle = getBundle(bundles, "locations");
  const routesBundle = getBundle(bundles, "location_routes");
  if (!locationsBundle || !routesBundle) return;

  const locationIds = indexes.get("locations") || new Set<string>();
  const routeIds = indexes.get("location_routes") || new Set<string>();
  const requirementIds = indexes.get("requirements") || new Set<string>();
  const eventIds = indexes.get("events") || new Set<string>();
  const encounterIds = indexes.get("encounters") || new Set<string>();
  const locationsById = new Map(locationsBundle.entries.map((entry) => [entryId(entry), entry]));
  const childrenByParent = new Map<string, EntryRecord[]>();
  for (const location of locationsBundle.entries) {
    const parentId = getString(location, "parent_location_id");
    if (!parentId) continue;
    childrenByParent.set(parentId, [...(childrenByParent.get(parentId) || []), location]);
    if (!locationIds.has(parentId)) {
      addWorldIssue(issues, locationsBundle, location, "error", "parent_location_id", "Missing parent location", `Parent location "${parentId}" does not exist.`);
    }
  }

  for (const location of locationsBundle.entries) {
    const id = entryId(location);
    const visited = new Set<string>();
    let parentId = getString(location, "parent_location_id");
    while (parentId) {
      if (parentId === id || visited.has(parentId)) {
        addWorldIssue(issues, locationsBundle, location, "error", "parent_location_id", "Location hierarchy cycle", "This location participates in a parent-location cycle.");
        break;
      }
      visited.add(parentId);
      parentId = getString(locationsById.get(parentId), "parent_location_id");
    }
  }

  const routeConnected = new Set<string>();
  const adjacency = new Map<string, Set<string>>();
  for (const route of routesBundle.entries) {
    const fromId = getString(route, "from_location_id");
    const toId = getString(route, "to_location_id");
    if (!locationIds.has(fromId) || !locationIds.has(toId)) {
      addWorldIssue(issues, routesBundle, route, "error", "from_location_id", "Route endpoint missing", "Route references one or more missing locations.");
    }
    if (fromId && toId && locationIds.has(fromId) && locationIds.has(toId)) {
      routeConnected.add(fromId);
      routeConnected.add(toId);
      adjacency.set(fromId, new Set([...(adjacency.get(fromId) || []), toId]));
      if (route.bidirectional !== false) adjacency.set(toId, new Set([...(adjacency.get(toId) || []), fromId]));
    }
    const requirementsId = getString(route, "requirements_id");
    if (requirementsId && !requirementIds.has(requirementsId)) {
      addWorldIssue(issues, routesBundle, route, "error", "requirements_id", "Missing route requirement", `Route requirement "${requirementsId}" does not exist.`);
    }
    if (route.is_hidden && !getString(route, "description") && (!Array.isArray(route.tags) || route.tags.length === 0)) {
      addWorldIssue(issues, routesBundle, route, "warning", "is_hidden", "Hidden route lacks discovery intent", "Hidden routes should have description or tags explaining how they are found.");
    }
  }

  for (const location of locationsBundle.entries) {
    const id = entryId(location);
    const type = getString(location, "location_type");
    const placeKind = getString(location, "place_kind");
    const inheritanceMode = autoBiomeMode(location);
    const resolvedBiome = effectiveBiome(location, locationsById);
    const isWorldMapNode = location.is_world_map_node !== false;
    const isPlayable = location.is_playable_space !== false;
    const hasChildren = (childrenByParent.get(id) || []).length > 0;
    const hasEncounters = Array.isArray(location.encounters) && location.encounters.length > 0;
    const hasNotes = Boolean(getString(location, "description"));
    if (isWorldMapNode && !routeConnected.has(id)) {
      addWorldIssue(issues, locationsBundle, location, "warning", "location_routes", "World-map location has no routes", "World-map nodes should normally connect to at least one route.");
    }
    if (["World", "Continent", "Region", "Zone", "Subzone"].includes(type) && !hasChildren && !hasEncounters && !hasNotes) {
      addWorldIssue(issues, locationsBundle, location, "warning", "location_type", "Empty hierarchy location", "This hierarchy location has no children, encounters, or description notes.");
    }
    if (isPlayable && !hasNotes) {
      addWorldIssue(issues, locationsBundle, location, "warning", "description", "Playable location lacks design notes", "Playable locations should have a description or creative brief.");
    }
    if (isPlayable && !placeKind) {
      addWorldIssue(issues, locationsBundle, location, "warning", "place_kind", "Playable location lacks place kind", "Playable locations should classify what kind of place they are.");
    }
    if (placeKind && !PLACE_KIND_VALUES.has(placeKind)) {
      addWorldIssue(issues, locationsBundle, location, "warning", "place_kind", "Unknown place kind", `Place kind "${placeKind}" is not part of the supported location taxonomy.`);
    }
    if (isPlayable && placeKind === "AbstractRegion") {
      addWorldIssue(issues, locationsBundle, location, "warning", "place_kind", "Abstract region marked playable", "Abstract regions should usually be containers rather than playable spaces.");
    }
    if (inheritanceMode === "Own" && !getString(location, "biome")) {
      addWorldIssue(issues, locationsBundle, location, "warning", "biome", "Own biome mode has no biome", "Own biome mode should provide a biome for ecology, travel tuning, and encounter context.");
    }
    if (inheritanceMode === "InheritFromParent" && !resolvedBiome) {
      addWorldIssue(issues, locationsBundle, location, "warning", "biome_inheritance", "Inherited biome not found", "This location inherits biome, but no parent biome could be resolved.");
    }
    if (isPlayable && !resolvedBiome && !["None", "Mixed"].includes(inheritanceMode)) {
      addWorldIssue(issues, locationsBundle, location, "warning", "biome", "Playable location has no effective biome", "Playable or tuning-relevant locations should usually have an own or inherited biome.");
    }
  }

  const startIds = locationsBundle.entries
    .filter((location) => location.is_safe_zone || location.has_respawn_point || (Array.isArray(location.tags) && location.tags.includes("start")))
    .map(entryId)
    .filter(Boolean);
  const reachable = new Set<string>();
  const queue = [...startIds];
  while (queue.length > 0) {
    const id = queue.shift() || "";
    if (!id || reachable.has(id)) continue;
    reachable.add(id);
    for (const next of adjacency.get(id) || []) {
      if (!reachable.has(next)) queue.push(next);
    }
  }
  if (startIds.length > 0) {
    for (const location of locationsBundle.entries) {
      const id = entryId(location);
      if (location.is_playable_space !== false && !reachable.has(id)) {
        addWorldIssue(issues, locationsBundle, location, "warning", "location_routes", "Playable location may be unreachable", "No route path from a starting/safe/respawn location reaches this location.");
      }
    }
  }

  const poiBundle = getBundle(bundles, "location_pois");
  for (const poi of poiBundle?.entries || []) {
    if (!locationIds.has(getString(poi, "location_id"))) addWorldIssue(issues, poiBundle!, poi, "error", "location_id", "Orphaned POI", "POI references a missing location.");
  }

  const encounterTableBundle = getBundle(bundles, "location_encounter_tables");
  for (const table of encounterTableBundle?.entries || []) {
    const entries = Array.isArray(table.encounter_entries) ? table.encounter_entries.filter(isRecord) : [];
    if (entries.length === 0) addWorldIssue(issues, encounterTableBundle!, table, "warning", "encounter_entries", "Encounter table is empty", "Encounter placement tables should include at least one weighted encounter entry.");
    entries.forEach((row, index) => {
      const encounterId = getString(row, "encounter_id");
      if (encounterId && !encounterIds.has(encounterId)) addWorldIssue(issues, encounterTableBundle!, table, "error", `encounter_entries[${index}].encounter_id`, "Missing encounter", `Encounter entry references missing encounter "${encounterId}".`);
      if (getNumber(row, "weight", 0) <= 0) addWorldIssue(issues, encounterTableBundle!, table, "warning", `encounter_entries[${index}].weight`, "Invalid encounter weight", "Encounter weights should be greater than 0.");
      if (getNumber(row, "max_count", 1) < getNumber(row, "min_count", 1)) addWorldIssue(issues, encounterTableBundle!, table, "warning", `encounter_entries[${index}].max_count`, "Invalid spawn count", "max_count should not be less than min_count.");
    });
  }

  const routeEventBundle = getBundle(bundles, "route_event_bindings");
  for (const binding of routeEventBundle?.entries || []) {
    if (!routeIds.has(getString(binding, "route_id"))) addWorldIssue(issues, routeEventBundle!, binding, "error", "route_id", "Missing route", "Route event binding references a missing route.");
    if (!eventIds.has(getString(binding, "event_id"))) addWorldIssue(issues, routeEventBundle!, binding, "error", "event_id", "Missing event", "Route event binding references a missing event.");
    const chance = getNumber(binding, "chance", 100);
    if (chance < 0 || chance > 100) addWorldIssue(issues, routeEventBundle!, binding, "warning", "chance", "Invalid event chance", "Route event chance should stay between 0 and 100.");
    if (getNumber(binding, "cooldown", 0) < 0) addWorldIssue(issues, routeEventBundle!, binding, "warning", "cooldown", "Invalid cooldown", "Cooldown should not be negative.");
  }

  const tuningBundle = getBundle(bundles, "travel_tuning");
  for (const tuning of tuningBundle?.entries || []) {
    const placeKind = getString(tuning, "place_kind");
    if (placeKind && !PLACE_KIND_VALUES.has(placeKind)) addWorldIssue(issues, tuningBundle!, tuning, "warning", "place_kind", "Unknown tuning place kind", `Travel tuning place kind "${placeKind}" is not part of the supported taxonomy.`);
    const chance = getNumber(tuning, "encounter_chance", 0);
    if (chance < 0 || chance > 100) addWorldIssue(issues, tuningBundle!, tuning, "warning", "encounter_chance", "Invalid encounter chance", "Encounter chance should stay between 0 and 100.");
    for (const key of ["travel_time_multiplier", "travel_cost_multiplier", "safe_zone_multiplier", "fatigue_cost", "risk_score"]) {
      if (getNumber(tuning, key, 0) < 0) addWorldIssue(issues, tuningBundle!, tuning, "warning", key, "Invalid travel tuning value", `${key} should not be negative.`);
    }
  }
}

export async function buildProjectHealthSummary(): Promise<HealthSummary> {
  const bundles = await Promise.all(EDITOR_DATASETS.map(loadDataset));
  const indexes = buildIdIndexes(bundles);
  const issues: HealthIssue[] = [];

  for (const bundle of bundles) {
    scanRequiredFields(bundle, issues);
    scanDuplicates(bundle, issues);
    scanReferences(bundle, indexes, issues);
    scanEmptyImportantArrays(bundle, issues);
    scanRewardValues(bundle, issues);
  }
  scanWorldDesign(bundles, indexes, issues);

  const sortedIssues = issues.sort((a, b) => {
    const severityScore: Record<Severity, number> = { error: 0, warning: 1, info: 2 };
    return severityScore[a.severity] - severityScore[b.severity] || a.schemaLabel.localeCompare(b.schemaLabel) || a.entryLabel.localeCompare(b.entryLabel);
  });

  return {
    generatedAt: Date.now(),
    datasetCount: bundles.length,
    entryCount: bundles.reduce((count, bundle) => count + bundle.entries.length, 0),
    errorCount: sortedIssues.filter((issue) => issue.severity === "error").length,
    warningCount: sortedIssues.filter((issue) => issue.severity === "warning").length,
    infoCount: sortedIssues.filter((issue) => issue.severity === "info").length,
    issues: sortedIssues,
  };
}
