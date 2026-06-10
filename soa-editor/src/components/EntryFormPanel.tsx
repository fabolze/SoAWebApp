import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import SchemaForm from "./SchemaForm";
import { ParentSummary } from "./EditorStackContext";
import { BUTTON_CLASSES, BUTTON_SIZES } from "../styles/uiTokens";
import CommandPalette, { type CommandPaletteItem } from "./command/CommandPalette";
import ContextSimulationPanel from "./simulation/ContextSimulationPanel";
import AuthoringStudio from "./authoring/AuthoringStudio";
import RelationshipPanel from "./relationships/RelationshipPanel";
import { collectUsedSlugs, findSlugCollision, getIdentitySource, makeUniqueSlug } from "../utils/identity";
import type { EntryRecord } from "../types/editorQol";
import type { SchemaFieldConfig } from "./schemaForm/types";
import type { EntryRelationshipSummary } from "../relationships";
import type { StudioBundle } from "../studio/types";

type EditorViewMode = "simple" | "tools" | "advanced";

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
    return stored === "simple" || stored === "tools" || stored === "advanced" ? stored : null;
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
  return isNew && !hasMeaningfulDraftData(data) ? "tools" : "simple";
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
  entries: EntryRecord[];
  relationshipSummary: EntryRelationshipSummary | null;
  referenceLoading: boolean;
  referenceError: string | null;
  onRefreshReferences: () => void;
  onOpenRelationshipEntry: (schemaName: string, routePath: string, entryId: string) => void;
  onCreateBundleDrafts: (bundle: StudioBundle, selectedIds: Set<string>) => void;
  changedFieldKeys: string[];
}

function getImmersiveAuthorPath(schemaName: string, entryId: string): string | null {
  const encodedId = encodeURIComponent(entryId);
  if (schemaName === "items") return `/author/items/${encodedId}`;
  if (schemaName === "shops") return `/author/shops/${encodedId}`;
  if (schemaName === "characters") return `/author/characters/${encodedId}`;
  if (schemaName === "dialogues") return `/author/dialogues/${encodedId}`;
  if (schemaName === "encounters") return `/author/encounters/${encodedId}`;
  if (schemaName === "quests") return `/author/quests/${encodedId}`;
  if (schemaName === "locations") return `/author/locations/${encodedId}`;
  return null;
}

function getNewImmersiveAuthorPath(schemaName: string): string | null {
  if (schemaName === "items") return "/author/items/new";
  if (schemaName === "shops") return "/author/shops/new";
  if (schemaName === "characters") return "/author/characters/new";
  if (schemaName === "dialogues") return "/author/dialogues/new";
  if (schemaName === "encounters") return "/author/encounters/new";
  if (schemaName === "quests") return "/author/quests/new";
  if (schemaName === "locations") return "/author/locations/new";
  return null;
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
  entries,
  relationshipSummary,
  referenceLoading,
  referenceError,
  onRefreshReferences,
  onOpenRelationshipEntry,
  onCreateBundleDrafts,
  changedFieldKeys,
}: EntryFormPanelProps) {
  const [utilityNotice, setUtilityNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [editorView, setEditorView] = useState<EditorViewMode>(() => getDefaultEditorView(schemaName, isNew, data || {}));
  const latestDataRef = useRef(data || {});
  const rawEntryId = data?.id;
  const currentEntryId = typeof rawEntryId === "string" ? rawEntryId : rawEntryId != null ? String(rawEntryId) : "";
  const hasCurrentId = currentEntryId.length > 0;
  const isPersistedEntry = hasCurrentId && entries.some((entry) => getDisplayText(entry?.id) === currentEntryId);
  const hasExistingId = !isNew && isPersistedEntry;
  const immersiveAuthorPath = isPersistedEntry ? getImmersiveAuthorPath(schemaName, currentEntryId) : null;
  const newImmersiveAuthorPath = !isPersistedEntry ? getNewImmersiveAuthorPath(schemaName) : null;
  const schemaTitle = typeof schema.title === "string" && schema.title.trim() ? schema.title.trim() : schemaName;
  const entryLabel = getDisplayText(data?.name) || getDisplayText(data?.title) || getDisplayText(data?.slug) || (isNew ? "New draft" : currentEntryId || "Untitled entry");
  const entrySubtitle = [
    getDisplayText(data?.type),
    getDisplayText(data?.rarity),
    getDisplayText(data?.category),
    getDisplayText(data?.role),
  ].filter(Boolean).slice(0, 2).join(" / ");
  const schemaProperties = useMemo(() => getSchemaProperties(schema), [schema]);
  const hasSlugField = Object.prototype.hasOwnProperty.call(schemaProperties, "slug");
  const currentSlug = typeof data?.slug === "string" ? data.slug : "";
  const slugCollision = useMemo(() => findSlugCollision(entries, currentSlug, currentEntryId), [currentEntryId, currentSlug, entries]);
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
              {relationshipSummary && <span>{relationshipSummary.inbound.reduce((sum, group) => sum + group.count, 0)} inbound reference{relationshipSummary.inbound.reduce((sum, group) => sum + group.count, 0) === 1 ? "" : "s"}</span>}
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
              <>
                {immersiveAuthorPath && (
                  <Link
                    className={`${BUTTON_CLASSES.indigo} ${BUTTON_SIZES.sm}`}
                    to={immersiveAuthorPath}
                  >
                    Author View
                  </Link>
                )}
                {schemaName === "locations" && (
                  <Link
                    className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.sm}`}
                    to="/author/locations/map"
                  >
                    Atlas
                  </Link>
                )}
              </>
            )}
            {!hasExistingId && newImmersiveAuthorPath && (
              <Link
                className={`${BUTTON_CLASSES.indigo} ${BUTTON_SIZES.sm}`}
                to={newImmersiveAuthorPath}
              >
                New Author View
              </Link>
            )}
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
        {hasSlugField && (
          <div className={`mb-4 rounded-md border px-3 py-2 ${slugCollision ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40" : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Slug Policy</div>
                <div className={`mt-1 truncate text-sm ${slugCollision ? "text-amber-800 dark:text-amber-200" : "text-slate-700 dark:text-slate-300"}`}>
                  {slugCollision ? `Collision with ${getDisplayText(slugCollision.name) || getDisplayText(slugCollision.title) || getDisplayText(slugCollision.slug) || getDisplayText(slugCollision.id)}` : currentSlug || "No slug set"}
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  className={`${BUTTON_CLASSES.secondary} ${BUTTON_SIZES.xs}`}
                  onClick={() => {
                    const source = getIdentitySource(data || {});
                    onChange({ ...data, slug: makeUniqueSlug(source, collectUsedSlugs(entries, currentEntryId)) });
                  }}
                >
                  Generate from Name
                </button>
                <button
                  type="button"
                  className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`}
                  onClick={() => {
                    const source = currentSlug || getIdentitySource(data || {});
                    onChange({ ...data, slug: makeUniqueSlug(source, collectUsedSlugs(entries, currentEntryId)) });
                  }}
                >
                  Regenerate Unique
                </button>
              </div>
            </div>
          </div>
        )}
        <div className="mb-4 rounded-md border border-slate-200 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-900">
          <div className="grid gap-2 sm:grid-cols-3">
            {[
              { id: "simple" as const, label: "Simple", detail: "Core fields and required fixes" },
              { id: "tools" as const, label: "Tools", detail: "Variants, cleanup, saved patches" },
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
              schemaName={schemaName}
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

        {editorView === "tools" && (
          <div className="mx-auto max-w-6xl">
            <div className="mb-4 rounded-md border border-blue-100 bg-blue-50 px-4 py-3 dark:border-blue-900 dark:bg-blue-950">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-blue-950 dark:text-blue-100">Draft tools</div>
                  <div className="mt-1 text-xs text-blue-800 dark:text-blue-300">
                    Make variants, run cleanup patches, or reuse saved local patches. Every change still goes through preview.
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
              onChange={onChange}
              relationshipSummary={relationshipSummary}
              onCreateBundleDrafts={onCreateBundleDrafts}
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
                <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{relationshipSummary?.inbound.reduce((sum, group) => sum + group.count, 0) ?? 0}</div>
                <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">{referenceFieldCount} reference field{referenceFieldCount === 1 ? "" : "s"} in schema</div>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
                <div className="text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Changes</div>
                <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{changedFieldKeys.length}</div>
                <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">{isDirty ? "Unsaved draft" : "No unsaved edits"}</div>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
                <div className="text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Authoring</div>
                <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">3</div>
                <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">tool modes available</div>
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
                  <span className="text-xs text-slate-500 dark:text-slate-400">JSON patch preview lives in Tools / Library.</span>
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
              <RelationshipPanel
                summary={relationshipSummary}
                loading={referenceLoading}
                error={referenceError}
                onRefresh={onRefreshReferences}
                onOpenEntry={onOpenRelationshipEntry}
              />
            )}
            <SchemaForm
              schema={schema}
              schemaName={schemaName}
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
