import {
  parseEntityTrackOccurrences,
  record,
  rows,
  text,
  type StoryOccurrence,
} from "./storyPlacement";
import type { EntryRecord } from "../types/editorQol";

export type ItemJourneyRowKind = "story" | "source";

export interface ItemJourneyRow {
  id: string;
  kind: ItemJourneyRowKind;
  sourceKind: string;
  label: string;
  ownerLabel: string;
  quantity: string;
  lifecycle: string;
  timelineId: string;
  storyArcId: string;
  scopeLabel: string;
  order: number | null;
  placed: boolean;
  route: string;
  tone: "reward" | "requirement" | "state" | "source" | "unplaced";
}

export interface ItemJourneyModel {
  rows: ItemJourneyRow[];
  warnings: string[];
  storyOccurrenceCount: number;
  sourceCount: number;
  unplacedSourceCount: number;
}

interface ItemPacketLike {
  item: EntryRecord;
  sources: Record<string, unknown>;
  catalogs: Record<string, EntryRecord[]>;
}

interface SourceCandidate {
  id: string;
  sourceKind: string;
  label: string;
  ownerKind: string;
  ownerId: string;
  ownerLabel: string;
  quantity: string;
  route: string;
}

function catalogById(values: EntryRecord[] | undefined): Map<string, EntryRecord> {
  return new Map((values || []).map((entry) => [text(entry.id), entry]));
}

function displayLabel(row: EntryRecord | undefined, fallback = "Unknown"): string {
  if (!row) return fallback;
  const nested = record(row.label);
  return text(row.name, text(row.title, text(nested.name, text(row.slug, text(row.id, fallback)))));
}

function routeFor(kind: string, id: string): string {
  if (!id) return "";
  const encoded = encodeURIComponent(id);
  if (kind === "quest") return `/author/quests/${encoded}`;
  if (kind === "event") return `/events?selected=${encoded}`;
  if (kind === "encounter") return `/author/encounters/${encoded}`;
  if (kind === "character") return `/author/characters/${encoded}`;
  if (kind === "location") return `/author/locations/${encoded}`;
  if (kind === "shop") return `/author/shops/${encoded}`;
  return "";
}

function sourceRows(value: unknown): Array<{ owner_id: string; entry: EntryRecord }> {
  return rows(value)
    .map((row) => ({ owner_id: text(row.owner_id), entry: record(row.entry) }))
    .filter((row) => row.owner_id && Object.keys(row.entry).length > 0);
}

function quantityLabel(entry: EntryRecord): string {
  const quantity = text(entry.quantity);
  const stock = text(entry.stock);
  const chance = text(entry.drop_chance);
  const values = [];
  if (quantity) values.push(`x${quantity}`);
  if (stock) values.push(`stock ${stock}`);
  if (chance) values.push(`${chance}%`);
  return values.join(" / ");
}

function scopeKey(row: Pick<ItemJourneyRow, "timelineId" | "storyArcId">): string {
  return `${row.timelineId || "none"}:${row.storyArcId || "none"}`;
}

function scopeLabel(row: Pick<ItemJourneyRow, "timelineId" | "storyArcId">, storyPacket: EntryRecord | null | undefined): string {
  const timelines = catalogById(rows(storyPacket?.timelines));
  const arcs = catalogById(rows(storyPacket?.story_arcs));
  const timeline = displayLabel(timelines.get(row.timelineId), row.timelineId);
  const arc = displayLabel(arcs.get(row.storyArcId), row.storyArcId);
  if (row.timelineId && row.storyArcId) return `${timeline} / ${arc}`;
  if (row.storyArcId) return arc;
  if (row.timelineId) return timeline;
  return "Unplaced";
}

function lifecycleFromOccurrence(occurrence: StoryOccurrence): string {
  return text(occurrence.state_label, text(occurrence.change_type, text(occurrence.occurrence_kind, text(occurrence.role, "Story"))));
}

function toneFromOccurrence(occurrence: StoryOccurrence): ItemJourneyRow["tone"] {
  if (occurrence.role === "requirement" || occurrence.occurrence_kind === "requirement") return "requirement";
  if (occurrence.role === "reward" || occurrence.occurrence_kind === "reward" || occurrence.change_type === "obtained" || occurrence.change_type === "restored") return "reward";
  return "state";
}

function buildSources(packet: ItemPacketLike): SourceCandidate[] {
  const catalogs = packet.catalogs || {};
  const shops = catalogById(catalogs.shops);
  const combatProfiles = catalogById(catalogs.combat_profiles);
  const quests = catalogById(catalogs.quests);
  const encounters = catalogById(catalogs.encounters);
  const events = catalogById(catalogs.events);
  const pois = catalogById(catalogs.pois);
  const result: SourceCandidate[] = [];

  rows(packet.sources.shop_inventory).forEach((row, index) => {
    const ownerId = text(row.shop_id);
    result.push({
      id: `shop:${ownerId}:${index}`,
      sourceKind: "Shop Inventory",
      label: "Sold by shop",
      ownerKind: "shop",
      ownerId,
      ownerLabel: displayLabel(shops.get(ownerId), ownerId),
      quantity: quantityLabel(row),
      route: routeFor("shop", ownerId),
    });
  });

  sourceRows(packet.sources.combat_loot).forEach((row, index) => {
    const owner = combatProfiles.get(row.owner_id);
    const characterId = text(owner?.character_id);
    result.push({
      id: `combat:${row.owner_id}:${index}`,
      sourceKind: "Combat Loot",
      label: "Dropped by combat profile",
      ownerKind: characterId ? "character" : "combat_profile",
      ownerId: characterId || row.owner_id,
      ownerLabel: displayLabel(owner, row.owner_id),
      quantity: quantityLabel(row.entry),
      route: characterId ? routeFor("character", characterId) : "",
    });
  });

  sourceRows(packet.sources.quest_rewards).forEach((row, index) => {
    result.push({
      id: `quest:${row.owner_id}:${index}`,
      sourceKind: "Quest Reward",
      label: "Rewarded by quest",
      ownerKind: "quest",
      ownerId: row.owner_id,
      ownerLabel: displayLabel(quests.get(row.owner_id), row.owner_id),
      quantity: quantityLabel(row.entry),
      route: routeFor("quest", row.owner_id),
    });
  });

  sourceRows(packet.sources.encounter_rewards).forEach((row, index) => {
    result.push({
      id: `encounter:${row.owner_id}:${index}`,
      sourceKind: "Encounter Reward",
      label: "Rewarded by encounter",
      ownerKind: "encounter",
      ownerId: row.owner_id,
      ownerLabel: displayLabel(encounters.get(row.owner_id), row.owner_id),
      quantity: quantityLabel(row.entry),
      route: routeFor("encounter", row.owner_id),
    });
  });

  sourceRows(packet.sources.event_rewards).forEach((row, index) => {
    result.push({
      id: `event:${row.owner_id}:${index}`,
      sourceKind: "Event Reward",
      label: "Rewarded by event",
      ownerKind: "event",
      ownerId: row.owner_id,
      ownerLabel: displayLabel(events.get(row.owner_id), row.owner_id),
      quantity: quantityLabel(row.entry),
      route: routeFor("event", row.owner_id),
    });
  });

  const poiIds = Array.isArray(packet.sources.poi_ids) ? packet.sources.poi_ids.map((value) => text(value)).filter(Boolean) : [];
  poiIds.forEach((poiId, index) => {
    const poi = pois.get(poiId);
    const locationId = text(poi?.location_id);
    result.push({
      id: `poi:${poiId}:${index}`,
      sourceKind: "World Placement",
      label: displayLabel(poi, poiId),
      ownerKind: locationId ? "location" : "poi",
      ownerId: locationId || poiId,
      ownerLabel: displayLabel(record(poi?.location), locationId || poiId),
      quantity: "",
      route: locationId ? routeFor("location", locationId) : "",
    });
  });

  return result;
}

export function buildItemJourneyModel(packet: ItemPacketLike, storyPacket: EntryRecord | null | undefined): ItemJourneyModel {
  const itemId = text(packet.item.id);
  const occurrences = parseEntityTrackOccurrences(storyPacket);
  const itemOccurrences = occurrences.filter((occurrence) => occurrence.entity_kind === "item" && occurrence.entity_id === itemId);
  const ownerOccurrences = new Map<string, StoryOccurrence[]>();
  occurrences.forEach((occurrence) => {
    const key = `${occurrence.entity_kind}:${occurrence.entity_id}`;
    ownerOccurrences.set(key, [...(ownerOccurrences.get(key) || []), occurrence]);
  });

  const storyRows: ItemJourneyRow[] = itemOccurrences.map((occurrence) => ({
    id: `story:${occurrence.id}`,
    kind: "story",
    sourceKind: "Story Placement",
    label: text(occurrence.source_label, "Story beat"),
    ownerLabel: text(occurrence.label, displayLabel(packet.item, itemId)),
    quantity: "",
    lifecycle: lifecycleFromOccurrence(occurrence),
    timelineId: occurrence.timeline_id,
    storyArcId: occurrence.story_arc_id,
    scopeLabel: scopeLabel({ timelineId: occurrence.timeline_id, storyArcId: occurrence.story_arc_id }, storyPacket),
    order: occurrence.order,
    placed: true,
    route: occurrence.source_kind === "adventure_beat" ? `/author/story-timeline?track=item&entity=${encodeURIComponent(itemId)}` : "",
    tone: toneFromOccurrence(occurrence),
  }));

  const sourceCandidates = buildSources(packet);
  const sourceJourneyRows = sourceCandidates.map((source) => {
    const ownerTrack = ownerOccurrences.get(`${source.ownerKind}:${source.ownerId}`)?.sort((a, b) => a.order - b.order)[0];
    const base = {
      id: `source:${source.id}`,
      kind: "source" as const,
      sourceKind: source.sourceKind,
      label: source.label,
      ownerLabel: source.ownerLabel,
      quantity: source.quantity,
      lifecycle: ownerTrack ? lifecycleFromOccurrence(ownerTrack) : "Unplaced",
      timelineId: text(ownerTrack?.timeline_id),
      storyArcId: text(ownerTrack?.story_arc_id),
      order: ownerTrack ? ownerTrack.order : null,
      placed: Boolean(ownerTrack),
      route: source.route,
      tone: ownerTrack ? "source" as const : "unplaced" as const,
    };
    return { ...base, scopeLabel: scopeLabel(base, storyPacket) };
  });

  const allRows = [...storyRows, ...sourceJourneyRows].sort((a, b) => {
    const scope = scopeKey(a).localeCompare(scopeKey(b));
    if (scope !== 0) return scope;
    if (a.order === null && b.order === null) return a.label.localeCompare(b.label);
    if (a.order === null) return 1;
    if (b.order === null) return -1;
    return a.order - b.order || a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label);
  });

  const warnings: string[] = [];
  const unplacedSources = sourceJourneyRows.filter((row) => !row.placed);
  if (unplacedSources.length > 0) warnings.push(`${unplacedSources.length} acquisition source(s) are not placed in story context.`);

  const rowsByScope = new Map<string, ItemJourneyRow[]>();
  allRows.filter((row) => row.order !== null).forEach((row) => {
    const key = scopeKey(row);
    rowsByScope.set(key, [...(rowsByScope.get(key) || []), row]);
  });
  rowsByScope.forEach((scopeRows) => {
    const acquisitions = scopeRows.filter((row) => row.tone === "reward" || row.tone === "source");
    const requirements = scopeRows.filter((row) => row.tone === "requirement");
    requirements.forEach((requirement) => {
      const earlierAcquisition = acquisitions.some((row) => row.order !== null && requirement.order !== null && row.order <= requirement.order);
      if (!earlierAcquisition) warnings.push(`${requirement.label} requires this item before any same-lane acquisition is visible.`);
    });
  });

  return {
    rows: allRows,
    warnings: [...new Set(warnings)],
    storyOccurrenceCount: itemOccurrences.length,
    sourceCount: sourceCandidates.length,
    unplacedSourceCount: unplacedSources.length,
  };
}
