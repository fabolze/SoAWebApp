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
  statuses: Record<string, unknown>[];
  ability_relations: Record<string, unknown>[];
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
  context?: {
    casterProfile?: Record<string, unknown> | null;
    targetProfile?: Record<string, unknown> | null;
  };
}

export type AbilityTraceEventKind =
  | "activate"
  | "impact"
  | "effect"
  | "status_apply"
  | "status_stack"
  | "status_remove"
  | "status_expire"
  | "status_immune"
  | "resource"
  | "cooldown"
  | "deactivate";

export interface AbilityTraceEvent {
  turn: number;
  kind: AbilityTraceEventKind;
  label: string;
  effectId?: string;
  statusId?: string;
  targetIds?: string[];
  amount?: number;
  detail?: string;
}

export interface EffectContribution {
  effectId: string;
  label: string;
  damage: number;
  control: number;
  sustain: number;
  applications: number;
  affectedTargets: number;
}

export interface AbilityTrace {
  turns: number;
  targetCount: number;
  targetIds: string[];
  initialResource: number;
  finalResource: number;
  casts: number;
  events: AbilityTraceEvent[];
  contributions: EffectContribution[];
  assumptions: string[];
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
  abilityTrace?: AbilityTrace;
}
