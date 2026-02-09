import type { CloneMutateOptions } from "../../creative/cloneMutate";
import { BUTTON_CLASSES, BUTTON_SIZES, TEXT_CLASSES } from "../../styles/uiTokens";

interface CloneMutatePanelProps {
  options: CloneMutateOptions;
  changedCount: number;
  canUndo: boolean;
  onChangeOptions: (next: CloneMutateOptions) => void;
  onApply: () => void;
  onUndo: () => void;
}

export default function CloneMutatePanel({
  options,
  changedCount,
  canUndo,
  onChangeOptions,
  onApply,
  onUndo,
}: CloneMutatePanelProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 mb-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className={`text-sm font-semibold ${TEXT_CLASSES.body}`}>Clone + Mutate</div>
          <div className={`text-xs mt-1 ${TEXT_CLASSES.muted}`}>
            Create a variant draft by cloning current data and mutating numeric values.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={`${BUTTON_CLASSES.primary} ${BUTTON_SIZES.xs}`}
            onClick={onApply}
          >
            Create Variant Draft
          </button>
          <button
            type="button"
            className={`${BUTTON_CLASSES.secondary} ${BUTTON_SIZES.xs}`}
            onClick={onUndo}
            disabled={!canUndo}
          >
            Undo Clone
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-2 mt-3">
        <div>
          <label className={`block text-xs font-medium mb-1 ${TEXT_CLASSES.muted}`}>Multiplier</label>
          <input
            type="number"
            step="0.05"
            value={options.numericMultiplier}
            onChange={(e) =>
              onChangeOptions({
                ...options,
                numericMultiplier: parseFloat(e.target.value || "1") || 1,
              })
            }
            className="w-full border border-gray-300 rounded-md px-2 py-2 text-sm text-slate-900 bg-white"
          />
        </div>
        <div>
          <label className={`block text-xs font-medium mb-1 ${TEXT_CLASSES.muted}`}>Offset</label>
          <input
            type="number"
            step="1"
            value={options.numericOffset}
            onChange={(e) =>
              onChangeOptions({
                ...options,
                numericOffset: parseFloat(e.target.value || "0") || 0,
              })
            }
            className="w-full border border-gray-300 rounded-md px-2 py-2 text-sm text-slate-900 bg-white"
          />
        </div>
        <div>
          <label className={`block text-xs font-medium mb-1 ${TEXT_CLASSES.muted}`}>Name Suffix</label>
          <input
            type="text"
            value={options.nameSuffix}
            onChange={(e) => onChangeOptions({ ...options, nameSuffix: e.target.value })}
            className="w-full border border-gray-300 rounded-md px-2 py-2 text-sm text-slate-900 bg-white"
          />
        </div>
        <div>
          <label className={`block text-xs font-medium mb-1 ${TEXT_CLASSES.muted}`}>Slug Suffix</label>
          <input
            type="text"
            value={options.slugSuffix}
            onChange={(e) => onChangeOptions({ ...options, slugSuffix: e.target.value })}
            className="w-full border border-gray-300 rounded-md px-2 py-2 text-sm text-slate-900 bg-white"
          />
        </div>
        <div className="flex items-end">
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={options.addVariantTag}
              onChange={(e) => onChangeOptions({ ...options, addVariantTag: e.target.checked })}
            />
            Add `variant` tag
          </label>
        </div>
      </div>

      <div className={`text-xs mt-2 ${TEXT_CLASSES.muted}`}>
        Estimated changed fields: {changedCount}
      </div>
    </div>
  );
}
