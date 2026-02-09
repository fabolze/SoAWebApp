import { useCallback, useEffect, useMemo, useState } from "react";
import useDebouncedValue from "../hooks/useDebouncedValue";
import {
  DEFAULT_SIMULATION_SCENARIO_ID,
  getSimulationDataset,
  getSimulationScenarioById,
  getSimulationSummary,
  isMeaningfulEntity,
  loadSimulationDatasets,
  SIMULATION_SCENARIOS,
  SIMULATION_SCHEMA_NAMES,
  simulateEntity,
  type SimulationDatasets,
  type SimulationResult,
  type SimulationSchemaName,
} from "../../simulation";
import { BUTTON_CLASSES, BUTTON_SIZES, TEXT_CLASSES } from "../../styles/uiTokens";

interface SimulationWorkbenchProps {
  fixedSchemaName?: SimulationSchemaName;
  initialSchemaName?: SimulationSchemaName;
  initialEntityId?: string;
  draftEntity?: Record<string, unknown> | null;
  compact?: boolean;
  title?: string;
}

const SCHEMA_LABELS: Record<SimulationSchemaName, string> = {
  abilities: "Abilities",
  items: "Items",
  effects: "Effects",
  encounters: "Encounters",
  combat_profiles: "Combat Profiles",
  characters: "Characters",
};

const METRIC_LABELS: Array<{ key: keyof SimulationResult["metrics"]; label: string }> = [
  { key: "power", label: "Power" },
  { key: "value", label: "Value" },
  { key: "influence", label: "Influence" },
  { key: "dps", label: "DPS" },
  { key: "survivability", label: "Survivability" },
  { key: "control", label: "Control" },
  { key: "economy", label: "Economy" },
  { key: "consistency", label: "Consistency" },
];

function toText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function entityOptionLabel(entity: Record<string, unknown>): string {
  const id = toText(entity.id) || "draft";
  const name = toText(entity.name) || toText(entity.title);
  return name ? `${name} (${id})` : id;
}

function metricTone(value: number): string {
  if (value >= 75) return "bg-emerald-500";
  if (value >= 45) return "bg-amber-500";
  return "bg-rose-500";
}

function boundedRuns(value: number): number {
  if (!Number.isFinite(value)) return 400;
  return Math.min(2000, Math.max(50, Math.round(value)));
}

export default function SimulationWorkbench({
  fixedSchemaName,
  initialSchemaName,
  initialEntityId,
  draftEntity,
  compact = false,
  title = "Simulation Sandbox",
}: SimulationWorkbenchProps) {
  const [schemaName, setSchemaName] = useState<SimulationSchemaName>(
    fixedSchemaName || initialSchemaName || "abilities"
  );
  const [datasets, setDatasets] = useState<SimulationDatasets | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEntityId, setSelectedEntityId] = useState<string>(initialEntityId || "");
  const [scenarioId, setScenarioId] = useState<string>(DEFAULT_SIMULATION_SCENARIO_ID);
  const [runs, setRuns] = useState<number>(400);
  const [seed, setSeed] = useState<number>(42);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(!!draftEntity);
  const debouncedDraftEntity = useDebouncedValue(draftEntity || {}, 280);
  const activeSchema = fixedSchemaName || schemaName;
  const draftMode = !!draftEntity;

  const refreshDatasets = useCallback(async (forceRefresh: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const loaded = await loadSimulationDatasets(forceRefresh);
      setDatasets(loaded);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load simulation datasets.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshDatasets(false);
  }, [refreshDatasets]);

  useEffect(() => {
    if (fixedSchemaName) setSchemaName(fixedSchemaName);
  }, [fixedSchemaName]);

  const entities = useMemo(
    () => (datasets ? getSimulationDataset(activeSchema, datasets) : []),
    [activeSchema, datasets]
  );

  useEffect(() => {
    if (draftMode) return;
    if (entities.length === 0) {
      setSelectedEntityId("");
      return;
    }
    const currentExists = entities.some((entry) => toText(entry.id) === selectedEntityId);
    if (currentExists) return;
    const preferred = initialEntityId && entities.some((entry) => toText(entry.id) === initialEntityId)
      ? initialEntityId
      : toText(entities[0]?.id);
    setSelectedEntityId(preferred);
  }, [draftMode, entities, initialEntityId, selectedEntityId]);

  const activeEntity = useMemo<Record<string, unknown> | null>(() => {
    if (draftMode && isMeaningfulEntity(debouncedDraftEntity)) return debouncedDraftEntity;
    if (!selectedEntityId) return null;
    const fromList = entities.find((entry) => toText(entry.id) === selectedEntityId);
    return fromList || null;
  }, [debouncedDraftEntity, draftMode, entities, selectedEntityId]);

  const runSimulation = useCallback(() => {
    if (!datasets || !activeEntity) return;
    const scenario = getSimulationScenarioById(scenarioId);
    const next = simulateEntity({
      schemaName: activeSchema,
      entity: activeEntity,
      datasets,
      scenario,
      runs: boundedRuns(runs),
      seed,
    });
    setResult(next);
  }, [activeEntity, activeSchema, datasets, runs, scenarioId, seed]);

  useEffect(() => {
    if (!autoRefresh || !draftMode) return;
    if (!datasets || !activeEntity) return;
    runSimulation();
  }, [autoRefresh, draftMode, datasets, activeEntity, runSimulation]);

  const summaryText = result ? getSimulationSummary(result.metrics) : "Run a simulation to get balancing feedback.";

  return (
    <div className={`rounded-lg border border-slate-200 bg-white ${compact ? "p-3 mb-4" : "p-6"}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className={`font-semibold ${compact ? "text-sm" : "text-lg"} ${TEXT_CLASSES.body}`}>{title}</div>
          <div className={`text-xs mt-1 ${TEXT_CLASSES.muted}`}>
            Compare power, value, and influence under selectable scenarios.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={`${BUTTON_CLASSES.secondary} ${BUTTON_SIZES.xs}`}
            onClick={() => refreshDatasets(true)}
            disabled={loading}
          >
            Refresh Data
          </button>
          <button
            type="button"
            className={`${BUTTON_CLASSES.primary} ${BUTTON_SIZES.xs}`}
            onClick={runSimulation}
            disabled={loading || !activeEntity}
          >
            Run Simulation
          </button>
        </div>
      </div>

      <div className={`grid gap-2 mt-3 ${compact ? "grid-cols-1 md:grid-cols-4" : "grid-cols-1 md:grid-cols-5"}`}>
        {!fixedSchemaName && (
          <div>
            <label className={`block text-xs font-medium mb-1 ${TEXT_CLASSES.muted}`}>Domain</label>
            <select
              className="w-full border border-slate-300 rounded-md px-2 py-2 text-sm text-slate-900 bg-white"
              value={schemaName}
              onChange={(e) => setSchemaName(e.target.value as SimulationSchemaName)}
            >
              {SIMULATION_SCHEMA_NAMES.map((name) => (
                <option key={name} value={name}>
                  {SCHEMA_LABELS[name]}
                </option>
              ))}
            </select>
          </div>
        )}

        {!draftMode && (
          <div className={compact ? "md:col-span-2" : "md:col-span-2"}>
            <label className={`block text-xs font-medium mb-1 ${TEXT_CLASSES.muted}`}>Entity</label>
            <select
              className="w-full border border-slate-300 rounded-md px-2 py-2 text-sm text-slate-900 bg-white"
              value={selectedEntityId}
              onChange={(e) => setSelectedEntityId(e.target.value)}
              disabled={loading || entities.length === 0}
            >
              {entities.length === 0 && <option value="">No entries loaded</option>}
              {entities.map((entry, idx) => {
                const id = toText(entry.id);
                return (
                  <option key={id || `entity-${idx}`} value={id}>
                    {entityOptionLabel(entry)}
                  </option>
                );
              })}
            </select>
          </div>
        )}

        <div>
          <label className={`block text-xs font-medium mb-1 ${TEXT_CLASSES.muted}`}>Scenario</label>
          <select
            className="w-full border border-slate-300 rounded-md px-2 py-2 text-sm text-slate-900 bg-white"
            value={scenarioId}
            onChange={(e) => setScenarioId(e.target.value)}
          >
            {SIMULATION_SCENARIOS.map((scenario) => (
              <option key={scenario.id} value={scenario.id}>
                {scenario.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={`block text-xs font-medium mb-1 ${TEXT_CLASSES.muted}`}>Runs</label>
          <input
            type="number"
            min={50}
            max={2000}
            step={50}
            className="w-full border border-slate-300 rounded-md px-2 py-2 text-sm text-slate-900 bg-white"
            value={runs}
            onChange={(e) => setRuns(boundedRuns(parseInt(e.target.value, 10) || 0))}
          />
        </div>

        <div>
          <label className={`block text-xs font-medium mb-1 ${TEXT_CLASSES.muted}`}>Seed</label>
          <input
            type="number"
            className="w-full border border-slate-300 rounded-md px-2 py-2 text-sm text-slate-900 bg-white"
            value={seed}
            onChange={(e) => setSeed(parseInt(e.target.value, 10) || 1)}
          />
        </div>
      </div>

      {draftMode && (
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className={`text-xs ${TEXT_CLASSES.muted}`}>
            Simulating current draft: <span className="font-medium text-slate-700">{entityOptionLabel(debouncedDraftEntity)}</span>
          </div>
          <label className="inline-flex items-center gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh on edit
          </label>
        </div>
      )}

      {loading && <div className={`mt-3 text-sm ${TEXT_CLASSES.muted}`}>Loading datasets for simulation...</div>}
      {error && <div className="mt-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

      {!loading && (
        <div className="mt-3 rounded border border-slate-200 bg-slate-50 p-3">
          <div className={`text-sm ${TEXT_CLASSES.body}`}>{summaryText}</div>
          {result && (
            <>
              <div className={`text-xs mt-1 ${TEXT_CLASSES.muted}`}>
                Entity: {result.entityLabel} | Scenario: {getSimulationScenarioById(result.scenarioId).label} | Runs: {result.runs}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
                {METRIC_LABELS.map(({ key, label }) => {
                  const metricValue = result.metrics[key];
                  return (
                    <div key={key} className="rounded border border-slate-200 bg-white p-2">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className={TEXT_CLASSES.muted}>{label}</span>
                        <span className="font-semibold text-slate-800">{metricValue.toFixed(1)}</span>
                      </div>
                      <div className="h-2 rounded bg-slate-200">
                        <div
                          className={`h-2 rounded ${metricTone(metricValue)}`}
                          style={{ width: `${Math.max(2, Math.min(100, metricValue))}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {result.warnings.length > 0 && (
                <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-2">
                  <div className="text-xs font-semibold text-amber-900">Warnings</div>
                  <ul className="mt-1 text-xs text-amber-800 list-disc list-inside">
                    {result.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}

              {result.notes.length > 0 && (
                <div className="mt-2 rounded border border-slate-200 bg-white p-2">
                  <div className="text-xs font-semibold text-slate-800">Notes</div>
                  <ul className="mt-1 text-xs text-slate-600 list-disc list-inside">
                    {result.notes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
