import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { buildMutatedClone, defaultCloneMutateOptions, estimateMutatedCloneChangeCount, type CloneMutateOptions } from "../../creative/cloneMutate";
import type { CreativeTone } from "../../creative";
import { applyPresetData } from "../../presets/apply";
import type { EntityPreset, PresetApplyMode } from "../../presets";
import { BUTTON_CLASSES, BUTTON_SIZES } from "../../styles/uiTokens";
import { asRecord, isRecord, type UnknownRecord } from "../../types/common";
import { localStudioProvider } from "../../studio/localProvider";
import type { StudioBrief, StudioBundle, StudioMode, StudioPatch, StudioProvider, StudioSuggestion } from "../../studio/types";
import type { EntryRelationshipSummary } from "../../relationships";
import useDebouncedValue from "../hooks/useDebouncedValue";
import PatchPreview from "./PatchPreview";
import BundlePreview from "./BundlePreview";

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
  relationshipSummary?: EntryRelationshipSummary | null;
  onCreateBundleDrafts?: (bundle: StudioBundle, selectedIds: Set<string>) => void;
  provider?: StudioProvider;
}

const toneOptions: CreativeTone[] = ["neutral", "heroic", "dark", "mystic", "playful"];
const modeTabs: Array<{
  id: StudioMode;
  label: string;
  plainName: string;
  summary: string;
  bestFor: string;
  startsFrom: string;
  produces: string;
  nextStep: string;
  example: string;
  safety: string;
}> = [
  {
    id: "recipes",
    label: "Recipes",
    plainName: "Pick a prepared template",
    summary: "Curated templates for common RPG content. Use these when you want a reliable starting point instead of inventing structure from scratch.",
    bestFor: "Fast starts from known RPG patterns: quests, vendors, shops, encounters, status combos, and fantasy adventure scaffolds.",
    startsFrom: "The current editor type, such as a quest, item, ability, or encounter.",
    produces: "A patch for the current entry, or a generated bundle recipe that can create several linked local drafts.",
    nextStep: "Preview the recipe, apply only the fields you want, then use Composer or Variants to personalize it.",
    example: "Start a quest with a Dungeon Contract recipe, then edit objectives and rewards.",
    safety: "Recipes open in preview first. Bundle recipes create drafts, not saved records.",
  },
  {
    id: "composer",
    label: "Composer",
    plainName: "Generate ideas from your brief",
    summary: "A guided idea generator. Fill the Studio Brief with theme, tone, level, and keywords, then ask for entry patches or connected draft bundles.",
    bestFor: "Turning a creative direction into names, descriptions, tags, rewards, encounters, shops, lore, or linked quest bundles.",
    startsFrom: "The Studio Brief. Better brief input gives more focused output.",
    produces: "Several generated suggestions. Entry patches edit the current record; bundles create connected local drafts.",
    nextStep: "Open a suggestion, review the preview, apply selected fields, then run Fix & Enrich to catch gaps.",
    example: "Theme: frost ruins, tone: mystic, level: 4. Generate a dungeon delve bundle.",
    safety: "Local output is deterministic. Optional AI output uses the same preview and schema filter.",
  },
  {
    id: "variants",
    label: "Variants",
    plainName: "Make alternate versions",
    summary: "Creates a changed version of the current entry. Use it after you already have a decent base entry.",
    bestFor: "Balance passes, rarity tiers, enemy strength tiers, economy shifts, early-game and late-game versions.",
    startsFrom: "The current entry’s existing values.",
    produces: "One overwrite-style preview showing what would change for the variant.",
    nextStep: "Apply the selected fields, then adjust details manually or save the result as a Library preset.",
    example: "Turn a standard encounter into an Elite or Boss version with stronger numbers and a suffix.",
    safety: "Variants use overwrite mode in preview, so inspect selected fields before applying.",
  },
  {
    id: "fix",
    label: "Fix & Enrich",
    plainName: "Clean up and finish",
    summary: "Checks the current entry for obvious authoring gaps and suggests small cleanup patches.",
    bestFor: "Missing required fields, broken references, weak metadata, sparse tags, and draft cleanup after generation.",
    startsFrom: "The current entry plus relationship/project-health information.",
    produces: "A low-risk patch, usually filling empty fields or adding a review tag.",
    nextStep: "Apply the safe fixes, then inspect any broken references manually in the Relationship panel.",
    example: "After generating a quest, fill a missing slug and mark entries with unresolved references as needs-review.",
    safety: "Fix patches prefer fill-empty behavior and tag risky entries as needs-review.",
  },
  {
    id: "library",
    label: "Library",
    plainName: "Reuse your own patterns",
    summary: "Your personal local shelf of saved presets and pasted JSON patches.",
    bestFor: "Reusing house patterns, recurring reward setups, common shop layouts, or hand-authored patches.",
    startsFrom: "The current entry, a saved preset, or a pasted JSON object.",
    produces: "A reusable local preset or a previewable patch.",
    nextStep: "Use saved presets as your own Recipes, then refine with Composer or Variants.",
    example: "Save a finished vendor setup and reuse it for future settlement shops.",
    safety: "Saved presets stay in this browser and still go through preview.",
  },
];

const applyModeDocs: Record<PresetApplyMode, string> = {
  fill_empty: "Only fills fields that are currently empty. Lowest-risk mode.",
  merge: "Merges object fields and replaces scalar fields included in the patch.",
  overwrite: "Uses the generated value for selected fields. Best for deliberate variants.",
};

const briefDocs: Record<string, string> = {
  theme: "Creative anchor used in names, descriptions, tags, and bundle concepts.",
  tone: "Language and flavor direction for generated copy.",
  difficulty: "Tuning intent for encounter strength, rewards, and variant presets.",
  rewardStyle: "How much generated quests, encounters, and shops lean into rewards.",
  count: "How many suggestions to request from the active provider.",
  keywords: "Comma-separated motifs added to tags and generator prompts.",
  playerLevel: "Target player level used for XP, enemy strength, prices, and reward scale.",
  locationId: "Optional existing location ID to link into generated drafts.",
  factionId: "Optional existing faction ID for requirements, reputation, or flavor.",
  contentPackId: "Optional content pack context for future filtering and generated metadata.",
  variantMultiplier: "Multiplies numeric fields. Use 1.25 for stronger, 0.75 for cheaper or weaker.",
  variantOffset: "Adds this amount after scaling numeric fields. Useful for level or late-game bumps.",
  variantName: "Text appended to name/title fields so the variant is easy to identify.",
  variantSlug: "Text appended to slug fields so the variant does not collide with the original.",
};

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
    schema: schemaName,
    source: "custom",
    defaultMode: "fill_empty",
    recommendedMode: "fill_empty",
    scope: "entry",
    outputKind: "patch",
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

function defaultBrief(): StudioBrief {
  return {
    theme: "",
    tone: "neutral",
    keywords: [],
    playerLevel: 1,
    stakes: "medium",
    rewardStyle: "modest",
    difficulty: "standard",
    intensity: 50,
  };
}

function getMissingFields(schema: UnknownRecord, data: UnknownRecord): string[] {
  const required = Array.isArray(schema.required) ? schema.required.filter((key): key is string => typeof key === "string") : [];
  return required.filter((key) => {
    const value = data[key];
    if (value === null || value === undefined) return true;
    if (typeof value === "string") return value.trim() === "";
    return false;
  });
}

function buildFixPatch(schemaName: string, schema: UnknownRecord, data: UnknownRecord, relationshipSummary?: EntryRelationshipSummary | null): StudioPatch {
  const missing = getMissingFields(schema, data);
  const patch: UnknownRecord = {};
  for (const field of missing) {
    if (field === "slug") patch.slug = typeof data.name === "string" ? data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") : `${schemaName}-draft`;
    else if (field === "title") patch.title = "New Draft";
    else if (field === "name") patch.name = "New Draft";
    else if (field === "description") patch.description = "Draft description.";
    else if (field === "id") continue;
    else patch[field] = "";
  }
  const outboundBroken = relationshipSummary?.outbound.flatMap((group) => group.items).filter((item) => item.broken) || [];
  if (Array.isArray(data.tags) && !data.tags.includes("needs-review") && (missing.length > 0 || outboundBroken.length > 0)) {
    patch.tags = [...data.tags.map(String), "needs-review"];
  }
  return {
    title: "Fix Missing Fields",
    summary: `${missing.length} missing required field${missing.length === 1 ? "" : "s"} and ${outboundBroken.length} broken outbound reference${outboundBroken.length === 1 ? "" : "s"} detected.`,
    patch,
    mode: "fill_empty",
    source: "local",
    risk: outboundBroken.length > 0 ? "needs_review" : "safe",
  };
}

export default function AuthoringStudio({
  schemaName,
  schema,
  data,
  presets,
  onChange,
  relationshipSummary,
  onCreateBundleDrafts,
  provider = localStudioProvider,
}: AuthoringStudioProps) {
  const [activeMode, setActiveMode] = useState<StudioMode>("recipes");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [brief, setBrief] = useState<StudioBrief>(() => defaultBrief());
  const [keywordsInput, setKeywordsInput] = useState("");
  const [count, setCount] = useState(3);
  const [ideaMode, setIdeaMode] = useState<PresetApplyMode>("fill_empty");
  const [suggestions, setSuggestions] = useState<StudioSuggestion[]>([]);
  const [cloneOptions, setCloneOptions] = useState<CloneMutateOptions>(defaultCloneMutateOptions);
  const [savedPresets, setSavedPresets] = useState<SavedPreset[]>(() => loadSavedPresets(schemaName));
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [bundlePreview, setBundlePreview] = useState<StudioBundle | null>(null);
  const [undoSnapshot, setUndoSnapshot] = useState<UnknownRecord | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showGuide, setShowGuide] = useState(true);
  const debouncedCloneOptions = useDebouncedValue(cloneOptions, 250);
  const debouncedData = useDebouncedValue(data, 250);

  useEffect(() => {
    setSavedPresets(loadSavedPresets(schemaName));
    setSelectedPresetId("");
    setSelectedCategory("All");
    setPreview(null);
    setBundlePreview(null);
    setUndoSnapshot(null);
  }, [schemaName]);

  useEffect(() => {
    setBrief((current) => ({ ...current, keywords: keywordsInput.split(",").map((item) => item.trim()).filter(Boolean) }));
  }, [keywordsInput]);

  useEffect(() => {
    if (selectedPresetId) return;
    if (presets.length > 0) setSelectedPresetId(presets[0].id);
  }, [presets, selectedPresetId]);

  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(timeout);
  }, [notice]);

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
    return Array.from(map.entries()).map(([category, groupPresets]) => ({ category, presets: groupPresets }));
  }, [presets, selectedCategory]);

  const selectedPreset = useMemo(
    () => presets.find((preset) => preset.id === selectedPresetId) || presets[0] || null,
    [presets, selectedPresetId]
  );

  const estimatedVariantChanges = useMemo(
    () => estimateMutatedCloneChangeCount(schema, debouncedData, debouncedCloneOptions),
    [debouncedCloneOptions, debouncedData, schema]
  );

  const openPatchPreview = useCallback((nextPreview: PreviewState) => {
    setPreview({ ...nextPreview, patch: filterPatchBySchema(nextPreview.patch, schema) });
    setBundlePreview(null);
  }, [schema]);

  const openStudioPatch = (patch: StudioPatch) => {
    openPatchPreview({
      title: patch.title,
      summary: patch.summary,
      patch: patch.patch,
      mode: patch.mode,
    });
  };

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

  const generateComposer = async (outputKind: "patch" | "bundle") => {
    setLoading(true);
    try {
      const input = { schemaName, schema, currentData: data, brief, count, relationshipSummary };
      const generated = outputKind === "bundle" ? await provider.generateBundles(input) : await provider.generatePatches(input);
      setSuggestions(generated);
      setNotice(`Generated ${generated.length} ${outputKind === "bundle" ? "bundle" : "patch"} suggestion${generated.length === 1 ? "" : "s"} with ${provider.label}.`);
    } finally {
      setLoading(false);
    }
  };

  const createVariantPreview = (preset?: Partial<CloneMutateOptions>) => {
    const options = { ...cloneOptions, ...preset };
    const result = buildMutatedClone(schema, data, options);
    openPatchPreview({
      title: "Variant Draft",
      summary: `${result.changedCount} field${result.changedCount === 1 ? "" : "s"} would change.`,
      patch: result.nextData,
      mode: "overwrite",
    });
  };

  const openFixPreview = () => {
    openStudioPatch(buildFixPatch(schemaName, schema, data, relationshipSummary));
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

  const tabs = modeTabs;
  const activeModeDoc = modeTabs.find((tab) => tab.id === activeMode) || modeTabs[0];

  return (
    <div className="mb-4 border-y border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-3 py-3 dark:border-slate-800">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Authoring Studio 2.0</div>
            <span className="rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">local</span>
            <span className="rounded bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">AI optional</span>
          </div>
          <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">
            A guided workspace for starting content, generating ideas, making variants, cleaning up drafts, and reusing your own patterns.
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <button type="button" className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`} onClick={() => setShowGuide((current) => !current)}>
            {showGuide ? "Hide Guide" : "Show Guide"}
          </button>
          <button type="button" className={`${BUTTON_CLASSES.secondary} ${BUTTON_SIZES.xs}`} onClick={undo} disabled={!undoSnapshot}>
            Undo Studio Apply
          </button>
        </div>
      </div>

      <StudioBriefPanel brief={brief} setBrief={setBrief} keywordsInput={keywordsInput} setKeywordsInput={setKeywordsInput} count={count} setCount={setCount} />

      <div className="flex flex-wrap gap-1 border-b border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
        {tabs.map((tab) => (
          <button key={tab.id} type="button" className={`rounded-md px-3 py-1 text-xs font-medium ${activeMode === tab.id ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"}`} onClick={() => setActiveMode(tab.id)}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="px-3 py-3">
        {showGuide && (
          <>
            <StudioStartGuide />
            <ModeGuide mode={activeModeDoc} />
          </>
        )}
        {notice && <div className="mb-3 rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">{notice}</div>}

        {activeMode === "recipes" && (
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {categories.map((category) => (
                <button key={category} type="button" className={`rounded-full px-2 py-1 text-xs ${selectedCategory === category ? "bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900" : "bg-white text-slate-700 border border-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"}`} onClick={() => setSelectedCategory(category)}>
                  {category}
                </button>
              ))}
              <button type="button" className={`${BUTTON_CLASSES.indigo} ${BUTTON_SIZES.xs}`} onClick={() => void generateComposer("bundle")}>
                Generate Bundle Recipes
              </button>
            </div>
            <div className="space-y-3">
              {groupedPresets.map((group) => (
                <div key={group.category}>
                  <div className="mb-1 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{group.category}</div>
                  <div className="grid gap-2 lg:grid-cols-2">
                    {group.presets.map((preset) => {
                      const selected = selectedPreset?.id === preset.id;
                      return (
                        <button key={preset.id} type="button" className={`border px-3 py-2 text-left ${selected ? "border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950" : "border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-800"}`} onClick={() => setSelectedPresetId(preset.id)}>
                          <div className="flex flex-wrap items-center gap-1">
                            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{preset.label}</span>
                            <Badge label={preset.outputKind || "patch"} />
                            <Badge label={preset.riskLevel || "low"} />
                            {preset.createsReferences && <Badge label="refs" />}
                          </div>
                          {preset.description && <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">{preset.description}</div>}
                          <div className="mt-2 flex flex-wrap gap-1">{(preset.tags || []).slice(0, 4).map((tag) => <Badge key={tag} label={tag} muted />)}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            {selectedPreset && (
              <div className="mt-3 flex justify-end">
                <button type="button" className={`${BUTTON_CLASSES.primary} ${BUTTON_SIZES.sm}`} onClick={() => openPatchPreview({ title: selectedPreset.label, summary: selectedPreset.description, patch: selectedPreset.data, mode: getPresetMode(selectedPreset) })}>
                  Preview Selected Recipe
                </button>
              </div>
            )}
            <SuggestionGrid suggestions={suggestions} onPatch={openStudioPatch} onBundle={(bundle) => { setBundlePreview(bundle); setPreview(null); }} />
          </div>
        )}

        {activeMode === "composer" && (
          <div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={`${BUTTON_CLASSES.indigo} ${BUTTON_SIZES.sm}`} onClick={() => void generateComposer("patch")} disabled={loading}>
                {loading ? "Generating..." : "Generate Entry Patches"}
              </button>
              <button type="button" className={`${BUTTON_CLASSES.primary} ${BUTTON_SIZES.sm}`} onClick={() => void generateComposer("bundle")} disabled={loading}>
                Generate Bundles
              </button>
              <select className="border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-950" value={ideaMode} onChange={(e) => setIdeaMode(e.target.value as PresetApplyMode)}>
                <option value="fill_empty">Fill Empty</option>
                <option value="merge">Merge</option>
                <option value="overwrite">Overwrite</option>
              </select>
              <span className="self-center text-xs text-slate-500 dark:text-slate-400">{applyModeDocs[ideaMode]}</span>
            </div>
            <SuggestionGrid suggestions={suggestions.map((suggestion) => suggestion.patch ? { ...suggestion, patch: { ...suggestion.patch, mode: ideaMode } } : suggestion)} onPatch={openStudioPatch} onBundle={(bundle) => { setBundlePreview(bundle); setPreview(null); }} />
          </div>
        )}

        {activeMode === "variants" && (
          <div>
            <div className="mb-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
              Variants are for changing an entry you already like. The multiplier scales numeric fields, the offset adds a flat amount, and suffixes keep the new name/slug distinct.
            </div>
            <div className="mb-3 grid grid-cols-1 gap-2 lg:grid-cols-5">
              <BriefField label="Number scale" helpKey="variantMultiplier"><input className="w-full border border-slate-300 px-2 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" type="number" step="0.05" value={cloneOptions.numericMultiplier} onChange={(e) => setCloneOptions({ ...cloneOptions, numericMultiplier: parseFloat(e.target.value || "1") || 1 })} /></BriefField>
              <BriefField label="Number add" helpKey="variantOffset"><input className="w-full border border-slate-300 px-2 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" type="number" step="1" value={cloneOptions.numericOffset} onChange={(e) => setCloneOptions({ ...cloneOptions, numericOffset: parseFloat(e.target.value || "0") || 0 })} /></BriefField>
              <BriefField label="Name suffix" helpKey="variantName"><input className="w-full border border-slate-300 px-2 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" value={cloneOptions.nameSuffix} onChange={(e) => setCloneOptions({ ...cloneOptions, nameSuffix: e.target.value })} placeholder="Elite" /></BriefField>
              <BriefField label="Slug suffix" helpKey="variantSlug"><input className="w-full border border-slate-300 px-2 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" value={cloneOptions.slugSuffix} onChange={(e) => setCloneOptions({ ...cloneOptions, slugSuffix: e.target.value })} placeholder="elite" /></BriefField>
              <label className="flex items-center gap-2 pt-5 text-sm text-slate-700 dark:text-slate-300"><input type="checkbox" checked={cloneOptions.addVariantTag} onChange={(e) => setCloneOptions({ ...cloneOptions, addVariantTag: e.target.checked })} /> Add `variant` tag</label>
            </div>
            <div className="mb-3 flex flex-wrap gap-2">
              {[
                ["Conservative", { numericMultiplier: 0.9, numericOffset: 0, nameSuffix: "Conservative", slugSuffix: "conservative" }],
                ["Elite", { numericMultiplier: 1.25, numericOffset: 2, nameSuffix: "Elite", slugSuffix: "elite" }],
                ["Boss", { numericMultiplier: 1.6, numericOffset: 5, nameSuffix: "Boss", slugSuffix: "boss" }],
                ["Vendor Cheap", { numericMultiplier: 0.75, numericOffset: 0, nameSuffix: "Discount", slugSuffix: "discount" }],
                ["Late Game", { numericMultiplier: 1.4, numericOffset: 10, nameSuffix: "Late Game", slugSuffix: "late-game" }],
              ].map(([label, options]) => <button key={String(label)} type="button" className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`} onClick={() => createVariantPreview(options as Partial<CloneMutateOptions>)}>{String(label)}</button>)}
            </div>
            <div className="flex items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
              <span>Estimated changed fields: {estimatedVariantChanges}</span>
              <button type="button" className={`${BUTTON_CLASSES.primary} ${BUTTON_SIZES.sm}`} onClick={() => createVariantPreview()}>Preview Custom Variant</button>
            </div>
          </div>
        )}

        {activeMode === "fix" && (
          <div className="space-y-3">
            <div className="grid gap-2 md:grid-cols-3">
              <InfoTile label="Missing required" value={getMissingFields(schema, data).length} />
              <InfoTile label="Broken outbound" value={relationshipSummary?.outbound.flatMap((group) => group.items).filter((item) => item.broken).length || 0} />
              <InfoTile label="Related entries" value={relationshipSummary?.related.reduce((sum, group) => sum + group.count, 0) || 0} />
            </div>
            <button type="button" className={`${BUTTON_CLASSES.primary} ${BUTTON_SIZES.sm}`} onClick={openFixPreview}>Preview Fix Patch</button>
          </div>
        )}

        {activeMode === "library" && (
          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm text-slate-600 dark:text-slate-400">Local presets are stored in this browser for `{schemaName}`.</div>
              <button type="button" className={`${BUTTON_CLASSES.primary} ${BUTTON_SIZES.sm}`} onClick={saveCurrentPreset}>Save Current as Preset</button>
            </div>
            {savedPresets.length === 0 ? <div className="text-sm text-slate-600 dark:text-slate-400">No saved presets yet.</div> : (
              <div className="space-y-2">
                {savedPresets.map((preset) => (
                  <div key={preset.id} className="flex items-center justify-between gap-2 border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
                    <div className="min-w-0"><div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{preset.label}</div><div className="text-xs text-slate-500 dark:text-slate-400">{new Date(preset.updatedAt).toLocaleString()}</div></div>
                    <button type="button" className={`${BUTTON_CLASSES.primary} ${BUTTON_SIZES.xs}`} onClick={() => openPatchPreview({ title: preset.label, summary: preset.description, patch: preset.data, mode: getPresetMode(preset) })}>Preview</button>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-800">
              <button type="button" className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.sm}`} onClick={() => {
                const raw = window.prompt("Paste JSON patch:");
                if (!raw) return;
                try {
                  const parsed = JSON.parse(raw) as unknown;
                  if (!isRecord(parsed)) { setNotice("JSON patch must be an object."); return; }
                  openPatchPreview({ title: "JSON Patch", summary: "Pasted JSON patch", patch: parsed, mode: "merge" });
                } catch { setNotice("Invalid JSON patch."); }
              }}>Preview JSON Patch</button>
            </div>
          </div>
        )}

        {preview && <PatchPreview currentData={data} patch={preview.patch} mode={preview.mode} title={preview.title} summary={preview.summary} schema={schema} onApply={applyPreview} onClose={() => setPreview(null)} />}
        {bundlePreview && <BundlePreview bundle={bundlePreview} onClose={() => setBundlePreview(null)} onApplyDrafts={(bundle, selectedIds) => { onCreateBundleDrafts?.(bundle, selectedIds); setBundlePreview(null); setNotice("Created local bundle drafts."); }} />}
      </div>
    </div>
  );
}

function Badge({ label, muted = false }: { label: string; muted?: boolean }) {
  return <span className={`rounded px-1.5 py-0.5 text-[11px] ${muted ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" : "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200"}`}>{label}</span>;
}

function InfoTile({ label, value }: { label: string; value: number }) {
  return <div className="rounded-md border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950"><div className="text-xs font-medium uppercase text-slate-500 dark:text-slate-400">{label}</div><div className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{value}</div></div>;
}

function StudioStartGuide() {
  const steps = [
    { label: "1. Start", mode: "Recipes", text: "Use a prepared template when you need structure quickly." },
    { label: "2. Shape", mode: "Composer", text: "Use the brief to generate names, text, rewards, or linked drafts." },
    { label: "3. Tune", mode: "Variants", text: "Make stronger, cheaper, rarer, or late-game versions of the current entry." },
    { label: "4. Check", mode: "Fix & Enrich", text: "Clean up missing fields and obvious relationship problems." },
    { label: "5. Reuse", mode: "Library", text: "Save patterns you like so they become your own templates." },
  ];
  return (
    <div className="mb-3 rounded-md border border-slate-200 bg-white px-3 py-3 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">New to the Studio? Use it as a workflow.</div>
          <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">
            You do not need every mode every time. Most content starts with Recipes or Composer, then gets tuned with Variants and checked with Fix & Enrich.
          </div>
        </div>
        <div className="rounded bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">preview before apply</div>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-5">
        {steps.map((step) => (
          <div key={step.label} className="rounded-md border border-slate-200 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-900">
            <div className="text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">{step.label}</div>
            <div className="mt-1 text-xs font-semibold text-slate-900 dark:text-slate-100">{step.mode}</div>
            <div className="mt-1 text-[11px] leading-snug text-slate-600 dark:text-slate-400">{step.text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ModeGuide({ mode }: { mode: typeof modeTabs[number] }) {
  return (
    <div className="mb-3 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 dark:border-blue-900 dark:bg-blue-950/60">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase text-blue-900 dark:text-blue-200">{mode.label}</div>
          <div className="mt-1 text-base font-semibold text-blue-950 dark:text-blue-100">{mode.plainName}</div>
          <div className="mt-1 text-sm text-blue-950 dark:text-blue-100">{mode.summary}</div>
        </div>
        <div className="flex flex-wrap gap-1">
          <Badge label="preview first" />
          <Badge label={mode.id === "recipes" || mode.id === "composer" ? "patches + bundles" : "patches"} />
        </div>
      </div>
      <div className="mt-3 grid gap-2 text-xs text-blue-900 dark:text-blue-200 md:grid-cols-2 lg:grid-cols-3">
        <GuideFact label="Use when" value={mode.bestFor} />
        <GuideFact label="Starts from" value={mode.startsFrom} />
        <GuideFact label="Produces" value={mode.produces} />
        <GuideFact label="Next step" value={mode.nextStep} />
        <GuideFact label="Example" value={mode.example} />
        <GuideFact label="Safety" value={mode.safety} />
      </div>
    </div>
  );
}

function GuideFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-blue-100 bg-white/60 px-2 py-2 dark:border-blue-900 dark:bg-blue-950/40">
      <div className="text-[11px] font-semibold uppercase text-blue-700 dark:text-blue-300">{label}</div>
      <div className="mt-1 leading-snug">{value}</div>
    </div>
  );
}

function SuggestionGrid({ suggestions, onPatch, onBundle }: { suggestions: StudioSuggestion[]; onPatch: (patch: StudioPatch) => void; onBundle: (bundle: StudioBundle) => void }) {
  if (suggestions.length === 0) {
    return (
      <div className="mt-3 rounded-md border border-dashed border-slate-300 bg-white px-3 py-4 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400">
        No generated suggestions yet. Fill the Studio Brief, then generate entry patches or bundles.
      </div>
    );
  }
  return (
    <div className="mt-3 grid gap-2 lg:grid-cols-2">
      {suggestions.map((suggestion) => (
        <button key={suggestion.id} type="button" className="border border-slate-200 bg-white px-3 py-2 text-left hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-800" onClick={() => suggestion.bundle ? onBundle(suggestion.bundle) : suggestion.patch ? onPatch(suggestion.patch) : undefined}>
          <div className="flex flex-wrap items-center gap-1"><span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{suggestion.title}</span><Badge label={suggestion.source} /><Badge label={suggestion.outputKind} /><Badge label={suggestion.risk} /></div>
          {suggestion.summary && <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">{suggestion.summary}</div>}
          <div className="mt-2 flex flex-wrap gap-1">{(suggestion.tags || []).slice(0, 5).map((tag) => <Badge key={tag} label={tag} muted />)}</div>
        </button>
      ))}
    </div>
  );
}

function StudioBriefPanel({ brief, setBrief, keywordsInput, setKeywordsInput, count, setCount }: {
  brief: StudioBrief;
  setBrief: (brief: StudioBrief) => void;
  keywordsInput: string;
  setKeywordsInput: (value: string) => void;
  count: number;
  setCount: (value: number) => void;
}) {
  return (
    <div className="border-b border-slate-200 bg-white px-3 py-3 dark:border-slate-800 dark:bg-slate-950">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Studio Brief</div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            The brief is shared by Composer and bundle generation. Think of it as the creative prompt for offline presets: theme says what it is about, tone says how it should feel, level/rewards shape numbers.
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-6">
        <BriefField className="lg:col-span-2" label="Theme" helpKey="theme"><input title={briefDocs.theme} className="w-full border border-slate-300 px-2 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" value={brief.theme} onChange={(e) => setBrief({ ...brief, theme: e.target.value })} placeholder="frost ruins, royal court" /></BriefField>
        <BriefField label="Tone" helpKey="tone"><select title={briefDocs.tone} className="w-full border border-slate-300 px-2 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" value={brief.tone} onChange={(e) => setBrief({ ...brief, tone: e.target.value as CreativeTone })}>{toneOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></BriefField>
        <BriefField label="Difficulty" helpKey="difficulty"><select title={briefDocs.difficulty} className="w-full border border-slate-300 px-2 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" value={brief.difficulty} onChange={(e) => setBrief({ ...brief, difficulty: e.target.value as StudioBrief["difficulty"] })}><option value="early">early-game</option><option value="standard">standard</option><option value="elite">elite</option><option value="boss">boss</option></select></BriefField>
        <BriefField label="Rewards" helpKey="rewardStyle"><select title={briefDocs.rewardStyle} className="w-full border border-slate-300 px-2 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" value={brief.rewardStyle} onChange={(e) => setBrief({ ...brief, rewardStyle: e.target.value as StudioBrief["rewardStyle"] })}><option value="none">no rewards</option><option value="modest">modest</option><option value="generous">generous</option><option value="rare">rare</option></select></BriefField>
        <BriefField label="Count" helpKey="count"><select title={briefDocs.count} className="w-full border border-slate-300 px-2 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" value={count} onChange={(e) => setCount(parseInt(e.target.value, 10))}><option value={2}>2 ideas</option><option value={3}>3 ideas</option><option value={5}>5 ideas</option></select></BriefField>
        <BriefField className="lg:col-span-2" label="Keywords" helpKey="keywords"><input title={briefDocs.keywords} className="w-full border border-slate-300 px-2 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" value={keywordsInput} onChange={(e) => setKeywordsInput(e.target.value)} placeholder="ice, ritual, betrayal" /></BriefField>
        <BriefField label="Level" helpKey="playerLevel"><input title={briefDocs.playerLevel} className="w-full border border-slate-300 px-2 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" type="number" min={1} value={brief.playerLevel} onChange={(e) => setBrief({ ...brief, playerLevel: parseInt(e.target.value, 10) || 1 })} /></BriefField>
        <BriefField label="Location" helpKey="locationId"><input title={briefDocs.locationId} className="w-full border border-slate-300 px-2 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" value={brief.locationId || ""} onChange={(e) => setBrief({ ...brief, locationId: e.target.value })} placeholder="Location ID" /></BriefField>
        <BriefField label="Faction" helpKey="factionId"><input title={briefDocs.factionId} className="w-full border border-slate-300 px-2 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" value={brief.factionId || ""} onChange={(e) => setBrief({ ...brief, factionId: e.target.value })} placeholder="Faction ID" /></BriefField>
        <BriefField label="Pack" helpKey="contentPackId"><input title={briefDocs.contentPackId} className="w-full border border-slate-300 px-2 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" value={brief.contentPackId || ""} onChange={(e) => setBrief({ ...brief, contentPackId: e.target.value })} placeholder="Content Pack" /></BriefField>
      </div>
    </div>
  );
}

function BriefField({ label, helpKey, className = "", children }: { label: string; helpKey: string; className?: string; children: ReactNode }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 flex items-center justify-between gap-2 text-[11px] font-medium uppercase text-slate-500 dark:text-slate-400">
        <span>{label}</span>
        <span className="normal-case text-slate-400 dark:text-slate-500" title={briefDocs[helpKey]}>?</span>
      </span>
      {children}
      <span className="mt-1 block text-[11px] leading-snug text-slate-500 dark:text-slate-500">{briefDocs[helpKey]}</span>
    </label>
  );
}
