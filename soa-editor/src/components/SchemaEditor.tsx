// soa-editor/src/components/SchemaEditor.tsx
// This file acts as a template for the other pages
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import EntryListPanel from "./EntryListPanel";
import EntryFormPanel from "./EntryFormPanel";
import { generateUlid, generateSlug } from "../utils/generateId";
import { type ParentSummary } from "./EditorStackContext";
import { apiFetch, buildApiUrl } from "../lib/api";
import { BUTTON_CLASSES, BUTTON_SIZES, TEXT_CLASSES } from "../styles/uiTokens";
import useDebouncedValue from "./hooks/useDebouncedValue";
import { isSimulationSchemaName } from "../simulation";
import { useDirtyState } from "./useDirtyState";
import { EDITOR_DATASETS, findDatasetBySchema } from "../config/editorDatasets";
import type { EntryRecord, RecentEntry, ReferenceHit, ReferenceSummary } from "../types/editorQol";

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

function isPrimitiveReferenceMatch(value: unknown, targetId: string): boolean {
  return typeof value === "string" && value === targetId;
}

function collectReferencePaths(
  value: unknown,
  targetId: string,
  currentPath: string,
  paths: string[],
  seen: WeakSet<object>,
  maxPaths: number
) {
  if (paths.length >= maxPaths) return;
  if (isPrimitiveReferenceMatch(value, targetId)) {
    paths.push(currentPath);
    return;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      if (paths.length >= maxPaths) return;
      collectReferencePaths(value[i], targetId, `${currentPath}[${i}]`, paths, seen, maxPaths);
    }
    return;
  }
  if (!isRecord(value)) return;
  if (seen.has(value)) return;
  seen.add(value);
  for (const [key, nested] of Object.entries(value)) {
    if (paths.length >= maxPaths) return;
    const nextPath = currentPath ? `${currentPath}.${key}` : key;
    collectReferencePaths(nested, targetId, nextPath, paths, seen, maxPaths);
  }
}

export default function SchemaEditor({
  schemaName,
  title,
  apiPath,
  idField = "id",
}: SchemaEditorProps) {
  const [schema, setSchema] = useState<SchemaDefinition | null>(null);
  const [data, setData] = useState<EntryRecord>({});
  const [entries, setEntries] = useState<EntryRecord[]>([]);
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
  const [originalData, setOriginalData] = useState<EntryRecord>({});
  const [isDirty, setIsDirty] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [showEditor, setShowEditor] = useState(true);
  const [recentEntries, setRecentEntries] = useState<RecentEntry[]>([]);
  const [referenceSummary, setReferenceSummary] = useState<ReferenceSummary | null>(null);
  const [referenceLoading, setReferenceLoading] = useState(false);
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const confirmDelete = useRef<EntryRecord | null>(null);
  const originalSerializedRef = useRef("{}");
  const dirtySourceId = useRef(`schema-editor-${generateUlid()}`);
  const pendingWorkspaceSelectionRef = useRef<string | null>(null);
  const referenceCacheRef = useRef<Map<string, ReferenceSummary>>(new Map());
  const debouncedSearch = useDebouncedValue(search, 120);
  const debouncedData = useDebouncedValue(data, 200);
  const debouncedDraftData = useDebouncedValue(data, 1200);
  const { setDirty, confirmNavigate } = useDirtyState();

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
    try {
      const res = await apiFetch(`/api/${apiPath}`);
      const payload = await readJsonSafe(res);
      if (!Array.isArray(payload)) {
        setEntries([]);
        const msg = asMessage(payload) || "API did not return a list.";
        setEntriesError(`Entries load failed: ${msg}`);
        return;
      }
      setEntries(toEntryArray(payload));
      setEntriesError(null);
    } catch (err) {
      setEntries([]);
      setEntriesError(`Entries load failed: ${errorMessage(err, "Unknown error")}`);
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
    setReferenceSummary(null);
    setReferenceError(null);
    setReferenceLoading(false);
  }, [schemaName]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

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
    } else {
      const payload = await readJsonSafe(res);
      const msg = asMessage(payload) ? `Save failed: ${asMessage(payload)}` : "Save failed";
      setToast({ type: "error", message: msg });
    }

    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    toastTimeout.current = setTimeout(() => setToast(null), 3000);
  }, [apiPath, data, entries, getEntryId, loadEntries, originalData, rememberRecentEntry, schemaName]);

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
    const pendingSelectionId = pendingWorkspaceSelectionRef.current;
    if (!pendingSelectionId) return;
    const matchingEntry = entries.find((entry) => getEntryId(entry) === pendingSelectionId);
    pendingWorkspaceSelectionRef.current = null;
    if (matchingEntry) {
      handleEdit(matchingEntry);
    }
  }, [entries, getEntryId, handleEdit]);

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
        setReferenceSummary(null);
        setReferenceError(null);
        setReferenceLoading(false);
        return;
      }

      const cached = referenceCacheRef.current.get(targetId);
      if (cached && !forceRefresh) {
        setReferenceSummary(cached);
        setReferenceError(null);
        setReferenceLoading(false);
        return;
      }

      setReferenceLoading(true);
      setReferenceError(null);

      try {
        const datasets = await Promise.all(
          EDITOR_DATASETS.map(async (dataset) => {
            try {
              const res = await apiFetch(`/api/${dataset.apiPath}`);
              const payload = await readJsonSafe(res);
              return {
                dataset,
                payload: Array.isArray(payload) ? payload : [],
              };
            } catch {
              return {
                dataset,
                payload: [] as unknown[],
              };
            }
          })
        );

        const hits: ReferenceHit[] = [];

        for (const { dataset, payload } of datasets) {
          for (let index = 0; index < payload.length; index += 1) {
            const raw = payload[index];
            if (!isRecord(raw)) continue;
            const sourceId = typeof raw.id === "string" ? raw.id : "";
            if (!sourceId) continue;
            if (dataset.schemaName === schemaName && sourceId === targetId) continue;

            const paths: string[] = [];
            collectReferencePaths(raw, targetId, "$", paths, new WeakSet<object>(), 8);
            if (paths.length === 0) continue;

            hits.push({
              schemaName: dataset.schemaName,
              routePath: dataset.routePath,
              apiPath: dataset.apiPath,
              schemaLabel: dataset.label,
              sourceId,
              sourceLabel: getEntryLabel(raw),
              paths,
            });
          }
        }

        const groupedMap = new Map<string, ReferenceHit[]>();
        for (const hit of hits) {
          const group = groupedMap.get(hit.schemaName) || [];
          group.push(hit);
          groupedMap.set(hit.schemaName, group);
        }

        const groups = Array.from(groupedMap.entries())
          .map(([groupSchemaName, groupHits]) => {
            const dataset = findDatasetBySchema(groupSchemaName);
            return {
              schemaName: groupSchemaName,
              schemaLabel: dataset?.label || groupSchemaName,
              routePath: dataset?.routePath || "",
              count: groupHits.length,
              hits: groupHits.sort((a, b) => a.sourceLabel.localeCompare(b.sourceLabel)),
            };
          })
          .sort((a, b) => b.count - a.count);

        const summary: ReferenceSummary = {
          targetId,
          total: hits.length,
          scannedAt: Date.now(),
          groups,
        };

        referenceCacheRef.current.set(targetId, summary);
        setReferenceSummary(summary);
      } catch (err) {
        setReferenceError(`Reference scan failed: ${errorMessage(err, "Unknown error")}`);
      } finally {
        setReferenceLoading(false);
      }
    },
    [getEntryLabel, schemaName]
  );

  const handleOpenRecentEntry = useCallback(
    (entryId: string) => {
      const match = entries.find((entry) => getEntryId(entry) === entryId);
      if (match) handleEdit(match);
    },
    [entries, getEntryId, handleEdit]
  );

  const handleOpenReferenceHit = useCallback(
    (hit: ReferenceHit) => {
      if (hit.schemaName === schemaName) {
        const localMatch = entries.find((entry) => getEntryId(entry) === hit.sourceId);
        if (localMatch) handleEdit(localMatch);
        return;
      }

      const targetWorkspaceKey = `soa.workspace.${hit.schemaName}`;
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
      nextWorkspace.selectedEntryId = hit.sourceId;
      localStorage.setItem(targetWorkspaceKey, JSON.stringify(nextWorkspace));
      window.location.assign(`/${hit.routePath}`);
    },
    [entries, getEntryId, handleEdit, schemaName]
  );

  const handleRefreshReferences = useCallback(() => {
    const targetId = getEntryId(data);
    if (!targetId) {
      setReferenceSummary(null);
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
      setReferenceSummary(null);
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

  // Import CSV handler.
  const handleImportCSV = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!importFile) return;
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
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files && e.target.files[0];
    setImportFile(file || null);
    setImportFileName(file ? file.name : "");
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-6 pb-0">
        <h2 className="text-2xl font-bold text-slate-900">{title}</h2>
        <div className="flex gap-2 items-center">
          {sandboxEligible && (
            <Link to={sandboxQuery} className={`${BUTTON_CLASSES.neutral} ${BUTTON_SIZES.sm}`}>
              Open Sandbox
            </Link>
          )}
          <a
            href={buildApiUrl(`/api/export/all-csv-zip`)}
            className={`${BUTTON_CLASSES.indigo} ${BUTTON_SIZES.sm}`}
            download
          >
            Download All (ZIP)
          </a>
          <a
            href={buildApiUrl(`/api/export/csv/${schemaName}`)}
            className={`${BUTTON_CLASSES.primary} ${BUTTON_SIZES.sm}`}
            download
          >
            Download CSV
          </a>
          <form onSubmit={handleImportCSV} className="flex items-center gap-2">
            <label htmlFor="csvFile" className={`${BUTTON_CLASSES.secondary} ${BUTTON_SIZES.xs} cursor-pointer`}>
              Choose CSV
              <input
                id="csvFile"
                name="csvFile"
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileChange}
              />
            </label>
            <span className={`text-xs min-w-[80px] truncate ${TEXT_CLASSES.muted}`} title={importFileName}>
              {importFileName || "No file chosen"}
            </span>
            <button type="submit" className={`${BUTTON_CLASSES.success} ${BUTTON_SIZES.sm}`} disabled={!importFile}>
              Import CSV
            </button>
          </form>
        </div>
      </div>
      {entriesError && (
        <div className="mx-6 mt-4 rounded border border-red-200 bg-red-50 text-red-800 px-4 py-2 text-sm">
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
            referenceSummary={referenceSummary}
            referenceLoading={referenceLoading}
            referenceError={referenceError}
            onRefreshReferences={handleRefreshReferences}
            onOpenReferenceHit={handleOpenReferenceHit}
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
