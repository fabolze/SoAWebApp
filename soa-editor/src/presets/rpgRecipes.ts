import type { PresetScope } from "./types";

export const npcVendorPreset: PresetScope = {
  schema: "characters",
  presets: [
    {
      id: "recipe-npc-vendor",
      label: "NPC Vendor",
      description: "Starter NPC profile for a shopkeeper or travelling merchant.",
      category: "RPG Recipes",
      tags: ["npc", "vendor", "shop"],
      difficulty: "starter",
      recommendedMode: "fill_empty",
      data: {
        role: "Vendor",
        tags: ["npc", "vendor", "shopkeeper"],
      },
    },
  ],
};

export const questStarterPreset: PresetScope = {
  schema: "quests",
  presets: [
    {
      id: "recipe-quest-starter",
      label: "Quest Starter",
      description: "Basic quest with first objective, completion flag, XP, currency, and item reward slots.",
      category: "RPG Recipes",
      tags: ["quest", "starter", "rewards"],
      difficulty: "starter",
      recommendedMode: "fill_empty",
      data: {
        objectives: [{ objective_id: "obj_1", description: "", requirements_id: "", flags_set: [] }],
        flags_set_on_completion: [],
        xp_reward: 100,
        currency_rewards: [{ currency_id: "", amount: 25 }],
        item_rewards: [{ item_id: "", quantity: 1 }],
        tags: ["quest", "starter"],
      },
    },
  ],
};

export const eliteEncounterPreset: PresetScope = {
  schema: "encounters",
  presets: [
    {
      id: "recipe-elite-encounter",
      label: "Elite Encounter",
      description: "Combat encounter starter with hostile participant and reward scaffold.",
      category: "RPG Recipes",
      tags: ["encounter", "elite", "combat"],
      difficulty: "intermediate",
      recommendedMode: "fill_empty",
      data: {
        encounter_type: "Combat",
        participants: [{ character_id: "", contexts: ["Combat"], combat_side: "Hostile" }],
        rewards: {
          xp: 250,
          items: [{ item_id: "", quantity: 1 }],
          currencies: [{ currency_id: "", amount: 50 }],
          reputation: [],
          flags_set: [],
        },
        tags: ["combat", "elite"],
      },
    },
  ],
};

export const combatProfileElitePreset: PresetScope = {
  schema: "combat_profiles",
  presets: [
    {
      id: "recipe-elite-combat-profile",
      label: "Elite Combat Profile",
      description: "Higher-value hostile profile with loot, currency, and stat override slots.",
      category: "RPG Recipes",
      tags: ["combat", "elite", "loot"],
      difficulty: "intermediate",
      recommendedMode: "fill_empty",
      data: {
        aggression: "Hostile",
        enemy_type: "humanoid",
        custom_stats: [{ stat_id: "", value: 10 }],
        loot_table: [{ item_id: "", drop_chance: 25 }],
        currency_rewards: [{ currency_id: "", amount: 50, drop_chance: 100 }],
        xp_reward: 250,
        tags: ["elite", "combat"],
      },
    },
  ],
};

export const statusComboPreset: PresetScope = {
  schema: "statuses",
  presets: [
    {
      id: "recipe-status-combo",
      label: "Status Combo Marker",
      description: "Status starter tagged for effect and ability combo authoring.",
      category: "RPG Recipes",
      tags: ["status", "combo", "effect"],
      difficulty: "starter",
      recommendedMode: "fill_empty",
      data: {
        category: "Buff",
        is_dispellable: true,
        max_stacks: 1,
        tags: ["status", "combo"],
      },
    },
  ],
};

export const themedShopPreset: PresetScope = {
  schema: "shops",
  presets: [
    {
      id: "recipe-themed-shop",
      label: "Themed Shop",
      description: "Shop starter with pricing defaults, gated inventory slot, and dynamic modifier scaffold.",
      category: "RPG Recipes",
      tags: ["shop", "vendor", "inventory"],
      difficulty: "intermediate",
      recommendedMode: "fill_empty",
      data: {
        price_multiplier: 1,
        price_modifier: 0,
        inventory: [{ item_id: "", stock: 1, requirements_id: "", price_multiplier: 1 }],
        price_modifiers: [{ modifier_type: "Flag", reference_id: "", operator: "eq", value: 1, price_multiplier: 0.9 }],
        tags: ["shop", "themed"],
      },
    },
  ],
};
