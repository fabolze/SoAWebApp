import type { CrossEntityConsequenceTargetKind, StoryPlacementDraft, TrackKind } from "./storyPlacement";

type PresetFields = Pick<StoryPlacementDraft, "role" | "occurrence_kind" | "change_type" | "importance" | "state_label">;

export interface StoryPlacementPreset extends PresetFields {
  id: string;
  label: string;
  note: string;
}

export const GENERIC_STORY_PLACEMENT_PRESETS: StoryPlacementPreset[] = [
  { id: "setting", label: "Setting", note: "Where this beat happens.", role: "setting", occurrence_kind: "appearance", change_type: "active", importance: "minor", state_label: "" },
  { id: "cast", label: "Cast", note: "Who appears in the scene.", role: "cast", occurrence_kind: "appearance", change_type: "active", importance: "minor", state_label: "" },
  { id: "runtime", label: "Runtime", note: "What plays or triggers here.", role: "runtime", occurrence_kind: "appearance", change_type: "active", importance: "major", state_label: "" },
  { id: "state", label: "State", note: "A story state changes here.", role: "state", occurrence_kind: "transition", change_type: "changed", importance: "major", state_label: "" },
  { id: "reward", label: "Reward", note: "The player gains this here.", role: "reward", occurrence_kind: "reward", change_type: "obtained", importance: "major", state_label: "" },
  { id: "requirement", label: "Requirement", note: "This is needed here.", role: "reference", occurrence_kind: "requirement", change_type: "active", importance: "major", state_label: "" },
  { id: "reference", label: "Reference", note: "Mentioned or contextual.", role: "reference", occurrence_kind: "reference", change_type: "none", importance: "minor", state_label: "" },
  { id: "player_journey", label: "Player Journey", note: "Quest or path beat.", role: "player_journey", occurrence_kind: "appearance", change_type: "active", importance: "major", state_label: "" },
];

export const WORKSPACE_STORY_PLACEMENT_PRESETS: Partial<Record<TrackKind, StoryPlacementPreset[]>> = {
  character: [
    { id: "introduced", label: "Introduced", note: "The story establishes this character.", role: "cast", occurrence_kind: "transition", change_type: "introduced", importance: "major", state_label: "" },
    { id: "joins", label: "Joins", note: "The character joins the active cast or party.", role: "cast", occurrence_kind: "transition", change_type: "joins", importance: "major", state_label: "" },
    { id: "leaves", label: "Leaves", note: "The character leaves the active cast or party.", role: "cast", occurrence_kind: "transition", change_type: "leaves", importance: "major", state_label: "" },
    { id: "injured", label: "Injured", note: "The character is injured as a consequence.", role: "state", occurrence_kind: "consequence", change_type: "injured", importance: "major", state_label: "" },
    { id: "captured", label: "Captured", note: "The character becomes a captive.", role: "state", occurrence_kind: "consequence", change_type: "captured", importance: "major", state_label: "" },
    { id: "dies", label: "Dies", note: "The character dies at this beat.", role: "state", occurrence_kind: "consequence", change_type: "dies", importance: "critical", state_label: "" },
    { id: "returns", label: "Returns", note: "The character explicitly returns to the story.", role: "cast", occurrence_kind: "transition", change_type: "returns", importance: "major", state_label: "" },
  ],
  item: [
    { id: "introduced", label: "Introduced", note: "The story establishes this item.", role: "state", occurrence_kind: "transition", change_type: "introduced", importance: "major", state_label: "" },
    { id: "obtained", label: "Obtained", note: "The player obtains this item.", role: "reward", occurrence_kind: "reward", change_type: "obtained", importance: "major", state_label: "" },
    { id: "required", label: "Required", note: "This item is required at the beat.", role: "reference", occurrence_kind: "requirement", change_type: "active", importance: "major", state_label: "" },
    { id: "lost", label: "Lost", note: "The item becomes unavailable because it is lost.", role: "state", occurrence_kind: "transition", change_type: "lost", importance: "major", state_label: "" },
    { id: "stolen", label: "Stolen", note: "The item becomes unavailable because it is stolen.", role: "state", occurrence_kind: "transition", change_type: "stolen", importance: "major", state_label: "" },
    { id: "consumed", label: "Consumed", note: "The item is consumed as a consequence.", role: "state", occurrence_kind: "consequence", change_type: "consumed", importance: "major", state_label: "" },
    { id: "restored", label: "Restored", note: "The item returns to an available state.", role: "state", occurrence_kind: "transition", change_type: "restored", importance: "major", state_label: "" },
    { id: "transformed", label: "Transformed", note: "The item changes into a new form.", role: "state", occurrence_kind: "transition", change_type: "transformed", importance: "major", state_label: "" },
  ],
  quest: [
    { id: "starts", label: "Starts", note: "This beat starts the quest journey.", role: "player_journey", occurrence_kind: "transition", change_type: "introduced", importance: "major", state_label: "" },
    { id: "escalates", label: "Escalates", note: "The quest stakes or pressure increase.", role: "player_journey", occurrence_kind: "transition", change_type: "changed", importance: "major", state_label: "Escalated" },
    { id: "branches", label: "Branches", note: "The quest enters a meaningful branch.", role: "player_journey", occurrence_kind: "transition", change_type: "changed", importance: "major", state_label: "Branched" },
    { id: "resolves", label: "Resolves", note: "This beat resolves the quest journey.", role: "player_journey", occurrence_kind: "consequence", change_type: "changed", importance: "major", state_label: "Resolved" },
  ],
  location: [
    { id: "setting", label: "Setting", note: "This beat takes place here.", role: "setting", occurrence_kind: "appearance", change_type: "active", importance: "minor", state_label: "" },
    { id: "occupied", label: "Occupied", note: "The location enters an occupied state.", role: "state", occurrence_kind: "transition", change_type: "changed", importance: "major", state_label: "Occupied" },
    { id: "destroyed", label: "Destroyed", note: "The location is destroyed as a consequence.", role: "state", occurrence_kind: "consequence", change_type: "destroyed", importance: "critical", state_label: "Destroyed" },
    { id: "restored", label: "Restored", note: "The location is explicitly restored.", role: "state", occurrence_kind: "transition", change_type: "restored", importance: "major", state_label: "Restored" },
    { id: "unavailable", label: "Unavailable", note: "The location becomes unavailable.", role: "state", occurrence_kind: "transition", change_type: "unavailable", importance: "major", state_label: "Unavailable" },
    { id: "transformed", label: "Transformed", note: "The location changes into a new form.", role: "state", occurrence_kind: "transition", change_type: "transformed", importance: "major", state_label: "Transformed" },
  ],
  dialogue: [
    { id: "runtime-dialogue", label: "Runtime Dialogue", note: "This dialogue plays at the beat.", role: "runtime", occurrence_kind: "appearance", change_type: "active", importance: "major", state_label: "" },
    { id: "reveals-lore", label: "Reveals Lore", note: "The dialogue delivers a meaningful lore reveal.", role: "reference", occurrence_kind: "consequence", change_type: "none", importance: "major", state_label: "Lore Revealed" },
    { id: "sets-state", label: "Sets State", note: "The dialogue changes story state.", role: "state", occurrence_kind: "consequence", change_type: "changed", importance: "major", state_label: "State Set" },
  ],
  encounter: [
    { id: "runtime-encounter", label: "Runtime Encounter", note: "This encounter plays at the beat.", role: "runtime", occurrence_kind: "appearance", change_type: "active", importance: "major", state_label: "" },
    { id: "boss-defeated", label: "Boss Defeated", note: "The encounter ends in a decisive boss defeat.", role: "state", occurrence_kind: "consequence", change_type: "changed", importance: "critical", state_label: "Boss Defeated" },
    { id: "resolved", label: "Encounter Resolved", note: "The encounter is resolved at this beat.", role: "state", occurrence_kind: "consequence", change_type: "changed", importance: "major", state_label: "Resolved" },
  ],
};

export const CROSS_ENTITY_CONSEQUENCE_PRESETS: Record<CrossEntityConsequenceTargetKind, StoryPlacementPreset[]> = {
  character: [
    { id: "character-injured", label: "Injured", note: "The second character is injured here.", role: "state", occurrence_kind: "consequence", change_type: "injured", importance: "major", state_label: "" },
    { id: "character-captured", label: "Captured", note: "The second character becomes captive.", role: "state", occurrence_kind: "consequence", change_type: "captured", importance: "major", state_label: "" },
    { id: "character-dies", label: "Dies", note: "The second character dies here.", role: "state", occurrence_kind: "consequence", change_type: "dies", importance: "critical", state_label: "" },
    { id: "character-returns", label: "Returns", note: "The second character explicitly returns.", role: "cast", occurrence_kind: "transition", change_type: "returns", importance: "major", state_label: "" },
    { id: "character-changed", label: "Changed", note: "The second character changes state.", role: "state", occurrence_kind: "consequence", change_type: "changed", importance: "major", state_label: "Changed" },
  ],
  faction: [
    { id: "faction-hostile", label: "Hostile", note: "The faction becomes hostile.", role: "state", occurrence_kind: "consequence", change_type: "changed", importance: "major", state_label: "Hostile" },
    { id: "faction-allied", label: "Allied", note: "The faction becomes allied.", role: "state", occurrence_kind: "consequence", change_type: "changed", importance: "major", state_label: "Allied" },
    { id: "faction-changed", label: "Changed", note: "The faction state changes.", role: "state", occurrence_kind: "consequence", change_type: "changed", importance: "major", state_label: "Changed" },
  ],
  item: [
    { id: "item-obtained", label: "Obtained", note: "The player gains the item.", role: "reward", occurrence_kind: "reward", change_type: "obtained", importance: "major", state_label: "" },
    { id: "item-lost", label: "Lost", note: "The item becomes lost.", role: "state", occurrence_kind: "consequence", change_type: "lost", importance: "major", state_label: "" },
    { id: "item-stolen", label: "Stolen", note: "The item is stolen.", role: "state", occurrence_kind: "consequence", change_type: "stolen", importance: "major", state_label: "" },
    { id: "item-consumed", label: "Consumed", note: "The item is consumed.", role: "state", occurrence_kind: "consequence", change_type: "consumed", importance: "major", state_label: "" },
    { id: "item-destroyed", label: "Destroyed", note: "The item is destroyed.", role: "state", occurrence_kind: "consequence", change_type: "destroyed", importance: "critical", state_label: "Destroyed" },
    { id: "item-transformed", label: "Transformed", note: "The item changes form.", role: "state", occurrence_kind: "transition", change_type: "transformed", importance: "major", state_label: "Transformed" },
  ],
  location: [
    { id: "location-occupied", label: "Occupied", note: "The location becomes occupied.", role: "state", occurrence_kind: "consequence", change_type: "changed", importance: "major", state_label: "Occupied" },
    { id: "location-unavailable", label: "Unavailable", note: "The location becomes unavailable.", role: "state", occurrence_kind: "consequence", change_type: "unavailable", importance: "major", state_label: "Unavailable" },
    { id: "location-destroyed", label: "Destroyed", note: "The location is destroyed.", role: "state", occurrence_kind: "consequence", change_type: "destroyed", importance: "critical", state_label: "Destroyed" },
    { id: "location-restored", label: "Restored", note: "The location is restored.", role: "state", occurrence_kind: "transition", change_type: "restored", importance: "major", state_label: "Restored" },
    { id: "location-transformed", label: "Transformed", note: "The location changes form.", role: "state", occurrence_kind: "transition", change_type: "transformed", importance: "major", state_label: "Transformed" },
  ],
};

export function workspaceStoryPlacementPresets(entityKind: TrackKind): StoryPlacementPreset[] {
  return WORKSPACE_STORY_PLACEMENT_PRESETS[entityKind] || [];
}

export function applyStoryPlacementPreset(value: StoryPlacementDraft, preset: StoryPlacementPreset): StoryPlacementDraft {
  return {
    ...value,
    role: preset.role,
    occurrence_kind: preset.occurrence_kind,
    change_type: preset.change_type,
    importance: preset.importance,
    state_label: preset.state_label,
  };
}

export function storyPlacementPresetIsActive(value: StoryPlacementDraft, preset: StoryPlacementPreset): boolean {
  return preset.role === value.role
    && preset.occurrence_kind === value.occurrence_kind
    && preset.change_type === value.change_type
    && preset.importance === value.importance
    && preset.state_label === value.state_label;
}
