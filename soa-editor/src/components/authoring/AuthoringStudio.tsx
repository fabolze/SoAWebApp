import { useCallback, useEffect, useMemo, useState } from "react";
import { buildMutatedClone, defaultCloneMutateOptions, estimateMutatedCloneChangeCount, type CloneMutateOptions } from "../../creative/cloneMutate";
import { localGenerationProvider, type CreativeSuggestion, type CreativeTone, type GenerationProvider } from "../../creative";
import { applyPresetData } from "../../presets/apply";
import type { EntityPreset, PresetApplyMode } from "../../presets";
import { BUTTON_CLASSES, BUTTON_SIZES } from "../../styles/uiTokens";
import { asRecord, isRecord, type UnknownRecord } from "../../types/common";
import useDebouncedValue from "../hooks/useDebouncedValue";
import PatchPreview from "./PatchPreview";

type StudioTab = "kits" | "ideas" | "variants" | "saved";

interface SavedPreset extends EntityPreset {
  createdAt: number;
  updatedAt: number;
  source: "custom";
}

interface PreviewState {
  title: string;
  summary?: string;
  patch: UnknownRecord;
  mode: PresetApplyMode;
}

interface AuthoringStudioProps {
  schemaName: string;
  schema: UnknownRecord;
  data: UnknownRecord;
  presets: EntityPreset[];
  onChange: (updated: UnknownRecord) => void;
  provider?: GenerationProvider;
}

const toneOptions: CreativeTone[] = ["neutral", "heroic", "dark", "mystic", "playful"];

function storageKey(schemaName: string): string {
  return `soa.customPresets.${schemaName}`;
}

function getPresetCategory(preset: EntityPreset): string {
  return preset.category || preset.intent || preset.tags?.[0] || "General";
}

function getPresetMode(preset: EntityPreset): PresetApplyMode {
  return preset.recommendedMode || preset.defaultMode || "fill_empty";
}

function filterPatchBySchema(patch: UnknownRecord, schema: UnknownRecord): UnknownRecord {
  const properties = asRecord(schema.properties);
  if (Object.keys(properties).length === 0) return patch;
  return Object.fromEntries(
    Object.entries(patch).filter(([key]) => Object.prototype.hasOwnProperty.call(properties, key))
  );
}

function buildPresetFromCurrent(schemaName: string, data: UnknownRecord, label: string): SavedPreset {
  const now = Date.now();
  const patch = Object.fromEntries(
    Object.entries(data).filter(([key, value]) => {
      if (key === "id") return false;
      if (value === null || value === undefined) return false;
      if (typeof value === "string") return value.trim() !== "";
      if (Array.isArray(value)) return value.length > 0;
      if (isRecord(value)) return Object.keys(value).length > 0;
      return true;
    })
  );
  return {
    id: `custom-${schemaName}-${now}`,
    label,
    description: "Saved from the current editor state.",
    category: "Saved",
    intent: "Custom authoring shortcut",
    schema: schemaName,
    source: "custom",
    defaultMode: "fill_empty",
    recommendedMode: "fill_empty",
    createdAt: now,
    updatedAt: now,
    data: patch,
  };
}

function loadSavedPresets(schemaName: string): SavedPreset[] {
  try {
    const raw = localStorage.getItem(storageKey(schemaName));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is SavedPreset => {
      return isRecord(entry) && typeof entry.id === "string" && typeof entry.label === "string" && isRecord(entry.data);
    });
  } catch {
    return [];
  }
}

function savePresets(schemaName: string, presets: SavedPreset[]) {
  localStorage.setItem(storageKey(schemaName), JSON.stringify(presets));
}

export default function AuthoringStudio({
  schemaName,
  schema,
  data,
  presets,
  onChange,
  provider = localGenerationProvider,
}: AuthoringStudioProps) {
  const [activeTab, setActiveTab] = useState<StudioTab>("kits");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [theme, setTheme] = useState("");
  const [tone, setTone] = useState<CreativeTone>("neutral");
  const [keywordsInput, setKeywordsInput] = useState("");
  const [count, setCount] = useState(3);
  const [ideaMode, setIdeaMode] = useState<PresetApplyMode>("fill_empty");
  const [ideas, setIdeas] = useState<CreativeSuggestion[]>([]);
  const [cloneOptions, setCloneOptions] = useState<CloneMutateOptions>(defaultCloneMutateOptions);
  const [savedPresets, setSavedPresets] = useState<SavedPreset[]>(() => loadSavedPresets(schemaName));
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [undoSnapshot, setUndoSnapshot] = useState<UnknownRecord | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const debouncedCloneOptions = useDebouncedValue(cloneOptions, 250);
  const debouncedData = useDebouncedValue(data, 250);

  useEffect(() => {
    setSavedPresets(loadSavedPresets(schemaName));
    setSelectedPresetId("");
    setSelectedCategory("All");
    setPreview(null);
    setUndoSnapshot(null);
  }, [schemaName]);

  useEffect(() => {
    if (selectedPresetId) return;
    if (presets.length > 0) setSelectedPresetId(presets[0].id);
  }, [presets, selectedPresetId]);

  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(null), 3000);
    return () => clearTimeout(timeout);
  }, [notice]);

  const keywords = useMemo(
    () => keywordsInput.split(",").map((item) => item.trim()).filter(Boolean),
    [keywordsInput]
  );

  const categories = useMemo(() => {
    return ["All", ...Array.from(new Set(presets.map(getPresetCategory))).sort((a, b) => a.localeCompare(b))];
  }, [presets]);

  const groupedPresets = useMemo(() => {
    const visible = selectedCategory === "All"
      ? presets
      : presets.filter((preset) => getPresetCategory(preset) === selectedCategory);
    const map = new Map<string, EntityPreset[]>();
    for (const preset of visible) {
      const category = getPresetCategory(preset);
      const group = map.get(category) || [];
      group.push(preset);
      map.set(category, group);
    }
    return Array.from(map.entries()).map(([category, groupPresets]) => ({
      category,
      presets: groupPresets,
    }));
  }, [presets, selectedCategory]);

  const selectedPreset = useMemo(
    () => presets.find((preset) => preset.id === selectedPresetId) || presets[0] || null,
    [presets, selectedPresetId]
  );

  const estimatedVariantChanges = useMemo(
    () => estimateMutatedCloneChangeCount(schema, debouncedData, debouncedCloneOptions),
    [debouncedCloneOptions, debouncedData, schema]
  );

  const openPreview = useCallback((nextPreview: PreviewState) => {
    setPreview({
      ...nextPreview,
      patch: filterPatchBySchema(nextPreview.patch, schema),
    });
  }, [schema]);

  const applyPreview = useCallback((patch: UnknownRecord, mode: PresetApplyMode) => {
    setUndoSnapshot(data);
    onChange(applyPresetData(data, patch, mode));
    setPreview(null);
    setNotice("Applied patch. Undo is available in Authoring Studio.");
  }, [data, onChange]);

  const undo = useCallback(() => {
    if (!undoSnapshot) return;
    onChange(undoSnapshot);
    setUndoSnapshot(null);
    setNotice("Reverted last Authoring Studio apply.");
  }, [onChange, undoSnapshot]);

  const generateIdeas = () => {
    const generated = provider.generate({
      schemaName,
      schema,
      currentData: data,
      theme,
      tone,
      keywords,
      count,
    });
    setIdeas(generated);
    setNotice(`Generated ${generated.length} idea${generated.length === 1 ? "" : "s"} with ${provider.label}.`);
  };

  const createVariantPreview = () => {
    const result = buildMutatedClone(schema, data, cloneOptions);
    openPreview({
      title: "Variant Draft",
      summary: `${result.changedCount} field${result.changedCount === 1 ? "" : "s"} would change.`,
      patch: result.nextData,
      mode: "overwrite",
    });
  };

  const saveCurrentPreset = () => {
    const label = window.prompt("Preset name:");
    if (!label?.trim()) return;
    const nextPreset = buildPresetFromCurrent(schemaName, data, label.trim());
    const next = [nextPreset, ...savedPresets];
    setSavedPresets(next);
    savePresets(schemaName, next);
    setNotice("Saved local preset.");
  };

  const renameSavedPreset = (preset: SavedPreset) => {
    const label = window.prompt("Preset name:", preset.label);
    if (!label?.trim()) return;
    const next = savedPresets.map((item) =>
      item.id === preset.id ? { ...item, label: label.trim(), updatedAt: Date.now() } : item
    );
    setSavedPresets(next);
    savePresets(schemaName, next);
  };

  const deleteSavedPreset = (preset: SavedPreset) => {
    if (!window.confirm(`Delete local preset "${preset.label}"?`)) return;
    const next = savedPresets.filter((item) => item.id !== preset.id);
    setSavedPresets(next);
    savePresets(schemaName, next);
  };

  const tabs: Array<{ id: StudioTab; label: string }> = [
    { id: "kits", label: "Kits" },
    { id: "ideas", label: "Ideas" },
    { id: "variants", label: "Variants" },
    { id: "saved", label: "Saved" },
  ];

  return (
    <div className="mb-4 border-y border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-3 py-3 dark:border-slate-800">
        <div>
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Authoring Studio</div>
          <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">
            Kits, generated ideas, variants, and saved local presets with review before apply.
          </div>
        </div>
        <button type="button" className={`${BUTTON_CLASSES.secondary} ${BUTTON_SIZES.xs}`} onClick={undo} disabled={!undoSnapshot}>
          Undo Studio Apply
        </button>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`rounded-md px-3 py-1 text-xs font-medium ${activeTab === tab.id ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="px-3 py-3">
        {notice && <div className="mb-3 rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-700">{notice}</div>}

        {activeTab === "kits" && (
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {categories.map((category) => (
                <button
                  key={category}
                  type="button"
                  className={`rounded-full px-2 py-1 text-xs ${selectedCategory === category ? "bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900" : "bg-white text-slate-700 border border-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"}`}
                  onClick={() => setSelectedCategory(category)}
                >
                  {category}
                </button>
              ))}
            </div>
            {presets.length === 0 ? (
              <div className="text-sm text-slate-600 dark:text-slate-400">No curated kits registered for this schema yet. Use Ideas, Variants, or Saved presets.</div>
            ) : (
              <div className="space-y-3">
                {groupedPresets.map((group) => (
                  <div key={group.category}>
                    <div className="mb-1 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{group.category}</div>
                    <div className="grid gap-2 lg:grid-cols-2">
                      {group.presets.map((preset) => {
                        const selected = selectedPreset?.id === preset.id;
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            className={`border px-3 py-2 text-left ${selected ? "border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950" : "border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-800"}`}
                            onClick={() => setSelectedPresetId(preset.id)}
                          >
                            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{preset.label}</div>
                            {preset.description && <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">{preset.description}</div>}
                            <div className="mt-2 flex flex-wrap gap-1">
                              {(preset.tags || []).slice(0, 4).map((tag) => (
                                <span key={tag} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">{tag}</span>
                              ))}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {selectedPreset && (
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  className={`${BUTTON_CLASSES.primary} ${BUTTON_SIZES.sm}`}
                  onClick={() => openPreview({
                    title: selectedPreset.label,
                    summary: selectedPreset.description,
                    patch: selectedPreset.data,
                    mode: getPresetMode(selectedPreset),
                  })}
                >
                  Preview Selected Kit
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === "ideas" && (
          <div>
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-5">
              <input className="lg:col-span-2 border border-slate-300 px-2 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="Theme: Frost, ruins, royal court" />
              <select className="border border-slate-300 px-2 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" value={tone} onChange={(e) => setTone(e.target.value as CreativeTone)}>
                {toneOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
              <select className="border border-slate-300 px-2 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" value={count} onChange={(e) => setCount(parseInt(e.target.value, 10))}>
                <option value={3}>3 ideas</option>
                <option value={5}>5 ideas</option>
              </select>
              <select className="border border-slate-300 px-2 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" value={ideaMode} onChange={(e) => setIdeaMode(e.target.value as PresetApplyMode)}>
                <option value="fill_empty">Fill Empty</option>
                <option value="merge">Merge</option>
                <option value="overwrite">Overwrite</option>
              </select>
            </div>
            <div className="mt-2 flex gap-2">
              <input className="flex-1 border border-slate-300 px-2 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" value={keywordsInput} onChange={(e) => setKeywordsInput(e.target.value)} placeholder="Keywords: ice, control, ritual" />
              <button type="button" className={`${BUTTON_CLASSES.indigo} ${BUTTON_SIZES.sm}`} onClick={generateIdeas}>Generate</button>
            </div>
            {ideas.length > 0 && (
              <div className="mt-3 grid gap-2 lg:grid-cols-2">
                {ideas.map((idea) => (
                  <button
                    key={idea.id}
                    type="button"
                    className="border border-slate-200 bg-white px-3 py-2 text-left hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-800"
                    onClick={() => openPreview({ title: idea.title, summary: idea.summary, patch: idea.patch, mode: ideaMode })}
                  >
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{idea.title}</div>
                    <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">{idea.summary}</div>
                    <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-500">{idea.source || provider.label} · {Math.round((idea.confidence ?? 0.7) * 100)}% confidence</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "variants" && (
          <div>
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-5">
              <input className="border border-slate-300 px-2 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" type="number" step="0.05" value={cloneOptions.numericMultiplier} onChange={(e) => setCloneOptions({ ...cloneOptions, numericMultiplier: parseFloat(e.target.value || "1") || 1 })} />
              <input className="border border-slate-300 px-2 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" type="number" step="1" value={cloneOptions.numericOffset} onChange={(e) => setCloneOptions({ ...cloneOptions, numericOffset: parseFloat(e.target.value || "0") || 0 })} />
              <input className="border border-slate-300 px-2 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" value={cloneOptions.nameSuffix} onChange={(e) => setCloneOptions({ ...cloneOptions, nameSuffix: e.target.value })} placeholder="Name suffix" />
              <input className="border border-slate-300 px-2 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" value={cloneOptions.slugSuffix} onChange={(e) => setCloneOptions({ ...cloneOptions, slugSuffix: e.target.value })} placeholder="Slug suffix" />
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input type="checkbox" checked={cloneOptions.addVariantTag} onChange={(e) => setCloneOptions({ ...cloneOptions, addVariantTag: e.target.checked })} />
                Add variant tag
              </label>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
              <span>Estimated changed fields: {estimatedVariantChanges}</span>
              <button type="button" className={`${BUTTON_CLASSES.primary} ${BUTTON_SIZES.sm}`} onClick={createVariantPreview}>Preview Variant</button>
            </div>
          </div>
        )}

        {activeTab === "saved" && (
          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm text-slate-600 dark:text-slate-400">Local presets are stored in this browser for `{schemaName}`.</div>
              <button type="button" className={`${BUTTON_CLASSES.primary} ${BUTTON_SIZES.sm}`} onClick={saveCurrentPreset}>Save Current as Preset</button>
            </div>
            {savedPresets.length === 0 ? (
              <div className="text-sm text-slate-600 dark:text-slate-400">No saved presets yet.</div>
            ) : (
              <div className="space-y-2">
                {savedPresets.map((preset) => (
                  <div key={preset.id} className="flex items-center justify-between gap-2 border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{preset.label}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{new Date(preset.updatedAt).toLocaleString()}</div>
                    </div>
                    <div className="flex gap-1">
                      <button type="button" className={`${BUTTON_CLASSES.primary} ${BUTTON_SIZES.xs}`} onClick={() => openPreview({ title: preset.label, summary: preset.description, patch: preset.data, mode: getPresetMode(preset) })}>Preview</button>
                      <button type="button" className={`${BUTTON_CLASSES.secondary} ${BUTTON_SIZES.xs}`} onClick={() => renameSavedPreset(preset)}>Rename</button>
                      <button type="button" className={`${BUTTON_CLASSES.danger} ${BUTTON_SIZES.xs}`} onClick={() => deleteSavedPreset(preset)}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-800">
              <button
                type="button"
                className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.sm}`}
                onClick={() => {
                  const raw = window.prompt("Paste JSON patch:");
                  if (!raw) return;
                  try {
                    const parsed = JSON.parse(raw) as unknown;
                    if (!isRecord(parsed)) {
                      setNotice("JSON patch must be an object.");
                      return;
                    }
                    openPreview({ title: "JSON Patch", summary: "Pasted JSON patch", patch: parsed, mode: "merge" });
                  } catch {
                    setNotice("Invalid JSON patch.");
                  }
                }}
              >
                Preview JSON Patch
              </button>
            </div>
          </div>
        )}

        {preview && (
          <PatchPreview
            currentData={data}
            patch={preview.patch}
            mode={preview.mode}
            title={preview.title}
            summary={preview.summary}
            schema={schema}
            onApply={applyPreview}
            onClose={() => setPreview(null)}
          />
        )}
      </div>
    </div>
  );
}
