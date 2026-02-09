import { apiFetch } from "../lib/api";
import type { SimulationDatasets, SimulationSchemaName } from "./types";

const DATASET_ENDPOINTS: Record<SimulationSchemaName, string> = {
  abilities: "abilities",
  items: "items",
  effects: "effects",
  encounters: "encounters",
  combat_profiles: "combat_profiles",
  characters: "characters",
};

const EMPTY_DATASETS: SimulationDatasets = {
  abilities: [],
  items: [],
  effects: [],
  encounters: [],
  combat_profiles: [],
  characters: [],
};

let datasetsCache: SimulationDatasets | null = null;
let pendingLoad: Promise<SimulationDatasets> | null = null;

async function fetchDataset(path: string): Promise<Record<string, unknown>[]> {
  try {
    const res = await apiFetch(`/api/${path}`);
    const payload = await res.json();
    return Array.isArray(payload) ? payload : [];
  } catch {
    return [];
  }
}

async function fetchAllDatasets(): Promise<SimulationDatasets> {
  const entries = await Promise.all(
    (Object.keys(DATASET_ENDPOINTS) as SimulationSchemaName[]).map(async (schemaName) => {
      const endpoint = DATASET_ENDPOINTS[schemaName];
      const dataset = await fetchDataset(endpoint);
      return [schemaName, dataset] as const;
    })
  );
  const next: SimulationDatasets = { ...EMPTY_DATASETS };
  entries.forEach(([schemaName, dataset]) => {
    next[schemaName] = dataset;
  });
  return next;
}

export async function loadSimulationDatasets(forceRefresh = false): Promise<SimulationDatasets> {
  if (!forceRefresh && datasetsCache) return datasetsCache;
  if (!forceRefresh && pendingLoad) return pendingLoad;

  pendingLoad = fetchAllDatasets()
    .then((datasets) => {
      datasetsCache = datasets;
      return datasets;
    })
    .finally(() => {
      pendingLoad = null;
    });

  return pendingLoad;
}

export function getSimulationDataset(schemaName: SimulationSchemaName, datasets: SimulationDatasets): Record<string, unknown>[] {
  return datasets[schemaName] || [];
}

export function clearSimulationDatasetsCache(): void {
  datasetsCache = null;
  pendingLoad = null;
}
