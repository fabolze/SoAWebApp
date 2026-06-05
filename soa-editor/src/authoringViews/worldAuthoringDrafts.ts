import type { EntryRecord } from "../types/editorQol";
import { generateSlug, generateUlid } from "../utils/generateId";

export type MapCoordinates = { x: number; y: number };

export function clampCoordinate(value: unknown, fallback = 50): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(100, numeric));
}

export function roundedCoordinate(value: number): number {
  return Math.round(clampCoordinate(value) * 10) / 10;
}

export function coordinatesFromEntry(entry: EntryRecord | undefined, fallback: MapCoordinates = { x: 50, y: 50 }): MapCoordinates {
  const raw = typeof entry?.coordinates === "object" && entry.coordinates !== null && !Array.isArray(entry.coordinates)
    ? entry.coordinates as EntryRecord
    : {};
  return {
    x: clampCoordinate(raw.x, fallback.x),
    y: clampCoordinate(raw.y, fallback.y),
  };
}

export function coordinatesFromPointer(clientX: number, clientY: number, target: HTMLElement): MapCoordinates {
  const rect = target.getBoundingClientRect();
  return {
    x: roundedCoordinate(((clientX - rect.left) / rect.width) * 100),
    y: roundedCoordinate(((clientY - rect.top) / rect.height) * 100),
  };
}

export function createLocationDraftAt(coordinates: MapCoordinates): EntryRecord {
  const id = generateUlid();
  const shortId = id.slice(-6).toLowerCase();
  const name = "New Location";
  return {
    id,
    slug: generateSlug(`${name}-${shortId}`),
    name,
    description: "",
    biome: "",
    location_type: "Zone",
    place_kind: "Wilderness",
    environment_tags: [],
    biome_inheritance: "",
    region: "",
    sort_order: 0,
    is_playable_space: true,
    is_world_map_node: true,
    level_range: { min: 1, max: 5 },
    coordinates: { x: roundedCoordinate(coordinates.x), y: roundedCoordinate(coordinates.y) },
    encounters: [],
    is_safe_zone: false,
    is_fast_travel_point: false,
    has_respawn_point: false,
    tags: ["sketch"],
  };
}

export function createRouteDraft(fromLocation: EntryRecord, toLocation: EntryRecord): EntryRecord {
  const fromName = displayText(fromLocation.name, displayText(fromLocation.slug, "Location"));
  const toName = displayText(toLocation.name, displayText(toLocation.slug, "Location"));
  const label = `${fromName} to ${toName}`;
  return {
    id: generateUlid(),
    slug: generateSlug(label),
    from_location_id: displayText(fromLocation.id),
    to_location_id: displayText(toLocation.id),
    bidirectional: true,
    route_type: "Road",
    travel_cost: 0,
    travel_time: 0,
    requirements_id: "",
    is_hidden: false,
    is_fast_travel_enabled: false,
    description: "",
    tags: [],
  };
}

export function writeDraft(schemaName: string, data: EntryRecord): string {
  const id = displayText(data.id, generateUlid());
  const draftKey = `soa.draft.${schemaName}.${id}`;
  localStorage.setItem(draftKey, JSON.stringify({ data: { ...data, id }, ts: Date.now() }));
  localStorage.setItem(`soa.draft.last.${schemaName}`, draftKey);
  return draftKey;
}

export function readDraft(schemaName: string, id: string): EntryRecord | null {
  const draft = parseDraftData(localStorage.getItem(`soa.draft.${schemaName}.${id}`));
  return draft;
}

export function readDrafts(schemaName: string): EntryRecord[] {
  const prefix = `soa.draft.${schemaName}.`;
  const drafts: EntryRecord[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith(prefix)) continue;
    const draft = parseDraftData(localStorage.getItem(key));
    if (draft) drafts.push(draft);
  }
  return drafts.sort((a, b) => displayText(a.name, displayText(a.slug)).localeCompare(displayText(b.name, displayText(b.slug))));
}

export function removeDraft(schemaName: string, id: string): void {
  const draftKey = `soa.draft.${schemaName}.${id}`;
  localStorage.removeItem(draftKey);
  if (localStorage.getItem(`soa.draft.last.${schemaName}`) === draftKey) {
    localStorage.removeItem(`soa.draft.last.${schemaName}`);
  }
}

function parseDraftData(raw: string | null): EntryRecord | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const data = parsed?.data;
    return typeof data === "object" && data !== null && !Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

function displayText(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}
