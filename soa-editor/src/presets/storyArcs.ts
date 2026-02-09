import type { PresetScope } from "./types";

export const storyArcsPresets: PresetScope = {
  schema: "story_arcs",
  presets: [
    {
      id: "story-arc-main-act",
      label: "Story Arc: Main Act",
      description: "Core main-story arc scaffold with required unlock flags.",
      tags: ["story", "main", "narrative"],
      defaultMode: "fill_empty",
      data: {
        type: "Main Story",
        summary: "Primary storyline arc with escalating stakes and major world impact.",
        related_quests: [],
        branching: [],
        required_flags: [],
        tags: ["story", "main_arc"],
      },
    },
    {
      id: "story-arc-faction-conflict",
      label: "Story Arc: Faction Conflict",
      description: "Faction-focused narrative arc with branching outcomes.",
      tags: ["story", "faction", "branching"],
      defaultMode: "fill_empty",
      data: {
        type: "Faction Arc",
        summary: "Faction conflict arc with player-driven branch decisions.",
        related_quests: [],
        branching: [
          {
            quest_id: "",
            branches: [{ condition_flag: "", next_quest_id: "" }],
          },
        ],
        required_flags: [],
        tags: ["story", "faction", "branching"],
      },
    },
    {
      id: "story-arc-side-mystery",
      label: "Story Arc: Side Mystery",
      description: "Self-contained side arc for exploration and optional rewards.",
      tags: ["story", "side", "exploration"],
      defaultMode: "fill_empty",
      data: {
        type: "Side Arc",
        summary: "Optional mystery arc designed for world building and discovery.",
        related_quests: [],
        branching: [],
        required_flags: [],
        tags: ["story", "side_arc", "mystery"],
      },
    },
  ],
};
