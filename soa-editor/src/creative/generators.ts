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

const fantasyRelicNouns = ["Relic", "Blade", "Lantern", "Charm", "Talisman", "Grimoire", "Aegis", "Key"];
const fantasySites = ["Sealed Vault", "Moonlit Crypt", "Sunken Hall", "Ashen Keep", "Runebound Gate", "Forgotten Shrine"];
const fantasyOrders = ["Lantern Order", "Silver Compact", "Vowbound Circle", "Thornwatch Wardens", "Sable Archivists"];
const fantasyThreatFrames = ["cult uprising", "cursed vault", "haunted ruin", "borderland raid", "forbidden rite", "ancient oath"];
const fantasyShopNouns = ["Apothecary", "Armory", "Reliquary", "Provisioner", "Writ Market", "Lantern Stall"];

function abilitySuggestions(input: CreativeInput): CreativeSuggestion[] {
  const theme = splitTheme(input.theme);
  const seed = hashString(`${input.theme}|${input.tone}|${input.keywords.join(",")}`);
  const cores = ["Bolt", "Ward", "Oath", "Brand", "Rite", "Lance", "Smite", "Step"];
  const damageTypes = ["Fire", "Cold", "Lightning", "Earth", "Light", "Shadow"];
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
        description: `A ${input.tone} ${targeting.toLowerCase()} fantasy ability shaped by ${theme}. Keywords: ${joinKeywords(input.keywords)}.`,
        tags: [theme.toLowerCase(), input.tone, "fantasy", "generated"].concat(input.keywords.slice(0, 3)),
      },
    };
  });
}

function itemSuggestions(input: CreativeInput): CreativeSuggestion[] {
  const theme = splitTheme(input.theme);
  const seed = hashString(`${input.theme}|${input.tone}|${input.keywords.join(",")}|items`);
  const itemTypes = ["Weapon", "Armor", "Consumable", "Accessory", "Material"];
  const rarities = ["Common", "Uncommon", "Rare", "Epic"];
  const nouns = fantasyRelicNouns;

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
        description: `${rarity} ${type.toLowerCase()} from a high-fantasy adventure site aligned with ${theme}. Keywords: ${joinKeywords(input.keywords)}.`,
        tags: [type.toLowerCase(), rarity.toLowerCase(), theme.toLowerCase(), input.tone, "fantasy"].concat(input.keywords.slice(0, 2)),
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
        description: `${fullName} is a ${roleTitle.toLowerCase()} tied to ${theme}, useful as a patron, rival, guide, or dungeon contact. Keywords: ${joinKeywords(input.keywords)}.`,
        tags: ["npc", "fantasy", theme.toLowerCase(), input.tone, ...archetype.tags].concat(input.keywords.slice(0, 2)),
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

function questSuggestions(input: CreativeInput): CreativeSuggestion[] {
  const theme = splitTheme(input.theme);
  const seed = hashString(`${input.theme}|${input.tone}|quests`);
  const hooks = ["Contract", "Oath", "Expedition", "Recovery", "Investigation", "Rescue"];
  return Array.from({ length: Math.max(1, input.count) }).map((_, idx) => {
    const absolute = seed + idx;
    const hook = pick(hooks, absolute);
    const site = pick(fantasySites, absolute + 2);
    const title = `${hook}: ${theme} ${site}`;
    return {
      id: `quest-${idx}`,
      title,
      summary: `${input.tone} fantasy quest scaffold with objectives and rewards.`,
      patch: {
        title,
        slug: toSlug(title),
        description: `A ${input.tone} ${hook.toLowerCase()} sends the party toward the ${site.toLowerCase()} to confront a ${pick(fantasyThreatFrames, absolute)}. Keywords: ${joinKeywords(input.keywords)}.`,
        objectives: [
          { objective_id: "obj_1", description: `Reach the ${site}.` },
          { objective_id: "obj_2", description: `Resolve the ${theme.toLowerCase()} threat.` },
          { objective_id: "obj_3", description: "Return with proof and claim the reward." },
        ],
        xp_reward: 100 + (absolute % 8) * 50,
        currency_rewards: [{ currency_id: "", amount: 30 + (absolute % 10) * 10 }],
        item_rewards: [{ item_id: "", quantity: 1 }],
        tags: ["quest", "fantasy", theme.toLowerCase(), input.tone].concat(input.keywords.slice(0, 3)),
      },
    };
  });
}

function encounterSuggestions(input: CreativeInput): CreativeSuggestion[] {
  const theme = splitTheme(input.theme);
  const seed = hashString(`${input.theme}|${input.tone}|encounters`);
  const frames = ["Ambush", "Guardian Trial", "Ritual Defense", "Vault Breach", "Bridge Hold", "Final Stand"];
  return Array.from({ length: Math.max(1, input.count) }).map((_, idx) => {
    const absolute = seed + idx;
    const frame = pick(frames, absolute);
    const title = `${theme} ${frame}`;
    return {
      id: `encounter-${idx}`,
      title,
      summary: `${input.tone} dungeon encounter with participant and reward placeholders.`,
      patch: {
        name: title,
        slug: toSlug(title),
        encounter_type: "Combat",
        description: `A ${input.tone} ${frame.toLowerCase()} built for a high-fantasy dungeon scene. Keywords: ${joinKeywords(input.keywords)}.`,
        participants: [{ character_id: "", contexts: ["Combat"], combat_side: "Hostile" }],
        rewards: { xp: 80 + (absolute % 10) * 30, items: [{ item_id: "", quantity: 1 }], currencies: [{ currency_id: "", amount: 20 + (absolute % 8) * 10 }], reputation: [], flags_set: [] },
        tags: ["encounter", "combat", "fantasy", theme.toLowerCase(), input.tone].concat(input.keywords.slice(0, 2)),
      },
    };
  });
}

function locationSuggestions(input: CreativeInput): CreativeSuggestion[] {
  const theme = splitTheme(input.theme);
  const seed = hashString(`${input.theme}|${input.tone}|locations`);
  return Array.from({ length: Math.max(1, input.count) }).map((_, idx) => {
    const absolute = seed + idx;
    const site = `${theme} ${pick(fantasySites, absolute)}`;
    return {
      id: `location-${idx}`,
      title: site,
      summary: `${input.tone} adventure location with dungeon hooks.`,
      patch: {
        name: site,
        slug: toSlug(site),
        biome: "Ruins",
        biome_modifier: input.tone.toLowerCase().includes("dark") ? "Shadowed" : "Arcane",
        region: `${theme} Marches`,
        level_range: { min: 1, max: 5 },
        coordinates: { x: 50, y: 50 },
        encounters: [],
        is_safe_zone: false,
        is_fast_travel_point: false,
        has_respawn_point: false,
        description: `A ${input.tone} high-fantasy location with sealed chambers, faction interest, and encounter space. Keywords: ${joinKeywords(input.keywords)}.`,
        tags: ["location", "adventure_site", "fantasy", theme.toLowerCase(), input.tone].concat(input.keywords.slice(0, 2)),
      },
    };
  });
}

function factionSuggestions(input: CreativeInput): CreativeSuggestion[] {
  const theme = splitTheme(input.theme);
  const seed = hashString(`${input.theme}|${input.tone}|factions`);
  return Array.from({ length: Math.max(1, input.count) }).map((_, idx) => {
    const absolute = seed + idx;
    const name = `${theme} ${pick(fantasyOrders, absolute)}`;
    return {
      id: `faction-${idx}`,
      title: name,
      summary: `${input.tone} fantasy faction for patrons, rivals, and reputation hooks.`,
      patch: {
        name,
        slug: toSlug(name),
        description: `A ${input.tone} order with interests in ${theme.toLowerCase()}, old ruins, dangerous contracts, and political leverage. Keywords: ${joinKeywords(input.keywords)}.`,
        tags: ["faction", "fantasy", theme.toLowerCase(), input.tone].concat(input.keywords.slice(0, 3)),
      },
    };
  });
}

function shopSuggestions(input: CreativeInput): CreativeSuggestion[] {
  const theme = splitTheme(input.theme);
  const seed = hashString(`${input.theme}|${input.tone}|shops`);
  return Array.from({ length: Math.max(1, input.count) }).map((_, idx) => {
    const absolute = seed + idx;
    const title = `${theme} ${pick(fantasyShopNouns, absolute)}`;
    return {
      id: `shop-${idx}`,
      title,
      summary: `${input.tone} fantasy shop with inventory and pricing placeholders.`,
      patch: {
        name: title,
        slug: toSlug(title),
        description: `A ${input.tone} shop for adventurers preparing for ${theme.toLowerCase()} expeditions. Keywords: ${joinKeywords(input.keywords)}.`,
        inventory: [{ item_id: "", stock: 5, price_multiplier: 1 }, { item_id: "", stock: 1, price_multiplier: 1.25 }],
        price_modifiers: [{ modifier_type: "Flag", reference_id: "", operator: "eq", value: 1, price_multiplier: 0.9 }],
        tags: ["shop", "fantasy", theme.toLowerCase(), input.tone].concat(input.keywords.slice(0, 2)),
      },
    };
  });
}

function loreSuggestions(input: CreativeInput): CreativeSuggestion[] {
  const theme = splitTheme(input.theme);
  const seed = hashString(`${input.theme}|${input.tone}|lore_entries`);
  const forms = ["Rumor", "Tomb Inscription", "Archivist Note", "Old Ballad", "Sealed Warning", "Map Annotation"];
  return Array.from({ length: Math.max(1, input.count) }).map((_, idx) => {
    const absolute = seed + idx;
    const form = pick(forms, absolute);
    const title = `${theme} ${form}`;
    return {
      id: `lore-${idx}`,
      title,
      summary: `${input.tone} lore seed for clues, journals, or environmental storytelling.`,
      patch: {
        title,
        slug: toSlug(title),
        content: `The ${theme.toLowerCase()} was not lost by accident. The final record points toward a locked lower chamber and a debt still unpaid.`,
        description: `${form} tied to ${theme}. Keywords: ${joinKeywords(input.keywords)}.`,
        tags: ["lore", "fantasy", theme.toLowerCase(), input.tone].concat(input.keywords.slice(0, 2)),
      },
    };
  });
}

function statusSuggestions(input: CreativeInput): CreativeSuggestion[] {
  const theme = splitTheme(input.theme);
  const seed = hashString(`${input.theme}|${input.tone}|statuses`);
  const suffixes = ["Mark", "Hex", "Ward", "Brand", "Vow", "Fatigue"];
  return Array.from({ length: Math.max(1, input.count) }).map((_, idx) => {
    const absolute = seed + idx;
    const name = `${theme} ${pick(suffixes, absolute)}`;
    return {
      id: `status-${idx}`,
      title: name,
      summary: `${input.tone} status effect hook for fantasy combat combos.`,
      patch: {
        name,
        slug: toSlug(name),
        category: absolute % 2 === 0 ? "Debuff" : "Buff",
        description: `A ${input.tone} status tied to ${theme.toLowerCase()}, useful for ability and item synergies.`,
        max_stacks: 1 + (absolute % 3),
        is_dispellable: true,
        tags: ["status", "fantasy", theme.toLowerCase(), input.tone].concat(input.keywords.slice(0, 2)),
      },
    };
  });
}

function effectSuggestions(input: CreativeInput): CreativeSuggestion[] {
  const theme = splitTheme(input.theme);
  const seed = hashString(`${input.theme}|${input.tone}|effects`);
  const types = ["Damage", "Heal", "ApplyStatus", "StatModifier"];
  return Array.from({ length: Math.max(1, input.count) }).map((_, idx) => {
    const absolute = seed + idx;
    const effectType = pick(types, absolute);
    const name = `${toneWord(input.tone, absolute)} ${theme} ${effectType}`;
    return {
      id: `effect-${idx}`,
      title: name,
      summary: `${input.tone} fantasy effect for abilities, statuses, and items.`,
      patch: {
        name,
        slug: toSlug(name),
        effect_type: effectType,
        description: `A ${input.tone} ${effectType.toLowerCase()} effect shaped by ${theme}. Keywords: ${joinKeywords(input.keywords)}.`,
        tags: ["effect", "fantasy", theme.toLowerCase(), input.tone].concat(input.keywords.slice(0, 2)),
      },
    };
  });
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
  { schema: "quests", generate: questSuggestions },
  { schema: "encounters", generate: encounterSuggestions },
  { schema: "locations", generate: locationSuggestions },
  { schema: "factions", generate: factionSuggestions },
  { schema: "shops", generate: shopSuggestions },
  { schema: "lore_entries", generate: loreSuggestions },
  { schema: "statuses", generate: statusSuggestions },
  { schema: "effects", generate: effectSuggestions },
  { schema: "dialogue_nodes", generate: dialogueNodeSuggestions },
  { schema: "dialogues", generate: dialoguesSuggestions },
  { schema: "characters", generate: characterSuggestions },
  { schema: "story_arcs", generate: storyArcSuggestions },
  { schema: "story_*", generate: storySuggestions },
  { schema: "npc_*", generate: characterSuggestions },
  { schema: "*", generate: genericSuggestions },
];
