export const SIMULATION_SCHEMA_NAMES = [
  "abilities",
  "items",
  "effects",
  "encounters",
  "combat_profiles",
  "characters",
] as const;

export type SimulationSchemaName = (typeof SIMULATION_SCHEMA_NAMES)[number];

export interface SimulationDatasets {
  abilities: Record<string, unknown>[];
  items: Record<string, unknown>[];
  effects: Record<string, unknown>[];
  encounters: Record<string, unknown>[];
  combat_profiles: Record<string, unknown>[];
  characters: Record<string, unknown>[];
}

export interface SimulationScenario {
  id: string;
  label: string;
  description: string;
  turns: number;
  targetCount: number;
  statBudget: number;
  resourceBudget: number;
  pressure: number;
  economyWeight: number;
  controlWeight: number;
}

export interface SimulationMetrics {
  power: number;
  value: number;
  influence: number;
  dps: number;
  survivability: number;
  control: number;
  economy: number;
  consistency: number;
}

export interface SimulationRunOptions {
  schemaName: SimulationSchemaName;
  entity: Record<string, unknown>;
  datasets: SimulationDatasets;
  scenario: SimulationScenario;
  runs: number;
  seed: number;
}

export interface SimulationResult {
  schemaName: SimulationSchemaName;
  entityId: string;
  entityLabel: string;
  scenarioId: string;
  runs: number;
  metrics: SimulationMetrics;
  warnings: string[];
  notes: string[];
}
