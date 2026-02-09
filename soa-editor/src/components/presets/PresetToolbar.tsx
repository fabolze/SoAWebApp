import { BUTTON_CLASSES, BUTTON_SIZES, TEXT_CLASSES } from '../../styles/uiTokens';
import type { EntityPreset, PresetApplyMode } from '../../presets';

interface PresetToolbarProps {
  schemaName: string;
  presets: EntityPreset[];
  selectedPresetId: string;
  applyMode: PresetApplyMode;
  canUndo: boolean;
  onSelectPreset: (presetId: string) => void;
  onModeChange: (mode: PresetApplyMode) => void;
  onApply: () => void;
  onUndo: () => void;
}

export default function PresetToolbar({
  schemaName,
  presets,
  selectedPresetId,
  applyMode,
  canUndo,
  onSelectPreset,
  onModeChange,
  onApply,
  onUndo,
}: PresetToolbarProps) {
  if (!presets.length) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 mb-4">
        <div className={`text-sm font-semibold ${TEXT_CLASSES.body}`}>Presets</div>
        <div className={`text-xs mt-1 ${TEXT_CLASSES.muted}`}>
          No presets registered for `{schemaName}` yet.
        </div>
      </div>
    );
  }

  const selected = presets.find((p) => p.id === selectedPresetId) || presets[0];

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 mb-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className={`text-sm font-semibold ${TEXT_CLASSES.body}`}>Preset Kits</div>
          <div className={`text-xs mt-1 ${TEXT_CLASSES.muted}`}>
            Apply reusable templates for `{schemaName}`. Add new presets in `src/presets/`.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={`${BUTTON_CLASSES.primary} ${BUTTON_SIZES.xs}`}
            onClick={onApply}
          >
            Apply
          </button>
          <button
            type="button"
            className={`${BUTTON_CLASSES.secondary} ${BUTTON_SIZES.xs}`}
            onClick={onUndo}
            disabled={!canUndo}
          >
            Undo Preset
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-3">
        <div className="md:col-span-2">
          <label className={`block text-xs font-medium mb-1 ${TEXT_CLASSES.muted}`}>Preset</label>
          <select
            className="w-full border border-gray-300 rounded-md px-2 py-2 text-sm text-slate-900 bg-white"
            value={selected.id}
            onChange={(e) => onSelectPreset(e.target.value)}
          >
            {presets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={`block text-xs font-medium mb-1 ${TEXT_CLASSES.muted}`}>Apply Mode</label>
          <select
            className="w-full border border-gray-300 rounded-md px-2 py-2 text-sm text-slate-900 bg-white"
            value={applyMode}
            onChange={(e) => onModeChange(e.target.value as PresetApplyMode)}
          >
            <option value="fill_empty">Fill Empty</option>
            <option value="merge">Merge</option>
            <option value="overwrite">Overwrite</option>
          </select>
        </div>
      </div>

      {selected.description && (
        <div className={`text-xs mt-2 ${TEXT_CLASSES.muted}`}>{selected.description}</div>
      )}
      {selected.tags && selected.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {selected.tags.map((tag) => (
            <span key={tag} className="text-xs px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700">
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
