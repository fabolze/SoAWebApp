import { useMemo, useState } from "react";
import { generateCreativeSuggestions, type CreativeSuggestion, type CreativeTone } from "../../creative";
import type { PresetApplyMode } from "../../presets";
import { BUTTON_CLASSES, BUTTON_SIZES, TEXT_CLASSES } from "../../styles/uiTokens";

interface CreativePromptPanelProps {
  schemaName: string;
  schema: any;
  data: Record<string, any>;
  canUndo: boolean;
  onUndo: () => void;
  onApplyPatch: (patch: Record<string, any>, mode: PresetApplyMode) => void;
}

const toneOptions: CreativeTone[] = ["neutral", "heroic", "dark", "mystic", "playful"];

function pickTextField(patch: Record<string, any>): [string, any] | null {
  const candidates = ["description", "text", "summary"];
  for (const key of candidates) {
    if (patch[key] !== undefined) return [key, patch[key]];
  }
  return null;
}

export default function CreativePromptPanel({
  schemaName,
  schema,
  data,
  canUndo,
  onUndo,
  onApplyPatch,
}: CreativePromptPanelProps) {
  const [theme, setTheme] = useState("");
  const [tone, setTone] = useState<CreativeTone>("neutral");
  const [keywordsInput, setKeywordsInput] = useState("");
  const [count, setCount] = useState(3);
  const [applyMode, setApplyMode] = useState<PresetApplyMode>("fill_empty");
  const [suggestions, setSuggestions] = useState<CreativeSuggestion[]>([]);

  const keywords = useMemo(
    () =>
      keywordsInput
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean),
    [keywordsInput]
  );

  const handleGenerate = () => {
    const generated = generateCreativeSuggestions({
      schemaName,
      schema,
      currentData: data || {},
      theme,
      tone,
      keywords,
      count,
    });
    setSuggestions(generated);
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 mb-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className={`text-sm font-semibold ${TEXT_CLASSES.body}`}>Creative Prompt Mode</div>
          <div className={`text-xs mt-1 ${TEXT_CLASSES.muted}`}>
            Local generator for ideas (names, descriptions, tags) without external LLM.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={`${BUTTON_CLASSES.indigo} ${BUTTON_SIZES.xs}`}
            onClick={handleGenerate}
          >
            Generate Ideas
          </button>
          <button
            type="button"
            className={`${BUTTON_CLASSES.secondary} ${BUTTON_SIZES.xs}`}
            onClick={onUndo}
            disabled={!canUndo}
          >
            Undo Creative
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-2 mt-3">
        <div className="md:col-span-2">
          <label className={`block text-xs font-medium mb-1 ${TEXT_CLASSES.muted}`}>Theme</label>
          <input
            type="text"
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            placeholder="e.g. Frost, Ruins, Royal Court"
            className="w-full border border-gray-300 rounded-md px-2 py-2 text-sm text-slate-900 bg-white"
          />
        </div>
        <div>
          <label className={`block text-xs font-medium mb-1 ${TEXT_CLASSES.muted}`}>Tone</label>
          <select
            value={tone}
            onChange={(e) => setTone(e.target.value as CreativeTone)}
            className="w-full border border-gray-300 rounded-md px-2 py-2 text-sm text-slate-900 bg-white"
          >
            {toneOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={`block text-xs font-medium mb-1 ${TEXT_CLASSES.muted}`}>Count</label>
          <select
            value={count}
            onChange={(e) => setCount(parseInt(e.target.value, 10))}
            className="w-full border border-gray-300 rounded-md px-2 py-2 text-sm text-slate-900 bg-white"
          >
            <option value={3}>3</option>
            <option value={5}>5</option>
          </select>
        </div>
        <div>
          <label className={`block text-xs font-medium mb-1 ${TEXT_CLASSES.muted}`}>Apply Mode</label>
          <select
            value={applyMode}
            onChange={(e) => setApplyMode(e.target.value as PresetApplyMode)}
            className="w-full border border-gray-300 rounded-md px-2 py-2 text-sm text-slate-900 bg-white"
          >
            <option value="fill_empty">Fill Empty</option>
            <option value="merge">Merge</option>
            <option value="overwrite">Overwrite</option>
          </select>
        </div>
      </div>

      <div className="mt-2">
        <label className={`block text-xs font-medium mb-1 ${TEXT_CLASSES.muted}`}>Keywords (comma-separated)</label>
        <input
          type="text"
          value={keywordsInput}
          onChange={(e) => setKeywordsInput(e.target.value)}
          placeholder="e.g. ice, control, ritual"
          className="w-full border border-gray-300 rounded-md px-2 py-2 text-sm text-slate-900 bg-white"
        />
      </div>

      {suggestions.length > 0 && (
        <div className="space-y-2 mt-3">
          {suggestions.map((suggestion) => {
            const textField = pickTextField(suggestion.patch);
            return (
              <div key={suggestion.id} className="rounded border border-slate-200 bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className={`text-sm font-semibold ${TEXT_CLASSES.body}`}>{suggestion.title}</div>
                    <div className={`text-xs mt-1 ${TEXT_CLASSES.muted}`}>{suggestion.summary}</div>
                  </div>
                  <button
                    type="button"
                    className={`${BUTTON_CLASSES.primary} ${BUTTON_SIZES.xs}`}
                    onClick={() => onApplyPatch(suggestion.patch, applyMode)}
                  >
                    Apply All
                  </button>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {Object.keys(suggestion.patch).slice(0, 6).map((key) => (
                    <span key={key} className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                      {key}
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {suggestion.patch.name !== undefined && (
                    <button
                      type="button"
                      className={`${BUTTON_CLASSES.secondary} ${BUTTON_SIZES.xs}`}
                      onClick={() => onApplyPatch({ name: suggestion.patch.name }, applyMode)}
                    >
                      Apply Name
                    </button>
                  )}
                  {textField && (
                    <button
                      type="button"
                      className={`${BUTTON_CLASSES.secondary} ${BUTTON_SIZES.xs}`}
                      onClick={() => onApplyPatch({ [textField[0]]: textField[1] }, applyMode)}
                    >
                      Apply Text
                    </button>
                  )}
                  {suggestion.patch.tags !== undefined && (
                    <button
                      type="button"
                      className={`${BUTTON_CLASSES.secondary} ${BUTTON_SIZES.xs}`}
                      onClick={() => onApplyPatch({ tags: suggestion.patch.tags }, applyMode)}
                    >
                      Apply Tags
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
