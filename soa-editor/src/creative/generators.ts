import type { CreativeGeneratorScope, CreativeInput, CreativeSuggestion, CreativeTone } from "./types";

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function pick<T>(list: T[], index: number): T {
  return list[index % list.length];
}

function toneWord(tone: CreativeTone, index: number): string {
  const toneMap: Record<CreativeTone, string[]> = {
    neutral: ["Balanced", "Steady", "Measured", "Reliable"],
    heroic: ["Radiant", "Valiant", "Noble", "Resolute"],
    dark: ["Grim", "Bleak", "Ruthless", "Dread"],
    mystic: ["Arcane", "Ethereal", "Astral", "Runic"],
    playful: ["Whimsical", "Cheeky", "Sparky", "Bouncy"],
  };
  return pick(toneMap[tone], index);
}

function splitTheme(theme: string): string {
  const cleaned = (theme || "").trim();
  return cleaned || "Core";
}

function joinKeywords(keywords: string[]): string {
  const safe = keywords.map((k) => k.trim()).filter(Boolean);
  return safe.length ? safe.join(", ") : "none";
}

function toSlug(value: string): string {
  return (value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function abilitySuggestions(input: CreativeInput): CreativeSuggestion[] {
  const theme = splitTheme(input.theme);
  const seed = hashString(`${input.theme}|${input.tone}|${input.keywords.join(",")}`);
  const cores = ["Burst", "Strike", "Nova", "Pulse", "Rend", "Lance"];
  const damageTypes = ["Fire", "Water", "Air", "Earth", "Light", "Shadow"];
  const targetings = ["Single", "Area", "Enemies"];

  return Array.from({ length: Math.max(1, input.count) }).map((_, idx) => {
    const absolute = seed + idx;
    const name = `${toneWord(input.tone, absolute)} ${theme} ${pick(cores, absolute)}`;
    const damage = pick(damageTypes, absolute);
    const targeting = pick(targetings, absolute);
    return {
      id: `ability-${idx}`,
      title: name,
      summary: `${input.tone} ${targeting.toLowerCase()} ability themed around ${theme}.`,
      patch: {
        name,
        slug: toSlug(name),
        type: "Active",
        targeting,
        trigger_condition: "On Use",
        damage_type_source: "Fixed",
        damage_type: damage,
        resource_cost: 10 + (absolute % 12),
        cooldown: 1 + (absolute % 4),
        description: `A ${input.tone} ${targeting.toLowerCase()} skill shaped by ${theme}. Keywords: ${joinKeywords(input.keywords)}.`,
        tags: [theme.toLowerCase(), input.tone, "generated"].concat(input.keywords.slice(0, 3)),
      },
    };
  });
}

function itemSuggestions(input: CreativeInput): CreativeSuggestion[] {
  const theme = splitTheme(input.theme);
  const seed = hashString(`${input.theme}|${input.tone}|${input.keywords.join(",")}|items`);
  const itemTypes = ["Weapon", "Armor", "Consumable", "Accessory", "Material"];
  const rarities = ["Common", "Uncommon", "Rare", "Epic"];
  const nouns = ["Relic", "Charm", "Blade", "Tonic", "Sigil", "Plate"];

  return Array.from({ length: Math.max(1, input.count) }).map((_, idx) => {
    const absolute = seed + idx;
    const type = pick(itemTypes, absolute);
    const rarity = pick(rarities, absolute);
    const name = `${toneWord(input.tone, absolute)} ${theme} ${pick(nouns, absolute)}`;
    const basePrice = 25 + (absolute % 20) * 5;
    return {
      id: `item-${idx}`,
      title: name,
      summary: `${rarity} ${type.toLowerCase()} preset with theme ${theme}.`,
      patch: {
        name,
        slug: toSlug(name),
        type,
        rarity,
        base_price: basePrice,
        description: `${rarity} ${type.toLowerCase()} aligned with ${theme}. Keywords: ${joinKeywords(input.keywords)}.`,
        tags: [type.toLowerCase(), rarity.toLowerCase(), theme.toLowerCase(), input.tone].concat(input.keywords.slice(0, 2)),
      },
    };
  });
}

function dialogueNodeSuggestions(input: CreativeInput): CreativeSuggestion[] {
  const theme = splitTheme(input.theme);
  const seed = hashString(`${input.theme}|${input.tone}|${input.keywords.join(",")}|dialogue_nodes`);
  const openers = ["Greetings", "Hold there", "Listen", "Take care", "Well met"];
  const closers = [
    "What do you need?",
    "Will you help us?",
    "Stay alert out there.",
    "The path ahead is uncertain.",
    "Choose your words carefully.",
  ];
  const speaker = String(input.currentData?.speaker || "NPC");

  return Array.from({ length: Math.max(1, input.count) }).map((_, idx) => {
    const absolute = seed + idx;
    const opener = pick(openers, absolute);
    const closer = pick(closers, absolute + 4);
    const text = `${opener}, traveler. The ${theme.toLowerCase()} path is dangerous. ${closer}`;
    return {
      id: `dialogue-node-${idx}`,
      title: `${speaker}: ${opener}`,
      summary: `${input.tone} node for a ${theme.toLowerCase()} context.`,
      patch: {
        speaker,
        text,
        choices: [
          { choice_text: "Tell me more.", next_node_id: "" },
          { choice_text: "I will return later.", next_node_id: "" },
        ],
        tags: ["dialogue", theme.toLowerCase(), input.tone].concat(input.keywords.slice(0, 2)),
      },
    };
  });
}

function dialoguesSuggestions(input: CreativeInput): CreativeSuggestion[] {
  const theme = splitTheme(input.theme);
  const seed = hashString(`${input.theme}|${input.tone}|dialogues`);
  const frames = [
    {
      kind: "Greeting",
      descriptionSeed: "First-contact exchange to establish tone and intent.",
      tags: ["intro", "greeting"],
    },
    {
      kind: "Quest Briefing",
      descriptionSeed: "Mission setup with objective, stakes, and constraints.",
      tags: ["quest", "briefing"],
    },
    {
      kind: "Confrontation",
      descriptionSeed: "High-tension scene with moral or tactical pressure.",
      tags: ["conflict", "drama"],
    },
    {
      kind: "Negotiation",
      descriptionSeed: "Branch-friendly social exchange with potential outcomes.",
      tags: ["branching", "social"],
    },
    {
      kind: "Resolution",
      descriptionSeed: "Closure scene for aftermath, rewards, or future hooks.",
      tags: ["resolution", "follow_up"],
    },
  ];

  return Array.from({ length: Math.max(1, input.count) }).map((_, idx) => {
    const absolute = seed + idx;
    const frame = pick(frames, absolute);
    const title = `${theme} ${frame.kind}`;
    return {
      id: `dialogues-${idx}`,
      title,
      summary: `${input.tone} dialogue scaffold (${frame.kind.toLowerCase()}).`,
      patch: {
        title,
        slug: toSlug(title),
        description: `${frame.descriptionSeed} ${input.tone} tone for ${theme.toLowerCase()}. Keywords: ${joinKeywords(input.keywords)}.`,
        tags: ["dialogue", theme.toLowerCase(), input.tone, ...frame.tags].concat(input.keywords.slice(0, 2)),
      },
    };
  });
}

function characterSuggestions(input: CreativeInput): CreativeSuggestion[] {
  const theme = splitTheme(input.theme);
  const seed = hashString(`${input.theme}|${input.tone}|characters`);
  const names = ["Aren", "Lyra", "Korin", "Mira", "Thane", "Sel", "Vera", "Darin"];
  const surnames = ["Vale", "Rook", "Ash", "Dawn", "Voss", "Reed", "Hale", "Quill"];
  const archetypes = [
    { title: "Warden", tags: ["guardian", "defense"], levelBase: 10 },
    { title: "Seer", tags: ["mystic", "knowledge"], levelBase: 8 },
    { title: "Scout", tags: ["explorer", "agile"], levelBase: 6 },
    { title: "Marshal", tags: ["leader", "combat"], levelBase: 14 },
    { title: "Oracle", tags: ["prophecy", "ritual"], levelBase: 12 },
    { title: "Envoy", tags: ["social", "diplomacy"], levelBase: 7 },
  ];

  return Array.from({ length: Math.max(1, input.count) }).map((_, idx) => {
    const absolute = seed + idx;
    const baseName = `${pick(names, absolute)} ${pick(surnames, absolute + 2)}`;
    const archetype = pick(archetypes, absolute);
    const roleTitle = `${toneWord(input.tone, absolute)} ${archetype.title}`;
    const fullName = baseName;
    return {
      id: `characters-${idx}`,
      title: `${fullName} (${roleTitle})`,
      summary: `${input.tone} character concept with ${theme} flavor.`,
      patch: {
        name: fullName,
        slug: toSlug(fullName),
        title: roleTitle,
        level: archetype.levelBase + (absolute % 6),
        description: `${fullName} is a ${roleTitle.toLowerCase()} tied to ${theme}. Keywords: ${joinKeywords(input.keywords)}.`,
        tags: ["npc", theme.toLowerCase(), input.tone, ...archetype.tags].concat(input.keywords.slice(0, 2)),
      },
    };
  });
}

function storyArcSuggestions(input: CreativeInput): CreativeSuggestion[] {
  const theme = splitTheme(input.theme);
  const seed = hashString(`${input.theme}|${input.tone}|story_arcs`);
  const arcFrames = [
    {
      type: "Main Story",
      hook: "Awakening",
      summarySeed: "Primary progression arc with global stakes.",
      tags: ["main_arc", "core_story"],
      branching: false,
    },
    {
      type: "Side Arc",
      hook: "Echo",
      summarySeed: "Optional arc for world depth and character moments.",
      tags: ["side_arc", "worldbuilding"],
      branching: false,
    },
    {
      type: "Faction Arc",
      hook: "Accord",
      summarySeed: "Faction conflict where player allegiance shapes outcomes.",
      tags: ["faction", "branching"],
      branching: true,
    },
    {
      type: "DLC Arc",
      hook: "Aftermath",
      summarySeed: "Post-launch chapter that expands existing narrative threads.",
      tags: ["dlc", "expansion"],
      branching: false,
    },
  ];

  return Array.from({ length: Math.max(1, input.count) }).map((_, idx) => {
    const absolute = seed + idx;
    const frame = pick(arcFrames, absolute);
    const title = `${theme} ${frame.hook}`;
    return {
      id: `story-arc-${idx}`,
      title,
      summary: `${input.tone} story arc seed (${frame.type}).`,
      patch: {
        title,
        slug: toSlug(title),
        type: frame.type,
        summary: `${frame.summarySeed} ${input.tone} tone around ${theme}. Key motifs: ${joinKeywords(input.keywords)}.`,
        related_quests: [],
        required_flags: [],
        branching: frame.branching
          ? [{ quest_id: "", branches: [{ condition_flag: "", next_quest_id: "" }] }]
          : [],
        tags: ["story", theme.toLowerCase(), input.tone, ...frame.tags].concat(input.keywords.slice(0, 3)),
      },
    };
  });
}

function storySuggestions(input: CreativeInput): CreativeSuggestion[] {
  return storyArcSuggestions(input);
}

function genericSuggestions(input: CreativeInput): CreativeSuggestion[] {
  const theme = splitTheme(input.theme);
  const seed = hashString(`${input.theme}|${input.tone}|generic`);
  const names = ["Template", "Variant", "Draft", "Pattern", "Spark"];
  return Array.from({ length: Math.max(1, input.count) }).map((_, idx) => {
    const absolute = seed + idx;
    const title = `${toneWord(input.tone, absolute)} ${theme} ${pick(names, absolute)}`;
    return {
      id: `generic-${idx}`,
      title,
      summary: "Generic creative suggestion.",
      patch: {
        name: title,
        slug: toSlug(title),
        title,
        description: `Generated ${input.tone} concept for ${theme}. Keywords: ${joinKeywords(input.keywords)}.`,
        summary: `Generated ${input.tone} concept for ${theme}.`,
        text: `Generated ${input.tone} line for ${theme}.`,
        tags: [theme.toLowerCase(), input.tone].concat(input.keywords.slice(0, 3)),
      },
    };
  });
}

export const creativeScopes: CreativeGeneratorScope[] = [
  { schema: "abilities", generate: abilitySuggestions },
  { schema: "items", generate: itemSuggestions },
  { schema: "dialogue_nodes", generate: dialogueNodeSuggestions },
  { schema: "dialogues", generate: dialoguesSuggestions },
  { schema: "characters", generate: characterSuggestions },
  { schema: "story_arcs", generate: storyArcSuggestions },
  { schema: "story_*", generate: storySuggestions },
  { schema: "npc_*", generate: characterSuggestions },
  { schema: "*", generate: genericSuggestions },
];
