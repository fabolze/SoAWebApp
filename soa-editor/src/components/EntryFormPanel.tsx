import { useCallback, useEffect, useMemo, useState } from "react";
import SchemaForm from "./SchemaForm";
import { ParentSummary } from "./EditorStackContext";
import { BUTTON_CLASSES, BUTTON_SIZES } from "../styles/uiTokens";
import PresetToolbar from "./presets/PresetToolbar";
import { applyPresetData } from "../presets/apply";
import { getPresetsForSchema, type PresetApplyMode } from "../presets";
import CreativePromptPanel from "./creative/CreativePromptPanel";
import CloneMutatePanel from "./creative/CloneMutatePanel";
import {
  buildMutatedClone,
  defaultCloneMutateOptions,
  estimateMutatedCloneChangeCount,
  type CloneMutateOptions,
} from "../creative/cloneMutate";
import CommandPalette, { type CommandPaletteItem } from "./command/CommandPalette";
import useDebouncedValue from "./hooks/useDebouncedValue";
import ContextSimulationPanel from "./simulation/ContextSimulationPanel";
import type { EntryRecord, ReferenceHit, ReferenceSummary } from "../types/editorQol";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface EntryFormPanelProps {
  schemaName: string;
  schema: Record<string, unknown>;
  data: EntryRecord;
  onChange: (updated: EntryRecord) => void;
  onSave: () => void;
  onCancel: () => void;
  formHeader: string;
  formValid: boolean;
  setFormValid: (valid: boolean) => void;
  isNew: boolean;
  referenceOptionsVersion: number;
  parentSummary?: ParentSummary;
  isDirty?: boolean;
  referenceSummary: ReferenceSummary | null;
  referenceLoading: boolean;
  referenceError: string | null;
  onRefreshReferences: () => void;
  onOpenReferenceHit: (hit: ReferenceHit) => void;
  changedFieldKeys: string[];
}

export default function EntryFormPanel({
  schemaName,
  schema,
  data,
  onChange,
  onSave,
  onCancel,
  formHeader,
  formValid,
  setFormValid,
  isNew,
  referenceOptionsVersion,
  parentSummary,
  isDirty,
  referenceSummary,
  referenceLoading,
  referenceError,
  onRefreshReferences,
  onOpenReferenceHit,
  changedFieldKeys,
}: EntryFormPanelProps) {
  const presets = useMemo(() => getPresetsForSchema(schemaName), [schemaName]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>("");
  const [applyMode, setApplyMode] = useState<PresetApplyMode>("fill_empty");
  const [undoSnapshot, setUndoSnapshot] = useState<EntryRecord | null>(null);
  const [creativeUndoSnapshot, setCreativeUndoSnapshot] = useState<EntryRecord | null>(null);
  const [cloneUndoSnapshot, setCloneUndoSnapshot] = useState<EntryRecord | null>(null);
  const [jsonMergeUndoSnapshot, setJsonMergeUndoSnapshot] = useState<EntryRecord | null>(null);
  const [utilityNotice, setUtilityNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [cloneOptions, setCloneOptions] = useState<CloneMutateOptions>(defaultCloneMutateOptions);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const debouncedCloneData = useDebouncedValue(data || {}, 250);
  const debouncedCloneOptions = useDebouncedValue(cloneOptions, 250);
  const rawEntryId = data?.id;
  const currentEntryId = typeof rawEntryId === "string" ? rawEntryId : rawEntryId != null ? String(rawEntryId) : "";
  const hasExistingId = !isNew && currentEntryId.length > 0;

  const showUtilityNotice = useCallback((type: "success" | "error", message: string) => {
    setUtilityNotice({ type, message });
  }, []);

  useEffect(() => {
    if (!presets.length) {
      setSelectedPresetId("");
      setUndoSnapshot(null);
      setCreativeUndoSnapshot(null);
      setCloneUndoSnapshot(null);
      setJsonMergeUndoSnapshot(null);
      return;
    }
    const first = presets[0];
    setSelectedPresetId(first.id);
    setApplyMode(first.defaultMode || "fill_empty");
    setUndoSnapshot(null);
    setCreativeUndoSnapshot(null);
    setCloneUndoSnapshot(null);
    setJsonMergeUndoSnapshot(null);
  }, [schemaName, presets]);

  useEffect(() => {
    if (!utilityNotice) return;
    const timeout = setTimeout(() => setUtilityNotice(null), 3500);
    return () => clearTimeout(timeout);
  }, [utilityNotice]);

  const selectedPreset = presets.find((preset) => preset.id === selectedPresetId) || presets[0] || null;

  const handleSelectPreset = useCallback((presetId: string) => {
    setSelectedPresetId(presetId);
    const next = presets.find((preset) => preset.id === presetId);
    if (next?.defaultMode) setApplyMode(next.defaultMode);
  }, [presets]);

  const handleApplyPreset = useCallback(() => {
    if (!selectedPreset) return;
    setUndoSnapshot(data || {});
    const next = applyPresetData(data || {}, selectedPreset.data, applyMode);
    onChange(next);
  }, [selectedPreset, data, applyMode, onChange]);

  const handleUndoPreset = useCallback(() => {
    if (!undoSnapshot) return;
    onChange(undoSnapshot);
    setUndoSnapshot(null);
  }, [undoSnapshot, onChange]);

  const handleApplyCreativePatch = useCallback((patch: EntryRecord, mode: PresetApplyMode) => {
    setCreativeUndoSnapshot(data || {});
    const next = applyPresetData(data || {}, patch, mode);
    onChange(next);
  }, [data, onChange]);

  const handleUndoCreative = useCallback(() => {
    if (!creativeUndoSnapshot) return;
    onChange(creativeUndoSnapshot);
    setCreativeUndoSnapshot(null);
  }, [creativeUndoSnapshot, onChange]);

  const estimatedCloneChanges = useMemo(
    () => estimateMutatedCloneChangeCount(schema, debouncedCloneData, debouncedCloneOptions),
    [schema, debouncedCloneData, debouncedCloneOptions]
  );

  const handleApplyClone = useCallback(() => {
    const immediateClone = buildMutatedClone(schema, data || {}, cloneOptions);
    setCloneUndoSnapshot(data || {});
    onChange(immediateClone.nextData);
  }, [schema, data, cloneOptions, onChange]);

  const handleUndoClone = useCallback(() => {
    if (!cloneUndoSnapshot) return;
    onChange(cloneUndoSnapshot);
    setCloneUndoSnapshot(null);
  }, [cloneUndoSnapshot, onChange]);

  const handleCopyJson = useCallback(async () => {
    const payload = JSON.stringify(data || {}, null, 2);
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(payload);
        showUtilityNotice("success", "Entry JSON copied to clipboard.");
        return;
      }
      window.prompt("Copy entry JSON:", payload);
      showUtilityNotice("success", "Entry JSON opened for copy.");
    } catch {
      showUtilityNotice("error", "Unable to copy JSON.");
    }
  }, [data, showUtilityNotice]);

  const handleCopyId = useCallback(async () => {
    if (!hasExistingId) {
      showUtilityNotice("error", "No entry ID available yet.");
      return;
    }
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(currentEntryId);
        showUtilityNotice("success", "Entry ID copied.");
        return;
      }
      window.prompt("Copy entry ID:", currentEntryId);
      showUtilityNotice("success", "Entry ID opened for copy.");
    } catch {
      showUtilityNotice("error", "Unable to copy entry ID.");
    }
  }, [currentEntryId, hasExistingId, showUtilityNotice]);

  const handleMergeJsonPatch = useCallback(() => {
    const raw = window.prompt("Paste JSON object to merge into this entry:");
    if (raw === null) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      showUtilityNotice("error", "Invalid JSON.");
      return;
    }

    if (!isRecord(parsed)) {
      showUtilityNotice("error", "JSON patch must be an object.");
      return;
    }
    const patch = parsed as EntryRecord;
    if (Object.keys(patch).length === 0) {
      showUtilityNotice("error", "JSON patch is empty.");
      return;
    }

    setJsonMergeUndoSnapshot(data || {});
    onChange({ ...(data || {}), ...patch });
    showUtilityNotice("success", `Merged ${Object.keys(patch).length} field(s).`);
  }, [data, onChange, showUtilityNotice]);

  const handleUndoJsonMerge = useCallback(() => {
    if (!jsonMergeUndoSnapshot) return;
    onChange(jsonMergeUndoSnapshot);
    setJsonMergeUndoSnapshot(null);
    showUtilityNotice("success", "Reverted JSON merge.");
  }, [jsonMergeUndoSnapshot, onChange, showUtilityNotice]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const commandItems = useMemo<CommandPaletteItem[]>(
    () => [
      {
        id: "save",
        title: "Save Entry",
        subtitle: "Persist current form data",
        keywords: ["save", "persist", "entry"],
        disabled: !formValid,
        run: async () => {
          await onSave();
        },
      },
      {
        id: "apply-preset",
        title: "Apply Selected Preset",
        subtitle: selectedPreset ? selectedPreset.label : "No preset available",
        keywords: ["preset", "template"],
        disabled: !selectedPreset,
        run: handleApplyPreset,
      },
      {
        id: "undo-preset",
        title: "Undo Preset",
        subtitle: "Revert last preset application",
        keywords: ["undo", "preset"],
        disabled: !undoSnapshot,
        run: handleUndoPreset,
      },
      {
        id: "undo-creative",
        title: "Undo Creative Patch",
        subtitle: "Revert last creative apply action",
        keywords: ["creative", "undo"],
        disabled: !creativeUndoSnapshot,
        run: handleUndoCreative,
      },
      {
        id: "create-variant",
        title: "Create Variant Draft",
        subtitle: `Clone and mutate current data (${estimatedCloneChanges} estimated changes)`,
        keywords: ["clone", "mutate", "variant"],
        run: handleApplyClone,
      },
      {
        id: "undo-clone",
        title: "Undo Clone + Mutate",
        subtitle: "Revert last clone/mutate action",
        keywords: ["clone", "undo", "mutate"],
        disabled: !cloneUndoSnapshot,
        run: handleUndoClone,
      },
      {
        id: "copy-json",
        title: "Copy Entry JSON",
        subtitle: "Copy current entry payload to clipboard",
        keywords: ["copy", "json", "clipboard"],
        run: handleCopyJson,
      },
      {
        id: "merge-json",
        title: "Merge JSON Patch",
        subtitle: "Paste a JSON object and merge fields",
        keywords: ["merge", "json", "patch"],
        run: handleMergeJsonPatch,
      },
      {
        id: "undo-json-merge",
        title: "Undo JSON Merge",
        subtitle: "Revert last JSON merge action",
        keywords: ["undo", "json", "merge"],
        disabled: !jsonMergeUndoSnapshot,
        run: handleUndoJsonMerge,
      },
      {
        id: "cancel",
        title: "Cancel Editing",
        subtitle: isNew ? "Not available for a new draft" : "Discard and return to a new draft",
        keywords: ["cancel", "discard"],
        disabled: isNew,
        run: onCancel,
      },
    ],
    [
      formValid,
      onSave,
      selectedPreset,
      handleApplyPreset,
      undoSnapshot,
      handleUndoPreset,
      creativeUndoSnapshot,
      handleUndoCreative,
      estimatedCloneChanges,
      handleApplyClone,
      cloneUndoSnapshot,
      handleUndoClone,
      handleCopyJson,
      handleMergeJsonPatch,
      jsonMergeUndoSnapshot,
      handleUndoJsonMerge,
      isNew,
      onCancel,
    ]
  );

  return (
    <div className="flex-1 min-w-0 flex flex-col h-full max-h-full overflow-hidden bg-white p-6">
      <div className="sticky top-0 z-10 bg-white p-4 border-b">
        <h1 className="text-xl font-bold mb-2 text-slate-900">{formHeader}</h1>
        {hasExistingId && (
          <span className="ml-2 text-slate-700 font-semibold">Editing: {currentEntryId}</span>
        )}
        {isDirty && (
          <span className="ml-2 text-amber-600 font-semibold">Unsaved changes</span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto min-h-0 p-4">
        <PresetToolbar
          schemaName={schemaName}
          presets={presets}
          selectedPresetId={selectedPreset?.id || ""}
          applyMode={applyMode}
          canUndo={!!undoSnapshot}
          onSelectPreset={handleSelectPreset}
          onModeChange={setApplyMode}
          onApply={handleApplyPreset}
          onUndo={handleUndoPreset}
        />
        <CreativePromptPanel
          schemaName={schemaName}
          schema={schema}
          data={data || {}}
          canUndo={!!creativeUndoSnapshot}
          onUndo={handleUndoCreative}
          onApplyPatch={handleApplyCreativePatch}
        />
        <CloneMutatePanel
          options={cloneOptions}
          changedCount={estimatedCloneChanges}
          canUndo={!!cloneUndoSnapshot}
          onChangeOptions={setCloneOptions}
          onApply={handleApplyClone}
          onUndo={handleUndoClone}
        />
        <ContextSimulationPanel
          schemaName={schemaName}
          data={(data || {}) as Record<string, unknown>}
        />
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 mb-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <div className="text-sm font-semibold text-slate-800">Authoring Utilities</div>
              <div className="text-xs text-slate-600 mt-1">
                Changed fields: <span className="font-semibold text-slate-800">{changedFieldKeys.length}</span>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              {hasExistingId && (
                <button
                  type="button"
                  className={`${BUTTON_CLASSES.secondary} ${BUTTON_SIZES.xs}`}
                  onClick={() => {
                    void handleCopyId();
                  }}
                >
                  Copy ID
                </button>
              )}
              <button
                type="button"
                className={`${BUTTON_CLASSES.secondary} ${BUTTON_SIZES.xs}`}
                onClick={() => {
                  void handleCopyJson();
                }}
              >
                Copy JSON
              </button>
              <button
                type="button"
                className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`}
                onClick={handleMergeJsonPatch}
              >
                Merge JSON
              </button>
              <button
                type="button"
                className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`}
                onClick={handleUndoJsonMerge}
                disabled={!jsonMergeUndoSnapshot}
              >
                Undo Merge
              </button>
            </div>
          </div>
          {utilityNotice && (
            <div
              className={`mt-2 rounded border px-2 py-1 text-xs ${
                utilityNotice.type === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              {utilityNotice.message}
            </div>
          )}
        </div>
        {hasExistingId && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 mb-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="text-sm font-semibold text-slate-800">Reference Insights</div>
                <div className="text-xs mt-1 text-slate-600">
                  Find where this entry is referenced across all authoring datasets.
                </div>
              </div>
              <button
                type="button"
                className={`${BUTTON_CLASSES.secondary} ${BUTTON_SIZES.xs}`}
                onClick={onRefreshReferences}
                disabled={referenceLoading}
              >
                {referenceLoading ? "Scanning..." : "Refresh"}
              </button>
            </div>
            {referenceError && (
              <div className="mt-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
                {referenceError}
              </div>
            )}
            {referenceSummary && (
              <div className="mt-2">
                <div className="text-xs text-slate-600 mb-2">
                  {referenceSummary.total} references found for <span className="font-semibold text-slate-800">{referenceSummary.targetId}</span>.
                </div>
                {referenceSummary.groups.length === 0 ? (
                  <div className="text-xs text-slate-500">No references detected.</div>
                ) : (
                  <div className="space-y-2">
                    {referenceSummary.groups.map((group) => (
                      <div key={group.schemaName} className="rounded border border-slate-200 bg-white p-2">
                        <div className="text-xs font-semibold text-slate-700 mb-1">
                          {group.schemaLabel} ({group.count})
                        </div>
                        <div className="space-y-1">
                          {group.hits.slice(0, 5).map((hit) => (
                            <div key={`${group.schemaName}-${hit.sourceId}`} className="flex items-center justify-between gap-2 text-xs">
                              <div className="min-w-0">
                                <div className="truncate text-slate-800" title={`${hit.sourceLabel} (${hit.sourceId})`}>
                                  {hit.sourceLabel}
                                </div>
                                <div className="truncate text-slate-500" title={hit.paths.join(", ")}>
                                  {hit.paths.slice(0, 2).join(", ")}
                                </div>
                              </div>
                              <button
                                type="button"
                                className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`}
                                onClick={() => onOpenReferenceHit(hit)}
                              >
                                Open
                              </button>
                            </div>
                          ))}
                          {group.hits.length > 5 && (
                            <div className="text-[11px] text-slate-500">
                              +{group.hits.length - 5} more
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        <SchemaForm
          schema={schema}
          data={data}
          onChange={onChange}
          referenceOptions={undefined}
          fetchReferenceOptions={undefined}
          isValidCallback={setFormValid}
          key={referenceOptionsVersion}
          parentSummary={parentSummary}
          changedFieldKeys={changedFieldKeys}
        />
        <div className="flex gap-2 mt-4">
          <button
            className={`${BUTTON_CLASSES.primary} ${BUTTON_SIZES.md}`}
            onClick={onSave}
            disabled={!formValid}
          >
            Save
          </button>
          {!isNew && (
            <button
              className={`${BUTTON_CLASSES.secondary} ${BUTTON_SIZES.md}`}
              onClick={onCancel}
            >
              Cancel
            </button>
          )}
        </div>
      </div>
      <CommandPalette
        open={commandPaletteOpen}
        title="Editor Commands"
        items={commandItems}
        onClose={() => setCommandPaletteOpen(false)}
      />
    </div>
  );
}
