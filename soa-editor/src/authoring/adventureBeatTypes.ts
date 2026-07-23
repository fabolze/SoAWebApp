export const ADVENTURE_BEAT_TYPE_INFO = [
  {
    value: "Hook",
    description: "Creates curiosity, tension, or a promise that pulls the player toward what comes next.",
  },
  {
    value: "Introduction",
    description: "Establishes a character, place, faction, problem, or rule that later story moments rely on.",
  },
  {
    value: "Discovery",
    description: "Lets the player find information, a place, or an object that changes what they understand or can pursue.",
  },
  {
    value: "Decision",
    description: "Asks for a meaningful choice or commitment about a goal, allegiance, method, or path.",
  },
  {
    value: "Conflict",
    description: "Brings opposing goals together as a confrontation, obstacle, contest, or other source of pressure.",
  },
  {
    value: "Revelation",
    description: "Exposes an important truth that answers a question or changes the meaning of earlier events.",
  },
  {
    value: "Reversal",
    description: "Turns the expected direction or situation around through a setback, betrayal, surprise, or victory with a cost.",
  },
  {
    value: "Climax",
    description: "Provides the peak confrontation or decision where the central tension is resolved or transformed.",
  },
  {
    value: "Recovery",
    description: "Creates aftermath and breathing room to process consequences, regroup, restore, or establish a new normal.",
  },
  {
    value: "Payoff",
    description: "Delivers a result prepared or promised by earlier beats, such as a reward, resolution, or emotional release.",
  },
  {
    value: "Other",
    description: "Covers a transition, placeholder, or structural moment whose primary narrative job is not known yet.",
  },
] as const;

export type AdventureBeatType = typeof ADVENTURE_BEAT_TYPE_INFO[number]["value"];

export function adventureBeatTypeDescription(value: string): string {
  return ADVENTURE_BEAT_TYPE_INFO.find((type) => type.value === value)?.description
    ?? ADVENTURE_BEAT_TYPE_INFO[ADVENTURE_BEAT_TYPE_INFO.length - 1].description;
}
