import { describe, expect, it } from "vitest";
import { simulateAbilityTrace } from "./abilityTrace";
import type { SimulationDatasets, SimulationScenario } from "./types";

const scenario: SimulationScenario = {
  id: "test",
  label: "Test",
  description: "",
  turns: 8,
  targetCount: 4,
  statBudget: 1,
  resourceBudget: 30,
  pressure: 1,
  economyWeight: 1,
  controlWeight: 1,
};

const effects = [
  { id: "damage", name: "Pulse", type: "Damage", target: "Area", value: 10 },
  { id: "burn", name: "Burn", type: "Status", target: "Area", status_id: "burning", status_operation: "Apply", duration: 3, apply_chance: 100 },
];
const statuses = [{ id: "burning", name: "Burning", category: "DoT", polarity: "Harmful", max_stacks: 2, reapplication_policy: "AddStackRefresh" }];
const datasets: SimulationDatasets = {
  abilities: [], effects, statuses, items: [], encounters: [], combat_profiles: [], characters: [], ability_relations: [],
};

describe("simulateAbilityTrace", () => {
  it("uses scenario target count and canonical cadence", () => {
    const result = simulateAbilityTrace({
      ability: { id: "a", name: "Pulse", type: "Active", targeting: "Area", resource_cost: 5, cooldown: 2, effects: ["damage"] },
      datasets,
      scenario,
      seed: 1,
    });
    expect(result.targetCount).toBe(4);
    expect(result.casts).toBe(4);
    expect(result.contributions[0].damage).toBe(160);
  });

  it("applies profile immunity before status lifecycle", () => {
    const result = simulateAbilityTrace({
      ability: { id: "a", name: "Burn", type: "Active", targeting: "Area", cooldown: 1, effects: ["burn"] },
      datasets,
      scenario,
      seed: 1,
      targetProfile: { status_rules: [{ polarity: "Harmful", immune: true }] },
    });
    expect(result.events.some((event) => event.kind === "status_apply")).toBe(false);
    expect(result.events.some((event) => event.kind === "status_immune")).toBe(true);
  });

  it("models toggle upkeep and deactivation", () => {
    const result = simulateAbilityTrace({
      ability: { id: "a", name: "Aura", type: "Toggle", targeting: "Area", resource_cost: 5, upkeep_cost: 10, effect_links: [{ effect_id: "damage", phase: "WhileActive" }] },
      datasets,
      scenario,
      seed: 1,
    });
    expect(result.events.some((event) => event.kind === "deactivate")).toBe(true);
    expect(result.finalResource).toBe(0);
  });
});
