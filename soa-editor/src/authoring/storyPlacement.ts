import type { EntryRecord } from "../types/editorQol";

export type TrackKind = "location" | "character" | "quest" | "event" | "dialogue" | "encounter" | "lore_entry" | "item" | "faction" | "story_arc";
export type StoryPlacementRole = "setting" | "cast" | "player_journey" | "runtime" | "state" | "reward" | "reference";
export type StoryOccurrenceKind = "appearance" | "transition" | "reward" | "requirement" | "consequence" | "reference";
export type StoryChangeType = "introduced" | "active" | "changed" | "unavailable" | "restored" | "destroyed" | "obtained" | "lost" | "stolen" | "consumed" | "joins" | "leaves" | "captured" | "injured" | "dies" | "returns" | "transformed" | "none";
export type StoryImportance = "critical" | "major" | "minor" | "background";

export interface StoryOccurrence {
  id: string;
  entity_kind: TrackKind;
  entity_id: string;
  label: string;
  timeline_id: string;
  story_arc_id: string;
  source_kind: string;
  source_id: string;
  source_label: string;
  order: number;
  role?: string;
  occurrence_kind?: string;
  change_type?: string;
  state_label?: string;
  importance?: string;
}

export interface StoryPlacementLocalAttachment {
  kind: string;
  entry_id: string;
  label: string;
  role: string;
}

export interface StoryPlacementLocalBeat {
  id: string;
  title: string;
  timeline_id: string;
  story_arc_id: string;
  order: number;
  attachments: StoryPlacementLocalAttachment[];
}

export interface StoryPlacementDraft {
  id: string;
  adventure_beat_id: string;
  target_type: TrackKind;
  target_id: string;
  role: StoryPlacementRole;
  occurrence_kind: StoryOccurrenceKind;
  change_type: StoryChangeType;
  state_label: string;
  starts_at_beat_id: string;
  ends_at_beat_id: string;
  continuity_group_id: string;
  importance: StoryImportance;
  sort_order: number;
  notes: string;
  tags: string[];
}

export interface StoryPlacementWarning {
  id: string;
  severity: "warning" | "error";
  message: string;
}

interface DeriveEntityOccurrencesOptions {
  packet: EntryRecord | null | undefined;
  placements: EntryRecord[];
  eventChains: EntryRecord[];
  catalogsByKind: Map<string, Map<string, EntryRecord>>;
  localBeats: StoryPlacementLocalBeat[];
}

interface DeriveStoryPlacementWarningsOptions {
  entityKind: TrackKind;
  entity: EntryRecord | null | undefined;
  occurrences: StoryOccurrence[];
}

const TRACK_KINDS: TrackKind[] = ["location", "character", "quest", "event", "dialogue", "encounter", "lore_entry", "item", "faction", "story_arc"];

const catalogKeyByKind: Record<TrackKind, string> = {
  location: "locations",
  character: "characters",
  quest: "quests",
  event: "events",
  dialogue: "dialogues",
  encounter: "encounters",
  lore_entry: "lore_entries",
  item: "items",
  faction: "factions",
  story_arc: "story_arcs",
};

export const STORY_PLACEMENT_ROLES: StoryPlacementRole[] = ["setting", "cast", "player_journey", "runtime", "state", "reward", "reference"];
export const STORY_OCCURRENCE_KINDS: StoryOccurrenceKind[] = ["appearance", "transition", "reward", "requirement", "consequence", "reference"];
export const STORY_CHANGE_TYPES: StoryChangeType[] = ["introduced", "active", "changed", "unavailable", "restored", "destroyed", "obtained", "lost", "stolen", "consumed", "joins", "leaves", "captured", "injured", "dies", "returns", "transformed", "none"];
export const STORY_IMPORTANCE_LEVELS: StoryImportance[] = ["critical", "major", "minor", "background"];

export function rows(value: unknown): EntryRecord[] {
  return Array.isArray(value)
    ? value.filter((row): row is EntryRecord => typeof row === "object" && row !== null && !Array.isArray(row))
    : [];
}

export function record(value: unknown): EntryRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as EntryRecord : {};
}

export function text(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  const rendered = String(value).trim();
  return rendered || fallback;
}

export function label(row: EntryRecord | undefined, fallback = "Untitled"): string {
  if (!row) return fallback;
  return text(row.name, text(row.title, text(row.slug, text(row.id, fallback))));
}

export function singular(kind: string): string {
  const values: Record<string, string> = {
    quests: "quest",
    events: "event",
    characters: "character",
    locations: "location",
    dialogues: "dialogue",
    encounters: "encounter",
    lore_entries: "lore_entry",
    items: "item",
    factions: "faction",
  };
  return values[kind] || kind.replace(/s$/, "");
}

export function isTrackKind(value: string): value is TrackKind {
  return TRACK_KINDS.includes(value as TrackKind);
}

export function defaultPlacementDraft(id: string, entityKind: TrackKind, entityId: string, beatId = "", sortOrder = 0): StoryPlacementDraft {
  const defaults: Record<TrackKind, Pick<StoryPlacementDraft, "role" | "occurrence_kind" | "change_type" | "importance">> = {
    location: { role: "setting", occurrence_kind: "appearance", change_type: "active", importance: "minor" },
    character: { role: "cast", occurrence_kind: "appearance", change_type: "active", importance: "minor" },
    quest: { role: "player_journey", occurrence_kind: "appearance", change_type: "active", importance: "major" },
    event: { role: "runtime", occurrence_kind: "appearance", change_type: "active", importance: "major" },
    dialogue: { role: "runtime", occurrence_kind: "appearance", change_type: "active", importance: "major" },
    encounter: { role: "runtime", occurrence_kind: "appearance", change_type: "active", importance: "major" },
    lore_entry: { role: "reference", occurrence_kind: "reference", change_type: "none", importance: "minor" },
    item: { role: "reward", occurrence_kind: "reward", change_type: "obtained", importance: "major" },
    faction: { role: "state", occurrence_kind: "appearance", change_type: "active", importance: "minor" },
    story_arc: { role: "reference", occurrence_kind: "reference", change_type: "active", importance: "major" },
  };
  return {
    id,
    adventure_beat_id: beatId,
    target_type: entityKind,
    target_id: entityId,
    ...defaults[entityKind],
    state_label: "",
    starts_at_beat_id: "",
    ends_at_beat_id: "",
    continuity_group_id: entityId,
    sort_order: sortOrder,
    notes: "",
    tags: [],
  };
}

function stringValues(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
}

function isImportantItem(entity: EntryRecord | null | undefined): boolean {
  const type = text(entity?.type).toLowerCase();
  const rarity = text(entity?.rarity).toLowerCase();
  const tags = stringValues(entity?.tags).map((tag) => tag.toLowerCase());
  return ["quest", "setpiece"].includes(type)
    || ["rare", "epic", "legendary"].includes(rarity)
    || tags.some((tag) => ["quest", "key", "story", "legendary"].includes(tag));
}

function hasImportantDialogueState(entity: EntryRecord | null | undefined): boolean {
  const nodes = rows(entity?.nodes);
  const dialogueFlags = stringValues(entity?.set_flags);
  const nodeFlags = nodes.flatMap((node) => [
    ...stringValues(node.set_flags),
    ...rows(node.choices).flatMap((choice) => stringValues(choice.set_flags)),
  ]);
  return dialogueFlags.length > 0 || nodeFlags.length > 0;
}

function isStoryImportantLocation(entity: EntryRecord | null | undefined): boolean {
  const placeKind = text(entity?.place_kind).toLowerCase();
  const locationType = text(entity?.location_type).toLowerCase();
  const tags = [...stringValues(entity?.tags), ...stringValues(entity?.environment_tags)].map((tag) => tag.toLowerCase());
  return ["settlement", "dungeon", "landmark"].includes(placeKind)
    || ["hub", "zone", "dungeon", "city"].includes(locationType)
    || tags.some((tag) => ["story", "critical", "main", "quest"].includes(tag));
}

export function deriveStoryPlacementWarnings({ entityKind, entity, occurrences }: DeriveStoryPlacementWarningsOptions): StoryPlacementWarning[] {
  const warnings: StoryPlacementWarning[] = [];
  if (entityKind === "item" && isImportantItem(entity) && occurrences.length === 0) {
    warnings.push({
      id: "important-item-unplaced",
      severity: "warning",
      message: "Important item has no story placement.",
    });
  }
  if (entityKind === "dialogue" && hasImportantDialogueState(entity) && occurrences.length === 0) {
    warnings.push({
      id: "stateful-dialogue-unplaced",
      severity: "warning",
      message: "Dialogue changes story state but has no story placement.",
    });
  }
  if (entityKind === "location" && isStoryImportantLocation(entity) && occurrences.length === 0) {
    warnings.push({
      id: "important-location-unplaced",
      severity: "warning",
      message: "Important location has no story placement.",
    });
  }
  return warnings;
}

export function parseEntityTrackOccurrences(packet: EntryRecord | null | undefined): StoryOccurrence[] {
  const result: StoryOccurrence[] = [];
  Object.entries(record(packet?.entity_tracks)).forEach(([groupKey, value]) => {
    rows(value).forEach((row) => {
      const entityKind = text(row.entity_kind, singular(groupKey));
      if (!isTrackKind(entityKind)) return;
      result.push({
        id: text(row.id, `track:${entityKind}:${text(row.entity_id)}:${result.length}`),
        entity_kind: entityKind,
        entity_id: text(row.entity_id),
        label: text(row.label),
        timeline_id: text(row.timeline_id),
        story_arc_id: text(row.story_arc_id),
        source_kind: text(row.source_kind, "adventure_beat"),
        source_id: text(row.source_id),
        source_label: text(row.source_label),
        order: Number(row.order) || 0,
        role: text(row.role),
        occurrence_kind: text(row.occurrence_kind),
        change_type: text(row.change_type),
        state_label: text(row.state_label),
        importance: text(row.importance, "major"),
      });
    });
  });
  return result;
}

export function deriveCharacterStoryBeatOccurrences(placements: EntryRecord[], existing: StoryOccurrence[]): StoryOccurrence[] {
  const result: StoryOccurrence[] = [];
  placements.forEach((placement) => {
    if (text(placement.kind) !== "character_story_beat") return;
    const character = record(placement.character);
    const characterId = text(character.entry_id);
    if (!characterId) return;
    const duplicate = existing.some((row) =>
      row.source_kind === "character_story_beat"
      && row.source_id === text(placement.entry_id)
      && row.entity_id === characterId
    );
    if (duplicate) return;
    result.push({
      id: `character-beat:${text(placement.entry_id)}:${characterId}`,
      entity_kind: "character",
      entity_id: characterId,
      label: text(character.label, characterId),
      timeline_id: text(placement.timeline_id),
      story_arc_id: text(placement.story_arc_id),
      source_kind: "character_story_beat",
      source_id: text(placement.entry_id),
      source_label: text(placement.label),
      order: Number(placement.order) || 0,
      role: "cast",
      occurrence_kind: "appearance",
      change_type: "active",
      importance: "minor",
    });
  });
  return result;
}

export function deriveAdventureBeatOccurrences(
  placements: EntryRecord[],
  existing: StoryOccurrence[],
  catalogsByKind: Map<string, Map<string, EntryRecord>>,
): StoryOccurrence[] {
  const result: StoryOccurrence[] = [];
  placements.forEach((placement) => {
    if (text(placement.kind) !== "adventure_beat") return;
    rows(placement.attachments).forEach((attachment, index) => {
      const entityKind = text(attachment.target_type);
      if (!isTrackKind(entityKind)) return;
      const entityId = text(attachment.target_id);
      if (!entityId) return;
      const duplicate = existing.some((row) =>
        row.source_kind === "adventure_beat"
        && row.source_id === text(placement.entry_id)
        && row.entity_id === entityId
        && text(attachment.id)
        && row.id.endsWith(text(attachment.id))
      );
      if (duplicate) return;
      const catalog = catalogsByKind.get(catalogKeyByKind[entityKind]) || new Map<string, EntryRecord>();
      result.push({
        id: `adventure:${text(placement.entry_id)}:${entityKind}:${entityId}:${index}`,
        entity_kind: entityKind,
        entity_id: entityId,
        label: text(attachment.label, label(catalog.get(entityId), entityId)),
        timeline_id: text(placement.timeline_id),
        story_arc_id: text(placement.story_arc_id),
        source_kind: "adventure_beat",
        source_id: text(placement.entry_id),
        source_label: text(placement.label),
        order: Number(placement.order) || 0,
        role: text(attachment.role),
        occurrence_kind: text(attachment.occurrence_kind, "appearance"),
        change_type: text(attachment.change_type, "active"),
        state_label: text(attachment.state_label),
        importance: text(attachment.importance, "major"),
      });
    });
  });
  return result;
}

export function deriveRuntimeLocationOccurrences(
  eventChains: EntryRecord[],
  placements: EntryRecord[],
  catalogsByKind: Map<string, Map<string, EntryRecord>>,
): StoryOccurrence[] {
  const result: StoryOccurrence[] = [];
  const arcByPlacementSource = new Map<string, EntryRecord>();
  placements.forEach((placement) => {
    const source = record(placement.source);
    if (text(source.kind) && text(source.entry_id)) {
      arcByPlacementSource.set(`${text(source.kind)}:${text(source.entry_id)}`, placement);
    }
  });

  eventChains.forEach((event) => {
    const placement = arcByPlacementSource.get(`event:${text(event.event_id)}`);
    const attachments = record(event.attachments);
    ([
      ["location", text(attachments.location_id), "locations", "minor"],
      ["dialogue", text(attachments.dialogue_id), "dialogues", "major"],
      ["encounter", text(attachments.encounter_id), "encounters", "major"],
    ] as const).forEach(([entityKind, entityId, catalogKey, importance]) => {
      if (!entityId) return;
      result.push({
        id: `event:${text(event.event_id)}:${entityKind}:${entityId}`,
        entity_kind: entityKind,
        entity_id: entityId,
        label: label(catalogsByKind.get(catalogKey)?.get(entityId), entityId),
        timeline_id: text(placement?.timeline_id),
        story_arc_id: text(placement?.story_arc_id),
        source_kind: "event",
        source_id: text(event.event_id),
        source_label: text(event.label),
        order: Number(placement?.order) || 0,
        role: "runtime",
        occurrence_kind: "appearance",
        change_type: "active",
        importance,
      });
    });
  });
  return result;
}

export function deriveLocalBeatOccurrences(localBeats: StoryPlacementLocalBeat[]): StoryOccurrence[] {
  const result: StoryOccurrence[] = [];
  localBeats.forEach((beat) => {
    beat.attachments.forEach((attachment, index) => {
      if (!isTrackKind(attachment.kind)) return;
      result.push({
        id: `local:${beat.id}:${attachment.entry_id}:${index}`,
        entity_kind: attachment.kind,
        entity_id: attachment.entry_id,
        label: attachment.label,
        timeline_id: beat.timeline_id,
        story_arc_id: beat.story_arc_id,
        source_kind: "local_beat",
        source_id: beat.id,
        source_label: beat.title,
        order: beat.order,
        role: attachment.role,
        occurrence_kind: attachment.role === "reward" ? "reward" : "appearance",
        change_type: attachment.role === "reward" && attachment.kind === "item" ? "obtained" : "active",
        importance: attachment.kind === "item" || attachment.role === "reward" ? "major" : "minor",
      });
    });
  });
  return result;
}

export function filterBackgroundOccurrences(occurrences: StoryOccurrence[]): StoryOccurrence[] {
  return occurrences.filter((row) => row.importance !== "background");
}

export function deriveEntityOccurrences({
  packet,
  placements,
  eventChains,
  catalogsByKind,
  localBeats,
}: DeriveEntityOccurrencesOptions): StoryOccurrence[] {
  const result = parseEntityTrackOccurrences(packet);
  result.push(...deriveCharacterStoryBeatOccurrences(placements, result));
  result.push(...deriveAdventureBeatOccurrences(placements, result, catalogsByKind));
  result.push(...deriveRuntimeLocationOccurrences(eventChains, placements, catalogsByKind));
  result.push(...deriveLocalBeatOccurrences(localBeats));
  return result.sort((left, right) =>
    left.timeline_id.localeCompare(right.timeline_id)
    || left.story_arc_id.localeCompare(right.story_arc_id)
    || left.order - right.order
    || left.label.localeCompare(right.label)
  );
}
