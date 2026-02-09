import type { SimulationScenario } from "./types";

export const SIMULATION_SCENARIOS: SimulationScenario[] = [
  {
    id: "duel_baseline",
    label: "Duel Baseline",
    description: "1v1 single-target pressure over a short exchange.",
    turns: 18,
    targetCount: 1,
    statBudget: 1.0,
    resourceBudget: 180,
    pressure: 1.0,
    economyWeight: 0.25,
    controlWeight: 0.35,
  },
  {
    id: "mob_wave",
    label: "Mob Wave",
    description: "Multiple lower-threat enemies where area impact matters.",
    turns: 22,
    targetCount: 4,
    statBudget: 0.9,
    resourceBudget: 220,
    pressure: 0.85,
    economyWeight: 0.35,
    controlWeight: 0.55,
  },
  {
    id: "boss_burst",
    label: "Boss Burst",
    description: "Single high-threat target with sustained pressure.",
    turns: 28,
    targetCount: 1,
    statBudget: 1.35,
    resourceBudget: 260,
    pressure: 1.35,
    economyWeight: 0.2,
    controlWeight: 0.25,
  },
  {
    id: "attrition_longfight",
    label: "Attrition Longfight",
    description: "Long scenario where efficiency and consistency dominate.",
    turns: 40,
    targetCount: 2,
    statBudget: 1.1,
    resourceBudget: 300,
    pressure: 1.15,
    economyWeight: 0.5,
    controlWeight: 0.45,
  },
  {
    id: "loot_economy",
    label: "Loot Economy",
    description: "Reward-focused scenario to compare value and progression gain.",
    turns: 16,
    targetCount: 2,
    statBudget: 0.95,
    resourceBudget: 140,
    pressure: 0.8,
    economyWeight: 1.0,
    controlWeight: 0.2,
  },
];

export const DEFAULT_SIMULATION_SCENARIO_ID = "duel_baseline";

export function getSimulationScenarioById(id: string): SimulationScenario {
  return (
    SIMULATION_SCENARIOS.find((scenario) => scenario.id === id) ||
    SIMULATION_SCENARIOS[0]
  );
}
