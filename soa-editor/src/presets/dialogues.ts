import type { PresetScope } from "./types";

export const dialoguesPresets: PresetScope = {
  schema: "dialogues",
  presets: [
    {
      id: "dialogue-greeting-intro",
      label: "Dialogue: Greeting Intro",
      description: "Short onboarding-style greeting dialogue scaffold.",
      tags: ["dialogue", "intro", "npc"],
      defaultMode: "fill_empty",
      data: {
        description: "Introductory exchange used when the player first meets this character.",
        tags: ["dialogue", "greeting", "intro"],
      },
    },
    {
      id: "dialogue-quest-briefing",
      label: "Dialogue: Quest Briefing",
      description: "Context-heavy quest setup with clear objective framing.",
      tags: ["dialogue", "quest", "briefing"],
      defaultMode: "fill_empty",
      data: {
        description: "Explains mission objective, stakes, and key constraints.",
        tags: ["dialogue", "quest", "briefing"],
      },
    },
    {
      id: "dialogue-branching-negotiation",
      label: "Dialogue: Branching Negotiation",
      description: "Negotiation scene template with conditional outcomes.",
      tags: ["dialogue", "branching", "story"],
      defaultMode: "fill_empty",
      data: {
        description: "A negotiation scene intended for multiple player outcomes.",
        tags: ["dialogue", "negotiation", "branching"],
      },
    },
  ],
};
