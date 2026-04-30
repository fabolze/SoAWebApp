import { EDITOR_DATASETS, findDatasetBySchema, type EditorDatasetConfig } from "../config/editorDatasets";
import { apiFetch } from "../lib/api";
import { resolveReferenceFromOptionsSource } from "../components/schemaForm/helpers";
import type { EntryRecord } from "../types/editorQol";
import type { SchemaFieldConfig, SchemaDefinition } from "../components/schemaForm/types";

export interface RelationshipEntry {
  dataset: EditorDatasetConfig;
  entry: EntryRecord;
  id: string;
  label: string;
}

export interface OutboundReference {
  sourcePath: string;
  targetSchemaName: string;
  targetLabel: string;
  targetId: string;
  targetEntry?: RelationshipEntry;
  broken: boolean;
}

export interface InboundReference {
  sourceSchemaName: string;
  sourceLabel: string;
  routePath: string;
  apiPath: string;
  sourceId: string;
  sourceEntryLabel: string;
  paths: string[];
}

export interface RelationshipGroup<T> {
  schemaName: string;
  schemaLabel: string;
  routePath: string;
  count: number;
  items: T[];
}

export interface RelationshipIndex {
  entriesBySchema: Map<string, RelationshipEntry[]>;
  entriesBySchemaAndId: Map<string, Map<string, RelationshipEntry>>;
  schemasByName: Map<string, SchemaDefinition>;
}

export interface EntryRelationshipSummary {
  targetId: string;
  inbound: RelationshipGroup<InboundReference>[];
  outbound: RelationshipGroup<OutboundReference>[];
  related: RelationshipGroup<RelationshipEntry>[];
  scannedAt: number;
}

function isRecord(value: unknown): value is EntryRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toEntryArray(value: unknown): EntryRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function entryId(entry: EntryRecord): string {
  return typeof entry.id === "string" ? entry.id : "";
}

export function entryLabel(entry: EntryRecord): string {
  for (const key of ["name", "title", "slug", "id"]) {
    const value = entry[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "Untitled entry";
}

function normalizeRefType(refType: string): string {
  const byApiPath = EDITOR_DATASETS.find((dataset) => dataset.apiPath === refType);
  return byApiPath?.schemaName || refType;
}

function refSchemaName(config: SchemaFieldConfig): string | null {
  if (typeof config.ui?.reference === "string" && config.ui.reference.trim()) {
    return normalizeRefType(config.ui.reference.trim());
  }
  const fromOptions = resolveReferenceFromOptionsSource(config.ui?.options_source);
  return fromOptions ? normalizeRefType(fromOptions) : null;
}

async function loadSchema(schemaName: string): Promise<SchemaDefinition> {
  const loaded = await import(`../../../backend/app/schemas/${schemaName}.json`);
  return (loaded.default || loaded) as SchemaDefinition;
}

export async function buildRelationshipIndex(): Promise<RelationshipIndex> {
  const bundles = await Promise.all(
    EDITOR_DATASETS.map(async (dataset) => {
      const [schema, response] = await Promise.all([
        loadSchema(dataset.schemaName).catch(() => ({ properties: {} })),
        apiFetch(`/api/${dataset.apiPath}`).catch(() => null),
      ]);
      const payload = response ? await response.json().catch(() => []) : [];
      return { dataset, schema, entries: toEntryArray(payload) };
    })
  );

  const entriesBySchema = new Map<string, RelationshipEntry[]>();
  const entriesBySchemaAndId = new Map<string, Map<string, RelationshipEntry>>();
  const schemasByName = new Map<string, SchemaDefinition>();

  for (const bundle of bundles) {
    schemasByName.set(bundle.dataset.schemaName, bundle.schema);
    const entries = bundle.entries.map((entry) => ({
      dataset: bundle.dataset,
      entry,
      id: entryId(entry),
      label: entryLabel(entry),
    })).filter((entry) => entry.id);
    entriesBySchema.set(bundle.dataset.schemaName, entries);
    entriesBySchemaAndId.set(bundle.dataset.schemaName, new Map(entries.map((entry) => [entry.id, entry])));
  }

  return { entriesBySchema, entriesBySchemaAndId, schemasByName };
}

function collectPrimitivePaths(value: unknown, targetId: string, currentPath: string, paths: string[], seen: WeakSet<object>) {
  if (typeof value === "string" && value === targetId) {
    paths.push(currentPath || "$");
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectPrimitivePaths(item, targetId, `${currentPath}[${index}]`, paths, seen));
    return;
  }
  if (!isRecord(value)) return;
  if (seen.has(value)) return;
  seen.add(value);
  Object.entries(value).forEach(([key, nested]) => collectPrimitivePaths(nested, targetId, currentPath ? `${currentPath}.${key}` : key, paths, seen));
}

function collectOutboundFromProperties(
  index: RelationshipIndex,
  properties: Record<string, SchemaFieldConfig>,
  source: EntryRecord,
  basePath: string,
  out: OutboundReference[]
) {
  for (const [key, config] of Object.entries(properties)) {
    const path = basePath ? `${basePath}.${key}` : key;
    const value = source[key];
    const targetSchemaName = refSchemaName(config);
    if (targetSchemaName) {
      const values = Array.isArray(value) ? value : [value];
      values.forEach((candidate, candidateIndex) => {
        if (typeof candidate !== "string" || !candidate.trim()) return;
        const targetDataset = findDatasetBySchema(targetSchemaName);
        const targetEntry = index.entriesBySchemaAndId.get(targetSchemaName)?.get(candidate);
        out.push({
          sourcePath: Array.isArray(value) ? `${path}[${candidateIndex}]` : path,
          targetSchemaName,
          targetLabel: targetDataset?.label || targetSchemaName,
          targetId: candidate,
          targetEntry,
          broken: !targetEntry,
        });
      });
    }
    if (config.type === "array" && config.items?.properties && Array.isArray(value)) {
      value.forEach((row, rowIndex) => {
        if (isRecord(row)) collectOutboundFromProperties(index, config.items?.properties || {}, row, `${path}[${rowIndex}]`, out);
      });
    }
    if ((config.type === "object" || config.properties) && config.properties && isRecord(value)) {
      collectOutboundFromProperties(index, config.properties, value, path, out);
    }
  }
}

function groupBySchema<T extends { targetSchemaName?: string; sourceSchemaName?: string }>(
  items: T[],
  schemaKey: "targetSchemaName" | "sourceSchemaName"
): RelationshipGroup<T>[] {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const schemaName = item[schemaKey];
    if (!schemaName) continue;
    const group = grouped.get(schemaName) || [];
    group.push(item);
    grouped.set(schemaName, group);
  }
  return Array.from(grouped.entries()).map(([schemaName, groupItems]) => {
    const dataset = findDatasetBySchema(schemaName);
    return {
      schemaName,
      schemaLabel: dataset?.label || schemaName,
      routePath: dataset?.routePath || "",
      count: groupItems.length,
      items: groupItems,
    };
  }).sort((a, b) => b.count - a.count || a.schemaLabel.localeCompare(b.schemaLabel));
}

export function summarizeEntryRelationships(index: RelationshipIndex, schemaName: string, entry: EntryRecord): EntryRelationshipSummary {
  const id = entryId(entry);
  const inbound: InboundReference[] = [];
  const outbound: OutboundReference[] = [];
  const schema = index.schemasByName.get(schemaName);
  collectOutboundFromProperties(index, schema?.properties || {}, entry, "", outbound);

  for (const [sourceSchemaName, entries] of index.entriesBySchema.entries()) {
    for (const source of entries) {
      if (sourceSchemaName === schemaName && source.id === id) continue;
      const paths: string[] = [];
      collectPrimitivePaths(source.entry, id, "$", paths, new WeakSet<object>());
      if (paths.length === 0) continue;
      inbound.push({
        sourceSchemaName,
        sourceLabel: source.dataset.label,
        routePath: source.dataset.routePath,
        apiPath: source.dataset.apiPath,
        sourceId: source.id,
        sourceEntryLabel: source.label,
        paths,
      });
    }
  }

  const relatedSchemas = new Set(["quests", "dialogues", "dialogue_nodes", "encounters", "items", "requirements", "flags", "locations"]);
  const relatedMap = new Map<string, RelationshipEntry>();
  outbound.forEach((ref) => {
    if (ref.targetEntry && relatedSchemas.has(ref.targetSchemaName)) relatedMap.set(`${ref.targetSchemaName}:${ref.targetId}`, ref.targetEntry);
  });
  inbound.forEach((ref) => {
    if (!relatedSchemas.has(ref.sourceSchemaName)) return;
    const entry = index.entriesBySchemaAndId.get(ref.sourceSchemaName)?.get(ref.sourceId);
    if (entry) relatedMap.set(`${ref.sourceSchemaName}:${ref.sourceId}`, entry);
  });

  const relatedBySchema = new Map<string, RelationshipEntry[]>();
  for (const related of relatedMap.values()) {
    const group = relatedBySchema.get(related.dataset.schemaName) || [];
    group.push(related);
    relatedBySchema.set(related.dataset.schemaName, group);
  }

  return {
    targetId: id,
    inbound: groupBySchema(inbound, "sourceSchemaName"),
    outbound: groupBySchema(outbound, "targetSchemaName"),
    related: Array.from(relatedBySchema.entries()).map(([relatedSchemaName, items]) => ({
      schemaName: relatedSchemaName,
      schemaLabel: findDatasetBySchema(relatedSchemaName)?.label || relatedSchemaName,
      routePath: findDatasetBySchema(relatedSchemaName)?.routePath || "",
      count: items.length,
      items: items.sort((a, b) => a.label.localeCompare(b.label)),
    })).sort((a, b) => b.count - a.count),
    scannedAt: Date.now(),
  };
}
