import { SIMULATION_SCHEMA_NAMES, type SimulationSchemaName } from "./types";

export function isSimulationSchemaName(value: string): value is SimulationSchemaName {
  return (SIMULATION_SCHEMA_NAMES as readonly string[]).includes(value);
}

export {
  DEFAULT_SIMULATION_SCENARIO_ID,
  getSimulationScenarioById,
  SIMULATION_SCENARIOS,
} from "./scenarios";
export {
  clearSimulationDatasetsCache,
  getSimulationDataset,
  loadSimulationDatasets,
} from "./data";
export {
  getSimulationSummary,
  isMeaningfulEntity,
  simulateEntity,
} from "./engine";
export {
  SIMULATION_SCHEMA_NAMES,
  type SimulationDatasets,
  type SimulationMetrics,
  type SimulationResult,
  type SimulationRunOptions,
  type SimulationScenario,
  type SimulationSchemaName,
} from "./types";
