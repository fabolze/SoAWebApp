import type { PresetScope } from "./types";

export const charactersPresets: PresetScope = {
  schema: "characters",
  presets: [
    {
      id: "character-npc-town-merchant",
      label: "Character: Town Merchant",
      description: "Baseline non-combat vendor NPC profile.",
      tags: ["npc", "town", "utility"],
      defaultMode: "fill_empty",
      data: {
        title: "Merchant",
        description: "Local merchant offering supplies and rumors.",
        level: 1,
        tags: ["npc", "merchant", "town"],
      },
    },
    {
      id: "character-quest-giver-guide",
      label: "Character: Quest Guide",
      description: "Story-facing NPC for progression and onboarding.",
      tags: ["npc", "quest", "story"],
      defaultMode: "fill_empty",
      data: {
        title: "Guide",
        description: "Provides direction, context, and quest hooks for the player.",
        level: 5,
        tags: ["npc", "quest_giver", "guide"],
      },
    },
    {
      id: "character-elite-antagonist",
      label: "Character: Elite Antagonist",
      description: "High-threat narrative enemy with combat presence.",
      tags: ["enemy", "elite", "combat"],
      defaultMode: "fill_empty",
      data: {
        title: "Elite Commander",
        description: "A dangerous opponent driving conflict in this chapter.",
        level: 20,
        tags: ["enemy", "elite", "boss_candidate"],
      },
    },
  ],
};
