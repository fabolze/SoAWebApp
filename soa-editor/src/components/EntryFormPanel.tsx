import { useEffect, useMemo, useState } from "react";
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

interface EntryFormPanelProps {
  schemaName: string;
  schema: any;
  data: any;
  onChange: (updated: any) => void;
  onSave: () => void;
  onCancel: () => void;
  formHeader: string;
  formValid: boolean;
  setFormValid: (valid: boolean) => void;
  isNew: boolean;
  referenceOptionsVersion: number;
  parentSummary?: ParentSummary;
  isDirty?: boolean;
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
}: EntryFormPanelProps) {
  const presets = useMemo(() => getPresetsForSchema(schemaName), [schemaName]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>("");
  const [applyMode, setApplyMode] = useState<PresetApplyMode>("fill_empty");
  const [undoSnapshot, setUndoSnapshot] = useState<Record<string, any> | null>(null);
  const [creativeUndoSnapshot, setCreativeUndoSnapshot] = useState<Record<string, any> | null>(null);
  const [cloneUndoSnapshot, setCloneUndoSnapshot] = useState<Record<string, any> | null>(null);
  const [cloneOptions, setCloneOptions] = useState<CloneMutateOptions>(defaultCloneMutateOptions);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const debouncedCloneData = useDebouncedValue(data || {}, 250);
  const debouncedCloneOptions = useDebouncedValue(cloneOptions, 250);

  useEffect(() => {
    if (!presets.length) {
      setSelectedPresetId("");
      setUndoSnapshot(null);
      setCreativeUndoSnapshot(null);
      setCloneUndoSnapshot(null);
      return;
    }
    const first = presets[0];
    setSelectedPresetId(first.id);
    setApplyMode(first.defaultMode || "fill_empty");
    setUndoSnapshot(null);
    setCreativeUndoSnapshot(null);
    setCloneUndoSnapshot(null);
  }, [schemaName, presets]);

  const selectedPreset = presets.find((preset) => preset.id === selectedPresetId) || presets[0] || null;

  const handleSelectPreset = (presetId: string) => {
    setSelectedPresetId(presetId);
    const next = presets.find((preset) => preset.id === presetId);
    if (next?.defaultMode) setApplyMode(next.defaultMode);
  };

  const handleApplyPreset = () => {
    if (!selectedPreset) return;
    setUndoSnapshot(data || {});
    const next = applyPresetData(data || {}, selectedPreset.data, applyMode);
    onChange(next);
  };

  const handleUndoPreset = () => {
    if (!undoSnapshot) return;
    onChange(undoSnapshot);
    setUndoSnapshot(null);
  };

  const handleApplyCreativePatch = (patch: Record<string, any>, mode: PresetApplyMode) => {
    setCreativeUndoSnapshot(data || {});
    const next = applyPresetData(data || {}, patch, mode);
    onChange(next);
  };

  const handleUndoCreative = () => {
    if (!creativeUndoSnapshot) return;
    onChange(creativeUndoSnapshot);
    setCreativeUndoSnapshot(null);
  };

  const estimatedCloneChanges = useMemo(
    () => estimateMutatedCloneChangeCount(schema, debouncedCloneData, debouncedCloneOptions),
    [schema, debouncedCloneData, debouncedCloneOptions]
  );

  const handleApplyClone = () => {
    const immediateClone = buildMutatedClone(schema, data || {}, cloneOptions);
    setCloneUndoSnapshot(data || {});
    onChange(immediateClone.nextData);
  };

  const handleUndoClone = () => {
    if (!cloneUndoSnapshot) return;
    onChange(cloneUndoSnapshot);
    setCloneUndoSnapshot(null);
  };

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
      isNew,
      onCancel,
    ]
  );

  return (
    <div className="flex-1 min-w-0 flex flex-col h-full max-h-full overflow-hidden bg-white p-6">
      <div className="sticky top-0 z-10 bg-white p-4 border-b">
        <h1 className="text-xl font-bold mb-2 text-slate-900">{formHeader}</h1>
        {!isNew && data?.id && (
          <span className="ml-2 text-slate-700 font-semibold">Editing: {data.id}</span>
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
        <SchemaForm
          schema={schema}
          data={data}
          onChange={onChange}
          referenceOptions={undefined}
          fetchReferenceOptions={undefined}
          isValidCallback={setFormValid}
          key={referenceOptionsVersion}
          parentSummary={parentSummary}
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
