import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { buildMutatedClone, defaultCloneMutateOptions, estimateMutatedCloneChangeCount, type CloneMutateOptions } from "../../creative/cloneMutate";
import { applyPresetData } from "../../presets/apply";
import type { EntityPreset, PresetApplyMode } from "../../presets";
import { BUTTON_CLASSES, BUTTON_SIZES } from "../../styles/uiTokens";
import { asRecord, isRecord, type UnknownRecord } from "../../types/common";
import type { StudioBundle, StudioMode, StudioPatch, StudioProvider } from "../../studio/types";
import type { EntryRelationshipSummary } from "../../relationships";
import useDebouncedValue from "../hooks/useDebouncedValue";
import PatchPreview from "./PatchPreview";

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
  onChange: (updated: UnknownRecord) => void;
  relationshipSummary?: EntryRelationshipSummary | null;
  onCreateBundleDrafts?: (bundle: StudioBundle, selectedIds: Set<string>) => void;
  provider?: StudioProvider;
}

type VisibleStudioMode = Extract<StudioMode, "variants" | "fix" | "library">;

const modeTabs: Array<{
  id: VisibleStudioMode;
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
    id: "variants",
    label: "Variants",
    plainName: "Make alternate versions",
    summary: "Creates a changed version of the current entry. Use it after you already have a decent base entry.",
    bestFor: "Balance passes, rarity tiers, enemy strength tiers, economy shifts, early-game and late-game versions.",
    startsFrom: "The current entry's existing values.",
    produces: "One overwrite-style preview showing what would change for the variant.",
    nextStep: "Apply the selected fields, then adjust details manually or save the result as a Library preset.",
    example: "Turn a standard encounter into an Elite or Boss version with stronger numbers and a suffix.",
    safety: "Variants use overwrite mode in preview, so inspect selected fields before applying.",
  },
  {
    id: "fix",
    label: "Cleanup",
    plainName: "Clean up and finish",
    summary: "Checks the current entry for obvious authoring gaps and suggests small cleanup patches.",
    bestFor: "Missing required fields, broken references, weak metadata, sparse tags, and draft cleanup.",
    startsFrom: "The current entry plus relationship/project-health information.",
    produces: "A low-risk patch, usually filling empty fields or adding a review tag.",
    nextStep: "Apply the safe fixes, then inspect any broken references manually in the Relationship panel.",
    example: "Fill a missing slug and mark entries with unresolved references as needs-review.",
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
    nextStep: "Use saved presets as your own repeatable patch library, then tune with Variants.",
    example: "Save a finished vendor setup and reuse it for future settlement shops.",
    safety: "Saved presets stay in this browser and still go through preview.",
  },
];

const briefDocs: Record<string, string> = {
  variantMultiplier: "Multiplies numeric fields. Use 1.25 for stronger, 0.75 for cheaper or weaker.",
  variantOffset: "Adds this amount after scaling numeric fields. Useful for level or late-game bumps.",
  variantName: "Text appended to name/title fields so the variant is easy to identify.",
  variantSlug: "Text appended to slug fields so the variant does not collide with the original.",
};

function storageKey(schemaName: string): string {
  return `soa.customPresets.${schemaName}`;
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
  onChange,
  relationshipSummary,
}: AuthoringStudioProps) {
  const [activeMode, setActiveMode] = useState<VisibleStudioMode>("variants");
  const [cloneOptions, setCloneOptions] = useState<CloneMutateOptions>(defaultCloneMutateOptions);
  const [savedPresets, setSavedPresets] = useState<SavedPreset[]>(() => loadSavedPresets(schemaName));
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [undoSnapshot, setUndoSnapshot] = useState<UnknownRecord | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(true);
  const debouncedCloneOptions = useDebouncedValue(cloneOptions, 250);
  const debouncedData = useDebouncedValue(data, 250);

  useEffect(() => {
    setSavedPresets(loadSavedPresets(schemaName));
    setPreview(null);
    setUndoSnapshot(null);
  }, [schemaName]);

  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(timeout);
  }, [notice]);

  const estimatedVariantChanges = useMemo(
    () => estimateMutatedCloneChangeCount(schema, debouncedData, debouncedCloneOptions),
    [debouncedCloneOptions, debouncedData, schema]
  );

  const openPatchPreview = useCallback((nextPreview: PreviewState) => {
    setPreview({ ...nextPreview, patch: filterPatchBySchema(nextPreview.patch, schema) });
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
    setNotice("Applied patch. Undo is available in Draft Tools.");
  }, [data, onChange]);

  const undo = useCallback(() => {
    if (!undoSnapshot) return;
    onChange(undoSnapshot);
    setUndoSnapshot(null);
    setNotice("Reverted last tool apply.");
  }, [onChange, undoSnapshot]);

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
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Draft Tools</div>
            <span className="rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">local</span>
          </div>
          <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">
            Practical local helpers for variants, cleanup patches, and reusable entry patterns.
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <button type="button" className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`} onClick={() => setShowGuide((current) => !current)}>
            {showGuide ? "Hide Guide" : "Show Guide"}
          </button>
          <button type="button" className={`${BUTTON_CLASSES.secondary} ${BUTTON_SIZES.xs}`} onClick={undo} disabled={!undoSnapshot}>
            Undo Tool Apply
          </button>
        </div>
      </div>

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
              <div className="text-sm text-slate-600 dark:text-slate-400">Saved patches are stored in this browser for `{schemaName}`.</div>
              <button type="button" className={`${BUTTON_CLASSES.primary} ${BUTTON_SIZES.sm}`} onClick={saveCurrentPreset}>Save Current as Patch</button>
            </div>
            {savedPresets.length === 0 ? <div className="text-sm text-slate-600 dark:text-slate-400">No saved patches yet.</div> : (
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
    { label: "1. Tune", mode: "Variants", text: "Make stronger, cheaper, rarer, or late-game versions of the current entry." },
    { label: "2. Check", mode: "Cleanup", text: "Clean up missing fields and obvious relationship problems." },
    { label: "3. Reuse", mode: "Library", text: "Save patterns you like so they become repeatable patches." },
  ];
  return (
    <div className="mb-3 rounded-md border border-slate-200 bg-white px-3 py-3 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Use the tools as a short workflow.</div>
          <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">
            Most entries only need one of these. Make a variant, run cleanup, or save the current shape for reuse.
          </div>
        </div>
        <div className="rounded bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">preview before apply</div>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-3">
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
          <Badge label="patches" />
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
