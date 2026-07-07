import {
  buildCrossEntityConsequenceBundle,
  defaultPlacementDraft,
  record,
  rows,
  text,
  type StoryPlacementDraft,
} from "./storyPlacement";
import type { EntryRecord } from "../types/editorQol";
import { generateUlid } from "../utils/generateId";

export type ConsequenceSourceKind = "event" | "encounter" | "quest" | "quest_objective" | "dialogue_node";

export interface ConsequencePacket {
  events: EntryRecord[];
  encounters: EntryRecord[];
  quests: EntryRecord[];
  dialogue_nodes: EntryRecord[];
  adventure_beats: EntryRecord[];
  adventure_beat_links: EntryRecord[];
  flags: EntryRecord[];
  items: EntryRecord[];
  currencies: EntryRecord[];
  factions: EntryRecord[];
  characters: EntryRecord[];
  locations: EntryRecord[];
  dependency_index: EntryRecord;
  story_packet: EntryRecord;
}

export interface ConsequenceBundle {
  events: EntryRecord[];
  encounters: EntryRecord[];
  quests: EntryRecord[];
  dialogue_nodes: EntryRecord[];
  adventure_beat_links: EntryRecord[];
}

export const emptyConsequencePacket: ConsequencePacket = {
  events: [],
  encounters: [],
  quests: [],
  dialogue_nodes: [],
  adventure_beats: [],
  adventure_beat_links: [],
  flags: [],
  items: [],
  currencies: [],
  factions: [],
  characters: [],
  locations: [],
  dependency_index: { nodes: [], edges: [] },
  story_packet: {},
};

const sourceKeyByKind: Record<ConsequenceSourceKind, keyof ConsequenceBundle> = {
  event: "events",
  encounter: "encounters",
  quest: "quests",
  quest_objective: "quests",
  dialogue_node: "dialogue_nodes",
};

export function consequenceText(value: unknown, fallback = ""): string {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}

export function consequenceRows(value: unknown): EntryRecord[] {
  return rows(value);
}

export function consequenceStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

export function consequenceLabel(entry: EntryRecord | null | undefined, fallback = "Untitled"): string {
  if (!entry) return fallback;
  return consequenceText(entry.name, consequenceText(entry.title, consequenceText(entry.slug, consequenceText(entry.id, fallback))));
}

export function normalizeConsequencePacket(value: unknown): ConsequencePacket {
  const source = record(value);
  return {
    ...emptyConsequencePacket,
    ...source,
    events: rows(source.events),
    encounters: rows(source.encounters),
    quests: rows(source.quests),
    dialogue_nodes: rows(source.dialogue_nodes),
    adventure_beats: rows(source.adventure_beats),
    adventure_beat_links: rows(source.adventure_beat_links),
    flags: rows(source.flags),
    items: rows(source.items),
    currencies: rows(source.currencies),
    factions: rows(source.factions),
    characters: rows(source.characters),
    locations: rows(source.locations),
    dependency_index: record(source.dependency_index),
    story_packet: record(source.story_packet),
  };
}

export function normalizeConsequenceSource(kind: ConsequenceSourceKind, source: EntryRecord): EntryRecord {
  if (kind === "event") {
    return {
      ...source,
      requirements_id: consequenceText(source.requirements_id),
      location_id: consequenceText(source.location_id),
      lore_id: consequenceText(source.lore_id),
      dialogue_id: consequenceText(source.dialogue_id),
      encounter_id: consequenceText(source.encounter_id),
      next_event_id: consequenceText(source.next_event_id),
      item_rewards: rows(source.item_rewards),
      currency_rewards: rows(source.currency_rewards),
      reputation_rewards: rows(source.reputation_rewards),
      flags_set: consequenceStrings(source.flags_set),
      tags: consequenceStrings(source.tags),
    };
  }
  if (kind === "encounter") {
    const rewards = record(source.rewards);
    return {
      ...source,
      requirements_id: consequenceText(source.requirements_id),
      participants: rows(source.participants),
      rewards: {
        xp: Number(rewards.xp || 0),
        items: rows(rewards.items),
        currencies: rows(rewards.currencies),
        reputation: rows(rewards.reputation),
        flags_set: consequenceStrings(rewards.flags_set),
      },
      tags: consequenceStrings(source.tags),
    };
  }
  if (kind === "quest" || kind === "quest_objective") {
    return {
      ...source,
      consequence_objective_id: kind === "quest_objective" ? consequenceText(source.consequence_objective_id) : undefined,
      story_arc_id: consequenceText(source.story_arc_id),
      requirements_id: consequenceText(source.requirements_id),
      objectives: rows(source.objectives),
      flags_set_on_completion: consequenceStrings(source.flags_set_on_completion),
      item_rewards: rows(source.item_rewards),
      currency_rewards: rows(source.currency_rewards),
      reputation_rewards: rows(source.reputation_rewards),
      tags: consequenceStrings(source.tags),
    };
  }
  return {
    ...source,
    dialogue_id: consequenceText(source.dialogue_id),
    speaker_character_id: consequenceText(source.speaker_character_id),
    requirements_id: consequenceText(source.requirements_id),
    choices: rows(source.choices),
    set_flags: consequenceStrings(source.set_flags),
    tags: consequenceStrings(source.tags),
  };
}

export function buildConsequenceComposerBundle({
  sourceKind,
  sourceDraft,
  expectedSource,
  storyLinks = [],
}: {
  sourceKind?: ConsequenceSourceKind;
  sourceDraft?: EntryRecord | null;
  expectedSource?: EntryRecord | null;
  storyLinks?: EntryRecord[];
}): ConsequenceBundle {
  const bundle: ConsequenceBundle = {
    events: [],
    encounters: [],
    quests: [],
    dialogue_nodes: [],
    adventure_beat_links: storyLinks,
  };
  if (sourceKind && sourceDraft) {
    const key = sourceKeyByKind[sourceKind];
    const normalizedSource = normalizeConsequenceSource(sourceKind, sourceDraft);
    const { consequence_objective_id: _sourceObjectiveId, ...sourcePayload } = normalizedSource;
    const normalizedExpected = expectedSource ? normalizeConsequenceSource(sourceKind, expectedSource) : null;
    const { consequence_objective_id: _expectedObjectiveId, ...expectedPayload } = normalizedExpected || {};
    bundle[key] = [{
      ...sourcePayload,
      ...(normalizedExpected ? { expected_previous: expectedPayload } : {}),
    }];
  }
  return bundle;
}

export function buildStoryConsequenceLinks({
  anchorKind,
  anchorId,
  anchorLabel,
  targetDraft,
  existingLinks,
}: {
  anchorKind: "character" | "dialogue" | "encounter";
  anchorId: string;
  anchorLabel: string;
  targetDraft: StoryPlacementDraft;
  existingLinks: EntryRecord[];
}): { links: EntryRecord[]; error: string } {
  const result = buildCrossEntityConsequenceBundle({
    anchorKind,
    anchorId,
    anchorLabel,
    targetDraft,
    existingLinks,
    makeId: generateUlid,
  });
  if (result.error) return { links: [], error: result.error };
  return { links: rows(record(result.bundle).adventure_beat_links), error: "" };
}

export function defaultStoryConsequenceDraft(kind: "character" | "faction" | "item" | "location", beatId = ""): StoryPlacementDraft {
  return defaultPlacementDraft(generateUlid(), kind, "", beatId);
}

export function stableConsequenceBundle(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export function eventSourceKind(sourceKind: ConsequenceSourceKind | undefined): string {
  if (!sourceKind) return "";
  return sourceKind.replace(/_/g, " ");
}

export function sourceRows(packet: ConsequencePacket, sourceKind: ConsequenceSourceKind): EntryRecord[] {
  return packet[sourceKeyByKind[sourceKind]];
}

export function findSource(packet: ConsequencePacket, sourceKind: ConsequenceSourceKind, sourceId: string): EntryRecord | undefined {
  return sourceRows(packet, sourceKind).find((entry) => text(entry.id) === sourceId);
}
