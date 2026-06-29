import { describe, expect, it } from "vitest";
import { buildQuestJourneyAnalysis } from "./questJourneyAnalysis";
import type { StoryOccurrence } from "./storyPlacement";

function occurrence(patch: Partial<StoryOccurrence>): StoryOccurrence {
  return {
    id: "occurrence-1",
    entity_kind: "quest",
    entity_id: "quest-1",
    label: "Quest",
    timeline_id: "timeline-1",
    story_arc_id: "arc-1",
    source_kind: "adventure_beat",
    source_id: "beat-1",
    source_label: "Beat",
    order: 1,
    role: "player_journey",
    occurrence_kind: "appearance",
    change_type: "active",
    state_label: "",
    importance: "major",
    ...patch,
  };
}

describe("buildQuestJourneyAnalysis", () => {
  it("classifies quest story milestones from lifecycle fields and beat types", () => {
    const result = buildQuestJourneyAnalysis({
      questId: "quest-1",
      packet: {
        quest: { id: "quest-1", description: "Start", objectives: [], flags_set_on_completion: [] },
        arc: { story_arc_id: "arc-1", related_quests: ["quest-1"], branches: [] },
        quests: [],
      },
      storyPacket: {
        catalogs: {
          adventure_beats: [
            { id: "beat-1", title: "Hook", beat_type: "Introduction" },
            { id: "beat-2", title: "Decision", beat_type: "Decision" },
            { id: "beat-3", title: "Payoff", beat_type: "Payoff" },
          ],
        },
      },
      occurrences: [
        occurrence({ id: "start", source_id: "beat-1", source_label: "Hook", order: 1, change_type: "introduced" }),
        occurrence({ id: "branch", source_id: "beat-2", source_label: "Decision", order: 2, state_label: "Branched", change_type: "changed" }),
        occurrence({ id: "resolution", source_id: "beat-3", source_label: "Payoff", order: 3, occurrence_kind: "consequence" }),
      ],
    });

    expect(result.milestones.map((milestone) => milestone.kind)).toEqual(["start", "branch", "resolution"]);
  });

  it("reports branch targets outside arc order and backward branch targets", () => {
    const result = buildQuestJourneyAnalysis({
      questId: "quest-2",
      packet: {
        quest: { id: "quest-2", description: "Middle", objectives: [], flags_set_on_completion: [] },
        arc: {
          story_arc_id: "arc-1",
          related_quests: ["quest-1", "quest-2"],
          branches: [
            { condition_flag: "flag-1", next_quest_id: "quest-3" },
            { condition_flag: "flag-2", next_quest_id: "quest-1" },
          ],
        },
        quests: [
          { id: "quest-1", title: "First", flags_set_on_completion: ["flag-2"], objectives: [] },
          { id: "quest-2", title: "Second", flags_set_on_completion: [], objectives: [] },
        ],
      },
      storyPacket: null,
      occurrences: [],
    });

    expect(result.diagnostics.map((diagnostic) => diagnostic.id)).toContain("branch-0-flag-1-quest-3:target-outside-order");
    expect(result.diagnostics.map((diagnostic) => diagnostic.id)).toContain("branch-1-flag-2-quest-1:backward-target");
  });

  it("reports branch condition flags first produced by later arc quests", () => {
    const result = buildQuestJourneyAnalysis({
      questId: "quest-1",
      packet: {
        quest: { id: "quest-1", description: "Start", objectives: [], flags_set_on_completion: [] },
        arc: {
          story_arc_id: "arc-1",
          related_quests: ["quest-1", "quest-2", "quest-3"],
          branches: [{ condition_flag: "late-flag", next_quest_id: "quest-3" }],
        },
        quests: [
          { id: "quest-2", title: "Later", flags_set_on_completion: ["late-flag"], objectives: [] },
          { id: "quest-3", title: "Target", flags_set_on_completion: [], objectives: [] },
        ],
      },
      storyPacket: null,
      occurrences: [],
    });

    expect(result.diagnostics.map((diagnostic) => diagnostic.id)).toContain("branch-0-late-flag-quest-3:flag-produced-later");
  });

  it("accepts a forward branch whose condition flag is produced by the current quest", () => {
    const result = buildQuestJourneyAnalysis({
      questId: "quest-1",
      packet: {
        quest: { id: "quest-1", description: "Start", objectives: [{ objective_id: "choice", flags_set: ["choice-made"] }], flags_set_on_completion: [] },
        arc: {
          story_arc_id: "arc-1",
          related_quests: ["quest-1", "quest-2"],
          branches: [{ condition_flag: "choice-made", next_quest_id: "quest-2" }],
        },
        quests: [{ id: "quest-2", title: "Target", flags_set_on_completion: [], objectives: [] }],
      },
      storyPacket: null,
      occurrences: [],
    });

    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === "warning")).toEqual([]);
  });
});
