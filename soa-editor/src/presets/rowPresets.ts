import type { UnknownRecord } from "../types/common";

export type RowPresetMode = "append" | "replaceRow" | "fillEmptyRow";

export interface RowPreset {
  schemaName: string;
  fieldPath: string;
  label: string;
  description?: string;
  mode: RowPresetMode;
  data: UnknownRecord;
}

const rewardPresets: RowPreset[] = [
  { schemaName: "*", fieldPath: "*item_rewards", label: "Item Reward", description: "Item plus quantity.", mode: "append", data: { item_id: "", quantity: 1 } },
  { schemaName: "*", fieldPath: "*items", label: "Item Reward", description: "Item plus quantity.", mode: "append", data: { item_id: "", quantity: 1 } },
  { schemaName: "*", fieldPath: "*currency_rewards", label: "Currency Reward", description: "Currency plus amount.", mode: "append", data: { currency_id: "", amount: 1 } },
  { schemaName: "*", fieldPath: "*currencies", label: "Currency Reward", description: "Currency plus amount.", mode: "append", data: { currency_id: "", amount: 1 } },
  { schemaName: "*", fieldPath: "*reputation_rewards", label: "Reputation Reward", description: "Faction reputation delta.", mode: "append", data: { faction_id: "", amount: 1 } },
  { schemaName: "*", fieldPath: "*reputation", label: "Reputation Reward", description: "Faction reputation delta.", mode: "append", data: { faction_id: "", amount: 1 } },
];

export const ROW_PRESETS: RowPreset[] = [
  ...rewardPresets,
  { schemaName: "*", fieldPath: "*stat_modifiers", label: "Flat Stat Bonus", description: "Flat stat modifier.", mode: "append", data: { stat_id: "", value: 1, value_type: "Flat" } },
  { schemaName: "*", fieldPath: "*stat_modifiers", label: "Percentage Stat Bonus", description: "Percentage stat modifier.", mode: "append", data: { stat_id: "", value: 10, value_type: "Percentage" } },
  { schemaName: "*", fieldPath: "*stat_modifiers", label: "Multiplier Stat Bonus", description: "Multiplier stat modifier.", mode: "append", data: { stat_id: "", value: 1.1, value_type: "Multiplier" } },
  { schemaName: "*", fieldPath: "*attribute_modifiers", label: "Attribute Bonus", description: "Basic attribute modifier.", mode: "append", data: { attribute_id: "", value: 1, scaling: "None" } },
  { schemaName: "encounters", fieldPath: "participants", label: "Hostile Combatant", description: "Enemy-side combat participant.", mode: "append", data: { character_id: "", contexts: ["Combat"], combat_side: "Hostile" } },
  { schemaName: "encounters", fieldPath: "participants", label: "Friendly Ally", description: "Friendly combat participant.", mode: "append", data: { character_id: "", contexts: ["Combat"], combat_side: "Friendly" } },
  { schemaName: "encounters", fieldPath: "participants", label: "Neutral Speaker", description: "Interaction participant.", mode: "append", data: { character_id: "", contexts: ["Interaction"], combat_side: "Neutral" } },
  { schemaName: "dialogue_nodes", fieldPath: "choices", label: "Gated Choice", description: "Choice with requirements.", mode: "append", data: { choice_text: "", next_node_id: "", requirements_id: "", set_flags: [] } },
  { schemaName: "dialogue_nodes", fieldPath: "choices", label: "Flag Choice", description: "Choice that sets a flag.", mode: "append", data: { choice_text: "", next_node_id: "", set_flags: [] } },
  { schemaName: "quests", fieldPath: "objectives", label: "Basic Objective", description: "Objective with generated id.", mode: "append", data: { objective_id: "", description: "", flags_set: [] } },
  { schemaName: "quests", fieldPath: "objectives", label: "Flag Objective", description: "Objective that sets flags.", mode: "append", data: { objective_id: "", description: "", requirements_id: "", flags_set: [] } },
  { schemaName: "*", fieldPath: "*stat_growth", label: "Stat Growth", description: "Per-level stat growth.", mode: "append", data: { stat_id: "", value: 1 } },
  { schemaName: "*", fieldPath: "*inventory", label: "Inventory Item", description: "Item for sale.", mode: "append", data: { item_id: "", stock: 1, price_multiplier: 1 } },
  { schemaName: "*", fieldPath: "*loot_table", label: "Loot Drop", description: "Item drop chance.", mode: "append", data: { item_id: "", drop_chance: 25 } },
];

function matchesPattern(value: string, pattern: string): boolean {
  if (pattern === "*") return true;
  if (pattern.startsWith("*")) return value.endsWith(pattern.slice(1));
  if (pattern.endsWith("*")) return value.startsWith(pattern.slice(0, -1));
  return value === pattern;
}

export function getRowPresets(schemaName: string, fieldPath: string): RowPreset[] {
  return ROW_PRESETS.filter((preset) => {
    return matchesPattern(schemaName, preset.schemaName) && matchesPattern(fieldPath, preset.fieldPath);
  });
}
