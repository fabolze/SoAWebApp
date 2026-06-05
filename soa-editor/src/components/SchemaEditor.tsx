// soa-editor/src/components/SchemaEditor.tsx
// This file acts as a template for the other pages
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ArchiveBoxArrowDownIcon,
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  BeakerIcon,
  DocumentIcon,
} from "@heroicons/react/24/outline";
import EntryListPanel from "./EntryListPanel";
import EntryFormPanel from "./EntryFormPanel";
import { generateUlid, generateSlug } from "../utils/generateId";
import { type ParentSummary } from "./EditorStackContext";
import { apiFetch, buildApiUrl } from "../lib/api";
import { BUTTON_CLASSES, BUTTON_SIZES, TEXT_CLASSES } from "../styles/uiTokens";
import useDebouncedValue from "./hooks/useDebouncedValue";
import { isSimulationSchemaName } from "../simulation";
import { useDirtyState } from "./useDirtyState";
import { buildRelationshipIndex, summarizeEntryRelationships, type EntryRelationshipSummary, type RelationshipIndex } from "../relationships";
import type { EntryRecord, RecentEntry } from "../types/editorQol";
import type { StudioBundle } from "../studio/types";

interface SchemaEditorProps {
  schemaName: string;
  title: string;
  apiPath: string;
  idField?: string;
}

interface SchemaPropertyConfig {
  ui?: {
    list_display?: boolean;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface SchemaDefinition {
  properties?: Record<string, SchemaPropertyConfig>;
  [key: string]: unknown;
}

interface DraftPayload {
  data?: unknown;
  ts?: number;
}

interface WorkspaceState {
  search?: string;
  searchField?: string;
  showEditor?: boolean;
  selectedEntryId?: string;
}

interface CsvImportPreview {
  status: "ok" | "error";
  table: string;
  counts: {
    added: number;
    updated: number;
    deleted: number;
    unchanged: number;
  };
  errors: Array<{ row?: number; id?: string; message: string; field?: string }>;
  warnings: Array<{ row?: number; field?: string; message: string }>;
  changes: Array<Record<string, unknown>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toEntryArray(value: unknown): EntryRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord);
}

function asMessage(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const message = value.message ?? value.error;
  return typeof message === "string" && message.trim() ? message : null;
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

async function readJsonSafe(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function parseDraftData(raw: string | null): EntryRecord | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as DraftPayload | unknown;
    if (!isRecord(parsed)) return null;
    const candidate = (parsed as DraftPayload).data;
    return isRecord(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

function stringifyStable(value: unknown): string {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return "{}";
  }
}

function toSearchText(value: unknown): string {
  return String(value ?? "").toLowerCase();
}

export default function SchemaEditor({
  schemaName,
  title,
  apiPath,
  idField = "id",
}: SchemaEditorProps) {
  const [schema, setSchema] = useState<SchemaDefinition | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const [data, setData] = useState<EntryRecord>({});
  const [entries, setEntries] = useState<EntryRecord[]>([]);
  const [entriesLoaded, setEntriesLoaded] = useState(false);
  const [entriesError, setEntriesError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchField, setSearchField] = useState<string>("__all__");
  const [formValid, setFormValid] = useState(true);
  const [referenceOptionsVersion, setReferenceOptionsVersion] = useState(0);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirmRef = useRef<HTMLDialogElement>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importFileName, setImportFileName] = useState<string>("");
  const [importPreview, setImportPreview] = useState<CsvImportPreview | null>(null);
  const [importPreviewLoading, setImportPreviewLoading] = useState(false);
  const [originalData, setOriginalData] = useState<EntryRecord>({});
  const [isDirty, setIsDirty] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [showEditor, setShowEditor] = useState(true);
  const [recentEntries, setRecentEntries] = useState<RecentEntry[]>([]);
  const [relationshipSummary, setRelationshipSummary] = useState<EntryRelationshipSummary | null>(null);
  const [referenceLoading, setReferenceLoading] = useState(false);
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const confirmDelete = useRef<EntryRecord | null>(null);
  const originalSerializedRef = useRef("{}");
  const dirtySourceId = useRef(`schema-editor-${generateUlid()}`);
  const pendingWorkspaceSelectionRef = useRef<string | null>(null);
  const pendingQuerySelectionRef = useRef<string | null>(null);
  const referenceCacheRef = useRef<Map<string, EntryRelationshipSummary>>(new Map());
  const relationshipIndexRef = useRef<RelationshipIndex | null>(null);
  const debouncedSearch = useDebouncedValue(search, 120);
  const debouncedData = useDebouncedValue(data, 200);
  const debouncedDraftData = useDebouncedValue(data, 1200);
  const { setDirty, confirmNavigate } = useDirtyState();
  const querySelectedId = useMemo(() => {
    const selected = new URLSearchParams(location.search).get("selected");
    return selected?.trim() || "";
  }, [location.search]);
  const returnTo = useMemo(() => {
    const value = new URLSearchParams(location.search).get("returnTo");
    return value?.startsWith("/") ? value : "";
  }, [location.search]);

  const getEntryId = useCallback(
    (entry: EntryRecord | null | undefined): string => {
      const value = entry?.[idField];
      return typeof value === "string" ? value : "";
    },
    [idField]
  );
  const debouncedReferenceTargetId = useDebouncedValue(getEntryId(data), 450);

  const parentSummary: ParentSummary = useMemo(
    () => ({
      title: title.replace(/ Editor$/, ""),
      data,
    }),
    [data, title]
  );

  const sandboxEligible = isSimulationSchemaName(schemaName);
  const selectedEntityIdForSandbox = getEntryId(data);
  const sandboxQuery = selectedEntityIdForSandbox
    ? `/simulation?schema=${schemaName}&id=${encodeURIComponent(selectedEntityIdForSandbox)}`
    : `/simulation?schema=${schemaName}`;
  const workspaceStorageKey = `soa.workspace.${schemaName}`;
  const recentStorageKey = `soa.recent.${schemaName}`;

  const getEntryLabel = useCallback((entry: EntryRecord): string => {
    const name = typeof entry.name === "string" ? entry.name : "";
    const titleValue = typeof entry.title === "string" ? entry.title : "";
    const slug = typeof entry.slug === "string" ? entry.slug : "";
    return name || titleValue || slug || getEntryId(entry) || "Untitled";
  }, [getEntryId]);

  const persistRecentEntries = useCallback((next: RecentEntry[]) => {
    setRecentEntries(next);
    localStorage.setItem(recentStorageKey, JSON.stringify(next));
  }, [recentStorageKey]);

  const rememberRecentEntry = useCallback((entry: EntryRecord) => {
    const id = getEntryId(entry);
    if (!id) return;
    const label = getEntryLabel(entry);
    const nextEntry: RecentEntry = { id, label, ts: Date.now() };
    setRecentEntries((prev) => {
      const merged = [nextEntry, ...prev.filter((item) => item.id !== id)].slice(0, 15);
      localStorage.setItem(recentStorageKey, JSON.stringify(merged));
      return merged;
    });
  }, [getEntryId, getEntryLabel, recentStorageKey]);

  const loadEntries = useCallback(async () => {
    setEntriesLoaded(false);
    try {
      const res = await apiFetch(`/api/${apiPath}`);
      const payload = await readJsonSafe(res);
      if (!Array.isArray(payload)) {
        setEntries([]);
        const msg = asMessage(payload) || "API did not return a list.";
        setEntriesError(`Entries load failed: ${msg}`);
        setEntriesLoaded(true);
        return;
      }
      setEntries(toEntryArray(payload));
      setEntriesError(null);
    } catch (err) {
      setEntries([]);
      setEntriesError(`Entries load failed: ${errorMessage(err, "Unknown error")}`);
    } finally {
      setEntriesLoaded(true);
    }
  }, [apiPath]);

  useEffect(() => {
    let isCancelled = false;
    void import(`../../../backend/app/schemas/${schemaName}.json`)
      .then((loaded: unknown) => {
        if (isCancelled) return;
        const maybeModule = loaded as { default?: SchemaDefinition };
        const resolved = maybeModule.default ?? (loaded as SchemaDefinition);
        setSchema(resolved);
      })
      .catch(() => {
        if (isCancelled) return;
        setSchema({ properties: {} });
      });
    return () => {
      isCancelled = true;
    };
  }, [schemaName]);

  useEffect(() => {
    const rawWorkspace = localStorage.getItem(workspaceStorageKey);
    if (rawWorkspace) {
      try {
        const parsed = JSON.parse(rawWorkspace) as WorkspaceState | unknown;
        if (isRecord(parsed)) {
          const searchValue = typeof parsed.search === "string" ? parsed.search : "";
          const restoredSearchField = typeof parsed.searchField === "string" ? parsed.searchField : "__all__";
          const restoredShowEditor = typeof parsed.showEditor === "boolean" ? parsed.showEditor : true;
          const restoredSelectedId = typeof parsed.selectedEntryId === "string" ? parsed.selectedEntryId : "";
          setSearch(searchValue);
          setSearchField(restoredSearchField || "__all__");
          setShowEditor(restoredShowEditor);
          pendingWorkspaceSelectionRef.current = restoredSelectedId || null;
        }
      } catch {
        pendingWorkspaceSelectionRef.current = null;
      }
    } else {
      pendingWorkspaceSelectionRef.current = null;
    }

    const rawRecent = localStorage.getItem(recentStorageKey);
    if (rawRecent) {
      try {
        const parsed = JSON.parse(rawRecent) as RecentEntry[] | unknown;
        if (Array.isArray(parsed)) {
          const normalized = parsed
            .filter((item): item is RecentEntry => {
              return isRecord(item) && typeof item.id === "string" && typeof item.label === "string" && typeof item.ts === "number";
            })
            .slice(0, 15);
          persistRecentEntries(normalized);
          return;
        }
      } catch {
        // Ignore invalid recent entry payloads.
      }
    }
    persistRecentEntries([]);
  }, [persistRecentEntries, recentStorageKey, workspaceStorageKey]);

  useEffect(() => {
    referenceCacheRef.current.clear();
    relationshipIndexRef.current = null;
    setRelationshipSummary(null);
    setReferenceError(null);
    setReferenceLoading(false);
  }, [schemaName]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  useEffect(() => {
    pendingQuerySelectionRef.current = querySelectedId || null;
  }, [querySelectedId]);

  const handleSave = useCallback(async () => {
    // Prevent accidental overwrites when switching to an ID that belongs to another entry.
    const currentId = getEntryId(data);
    const originalId = getEntryId(originalData);
    if (currentId) {
      const conflict = entries.some((entry) => {
        const entryId = getEntryId(entry);
        return entryId === currentId && entryId !== originalId;
      });
      if (conflict) {
        if (!window.confirm(`An entry with ID '${currentId}' already exists. Overwrite?`)) {
          return;
        }
      }
    }

    const res = await apiFetch(`/api/${apiPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    if (res.ok) {
      setToast({ type: "success", message: "Saved successfully" });
      await loadEntries();
      rememberRecentEntry(data);
      setReferenceOptionsVersion((v) => v + 1); // Trigger referenceOptions refresh in SchemaForm
      setOriginalData(data);
      setIsDirty(false);
      originalSerializedRef.current = stringifyStable(data);
      const draftKey = `soa.draft.${schemaName}.${currentId || "new"}`;
      const lastKey = `soa.draft.last.${schemaName}`;
      localStorage.removeItem(draftKey);
      if (localStorage.getItem(lastKey) === draftKey) {
        localStorage.removeItem(lastKey);
      }
      if (returnTo) {
        navigate(returnTo);
        return;
      }
    } else {
      const payload = await readJsonSafe(res);
      const msg = asMessage(payload) ? `Save failed: ${asMessage(payload)}` : "Save failed";
      setToast({ type: "error", message: msg });
    }

    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    toastTimeout.current = setTimeout(() => setToast(null), 3000);
  }, [apiPath, data, entries, getEntryId, loadEntries, navigate, originalData, rememberRecentEntry, returnTo, schemaName]);

  // Get all field names from schema for table columns.
  const fieldKeys = useMemo(() => Object.keys(schema?.properties || {}), [schema]);

  const dedupeFields = useCallback((fields: string[]) => {
    // Avoid duplicated columns when idField matches a fallback candidate.
    const seen = new Set<string>();
    return fields.filter((field) => {
      if (seen.has(field)) return false;
      seen.add(field);
      return true;
    });
  }, []);

  // Determine which fields to display in the table list view.
  const listFields = useMemo(() => {
    const properties = schema?.properties || {};
    let resolvedFields = Object.entries(properties)
      .filter(([, config]) => !!config.ui?.list_display)
      .map(([key]) => key);
    resolvedFields = dedupeFields(resolvedFields);

    // Fallback: if none marked, use id/slug/name/title etc. if present
    if (resolvedFields.length === 0) {
      const candidates = [
        idField,
        "slug",
        "name",
        "title",
        "type",
        "role",
        "value_type",
        "created_at",
        "default_value",
      ];
      resolvedFields = candidates.filter((field) => !!field && fieldKeys.includes(field)) as string[];
      resolvedFields = dedupeFields(resolvedFields);
      if (resolvedFields.length === 0) resolvedFields = fieldKeys.slice(0, 3); // fallback to first 3 fields
    }

    return resolvedFields;
  }, [schema, dedupeFields, idField, fieldKeys]);

  // Track which entry is being edited (by id).
  const editingId = getEntryId(data) || null;

  useEffect(() => {
    const workspace: WorkspaceState = {
      search,
      searchField,
      showEditor,
      selectedEntryId: editingId || "",
    };
    localStorage.setItem(workspaceStorageKey, JSON.stringify(workspace));
  }, [editingId, search, searchField, showEditor, workspaceStorageKey]);

  const confirmDiscard = useCallback(() => {
    if (!isDirty) return true;
    return confirmNavigate();
  }, [confirmNavigate, isDirty]);

  // Add New handler.
  const handleAddNew = useCallback(() => {
    if (!confirmDiscard()) return;
    const newData: EntryRecord = { id: generateUlid() };
    setData(newData);
    setOriginalData(newData);
    originalSerializedRef.current = stringifyStable(newData);
    setIsDirty(false);
    setShowEditor(true);
  }, [confirmDiscard]);

  // Duplicate handler.
  const handleDuplicate = useCallback(
    (entry: EntryRecord) => {
      if (!confirmDiscard()) return;
      const copy: EntryRecord = { ...entry };
      if (idField) copy[idField] = generateUlid();

      // Keep slug; if conflict, append suffix (-copy, -copy-2, ...). If missing, derive from name.
      const existingSlugs = new Set(
        entries
          .map((e) => e.slug)
          .filter((slug): slug is string => typeof slug === "string" && slug.length > 0)
      );

      const rawSlug = typeof copy.slug === "string" ? copy.slug : "";
      const rawName = typeof copy.name === "string" ? copy.name : "";
      const baseSlug = rawSlug || (rawName ? generateSlug(rawName) : "");
      let newSlug = baseSlug;

      if (newSlug) {
        if (existingSlugs.has(newSlug)) {
          let i = 1;
          let candidate = `${newSlug}-copy`;
          while (existingSlugs.has(candidate)) {
            i += 1;
            candidate = `${newSlug}-copy-${i}`;
          }
          newSlug = candidate;
        }
        copy.slug = newSlug;
      }

      setData(copy);
      setOriginalData(copy);
      originalSerializedRef.current = stringifyStable(copy);
      setIsDirty(false);
      setShowEditor(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [confirmDiscard, idField, entries]
  );

  // Edit entry handler.
  const handleEdit = useCallback(
    (entry: EntryRecord) => {
      if (!confirmDiscard()) return;

      const entryId = getEntryId(entry);
      const draftKey = `soa.draft.${schemaName}.${entryId || "new"}`;
      const draft = parseDraftData(localStorage.getItem(draftKey));
      if (draft) {
        setData(draft);
        setOriginalData(draft);
        originalSerializedRef.current = stringifyStable(draft);
        setIsDirty(false);
        setDraftRestored(true);
        setShowEditor(true);
        rememberRecentEntry(draft);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      setData(entry);
      setOriginalData(entry);
      originalSerializedRef.current = stringifyStable(entry);
      setIsDirty(false);
      setShowEditor(true);
      rememberRecentEntry(entry);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [confirmDiscard, getEntryId, rememberRecentEntry, schemaName]
  );

  useEffect(() => {
    const pendingQuerySelectionId = pendingQuerySelectionRef.current;
    if (pendingQuerySelectionId) {
      if (!entriesLoaded) return;
      const matchingEntry = entries.find((entry) => getEntryId(entry) === pendingQuerySelectionId);
      pendingQuerySelectionRef.current = null;
      if (matchingEntry) {
        handleEdit(matchingEntry);
        return;
      }
      const draftKey = `soa.draft.${schemaName}.${pendingQuerySelectionId}`;
      const draft = parseDraftData(localStorage.getItem(draftKey));
      if (draft) {
        setData(draft);
        setOriginalData(draft);
        originalSerializedRef.current = stringifyStable(draft);
        setIsDirty(false);
        setDraftRestored(true);
        setShowEditor(true);
        return;
      }
      setToast({ type: "error", message: `Entry '${pendingQuerySelectionId}' was not found in ${title}.` });
      if (toastTimeout.current) clearTimeout(toastTimeout.current);
      toastTimeout.current = setTimeout(() => setToast(null), 3000);
      return;
    }

    const pendingSelectionId = pendingWorkspaceSelectionRef.current;
    if (!pendingSelectionId) return;
    const matchingEntry = entries.find((entry) => getEntryId(entry) === pendingSelectionId);
    pendingWorkspaceSelectionRef.current = null;
    if (matchingEntry) {
      handleEdit(matchingEntry);
      return;
    }
    const draftKey = `soa.draft.${schemaName}.${pendingSelectionId}`;
    const draft = parseDraftData(localStorage.getItem(draftKey));
    if (draft) {
      setData(draft);
      setOriginalData(draft);
      originalSerializedRef.current = stringifyStable(draft);
      setIsDirty(false);
      setDraftRestored(true);
      setShowEditor(true);
    }
  }, [entries, entriesLoaded, getEntryId, handleEdit, querySelectedId, schemaName, title]);

  // Delete entry handler.
  const handleDelete = useCallback((entry: EntryRecord) => {
    confirmDelete.current = entry;
    setTimeout(() => confirmRef.current?.showModal(), 0);
  }, []);

  const confirmDeleteAction = useCallback(async () => {
    const entry = confirmDelete.current;
    if (!entry) return;
    confirmRef.current?.close();
    confirmDelete.current = null;

    const entryId = getEntryId(entry);
    if (!entryId) {
      setToast({ type: "error", message: "Delete failed: missing entry ID" });
      return;
    }

    const res = await apiFetch(`/api/${apiPath}/${encodeURIComponent(entryId)}`, {
      method: "DELETE",
    });

    if (res.ok) {
      setEntries((prev) => prev.filter((e) => getEntryId(e) !== entryId));
      setData((prev) => (getEntryId(prev) === entryId ? {} : prev));
      setToast({ type: "success", message: "Deleted successfully" });
    } else {
      const payload = await readJsonSafe(res);
      const msg = asMessage(payload) ? `Delete failed: ${asMessage(payload)}` : "Delete failed";
      setToast({ type: "error", message: msg });
    }

    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    toastTimeout.current = setTimeout(() => setToast(null), 3000);
  }, [apiPath, getEntryId]);

  const cancelDelete = useCallback(() => {
    confirmRef.current?.close();
    confirmDelete.current = null;
  }, []);

  const buildDuplicate = useCallback(
    (entry: EntryRecord, usedSlugs: Set<string>) => {
      const copy: EntryRecord = { ...entry };
      if (idField) copy[idField] = generateUlid();

      const rawSlug = typeof copy.slug === "string" ? copy.slug : "";
      const rawName = typeof copy.name === "string" ? copy.name : "";
      const baseSlug = rawSlug || (rawName ? generateSlug(rawName) : "");
      if (baseSlug) {
        let newSlug = baseSlug;
        if (usedSlugs.has(newSlug)) {
          let i = 1;
          let candidate = `${newSlug}-copy`;
          while (usedSlugs.has(candidate)) {
            i += 1;
            candidate = `${newSlug}-copy-${i}`;
          }
          newSlug = candidate;
        }
        copy.slug = newSlug;
        usedSlugs.add(newSlug);
      }
      return copy;
    },
    [idField]
  );

  const handleBulkDelete = useCallback(
    async (selected: EntryRecord[]) => {
      if (selected.length === 0) return;
      if (!window.confirm(`Delete ${selected.length} entries? This cannot be undone.`)) return;

      await Promise.all(
        selected.map(async (entry) => {
          const entryId = getEntryId(entry);
          if (!entryId) return;
          await apiFetch(`/api/${apiPath}/${encodeURIComponent(entryId)}`, { method: "DELETE" });
        })
      );

      await loadEntries();
      setData((prev) =>
        selected.some((entry) => getEntryId(entry) === getEntryId(prev)) ? {} : prev
      );
    },
    [apiPath, getEntryId, loadEntries]
  );

  const coerceValue = useCallback((template: unknown, value: string): unknown => {
    if (value === "__null__") return null;
    if (typeof template === "number") {
      const num = parseFloat(value);
      return Number.isNaN(num) ? template : num;
    }
    if (typeof template === "boolean") {
      if (value.toLowerCase() === "true") return true;
      if (value.toLowerCase() === "false") return false;
      return template;
    }
    if (Array.isArray(template)) {
      return value
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
    }
    if (template === undefined) {
      const num = parseFloat(value);
      if (!Number.isNaN(num)) return num;
    }
    return value;
  }, []);

  const handleBulkEdit = useCallback(
    async (selected: EntryRecord[], field: string, value: string) => {
      if (selected.length === 0) return;
      if (!field) return;
      if (!window.confirm(`Apply "${field}" to ${selected.length} entries?`)) return;

      const results = await Promise.all(
        selected.map((entry) => {
          const updated: EntryRecord = { ...entry, [field]: coerceValue(entry[field], value) };
          return apiFetch(`/api/${apiPath}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updated),
          });
        })
      );

      const failed = results.filter((r) => !r.ok);
      if (failed.length > 0) {
        const payload = await readJsonSafe(failed[0]);
        const detail = asMessage(payload);
        setToast({
          type: "error",
          message: detail ? `${failed.length} updates failed: ${detail}` : `${failed.length} updates failed`,
        });
      } else {
        setToast({ type: "success", message: `Updated ${selected.length} entries` });
      }

      await loadEntries();
    },
    [apiPath, coerceValue, loadEntries]
  );

  const handleBulkDuplicate = useCallback(
    async (selected: EntryRecord[]) => {
      if (selected.length === 0) return;
      const usedSlugs = new Set(
        entries
          .map((entry) => entry.slug)
          .filter((slug): slug is string => typeof slug === "string" && slug.length > 0)
      );
      const duplicates = selected.map((entry) => buildDuplicate(entry, usedSlugs));
      await Promise.all(
        duplicates.map((copy) =>
          apiFetch(`/api/${apiPath}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(copy),
          })
        )
      );
      await loadEntries();
      setReferenceOptionsVersion((v) => v + 1);
    },
    [entries, buildDuplicate, apiPath, loadEntries]
  );

  const runReferenceScan = useCallback(
    async (targetId: string, forceRefresh = false) => {
      if (!targetId) {
        setRelationshipSummary(null);
        setReferenceError(null);
        setReferenceLoading(false);
        return;
      }

      const cached = referenceCacheRef.current.get(targetId);
      if (cached && !forceRefresh) {
        setRelationshipSummary(cached);
        setReferenceError(null);
        setReferenceLoading(false);
        return;
      }

      setReferenceLoading(true);
      setReferenceError(null);

      try {
        const index = forceRefresh || !relationshipIndexRef.current
          ? await buildRelationshipIndex()
          : relationshipIndexRef.current;
        relationshipIndexRef.current = index;
        const selectedEntry = entries.find((entry) => getEntryId(entry) === targetId) || data;
        const summary = summarizeEntryRelationships(index, schemaName, selectedEntry);

        referenceCacheRef.current.set(targetId, summary);
        setRelationshipSummary(summary);
      } catch (err) {
        setReferenceError(`Reference scan failed: ${errorMessage(err, "Unknown error")}`);
      } finally {
        setReferenceLoading(false);
      }
    },
    [data, entries, getEntryId, schemaName]
  );

  const handleOpenRecentEntry = useCallback(
    (entryId: string) => {
      const match = entries.find((entry) => getEntryId(entry) === entryId);
      if (match) handleEdit(match);
    },
    [entries, getEntryId, handleEdit]
  );

  const handleOpenRelationshipEntry = useCallback(
    (targetSchemaName: string, routePath: string, entryId: string) => {
      if (targetSchemaName === schemaName) {
        const localMatch = entries.find((entry) => getEntryId(entry) === entryId);
        if (localMatch) handleEdit(localMatch);
        return;
      }

      const targetWorkspaceKey = `soa.workspace.${targetSchemaName}`;
      const existingRaw = localStorage.getItem(targetWorkspaceKey);
      let nextWorkspace: WorkspaceState = {};
      if (existingRaw) {
        try {
          const parsed = JSON.parse(existingRaw) as WorkspaceState | unknown;
          if (isRecord(parsed)) {
            nextWorkspace = {
              search: typeof parsed.search === "string" ? parsed.search : "",
              searchField: typeof parsed.searchField === "string" ? parsed.searchField : "__all__",
              showEditor: typeof parsed.showEditor === "boolean" ? parsed.showEditor : true,
              selectedEntryId: typeof parsed.selectedEntryId === "string" ? parsed.selectedEntryId : "",
            };
          }
        } catch {
          nextWorkspace = {};
        }
      }
      nextWorkspace.selectedEntryId = entryId;
      localStorage.setItem(targetWorkspaceKey, JSON.stringify(nextWorkspace));
      window.location.assign(`/${routePath}`);
    },
    [entries, getEntryId, handleEdit, schemaName]
  );

  const handleCreateBundleDrafts = useCallback((bundle: StudioBundle, selectedIds: Set<string>) => {
    const selectedEntries = bundle.entries.filter((entry) => selectedIds.has(entry.tempId));
    if (selectedEntries.length === 0) return;
    for (const entry of selectedEntries) {
      const draftKey = `soa.draft.${entry.schemaName}.${entry.tempId}`;
      const lastKey = `soa.draft.last.${entry.schemaName}`;
      localStorage.setItem(draftKey, JSON.stringify({ data: entry.data, ts: Date.now(), bundleId: bundle.id }));
      localStorage.setItem(lastKey, draftKey);
    }
    const first = selectedEntries[0];
    const targetWorkspaceKey = `soa.workspace.${first.schemaName}`;
    localStorage.setItem(targetWorkspaceKey, JSON.stringify({
      search: "",
      searchField: "__all__",
      showEditor: true,
      selectedEntryId: first.tempId,
    }));
    if (first.schemaName === schemaName) {
      setData(first.data);
      setOriginalData(first.data);
      originalSerializedRef.current = stringifyStable(first.data);
      setIsDirty(false);
      setShowEditor(true);
      return;
    }
    window.location.assign(`/${first.routePath}`);
  }, [schemaName]);

  const handleRefreshReferences = useCallback(() => {
    const targetId = getEntryId(data);
    if (!targetId) {
      setRelationshipSummary(null);
      return;
    }
    referenceCacheRef.current.delete(targetId);
    void runReferenceScan(targetId, true);
  }, [data, getEntryId, runReferenceScan]);

  // Filtered and sorted entries.
  const filteredEntries = useMemo(
    () =>
      entries.filter((entry) => {
        if (!debouncedSearch.trim()) return true;
        const searchLower = debouncedSearch.toLowerCase();
        if (searchField === "__all__") {
          return fieldKeys.some((key) => {
            const val = entry[key];
            if (Array.isArray(val)) {
              return val.some((v) => toSearchText(v).includes(searchLower));
            }
            return toSearchText(val).includes(searchLower);
          });
        }
        const val = entry[searchField];
        if (Array.isArray(val)) {
          return val.some((v) => toSearchText(v).includes(searchLower));
        }
        return toSearchText(val).includes(searchLower);
      }),
    [entries, debouncedSearch, searchField, fieldKeys]
  );

  // Sort alphabetically by name, fallback to id.
  const sortedEntries = useMemo(() => {
    return [...filteredEntries].sort((a, b) => {
      const aName = toSearchText(a.name || a[idField] || "");
      const bName = toSearchText(b.name || b[idField] || "");
      return aName.localeCompare(bName);
    });
  }, [filteredEntries, idField]);

  // Determine if creating new entry.
  const isNew = !editingId;
  const formHeader = isNew ? `New ${title.replace(/ Editor$/, "")}` : `Edit ${title.replace(/ Editor$/, "")}`;
  const changedFieldKeys = useMemo(() => {
    const keys = new Set<string>([
      ...Object.keys(originalData || {}),
      ...Object.keys(data || {}),
    ]);
    return Array.from(keys)
      .filter((key) => stringifyStable(originalData?.[key]) !== stringifyStable(data?.[key]))
      .sort((a, b) => a.localeCompare(b));
  }, [data, originalData]);

  useEffect(() => {
    originalSerializedRef.current = stringifyStable(originalData);
  }, [originalData]);

  useEffect(() => {
    if (Object.keys(debouncedData).length === 0) {
      setIsDirty(false);
      return;
    }
    setIsDirty(stringifyStable(debouncedData) !== originalSerializedRef.current);
  }, [debouncedData]);

  useEffect(() => {
    if (Object.keys(debouncedDraftData).length === 0) return;
    if (!isDirty) return;
    const draftId = getEntryId(debouncedDraftData);
    const draftKey = `soa.draft.${schemaName}.${draftId || "new"}`;
    const lastKey = `soa.draft.last.${schemaName}`;
    localStorage.setItem(draftKey, JSON.stringify({ data: debouncedDraftData, ts: Date.now() }));
    localStorage.setItem(lastKey, draftKey);
  }, [debouncedDraftData, getEntryId, isDirty, schemaName]);

  useEffect(() => {
    if (draftRestored) return;
    if (Object.keys(data).length > 0) return;
    const lastKey = `soa.draft.last.${schemaName}`;
    const draftKey = localStorage.getItem(lastKey);
    const draft = parseDraftData(draftKey ? localStorage.getItem(draftKey) : null);
    if (!draft) return;
    setData(draft);
    setOriginalData(draft);
    originalSerializedRef.current = stringifyStable(draft);
    setIsDirty(false);
    setDraftRestored(true);
  }, [schemaName, data, draftRestored]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  useEffect(() => {
    const sourceId = dirtySourceId.current;
    setDirty(sourceId, isDirty);
    return () => setDirty(sourceId, false);
  }, [isDirty, setDirty]);

  useEffect(() => {
    if (!debouncedReferenceTargetId) {
      setRelationshipSummary(null);
      setReferenceError(null);
      setReferenceLoading(false);
      return;
    }
    void runReferenceScan(debouncedReferenceTargetId, false);
  }, [debouncedReferenceTargetId, runReferenceScan]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();

      if (key === "s") {
        event.preventDefault();
        if (!formValid) return;
        void handleSave();
        return;
      }

      if (key === "n") {
        event.preventDefault();
        handleAddNew();
        return;
      }

      if (key === "d") {
        event.preventDefault();
        if (!editingId) return;
        if (Object.keys(data).length === 0) return;
        handleDuplicate(data);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [data, editingId, formValid, handleAddNew, handleDuplicate, handleSave]);

  const handleToggleEditor = useCallback(() => {
    setShowEditor((v) => !v);
  }, []);

  if (!schema) return <p className="p-4">Loading schema...</p>;

  const handlePreviewImportCSV = async () => {
    if (!importFile) return;
    setImportPreviewLoading(true);
    const formData = new FormData();
    formData.append("file", importFile);
    try {
      const res = await apiFetch(`/api/import/csv/${schemaName}/preview`, {
        method: "POST",
        body: formData,
      });
      const payload = await readJsonSafe(res);
      if (res.ok && isRecord(payload)) {
        setImportPreview(payload as unknown as CsvImportPreview);
      } else {
        setImportPreview(null);
        setToast({ type: "error", message: asMessage(payload) || "Import preview failed" });
      }
    } finally {
      setImportPreviewLoading(false);
    }
  };

  // Import CSV handler.
  const handleImportCSV = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!importFile) return;
    if (!importPreview || importPreview.status !== "ok") {
      await handlePreviewImportCSV();
      return;
    }
    const formData = new FormData();
    formData.append("file", importFile);
    const res = await apiFetch(`/api/import/csv/${schemaName}`, {
      method: "POST",
      body: formData,
    });
    if (res.ok) {
      setToast({ type: "success", message: "Imported successfully" });
      await loadEntries();
    } else {
      const payload = await readJsonSafe(res);
      const detail = asMessage(payload);
      setToast({ type: "error", message: detail ? `Import failed: ${detail}` : "Import failed" });
    }
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    toastTimeout.current = setTimeout(() => setToast(null), 3000);
    setImportFile(null);
    setImportFileName("");
    setImportPreview(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files && e.target.files[0];
    setImportFile(file || null);
    setImportFileName(file ? file.name : "");
    setImportPreview(null);
  };

  return (
    <div className="flex h-full flex-col bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="p-6 pb-0">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Dataset</div>
            <h2 className="mt-1 truncate text-2xl font-semibold text-slate-950 dark:text-slate-100">{title}</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-2 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {sandboxEligible && (
            <Link
              to={sandboxQuery}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <BeakerIcon className="h-4 w-4" />
              Sandbox
            </Link>
          )}
          <a
            href={buildApiUrl(`/api/export/all-csv-zip`)}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-indigo-200 bg-indigo-50 px-3 text-sm font-medium text-indigo-700 hover:bg-indigo-100 dark:border-indigo-900 dark:bg-indigo-950 dark:text-indigo-200 dark:hover:bg-indigo-900"
            download
          >
            <ArchiveBoxArrowDownIcon className="h-4 w-4" />
            All ZIP
          </a>
          <a
            href={buildApiUrl(`/api/export/csv/${schemaName}`)}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 text-sm font-medium text-blue-700 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200 dark:hover:bg-blue-900"
            download
          >
            <ArrowDownTrayIcon className="h-4 w-4" />
            CSV
          </a>
          <form onSubmit={handleImportCSV} className="flex min-w-0 flex-wrap items-center gap-2 border-l border-slate-200 pl-2 dark:border-slate-700">
            <label
              htmlFor={`csvFile-${schemaName}`}
              className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <DocumentIcon className="h-4 w-4" />
              Choose CSV
              <input
                id={`csvFile-${schemaName}`}
                name="csvFile"
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileChange}
              />
            </label>
            <span
              className={`max-w-[180px] truncate rounded-md border px-2 py-1 text-xs ${
                importFileName
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
                  : `border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800 ${TEXT_CLASSES.muted}`
              }`}
              title={importFileName}
            >
              {importFileName || "No CSV selected"}
            </span>
            <button
              type="button"
              className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              disabled={!importFile || importPreviewLoading}
              onClick={() => {
                void handlePreviewImportCSV();
              }}
            >
              {importPreviewLoading ? "Previewing..." : "Preview"}
            </button>
            <button
              type="submit"
              className="inline-flex h-9 items-center gap-2 rounded-md bg-emerald-600 px-3 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
              disabled={!importFile || !importPreview || importPreview.status !== "ok"}
            >
              <ArrowUpTrayIcon className="h-4 w-4" />
              Confirm Import
            </button>
          </form>
          </div>
        </div>
      </div>
      {importPreview && (
        <div className={`mx-6 mt-4 rounded border px-4 py-3 text-sm ${importPreview.status === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200" : "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200"}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-semibold">
              Import preview: {importPreview.counts.added} added, {importPreview.counts.updated} updated, {importPreview.counts.deleted} deleted, {importPreview.counts.unchanged} unchanged
            </div>
            {importPreview.counts.deleted > 0 && <span className="rounded bg-red-100 px-2 py-1 text-xs font-semibold text-red-800 dark:bg-red-900 dark:text-red-100">Replace-all will delete {importPreview.counts.deleted}</span>}
          </div>
          {importPreview.errors.length > 0 && (
            <div className="mt-2 space-y-1">
              {importPreview.errors.slice(0, 5).map((error, index) => (
                <div key={index} className="text-xs">Row {error.row || "?"}: {error.message}</div>
              ))}
            </div>
          )}
          {importPreview.warnings.length > 0 && (
            <div className="mt-2 text-xs text-amber-800 dark:text-amber-200">
              {importPreview.warnings.slice(0, 3).map((warning) => `Row ${warning.row || "?"}: ${warning.message}`).join(" · ")}
            </div>
          )}
          {importPreview.changes.length > 0 && (
            <div className="mt-2 text-xs opacity-80">
              Showing {Math.min(importPreview.changes.length, 100)} sample changed row{importPreview.changes.length === 1 ? "" : "s"}.
            </div>
          )}
        </div>
      )}
      {entriesError && (
        <div className="mx-6 mt-4 rounded border border-red-200 bg-red-50 text-red-800 px-4 py-2 text-sm dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {entriesError}
        </div>
      )}
      <div className="flex flex-row gap-6 flex-1 min-h-0">
        <EntryListPanel
          schemaName={schemaName}
          entries={sortedEntries}
          listFields={listFields}
          idField={idField}
          editingId={editingId}
          onEdit={handleEdit}
          onDuplicate={handleDuplicate}
          onDelete={handleDelete}
          onAddNew={handleAddNew}
          search={search}
          setSearch={setSearch}
          searchField={searchField}
          setSearchField={setSearchField}
          fieldKeys={fieldKeys}
          onBulkDelete={handleBulkDelete}
          onBulkDuplicate={handleBulkDuplicate}
          onBulkEdit={handleBulkEdit}
          showEditor={showEditor}
          onToggleEditor={handleToggleEditor}
          recentEntries={recentEntries}
          onOpenRecentEntry={handleOpenRecentEntry}
        />
        {showEditor && (
          <EntryFormPanel
            schemaName={schemaName}
            schema={schema}
            data={data}
            onChange={setData}
            onSave={handleSave}
            onCancel={handleAddNew}
            formHeader={formHeader}
            formValid={formValid}
            setFormValid={setFormValid}
            isNew={isNew}
            referenceOptionsVersion={referenceOptionsVersion}
            parentSummary={parentSummary}
            isDirty={isDirty}
            entries={entries}
            relationshipSummary={relationshipSummary}
            referenceLoading={referenceLoading}
            referenceError={referenceError}
            onRefreshReferences={handleRefreshReferences}
            onOpenRelationshipEntry={handleOpenRelationshipEntry}
            onCreateBundleDrafts={handleCreateBundleDrafts}
            changedFieldKeys={changedFieldKeys}
          />
        )}
      </div>
      {/* DaisyUI modal for delete confirmation */}
      <dialog ref={confirmRef} className="modal">
        <form method="dialog" className="modal-box">
          <h3 className="font-bold text-lg">Confirm Delete</h3>
          <p className="py-4">Are you sure you want to delete this entry?</p>
          <div className="modal-action">
            <button
              type="button"
              className={`${BUTTON_CLASSES.danger} ${BUTTON_SIZES.sm}`}
              onClick={confirmDeleteAction}
            >
              Delete
            </button>
            <button type="button" className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.sm}`} onClick={cancelDelete}>
              Cancel
            </button>
          </div>
        </form>
      </dialog>
      {toast && (
        <div className="toast toast-top toast-end z-50 fixed right-4 top-4">
          <div className={`alert ${toast.type === "success" ? "alert-success" : "alert-error"} shadow-lg`}>
            <span>{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}
