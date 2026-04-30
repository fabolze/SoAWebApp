import { EDITOR_DATASETS, findDatasetBySchema, type EditorDatasetConfig } from "../config/editorDatasets";
import { apiFetch } from "../lib/api";
import { resolveReferenceFromOptionsSource } from "../components/schemaForm/helpers";
import type { EntryRecord } from "../types/editorQol";

type Severity = "error" | "warning" | "info";
type HealthCategory = "reference" | "duplicate" | "required" | "empty" | "reward";

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
