import { generateCreativeSuggestions } from "../creative";
import { findDatasetBySchema } from "../config/editorDatasets";
import { generateSlug, generateUlid } from "../utils/generateId";
import { asRecord } from "../types/common";
import type { UnknownRecord } from "../types/common";
import type { StudioBrief, StudioBundle, StudioBundleEntry, StudioProvider, StudioProviderInput, StudioSuggestion } from "./types";

function keywordTags(brief: StudioBrief): string[] {
  return [brief.theme, brief.tone, ...brief.keywords].map((tag) => generateSlug(tag)).filter(Boolean).slice(0, 6);
}

function titleCase(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "Untitled";
  return trimmed.replace(/\b\w/g, (char) => char.toUpperCase());
}

function themedName(brief: StudioBrief, noun: string): string {
  const theme = titleCase(brief.theme || "Frontier");
  return `${theme} ${noun}`;
}

function entry(schemaName: string, label: string, data: UnknownRecord, dependsOn: string[] = []): StudioBundleEntry {
  const dataset = findDatasetBySchema(schemaName);
  const tempId = typeof data.id === "string" && data.id ? data.id : generateUlid();
  return {
    schemaName,
    apiPath: dataset?.apiPath || schemaName,
    routePath: dataset?.routePath || schemaName,
    tempId,
    label,
    data: { ...data, id: tempId },
    dependsOn,
  };
}

function bundle(id: string, title: string, entries: StudioBundleEntry[], summary?: string): StudioBundle {
  return {
    id,
    title,
    summary,
    source: "local",
    risk: "needs_review",
    entries,
    warnings: ["Generated as local drafts. Review each entry before saving."],
  };
}

function questChain(input: StudioProviderInput): StudioSuggestion {
  const brief = input.brief;
  const tags = keywordTags(brief);
  const questId = generateUlid();
  const flagStart = generateUlid();
  const flagDone = generateUlid();
  const reqId = generateUlid();
  const dialogueId = generateUlid();
  const nodeStart = generateUlid();
  const nodeAccept = generateUlid();
  const questTitle = themedName(brief, "Oath");
  const entries = [
    entry("flags", `${questTitle} Started`, { id: flagStart, slug: generateSlug(`${questTitle} started`), name: `${questTitle} Started`, description: "Set when the player accepts the quest.", tags }),
    entry("flags", `${questTitle} Completed`, { id: flagDone, slug: generateSlug(`${questTitle} completed`), name: `${questTitle} Completed`, description: "Set when the player completes the quest.", tags }),
    entry("requirements", `${questTitle} Requirement`, { id: reqId, slug: generateSlug(`${questTitle} requirement`), required_flags: [], forbidden_flags: [flagDone], min_faction_reputation: [], tags }),
    entry("dialogues", `${questTitle} Briefing`, { id: dialogueId, slug: generateSlug(`${questTitle} briefing`), title: `${questTitle} Briefing`, character_id: "", location_id: brief.locationId || "", starting_node_id: nodeStart, tags }),
    entry("dialogue_nodes", `${questTitle} Opening`, { id: nodeStart, slug: generateSlug(`${questTitle} opening`), dialogue_id: dialogueId, speaker: "Quest Giver", text: `The ${brief.theme || "road"} needs someone willing to act.`, choices: [{ choice_text: "I will help.", next_node_id: nodeAccept, requirements_id: reqId, set_flags: [flagStart] }], tags }),
    entry("dialogue_nodes", `${questTitle} Accepted`, { id: nodeAccept, slug: generateSlug(`${questTitle} accepted`), dialogue_id: dialogueId, speaker: "Quest Giver", text: "Then begin before the trail grows cold.", choices: [], set_flags: [flagStart], tags }),
    entry("quests", questTitle, {
      id: questId,
      slug: generateSlug(questTitle),
      title: questTitle,
      description: `${brief.stakes} stakes quest seed around ${brief.theme || "the local conflict"}.`,
      requirements_id: reqId,
      objectives: [{ objective_id: "obj_1", description: `Resolve the ${brief.theme || "local"} problem.`, flags_set: [flagDone] }],
      flags_set_on_completion: [flagDone],
      xp_reward: brief.playerLevel * 50,
      currency_rewards: brief.rewardStyle === "none" ? [] : [{ currency_id: "", amount: brief.rewardStyle === "generous" ? 100 : 25 }],
      item_rewards: brief.rewardStyle === "rare" ? [{ item_id: "", quantity: 1 }] : [],
      tags,
    }, [reqId, flagStart, flagDone]),
  ];
  return {
    id: "bundle-quest-chain",
    title: "Quest Chain Bundle",
    summary: "Quest, flags, requirement, and starter dialogue nodes.",
    outputKind: "bundle",
    source: "local",
    risk: "needs_review",
    tags: ["quest", "dialogue", "flags"],
    bundle: bundle("quest-chain", "Quest Chain Bundle", entries, "Creates linked quest scaffolding as drafts."),
  };
}

function npcVendor(input: StudioProviderInput): StudioSuggestion {
  const brief = input.brief;
  const tags = ["vendor", "shop", ...keywordTags(brief)];
  const characterId = generateUlid();
  const shopId = generateUlid();
  const interactionId = generateUlid();
  const supplyId = generateUlid();
  const name = themedName(brief, "Provisioner");
  const supplyName = themedName(brief, "Field Supply");
  const entries = [
    entry("characters", name, { id: characterId, slug: generateSlug(name), name, title: "Merchant", level: brief.playerLevel, description: `A ${brief.tone} merchant connected to ${brief.theme || "local trade"}.`, home_location_id: brief.locationId || "", faction_id: brief.factionId || "", tags }),
    entry("items", supplyName, { id: supplyId, slug: generateSlug(supplyName), name: supplyName, type: "Tool", rarity: "Common", base_price: Math.max(10, brief.playerLevel * 8), description: `Practical stock for ${brief.theme || "local"} travel.`, tags: ["shop_stock", ...tags] }),
    entry("interaction_profiles", `${name} Interaction`, { id: interactionId, character_id: characterId, role: "Merchant", dialogue_tree_id: "", inventory: [{ item_id: supplyId, price: Math.max(10, brief.playerLevel * 8) }], tags }, [characterId, supplyId]),
    entry("shops", `${name}'s Stock`, { id: shopId, slug: generateSlug(`${name} stock`), name: `${name}'s Stock`, character_id: characterId, location_id: brief.locationId || "", price_multiplier: brief.rewardStyle === "generous" ? 0.9 : 1, inventory: [{ item_id: supplyId, stock: 3, price_multiplier: 1 }], tags }, [characterId, interactionId, supplyId]),
  ];
  return { id: "bundle-npc-vendor", title: "NPC Vendor Bundle", summary: "Character, shop, and interaction profile.", outputKind: "bundle", source: "local", risk: "needs_review", tags: ["vendor", "shop"], bundle: bundle("npc-vendor", "NPC Vendor Bundle", entries) };
}

function eliteEncounter(input: StudioProviderInput): StudioSuggestion {
  const brief = input.brief;
  const tags = ["elite", "combat", ...keywordTags(brief)];
  const characterId = generateUlid();
  const profileId = generateUlid();
  const encounterId = generateUlid();
  const name = themedName(brief, brief.difficulty === "boss" ? "Boss" : "Elite");
  const entries = [
    entry("characters", name, { id: characterId, slug: generateSlug(name), name, title: "Elite Enemy", level: Math.max(1, brief.playerLevel + 2), description: `A ${brief.tone} combatant shaped by ${brief.theme || "danger"}.`, tags }),
    entry("combat_profiles", `${name} Profile`, { id: profileId, character_id: characterId, enemy_type: "humanoid", aggression: "Hostile", custom_stats: [{ stat_id: "", value: brief.difficulty === "boss" ? 25 : 12 }], loot_table: [{ item_id: "", drop_chance: brief.rewardStyle === "rare" ? 35 : 15 }], currency_rewards: [{ currency_id: "", amount: brief.playerLevel * 10, drop_chance: 100 }], xp_reward: brief.playerLevel * (brief.difficulty === "boss" ? 150 : 80), tags }, [characterId]),
    entry("encounters", `${name} Encounter`, { id: encounterId, slug: generateSlug(`${name} encounter`), name: `${name} Encounter`, encounter_type: "Combat", participants: [{ character_id: characterId, contexts: ["Combat"], combat_side: "Hostile" }], rewards: { xp: brief.playerLevel * 100, items: [], currencies: [{ currency_id: "", amount: brief.playerLevel * 8 }], reputation: [], flags_set: [] }, tags }, [characterId, profileId]),
  ];
  return { id: "bundle-elite-encounter", title: "Elite Encounter Bundle", summary: "Enemy, combat profile, and encounter.", outputKind: "bundle", source: "local", risk: "needs_review", tags: ["combat", "elite"], bundle: bundle("elite-encounter", "Elite Encounter Bundle", entries) };
}

function dialogueBranch(input: StudioProviderInput): StudioSuggestion {
  const brief = input.brief;
  const tags = ["dialogue", "branching", ...keywordTags(brief)];
  const dialogueId = generateUlid();
  const startId = generateUlid();
  const helpId = generateUlid();
  const refuseId = generateUlid();
  const flagId = generateUlid();
  const title = themedName(brief, "Decision");
  const entries = [
    entry("flags", `${title} Helped`, { id: flagId, slug: generateSlug(`${title} helped`), name: `${title} Helped`, description: "Tracks the helpful branch.", tags }),
    entry("dialogues", title, { id: dialogueId, slug: generateSlug(title), title, starting_node_id: startId, tags }),
    entry("dialogue_nodes", `${title} Start`, { id: startId, slug: generateSlug(`${title} start`), dialogue_id: dialogueId, speaker: "NPC", text: `There is a choice to make about ${brief.theme || "what comes next"}.`, choices: [{ choice_text: "Offer help.", next_node_id: helpId, set_flags: [flagId] }, { choice_text: "Walk away.", next_node_id: refuseId, set_flags: [] }], tags }, [dialogueId]),
    entry("dialogue_nodes", `${title} Help`, { id: helpId, slug: generateSlug(`${title} help`), dialogue_id: dialogueId, speaker: "NPC", text: "Then we still have a chance.", choices: [], set_flags: [flagId], tags }, [dialogueId, flagId]),
    entry("dialogue_nodes", `${title} Refuse`, { id: refuseId, slug: generateSlug(`${title} refuse`), dialogue_id: dialogueId, speaker: "NPC", text: "Then the burden remains with us.", choices: [], tags }, [dialogueId]),
  ];
  return { id: "bundle-dialogue-branch", title: "Dialogue Branch Bundle", summary: "Dialogue plus branching nodes and flag.", outputKind: "bundle", source: "local", risk: "needs_review", tags: ["dialogue", "branching"], bundle: bundle("dialogue-branch", "Dialogue Branch Bundle", entries) };
}

function themedShop(input: StudioProviderInput): StudioSuggestion {
  const brief = input.brief;
  const name = themedName(brief, "Market");
  const tags = ["shop", ...keywordTags(brief)];
  const stapleId = generateUlid();
  const rareId = generateUlid();
  const stapleName = themedName(brief, "Travel Kit");
  const rareName = themedName(brief, "Curio");
  const entries = [
    entry("items", stapleName, { id: stapleId, slug: generateSlug(stapleName), name: stapleName, type: "Tool", rarity: "Common", base_price: 25, description: `Reliable supplies for ${brief.theme || "regional"} travel.`, tags: ["shop_stock", ...tags] }),
    entry("items", rareName, { id: rareId, slug: generateSlug(rareName), name: rareName, type: "Accessory", rarity: brief.rewardStyle === "rare" ? "Rare" : "Uncommon", base_price: Math.max(60, brief.playerLevel * 25), description: `A distinctive item that gives the shop a memorable identity.`, tags: ["shop_stock", ...tags] }),
    entry("shops", name, { id: generateUlid(), slug: generateSlug(name), name, description: `A ${brief.tone} shop themed around ${brief.theme || "regional goods"}.`, location_id: brief.locationId || "", price_multiplier: brief.rewardStyle === "generous" ? 0.95 : 1.1, inventory: [{ item_id: stapleId, stock: 5, price_multiplier: 1 }, { item_id: rareId, stock: 1, price_multiplier: 1.25 }], price_modifiers: [{ modifier_type: "Flag", reference_id: "", operator: "eq", value: 1, price_multiplier: 0.9 }], tags }, [stapleId, rareId]),
  ];
  return { id: "bundle-themed-shop", title: "Themed Shop Collection", summary: "Shop with inventory slots and pricing modifier.", outputKind: "bundle", source: "local", risk: "needs_review", tags: ["shop"], bundle: bundle("themed-shop", "Themed Shop Collection", entries) };
}

function statusCombo(input: StudioProviderInput): StudioSuggestion {
  const brief = input.brief;
  const tags = ["combo", ...keywordTags(brief)];
  const statusId = generateUlid();
  const effectId = generateUlid();
  const abilityId = generateUlid();
  const itemId = generateUlid();
  const name = themedName(brief, "Combo");
  const entries = [
    entry("statuses", `${name} Status`, { id: statusId, slug: generateSlug(`${name} status`), name: `${name} Status`, category: "Debuff", description: `Status hook for ${brief.theme || "combo play"}.`, max_stacks: 1, is_dispellable: true, tags }),
    entry("effects", `${name} Effect`, { id: effectId, slug: generateSlug(`${name} effect`), name: `${name} Effect`, effect_type: "Damage", description: `Effect paired with ${name} Status.`, status_id: statusId, tags }, [statusId]),
    entry("abilities", `${name} Ability`, { id: abilityId, slug: generateSlug(`${name} ability`), name: `${name} Ability`, type: "Active", targeting: "Single", resource_cost: 10, cooldown: 2, effects: [effectId], tags }, [effectId]),
    entry("items", `${name} Catalyst`, { id: itemId, slug: generateSlug(`${name} catalyst`), name: `${name} Catalyst`, type: "Consumable", rarity: brief.rewardStyle === "rare" ? "Rare" : "Uncommon", base_price: brief.playerLevel * 20, effects: [effectId], tags }, [effectId]),
  ];
  return { id: "bundle-status-combo", title: "Status Combo Package", summary: "Status, effect, ability, and item catalyst.", outputKind: "bundle", source: "local", risk: "needs_review", tags: ["status", "combo"], bundle: bundle("status-combo", "Status Combo Package", entries) };
}

function dungeonDelve(input: StudioProviderInput): StudioSuggestion {
  const brief = input.brief;
  const tags = ["fantasy", "dungeon", ...keywordTags(brief)];
  const campId = generateUlid();
  const locationId = generateUlid();
  const routeId = generateUlid();
  const flagFound = generateUlid();
  const flagCleared = generateUlid();
  const questId = generateUlid();
  const encounterId = generateUlid();
  const loreId = generateUlid();
  const itemId = generateUlid();
  const baseName = themedName(brief, "Sealed Vault");
  const campName = themedName(brief, "Expedition Camp");
  const rewardName = themedName(brief, "Relic");
  const entries = [
    entry("locations", campName, {
      id: campId,
      slug: generateSlug(campName),
      name: campName,
      biome: "Plains",
      region: brief.locationId || "Uncharted Depths",
      level_range: { min: Math.max(1, brief.playerLevel - 1), max: Math.max(1, brief.playerLevel + 1) },
      coordinates: { x: 42, y: 58 },
      encounters: [],
      is_safe_zone: true,
      is_fast_travel_point: true,
      has_respawn_point: true,
      description: `A small field camp used as the staging point for expeditions into ${baseName}.`,
      tags,
    }),
    entry("locations", baseName, {
      id: locationId,
      slug: generateSlug(baseName),
      name: baseName,
      biome: "Cave",
      biome_modifier: brief.tone.toLowerCase().includes("dark") ? "Shadowed" : "Arcane",
      region: brief.locationId || "Uncharted Depths",
      level_range: { min: Math.max(1, brief.playerLevel - 1), max: Math.max(1, brief.playerLevel + 2) },
      coordinates: { x: 50, y: 50 },
      description: `A ${brief.tone} underground adventure site with locked passages, old wards, and a dangerous central chamber.`,
      encounters: [encounterId],
      is_safe_zone: false,
      is_fast_travel_point: false,
      has_respawn_point: false,
      tags,
    }),
    entry("location_routes", `${campName} to ${baseName}`, {
      id: routeId,
      slug: generateSlug(`${campName} to ${baseName}`),
      from_location_id: campId,
      to_location_id: locationId,
      bidirectional: true,
      route_type: "Trail",
      travel_cost: Math.max(1, brief.playerLevel),
      travel_time: 1,
      is_hidden: false,
      is_fast_travel_enabled: false,
      description: `A marked trail from the expedition camp toward the sealed dungeon entrance.`,
      tags,
    }, [campId, locationId]),
    entry("flags", `${baseName} Discovered`, { id: flagFound, slug: generateSlug(`${baseName} discovered`), name: `${baseName} Discovered`, description: "Set when the player reaches the dungeon site.", tags }, [locationId]),
    entry("flags", `${baseName} Cleared`, { id: flagCleared, slug: generateSlug(`${baseName} cleared`), name: `${baseName} Cleared`, description: "Set when the player resolves the main dungeon threat.", tags }, [locationId]),
    entry("items", rewardName, {
      id: itemId,
      slug: generateSlug(rewardName),
      name: rewardName,
      type: "Accessory",
      rarity: brief.rewardStyle === "rare" ? "Rare" : "Uncommon",
      base_price: Math.max(75, brief.playerLevel * 35),
      description: `A recovered relic tied to ${brief.theme || "the vault"} and suitable as a quest reward.`,
      tags,
    }),
    entry("lore_entries", `${baseName} Warning`, {
      id: loreId,
      slug: generateSlug(`${baseName} warning`),
      title: `${baseName} Warning`,
      content: `The old inscription warns that the lower chamber was sealed to keep a broken oath from spreading.`,
      tags,
    }, [locationId]),
    entry("encounters", `${baseName} Guardian Trial`, {
      id: encounterId,
      slug: generateSlug(`${baseName} guardian trial`),
      name: `${baseName} Guardian Trial`,
      encounter_type: "Combat",
      participants: [{ character_id: "", contexts: ["Combat"], combat_side: "Hostile" }],
      rewards: { xp: brief.playerLevel * 90, items: [{ item_id: itemId, quantity: 1 }], currencies: [{ currency_id: "", amount: brief.playerLevel * 12 }], reputation: [], flags_set: [flagCleared] },
      tags,
    }, [locationId, itemId, flagCleared]),
    entry("quests", `${baseName} Expedition`, {
      id: questId,
      slug: generateSlug(`${baseName} expedition`),
      title: `${baseName} Expedition`,
      description: `Explore the ${baseName.toLowerCase()}, uncover what was sealed below, and return with proof.`,
      objectives: [
        { objective_id: "obj_1", description: `Find the entrance to the ${baseName}.`, flags_set: [flagFound] },
        { objective_id: "obj_2", description: "Survive the central chamber and secure the relic.", flags_set: [flagCleared] },
      ],
      flags_set_on_completion: [flagCleared],
      xp_reward: brief.playerLevel * 120,
      item_rewards: [{ item_id: itemId, quantity: 1 }],
      currency_rewards: brief.rewardStyle === "none" ? [] : [{ currency_id: "", amount: brief.playerLevel * 15 }],
      tags,
    }, [locationId, campId, routeId, flagFound, flagCleared, itemId, encounterId, loreId]),
  ];
  return {
    id: "bundle-fantasy-dungeon-delve",
    title: "Fantasy Dungeon Delve Bundle",
    summary: "Location, quest, lore, flags, encounter, and relic reward.",
    outputKind: "bundle",
    source: "local",
    risk: "needs_review",
    tags: ["fantasy", "dungeon", "quest"],
    bundle: bundle("fantasy-dungeon-delve", "Fantasy Dungeon Delve Bundle", entries, "Creates a connected dungeon adventure as local drafts."),
  };
}

function patronContract(input: StudioProviderInput): StudioSuggestion {
  const brief = input.brief;
  const tags = ["fantasy", "patron", "contract", ...keywordTags(brief)];
  const factionId = generateUlid();
  const characterId = generateUlid();
  const shopId = generateUlid();
  const questId = generateUlid();
  const dialogueId = generateUlid();
  const nodeId = generateUlid();
  const supplyId = generateUlid();
  const factionName = themedName(brief, "Lantern Order");
  const patronName = themedName(brief, "Quartermaster");
  const entries = [
    entry("factions", factionName, {
      id: factionId,
      slug: generateSlug(factionName),
      name: factionName,
      description: `A ${brief.tone} patron faction that funds dangerous expeditions and tracks recovered relics.`,
      tags,
    }),
    entry("characters", patronName, {
      id: characterId,
      slug: generateSlug(patronName),
      name: patronName,
      title: "Contract Patron",
      level: Math.max(1, brief.playerLevel + 1),
      faction_id: factionId,
      home_location_id: brief.locationId || "",
      description: `A practical contact who offers work, supplies, and rumors tied to ${brief.theme || "local ruins"}.`,
      tags,
    }, [factionId]),
    entry("interaction_profiles", `${patronName} Merchant Profile`, {
      id: generateUlid(),
      character_id: characterId,
      role: "Merchant",
      dialogue_tree_id: dialogueId,
      inventory: [],
      tags,
    }, [characterId, dialogueId]),
    entry("items", `${patronName} Supply Bundle`, {
      id: supplyId,
      slug: generateSlug(`${patronName} supply bundle`),
      name: `${patronName} Supply Bundle`,
      type: "Tool",
      rarity: "Common",
      base_price: Math.max(20, brief.playerLevel * 10),
      description: `Field supplies issued through ${factionName}.`,
      tags,
    }, [factionId]),
    entry("shops", `${patronName}'s Field Supplies`, {
      id: shopId,
      slug: generateSlug(`${patronName} field supplies`),
      name: `${patronName}'s Field Supplies`,
      character_id: characterId,
      location_id: brief.locationId || "",
      inventory: [{ item_id: supplyId, stock: 4, price_multiplier: 0.95 }],
      price_modifiers: [{ modifier_type: "FactionReputation", reference_id: factionId, operator: "gte", value: 10, price_multiplier: 0.9 }],
      tags,
    }, [characterId, factionId, supplyId]),
    entry("dialogues", `${patronName} Contract Briefing`, {
      id: dialogueId,
      slug: generateSlug(`${patronName} contract briefing`),
      title: `${patronName} Contract Briefing`,
      character_id: characterId,
      starting_node_id: nodeId,
      tags,
    }, [characterId]),
    entry("dialogue_nodes", `${patronName} Offer`, {
      id: nodeId,
      slug: generateSlug(`${patronName} offer`),
      dialogue_id: dialogueId,
      speaker: patronName,
      text: `I have a contract tied to ${brief.theme || "the old roads"}. Take it, and the order will remember the help.`,
      choices: [{ choice_text: "Show me the contract.", next_node_id: "", set_flags: [] }],
      tags,
    }, [dialogueId, characterId]),
    entry("quests", `${factionName} Contract`, {
      id: questId,
      slug: generateSlug(`${factionName} contract`),
      title: `${factionName} Contract`,
      description: `A faction-backed contract with supplies, reputation hooks, and a clear expedition objective.`,
      objectives: [{ objective_id: "obj_1", description: `Complete the contract for ${factionName}.` }],
      xp_reward: brief.playerLevel * 80,
      faction_rewards: [{ faction_id: factionId, amount: 5 }],
      currency_rewards: brief.rewardStyle === "none" ? [] : [{ currency_id: "", amount: brief.playerLevel * 10 }],
      tags,
    }, [factionId, characterId, shopId, dialogueId]),
  ];
  return {
    id: "bundle-fantasy-patron-contract",
    title: "Fantasy Patron Contract Bundle",
    summary: "Faction patron, quest, vendor stock, and briefing dialogue.",
    outputKind: "bundle",
    source: "local",
    risk: "needs_review",
    tags: ["fantasy", "faction", "vendor"],
    bundle: bundle("fantasy-patron-contract", "Fantasy Patron Contract Bundle", entries, "Creates a reusable patron hub for dungeon contracts."),
  };
}

export function localBundleSuggestions(input: StudioProviderInput): StudioSuggestion[] {
  return [dungeonDelve(input), patronContract(input), questChain(input), npcVendor(input), eliteEncounter(input), dialogueBranch(input), themedShop(input), statusCombo(input)];
}

export function localPatchSuggestions(input: StudioProviderInput): StudioSuggestion[] {
  return generateCreativeSuggestions({
    schemaName: input.schemaName,
    schema: input.schema,
    currentData: input.currentData,
    theme: input.brief.theme,
    tone: input.brief.tone,
    keywords: input.brief.keywords,
    count: input.count,
  }).map((suggestion) => ({
    id: suggestion.id,
    title: suggestion.title,
    summary: suggestion.summary,
    outputKind: "patch",
    source: "local",
    risk: "safe",
    tags: suggestion.tags,
    patch: {
      title: suggestion.title,
      summary: suggestion.summary,
      patch: asRecord(suggestion.patch),
      mode: "fill_empty",
      source: "local",
      risk: "safe",
    },
  }));
}

export const localStudioProvider: StudioProvider = {
  id: "local-studio",
  label: "Local Studio",
  source: "local",
  generatePatches: localPatchSuggestions,
  generateBundles: localBundleSuggestions,
};
