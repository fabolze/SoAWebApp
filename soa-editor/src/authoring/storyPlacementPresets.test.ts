import { describe, expect, it } from "vitest";
import {
  STORY_CHANGE_TYPES,
  STORY_IMPORTANCE_LEVELS,
  STORY_OCCURRENCE_KINDS,
  STORY_PLACEMENT_ROLES,
  defaultPlacementDraft,
  type TrackKind,
} from "./storyPlacement";
import {
  CROSS_ENTITY_CONSEQUENCE_PRESETS,
  GENERIC_STORY_PLACEMENT_PRESETS,
  WORKSPACE_STORY_PLACEMENT_PRESETS,
  applyStoryPlacementPreset,
  storyPlacementPresetIsActive,
  workspaceStoryPlacementPresets,
} from "./storyPlacementPresets";

describe("workspace story placement presets", () => {
  it("provides the intended actions for each integrated workspace", () => {
    const labels = (kind: TrackKind) => workspaceStoryPlacementPresets(kind).map((preset) => preset.label);

    expect(labels("character")).toEqual(["Introduced", "Joins", "Leaves", "Injured", "Captured", "Dies", "Returns"]);
    expect(labels("item")).toEqual(["Introduced", "Obtained", "Required", "Lost", "Stolen", "Consumed", "Restored", "Transformed"]);
    expect(labels("quest")).toEqual(["Starts", "Escalates", "Branches", "Resolves"]);
    expect(labels("location")).toEqual(["Introduced", "Setting", "Occupied", "Destroyed", "Restored", "Unavailable", "Transformed"]);
    expect(labels("dialogue")).toEqual(["Runtime Dialogue", "Reveals Lore", "Sets State"]);
    expect(labels("encounter")).toEqual(["Runtime Encounter", "Boss Defeated", "Encounter Resolved"]);
    expect(labels("event")).toEqual([]);
    expect(labels("faction")).toEqual([]);
  });

  it("uses unique identifiers and only canonical enum values", () => {
    [...Object.entries(WORKSPACE_STORY_PLACEMENT_PRESETS), ...Object.entries(CROSS_ENTITY_CONSEQUENCE_PRESETS)].forEach(([kind, presets]) => {
      expect(new Set(presets.map((preset) => preset.id)).size, `${kind} preset ids`).toBe(presets.length);
      presets.forEach((preset) => {
        expect(STORY_PLACEMENT_ROLES).toContain(preset.role);
        expect(STORY_OCCURRENCE_KINDS).toContain(preset.occurrence_kind);
        expect(STORY_CHANGE_TYPES).toContain(preset.change_type);
        expect(STORY_IMPORTANCE_LEVELS).toContain(preset.importance);
      });
    });
    expect(new Set(GENERIC_STORY_PLACEMENT_PRESETS.map((preset) => preset.id)).size).toBe(GENERIC_STORY_PLACEMENT_PRESETS.length);
  });

  it("provides cross-entity consequence actions for supported explicit targets", () => {
    expect(CROSS_ENTITY_CONSEQUENCE_PRESETS.character.map((preset) => preset.label)).toEqual(["Injured", "Captured", "Dies", "Returns", "Changed"]);
    expect(CROSS_ENTITY_CONSEQUENCE_PRESETS.faction.map((preset) => preset.label)).toEqual(["Hostile", "Allied", "Changed"]);
    expect(CROSS_ENTITY_CONSEQUENCE_PRESETS.item.map((preset) => preset.label)).toEqual(["Obtained", "Lost", "Stolen", "Consumed", "Destroyed", "Transformed"]);
    expect(CROSS_ENTITY_CONSEQUENCE_PRESETS.location.map((preset) => preset.label)).toEqual(["Occupied", "Unavailable", "Destroyed", "Restored", "Transformed"]);
  });

  it("maps coherence-sensitive quest and location actions exactly", () => {
    expect(workspaceStoryPlacementPresets("quest").find((preset) => preset.id === "resolves")).toEqual(expect.objectContaining({
      role: "player_journey",
      occurrence_kind: "consequence",
      change_type: "changed",
      importance: "major",
      state_label: "Resolved",
    }));
    expect(workspaceStoryPlacementPresets("location").find((preset) => preset.id === "destroyed")).toEqual(expect.objectContaining({
      role: "state",
      occurrence_kind: "consequence",
      change_type: "destroyed",
      importance: "critical",
      state_label: "Destroyed",
    }));
    expect(workspaceStoryPlacementPresets("location").find((preset) => preset.id === "introduced")).toEqual(expect.objectContaining({
      role: "setting",
      occurrence_kind: "transition",
      change_type: "introduced",
      importance: "major",
      state_label: "",
    }));
  });

  it("changes only preset-owned fields and resets stale state labels", () => {
    const draft = {
      ...defaultPlacementDraft("draft-1", "quest", "quest-1", "beat-1", 7),
      state_label: "Old State",
      starts_at_beat_id: "beat-1",
      ends_at_beat_id: "beat-2",
      continuity_group_id: "quest-thread",
      notes: "Keep this note",
      tags: ["keep"],
    };
    const preset = workspaceStoryPlacementPresets("quest").find((candidate) => candidate.id === "branches")!;
    const result = applyStoryPlacementPreset(draft, preset);

    expect(result).toEqual({
      ...draft,
      role: "player_journey",
      occurrence_kind: "transition",
      change_type: "changed",
      importance: "major",
      state_label: "Branched",
    });
    expect(storyPlacementPresetIsActive(result, preset)).toBe(true);
    expect(storyPlacementPresetIsActive({ ...result, state_label: "Custom branch" }, preset)).toBe(false);
  });
});
