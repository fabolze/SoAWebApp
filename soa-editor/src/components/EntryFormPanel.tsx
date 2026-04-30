import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SchemaForm from "./SchemaForm";
import { ParentSummary } from "./EditorStackContext";
import { BUTTON_CLASSES, BUTTON_SIZES } from "../styles/uiTokens";
import { getPresetsForSchema } from "../presets";
import CommandPalette, { type CommandPaletteItem } from "./command/CommandPalette";
import ContextSimulationPanel from "./simulation/ContextSimulationPanel";
import AuthoringStudio from "./authoring/AuthoringStudio";
import type { EntryRecord, ReferenceHit, ReferenceSummary } from "../types/editorQol";
import type { SchemaFieldConfig } from "./schemaForm/types";

type EditorViewMode = "simple" | "generate" | "advanced";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getDisplayText(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (isRecord(value)) return Object.keys(value).length === 0;
  return false;
}

function getSchemaProperties(schema: Record<string, unknown>): Record<string, Record<string, unknown>> {
  const properties = schema.properties;
  if (!isRecord(properties)) return {};
  return Object.fromEntries(
    Object.entries(properties).filter((entry): entry is [string, Record<string, unknown>] => isRecord(entry[1]))
  );
}

function getRequiredFields(schema: Record<string, unknown>): string[] {
  return Array.isArray(schema.required) ? schema.required.filter((field): field is string => typeof field === "string") : [];
}

function collectReferenceFieldCount(properties: Record<string, Record<string, unknown>>): number {
  return Object.values(properties).filter((config) => {
    const ui = config.ui;
    return isRecord(ui) && (typeof ui.reference === "string" || typeof ui.options_source === "string");
  }).length;
}

function editorViewStorageKey(schemaName: string): string {
  return `soa.editorView.${schemaName}`;
}

function readStoredEditorView(schemaName: string): EditorViewMode | null {
  try {
    const stored = localStorage.getItem(editorViewStorageKey(schemaName));
    return stored === "simple" || stored === "generate" || stored === "advanced" ? stored : null;
  } catch {
    return null;
  }
}

function writeStoredEditorView(schemaName: string, view: EditorViewMode) {
  try {
    localStorage.setItem(editorViewStorageKey(schemaName), view);
  } catch {
    // Ignore storage failures; view switching should still work.
  }
}

function hasMeaningfulDraftData(data: EntryRecord): boolean {
  return Object.entries(data || {}).some(([key, value]) => key !== "id" && !isEmptyValue(value));
}

function getDefaultEditorView(schemaName: string, isNew: boolean, data: EntryRecord): EditorViewMode {
  const stored = readStoredEditorView(schemaName);
  if (stored) return stored;
  return isNew && !hasMeaningfulDraftData(data) ? "generate" : "simple";
}

function getFieldSection(key: string, config: Record<string, unknown>): string {
  const ui = isRecord(config.ui) ? config.ui : {};
  const explicit = ui.section;
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim().toLowerCase();
  const normalized = key.toLowerCase();
  if (["id", "slug", "name", "title", "description", "summary"].includes(normalized)) return "identity";
  if (normalized.includes("requirement") || normalized.includes("flag") || normalized.includes("condition")) return "gating";
  if (normalized.includes("reward") || normalized.includes("currency") || normalized.includes("price") || normalized.includes("cost") || normalized.includes("loot") || normalized.includes("xp")) return "economy";
  if (normalized.includes("effect") || normalized.includes("status") || normalized.includes("modifier") || normalized.includes("scaling") || normalized.includes("stat") || normalized.includes("attribute") || normalized.includes("damage") || normalized.includes("cooldown") || normalized.includes("target")) return "mechanics";
  if (normalized.includes("location") || normalized.includes("biome") || normalized.includes("faction") || normalized.includes("character") || normalized.includes("encounter") || normalized.includes("event") || normalized.includes("quest") || normalized.includes("dialogue")) return "world links";
  if (normalized.includes("tag") || normalized.includes("icon") || normalized.includes("notes") || normalized.includes("content_pack")) return "metadata";
  if (config.type === "array" || config.type === "object") return "details";
  return "core";
}

function isSimpleField(key: string, config: SchemaFieldConfig, requiredFields: string[], changedFieldKeys: string[], data: EntryRecord): boolean {
  if (requiredFields.includes(key)) return true;
  if (changedFieldKeys.includes(key)) return true;
  if (requiredFields.includes(key) && isEmptyValue(data?.[key])) return true;

  const normalized = key.toLowerCase();
  if (["id", "slug", "name", "title", "description", "summary", "type", "category", "role", "rarity", "level", "tags"].includes(normalized)) {
    return true;
  }

  const section = getFieldSection(key, config);
  if (section === "identity" || section === "core") return true;

  const ui = config.ui || {};
  if (ui.list_display) return true;
  if (typeof ui.widget === "string" && ["textarea", "markdown", "tags"].includes(ui.widget)) return true;

  return false;
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
  const [utilityNotice, setUtilityNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [editorView, setEditorView] = useState<EditorViewMode>(() => getDefaultEditorView(schemaName, isNew, data || {}));
  const latestDataRef = useRef(data || {});
  const rawEntryId = data?.id;
  const currentEntryId = typeof rawEntryId === "string" ? rawEntryId : rawEntryId != null ? String(rawEntryId) : "";
  const hasExistingId = !isNew && currentEntryId.length > 0;
  const schemaTitle = typeof schema.title === "string" && schema.title.trim() ? schema.title.trim() : schemaName;
  const entryLabel = getDisplayText(data?.name) || getDisplayText(data?.title) || getDisplayText(data?.slug) || (isNew ? "New draft" : currentEntryId || "Untitled entry");
  const entrySubtitle = [
    getDisplayText(data?.type),
    getDisplayText(data?.rarity),
    getDisplayText(data?.category),
    getDisplayText(data?.role),
  ].filter(Boolean).slice(0, 2).join(" / ");
  const schemaProperties = useMemo(() => getSchemaProperties(schema), [schema]);
  const requiredFields = useMemo(() => getRequiredFields(schema), [schema]);
  const missingRequiredFields = useMemo(
    () => requiredFields.filter((field) => isEmptyValue(data?.[field])),
    [data, requiredFields]
  );
  const referenceFieldCount = useMemo(() => collectReferenceFieldCount(schemaProperties), [schemaProperties]);
  const simpleFieldKeys = useMemo(() => {
    return Object.entries(schemaProperties)
      .filter(([key, config]) => isSimpleField(key, config as SchemaFieldConfig, requiredFields, changedFieldKeys, data || {}))
      .map(([key]) => key);
  }, [changedFieldKeys, data, requiredFields, schemaProperties]);
  const visibleSimpleFieldSet = useMemo(() => new Set(simpleFieldKeys), [simpleFieldKeys]);
  const hiddenSimpleFieldCount = Math.max(0, Object.keys(schemaProperties).length - visibleSimpleFieldSet.size);
  const qualityStatus = !formValid || missingRequiredFields.length > 0
    ? "Needs attention"
    : isDirty
      ? "Draft changed"
      : "Ready";

  useEffect(() => {
    latestDataRef.current = data || {};
  }, [data]);

  useEffect(() => {
    setEditorView(getDefaultEditorView(schemaName, isNew, latestDataRef.current));
  }, [schemaName, isNew]);

  const switchEditorView = useCallback((view: EditorViewMode) => {
    setEditorView(view);
    writeStoredEditorView(schemaName, view);
  }, [schemaName]);

  const showUtilityNotice = useCallback((type: "success" | "error", message: string) => {
    setUtilityNotice({ type, message });
  }, []);

  useEffect(() => {
    if (!utilityNotice) return;
    const timeout = setTimeout(() => setUtilityNotice(null), 3500);
    return () => clearTimeout(timeout);
  }, [utilityNotice]);

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
        id: "copy-json",
        title: "Copy Entry JSON",
        subtitle: "Copy current entry payload to clipboard",
        keywords: ["copy", "json", "clipboard"],
        run: handleCopyJson,
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
      handleCopyJson,
      isNew,
      onCancel,
    ]
  );

  return (
    <div className="flex-1 min-w-0 flex flex-col h-full max-h-full overflow-hidden bg-white dark:bg-slate-950">
      <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-6 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span>{schemaTitle}</span>
              <span className={`rounded-full px-2 py-0.5 font-medium ${
                qualityStatus === "Ready"
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                  : qualityStatus === "Draft changed"
                    ? "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                    : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
              }`}>
                {qualityStatus}
              </span>
              {hasExistingId && <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">{currentEntryId}</span>}
            </div>
            <h1 className="mt-1 truncate text-xl font-semibold text-slate-950 dark:text-slate-100" title={entryLabel}>
              {entryLabel}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
              <span>{formHeader}</span>
              {entrySubtitle && <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-700 dark:bg-slate-800 dark:text-slate-300">{entrySubtitle}</span>}
              {changedFieldKeys.length > 0 && <span>{changedFieldKeys.length} changed field{changedFieldKeys.length === 1 ? "" : "s"}</span>}
              {referenceSummary && <span>{referenceSummary.total} inbound reference{referenceSummary.total === 1 ? "" : "s"}</span>}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.sm}`}
              onClick={() => setCommandPaletteOpen(true)}
            >
              Commands
            </button>
            {hasExistingId && (
              <button
                type="button"
                className={`${BUTTON_CLASSES.secondary} ${BUTTON_SIZES.sm}`}
                onClick={() => {
                  void handleCopyId();
                }}
              >
                Copy ID
              </button>
            )}
            {!isNew && (
              <button
                type="button"
                className={`${BUTTON_CLASSES.secondary} ${BUTTON_SIZES.sm}`}
                onClick={onCancel}
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              className={`${BUTTON_CLASSES.primary} ${BUTTON_SIZES.md}`}
              onClick={onSave}
              disabled={!formValid}
            >
              {isDirty ? "Save Changes" : "Save"}
            </button>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0 p-4">
        <div className="mb-4 rounded-md border border-slate-200 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-900">
          <div className="grid gap-2 sm:grid-cols-3">
            {[
              { id: "simple" as const, label: "Simple", detail: "Core fields and required fixes" },
              { id: "generate" as const, label: "Generate", detail: "Kits, ideas, variants, saved presets" },
              { id: "advanced" as const, label: "Advanced", detail: "Full schema, references, simulation" },
            ].map((view) => {
              const active = editorView === view.id;
              return (
                <button
                  key={view.id}
                  type="button"
                  className={`rounded-md border px-3 py-2 text-left transition ${
                    active
                      ? "border-blue-500 bg-white text-blue-900 shadow-sm dark:bg-slate-800 dark:text-blue-200"
                      : "border-transparent bg-transparent text-slate-700 hover:border-slate-200 hover:bg-white dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-800"
                  }`}
                  onClick={() => switchEditorView(view.id)}
                >
                  <div className="text-sm font-semibold">{view.label}</div>
                  <div className={`mt-0.5 text-xs ${active ? "text-blue-700 dark:text-blue-300" : "text-slate-500 dark:text-slate-400"}`}>{view.detail}</div>
                </button>
              );
            })}
          </div>
        </div>

        {editorView === "simple" && (
          <div className="mx-auto max-w-4xl">
            <div className="mb-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-md border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                <div className="text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Required</div>
                <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {requiredFields.length - missingRequiredFields.length}/{requiredFields.length}
                </div>
                {missingRequiredFields.length > 0 && (
                  <div className="mt-1 truncate text-xs text-amber-700 dark:text-amber-300" title={missingRequiredFields.join(", ")}>
                    Missing: {missingRequiredFields.slice(0, 3).join(", ")}
                  </div>
                )}
              </div>
              <div className="rounded-md border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                <div className="text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Changes</div>
                <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{changedFieldKeys.length}</div>
                <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">{isDirty ? "Unsaved draft" : "No unsaved edits"}</div>
              </div>
              <div className="rounded-md border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                <div className="text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Hidden Details</div>
                <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{hiddenSimpleFieldCount}</div>
                <button
                  type="button"
                  className="mt-1 text-xs font-medium text-blue-700 hover:text-blue-900 dark:text-blue-300 dark:hover:text-blue-200"
                  onClick={() => switchEditorView("advanced")}
                >
                  Open Advanced
                </button>
              </div>
            </div>
            <SchemaForm
              schema={schema}
              data={data}
              onChange={onChange}
              referenceOptions={undefined}
              fetchReferenceOptions={undefined}
              isValidCallback={setFormValid}
              key={`simple-${referenceOptionsVersion}`}
              parentSummary={parentSummary}
              changedFieldKeys={changedFieldKeys}
              includedFieldKeys={simpleFieldKeys}
              compactControls
            />
          </div>
        )}

        {editorView === "generate" && (
          <div className="mx-auto max-w-6xl">
            <div className="mb-4 rounded-md border border-blue-100 bg-blue-50 px-4 py-3 dark:border-blue-900 dark:bg-blue-950">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-blue-950 dark:text-blue-100">Create from a stronger starting point</div>
                  <div className="mt-1 text-xs text-blue-800 dark:text-blue-300">
                    Apply curated kits, generate local ideas, make variants, or reuse saved presets. Every change still goes through preview.
                  </div>
                </div>
                <button
                  type="button"
                  className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.sm}`}
                  onClick={() => switchEditorView("simple")}
                >
                  Edit Fields
                </button>
              </div>
            </div>
            <AuthoringStudio
              schemaName={schemaName}
              schema={schema}
              data={data || {}}
              presets={presets}
              onChange={onChange}
            />
          </div>
        )}

        {editorView === "advanced" && (
          <div>
            <div className="grid gap-3 mb-4 lg:grid-cols-4">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
                <div className="text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Required</div>
                <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {requiredFields.length - missingRequiredFields.length}/{requiredFields.length}
                </div>
                {missingRequiredFields.length > 0 && (
                  <div className="mt-1 truncate text-xs text-amber-700 dark:text-amber-300" title={missingRequiredFields.join(", ")}>
                    Missing: {missingRequiredFields.slice(0, 3).join(", ")}
                  </div>
                )}
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
                <div className="text-xs font-medium uppercase text-slate-500 dark:text-slate-400">References</div>
                <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{referenceSummary?.total ?? 0}</div>
                <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">{referenceFieldCount} reference field{referenceFieldCount === 1 ? "" : "s"} in schema</div>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
                <div className="text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Changes</div>
                <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{changedFieldKeys.length}</div>
                <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">{isDirty ? "Unsaved draft" : "No unsaved edits"}</div>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
                <div className="text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Authoring</div>
                <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{presets.length}</div>
                <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">preset{presets.length === 1 ? "" : "s"} available</div>
              </div>
            </div>
            <ContextSimulationPanel
              schemaName={schemaName}
              data={(data || {}) as Record<string, unknown>}
            />
            <div className="mb-4 border-y border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">Authoring Utilities</div>
                  <div className="text-xs text-slate-600 mt-1 dark:text-slate-400">
                    Changed fields: <span className="font-semibold text-slate-800 dark:text-slate-200">{changedFieldKeys.length}</span>
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
                  <span className="text-xs text-slate-500 dark:text-slate-400">JSON patch preview lives in Generate / Saved.</span>
                </div>
              </div>
              {utilityNotice && (
                <div
                  className={`mt-2 rounded border px-2 py-1 text-xs ${
                    utilityNotice.type === "success"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
                      : "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
                  }`}
                >
                  {utilityNotice.message}
                </div>
              )}
            </div>
            {hasExistingId && (
              <div className="mb-4 border-y border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">Reference Insights</div>
                    <div className="text-xs mt-1 text-slate-600 dark:text-slate-400">
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
                  <div className="mt-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                    {referenceError}
                  </div>
                )}
                {referenceSummary && (
                  <div className="mt-2">
                    <div className="text-xs text-slate-600 mb-2 dark:text-slate-400">
                      {referenceSummary.total} references found for <span className="font-semibold text-slate-800 dark:text-slate-200">{referenceSummary.targetId}</span>.
                    </div>
                    {referenceSummary.groups.length === 0 ? (
                      <div className="text-xs text-slate-500 dark:text-slate-400">No references detected.</div>
                    ) : (
                      <div className="space-y-2">
                        {referenceSummary.groups.map((group) => (
                          <div key={group.schemaName} className="border-t border-slate-200 bg-white/60 px-2 py-2 first:border-t-0 dark:border-slate-800 dark:bg-slate-950/40">
                            <div className="text-xs font-semibold text-slate-700 mb-1 dark:text-slate-300">
                              {group.schemaLabel} ({group.count})
                            </div>
                            <div className="space-y-1">
                              {group.hits.slice(0, 5).map((hit) => (
                                <div key={`${group.schemaName}-${hit.sourceId}`} className="flex items-center justify-between gap-2 text-xs">
                                  <div className="min-w-0">
                                    <div className="truncate text-slate-800 dark:text-slate-200" title={`${hit.sourceLabel} (${hit.sourceId})`}>
                                      {hit.sourceLabel}
                                    </div>
                                    <div className="truncate text-slate-500 dark:text-slate-400" title={hit.paths.join(", ")}>
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
                                <div className="text-[11px] text-slate-500 dark:text-slate-400">
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
              key={`advanced-${referenceOptionsVersion}`}
              parentSummary={parentSummary}
              changedFieldKeys={changedFieldKeys}
            />
          </div>
        )}

        <div className="mt-4 flex gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
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
