// soa-editor/src/components/SchemaEditor.tsx
// This file acts as a template for the other pages
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import EntryListPanel from "./EntryListPanel";
import EntryFormPanel from "./EntryFormPanel";
import { generateUlid, generateSlug } from "../utils/generateId";
import { ParentSummary } from "./EditorStackContext";
import { apiFetch, buildApiUrl } from "../lib/api";
import { BUTTON_CLASSES, BUTTON_SIZES, TEXT_CLASSES } from "../styles/uiTokens";
import useDebouncedValue from "./hooks/useDebouncedValue";
import { isSimulationSchemaName } from "../simulation";

interface SchemaEditorProps {
  schemaName: string;
  title: string;
  apiPath: string;
  idField?: string;
}

export default function SchemaEditor({ schemaName, title, apiPath, idField = "id" }: SchemaEditorProps) {
  const [schema, setSchema] = useState<any | null>(null);
  const [data, setData] = useState<any>({});
  const [entries, setEntries] = useState<any[]>([]);
  const [entriesError, setEntriesError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [formValid, setFormValid] = useState(true);
  const [referenceOptionsVersion, setReferenceOptionsVersion] = useState(0);
  const [toast, setToast] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirmRef = useRef<HTMLDialogElement>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importFileName, setImportFileName] = useState<string>("");
  const [originalData, setOriginalData] = useState<any>({});
  const [isDirty, setIsDirty] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [showEditor, setShowEditor] = useState(true);
  const confirmDelete = useRef<any>(null);
  const originalSerializedRef = useRef("{}");
  const debouncedSearch = useDebouncedValue(search, 120);
  const debouncedData = useDebouncedValue(data, 200);
  const debouncedDraftData = useDebouncedValue(data, 1200);
  const parentSummary: ParentSummary = {
    title: title.replace(/ Editor$/, ''),
    data,
  };
  const sandboxEligible = isSimulationSchemaName(schemaName);
  const selectedEntityIdForSandbox = typeof data?.[idField] === "string" ? data[idField] : "";
  const sandboxQuery = selectedEntityIdForSandbox
    ? `/simulation?schema=${schemaName}&id=${encodeURIComponent(selectedEntityIdForSandbox)}`
    : `/simulation?schema=${schemaName}`;

  useEffect(() => {
    // Load the JSON schema definition for the current editor page.
    import(`../../../backend/app/schemas/${schemaName}.json`).then(setSchema);
  }, [schemaName]);

  useEffect(() => {
    // Load current entries from the API endpoint backing this schema.
    apiFetch(`/api/${apiPath}`)
      .then((res) => res.json())
      .then((result) => {
        if (!Array.isArray(result)) {
          console.warn("API did not return an array for entries:", result);
          setEntries([]);
          const msg = result?.message || result?.error || "API did not return a list.";
          setEntriesError(`Entries load failed: ${msg}`);
        } else {
          setEntries(result);
          setEntriesError(null);
        }
      })
      .catch((err) => {
        console.error("Failed to load entries:", err);
        setEntries([]);
        setEntriesError(`Entries load failed: ${err?.message || "Unknown error"}`);
      });
  }, [apiPath]);

  const handleSave = useCallback(async () => {
    // Prevent accidental overwrites when the ID already exists.
    if (idField && data[idField]) {
      const existing = entries.find((entry) => entry[idField] === data[idField]);
      // If editing (ID matches current data), allow overwrite with confirmation
      if (existing && existing !== data) {
        if (!window.confirm(`An entry with ID '${data[idField]}' already exists. Overwrite?`)) {
          return;
        }
      }
    }
    console.log("Saving data:", data);
    const res = await apiFetch(`/api/${apiPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });
    

    if (res.ok) {
      setToast({ type: 'success', message: 'Saved successfully' });
      const updated = await apiFetch(`/api/${apiPath}`).then((r) => r.json());
      setEntries(updated);
      setReferenceOptionsVersion((v) => v + 1); // Trigger referenceOptions refresh in SchemaForm
      setOriginalData(data);
      setIsDirty(false);
      originalSerializedRef.current = JSON.stringify(data || {});
      const draftKey = `soa.draft.${schemaName}.${data?.[idField] || 'new'}`;
      const lastKey = `soa.draft.last.${schemaName}`;
      localStorage.removeItem(draftKey);
      if (localStorage.getItem(lastKey) === draftKey) {
        localStorage.removeItem(lastKey);
      }
    } else {
      let msg = 'Save failed';
      try {
        const err = await res.json();
        if (err && err.message) msg += `: ${err.message}`;
      } catch {}
      setToast({ type: 'error', message: msg });
    }
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    toastTimeout.current = setTimeout(() => setToast(null), 3000);
  }, [apiPath, data, entries, idField, schemaName]);

  // Get all field names from schema for table columns.
  const fieldKeys = useMemo(() => (schema ? Object.keys(schema.properties || {}) : []), [schema]);

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
    if (!schema) return [];
    let resolvedFields = Object.entries(schema.properties || {})
      .filter(([_, config]: any) => config.ui && config.ui.list_display)
      .map(([key]) => key);
    resolvedFields = dedupeFields(resolvedFields);
    // Fallback: if none marked, use id/slug/name/title etc. if present
    if (resolvedFields.length === 0) {
      const candidates = [idField, 'slug', 'name', 'title', 'type', 'role', 'value_type', 'created_at', 'default_value'];
      resolvedFields = candidates.filter(f => f && fieldKeys.includes(f as string)) as string[];
      resolvedFields = dedupeFields(resolvedFields);
      if (resolvedFields.length === 0) resolvedFields = fieldKeys.slice(0, 3); // fallback to first 3 fields
    }
    return resolvedFields;
  }, [schema, dedupeFields, idField, fieldKeys]);

  // Track which entry is being edited (by id).
  const editingId = data && data[idField] ? data[idField] : null;

  const confirmDiscard = useCallback(() => {
    if (!isDirty) return true;
    return window.confirm('You have unsaved changes. Discard them?');
  }, [isDirty]);

  // Add New handler.
  const handleAddNew = useCallback(() => {
    if (!confirmDiscard()) return;
    const newData = { id: generateUlid() };
    setData(newData);
    setOriginalData(newData);
    originalSerializedRef.current = JSON.stringify(newData);
    setIsDirty(false);
    setShowEditor(true);
  }, [confirmDiscard]);
  // Duplicate handler.
  const handleDuplicate = useCallback((entry: any) => {
    if (!confirmDiscard()) return;
    const copy = { ...entry };
    if (idField) copy[idField] = generateUlid();
    // Keep slug; if conflict, append suffix (-copy, -copy-2, ...). If missing, derive from name.
    const existingSlugs = new Set((entries || []).map((e) => e?.slug).filter(Boolean));
    const baseSlug = (copy.slug && String(copy.slug)) || (copy.name ? generateSlug(copy.name) : "");
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
      (copy as any).slug = newSlug;
    }
    setData(copy);
    setOriginalData(copy);
    originalSerializedRef.current = JSON.stringify(copy);
    setIsDirty(false);
    setShowEditor(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [confirmDiscard, idField, entries]);

  // Edit entry handler.
  const handleEdit = useCallback((entry: any) => {
    if (!confirmDiscard()) return;
    const draftKey = `soa.draft.${schemaName}.${entry?.[idField] || 'new'}`;
    const draftRaw = localStorage.getItem(draftKey);
    if (draftRaw) {
      try {
        const parsed = JSON.parse(draftRaw);
        if (parsed?.data) {
          setData(parsed.data);
          setOriginalData(parsed.data);
          originalSerializedRef.current = JSON.stringify(parsed.data || {});
          setIsDirty(false);
          setDraftRestored(true);
          setShowEditor(true);
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }
      } catch {}
    }
    setData(entry);
    setOriginalData(entry);
    originalSerializedRef.current = JSON.stringify(entry || {});
    setIsDirty(false);
    setShowEditor(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [confirmDiscard, schemaName, idField]);

  // Delete entry handler.
  const handleDelete = useCallback((entry: any) => {
    confirmDelete.current = entry;
    setTimeout(() => confirmRef.current?.showModal(), 0);
  }, []);
  const confirmDeleteAction = useCallback(async () => {
    const entry = confirmDelete.current;
    if (!entry) return;
    confirmRef.current?.close();
    confirmDelete.current = null;
    const res = await apiFetch(`/api/${apiPath}/${entry[idField]}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      setEntries((prev) => prev.filter((e) => e[idField] !== entry[idField]));
      setData((prev: any) => (prev?.[idField] === entry[idField] ? {} : prev));
      setToast({ type: 'success', message: 'Deleted successfully' });
    } else {
      let msg = 'Delete failed';
      try {
        const err = await res.json();
        if (err && err.message) msg += `: ${err.message}`;
      } catch {}
      setToast({ type: 'error', message: msg });
    }
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    toastTimeout.current = setTimeout(() => setToast(null), 3000);
  }, [apiPath, idField]);
  const cancelDelete = useCallback(() => {
    confirmRef.current?.close();
    confirmDelete.current = null;
  }, []);

  const buildDuplicate = useCallback((entry: any, usedSlugs: Set<string>) => {
    const copy = { ...entry };
    if (idField) copy[idField] = generateUlid();
    const baseSlug = (copy.slug && String(copy.slug)) || (copy.name ? generateSlug(copy.name) : "");
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
  }, [idField]);

  const handleBulkDelete = useCallback(async (selected: any[]) => {
    if (selected.length === 0) return;
    if (!window.confirm(`Delete ${selected.length} entries? This cannot be undone.`)) return;
    await Promise.all(
      selected.map((entry) =>
        apiFetch(`/api/${apiPath}/${entry[idField]}`, { method: 'DELETE' })
      )
    );
    const updated = await apiFetch(`/api/${apiPath}`).then((r) => r.json());
    setEntries(updated);
    setData((prev: any) => (selected.some((e) => e[idField] === prev?.[idField]) ? {} : prev));
  }, [apiPath, idField]);

  const coerceValue = useCallback((template: any, value: string) => {
    if (value === "__null__") return null;
    if (typeof template === 'number') {
      const num = parseFloat(value);
      return Number.isNaN(num) ? template : num;
    }
    if (typeof template === 'boolean') {
      if (value.toLowerCase() === 'true') return true;
      if (value.toLowerCase() === 'false') return false;
      return template;
    }
    if (Array.isArray(template)) {
      return value.split(',').map((v) => v.trim()).filter(Boolean);
    }
    if (template === undefined) {
      const num = parseFloat(value);
      if (!Number.isNaN(num)) return num;
    }
    return value;
  }, []);

  const handleBulkEdit = useCallback(async (selected: any[], field: string, value: string) => {
    if (selected.length === 0) return;
    if (!field) return;
    if (!window.confirm(`Apply "${field}" to ${selected.length} entries?`)) return;
    const results = await Promise.all(
      selected.map((entry) => {
        const updated = { ...entry, [field]: coerceValue(entry[field], value) };
        return apiFetch(`/api/${apiPath}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updated),
        });
      })
    );
    const failed = results.filter((r) => !r.ok);
    if (failed.length > 0) {
      let msg = `${failed.length} updates failed`;
      try {
        const err = await failed[0].json();
        if (err?.message) msg += `: ${err.message}`;
      } catch {}
      setToast({ type: 'error', message: msg });
    } else {
      setToast({ type: 'success', message: `Updated ${selected.length} entries` });
    }
    const updated = await apiFetch(`/api/${apiPath}`).then((r) => r.json());
    setEntries(updated);
  }, [apiPath, coerceValue]);

  const handleBulkDuplicate = useCallback(async (selected: any[]) => {
    if (selected.length === 0) return;
    const usedSlugs = new Set((entries || []).map((e) => e?.slug).filter(Boolean));
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
    const updated = await apiFetch(`/api/${apiPath}`).then((r) => r.json());
    setEntries(updated);
    setReferenceOptionsVersion((v) => v + 1);
  }, [entries, buildDuplicate, apiPath]);

  // Field selection for search.
  const [searchField, setSearchField] = useState<string>("__all__");

  // Filtered and sorted entries.
  const safeEntries = useMemo(() => (Array.isArray(entries) ? entries : []), [entries]);
  const filteredEntries = useMemo(() => safeEntries.filter((entry) => {
    if (!debouncedSearch.trim()) return true;
    const searchLower = debouncedSearch.toLowerCase();
    if (searchField === "__all__") {
      return fieldKeys.some((key: string) => {
        const val = entry[key];
        if (Array.isArray(val)) {
          return val.some((v) => String(v ?? "").toLowerCase().includes(searchLower));
        }
        return String(val ?? "").toLowerCase().includes(searchLower);
      });
    }
    const val = entry[searchField];
    if (Array.isArray(val)) {
      return val.some((v) => String(v ?? "").toLowerCase().includes(searchLower));
    }
    return String(val ?? "").toLowerCase().includes(searchLower);
  }), [safeEntries, debouncedSearch, searchField, fieldKeys]);

  // Sort alphabetically by name, fallback to id.
  const sortedEntries = useMemo(() => [...filteredEntries].sort((a, b) => {
    const aName = (a.name || a[idField] || "").toLowerCase();
    const bName = (b.name || b[idField] || "").toLowerCase();
    return aName.localeCompare(bName);
  }), [filteredEntries, idField]);

  // Determine if creating new entry.
  const isNew = !editingId;
  const formHeader = isNew ? `New ${title.replace(/ Editor$/, '')}` : `Edit ${title.replace(/ Editor$/, '')}`;

  useEffect(() => {
    originalSerializedRef.current = JSON.stringify(originalData || {});
  }, [originalData]);

  useEffect(() => {
    if (!debouncedData || Object.keys(debouncedData).length === 0) {
      setIsDirty(false);
      return;
    }
    setIsDirty(JSON.stringify(debouncedData || {}) !== originalSerializedRef.current);
  }, [debouncedData]);

  useEffect(() => {
    if (!debouncedDraftData || Object.keys(debouncedDraftData).length === 0) return;
    if (!isDirty) return;
    const draftKey = `soa.draft.${schemaName}.${debouncedDraftData?.[idField] || 'new'}`;
    const lastKey = `soa.draft.last.${schemaName}`;
    localStorage.setItem(draftKey, JSON.stringify({ data: debouncedDraftData, ts: Date.now() }));
    localStorage.setItem(lastKey, draftKey);
  }, [debouncedDraftData, idField, isDirty, schemaName]);

  useEffect(() => {
    if (draftRestored) return;
    if (data && Object.keys(data).length > 0) return;
    const lastKey = `soa.draft.last.${schemaName}`;
    const draftKey = localStorage.getItem(lastKey);
    if (!draftKey) return;
    const raw = localStorage.getItem(draftKey);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.data) {
        setData(parsed.data);
        setOriginalData(parsed.data);
        originalSerializedRef.current = JSON.stringify(parsed.data || {});
        setIsDirty(false);
        setDraftRestored(true);
      }
    } catch {}
  }, [schemaName, data, draftRestored]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  useEffect(() => {
    (window as any).__soaDirty = isDirty;
  }, [isDirty]);

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
      // Refresh entries
      const updated = await apiFetch(`/api/${apiPath}`).then((r) => r.json());
      setEntries(updated);
    } else {
      let msg = "Import failed";
      try {
        const err = await res.json();
        if (err && err.error) msg += `: ${err.error}`;
      } catch {}
      setToast({ type: "error", message: msg });
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

  const handleToggleEditor = useCallback(() => {
    setShowEditor((v) => !v);
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-6 pb-0">
        <h2 className="text-2xl font-bold text-slate-900">{title}</h2>
        <div className="flex gap-2 items-center">
          {sandboxEligible && (
            <Link
              to={sandboxQuery}
              className={`${BUTTON_CLASSES.neutral} ${BUTTON_SIZES.sm}`}
            >
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
            <span className={`text-xs min-w-[80px] truncate ${TEXT_CLASSES.muted}`} title={importFileName}>{importFileName || "No file chosen"}</span>
            <button
              type="submit"
              className={`${BUTTON_CLASSES.success} ${BUTTON_SIZES.sm}`}
              disabled={!importFile}
            >
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
          />
        )}
      </div>
      {/* DaisyUI modal for delete confirmation */}
      <dialog ref={confirmRef} className="modal">
        <form method="dialog" className="modal-box">
          <h3 className="font-bold text-lg">Confirm Delete</h3>
          <p className="py-4">Are you sure you want to delete this entry?</p>
          <div className="modal-action">
            <button type="button" className={`${BUTTON_CLASSES.danger} ${BUTTON_SIZES.sm}`} onClick={confirmDeleteAction}>Delete</button>
            <button type="button" className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.sm}`} onClick={cancelDelete}>Cancel</button>
          </div>
        </form>
      </dialog>
      {toast && (
        <div className={`toast toast-top toast-end z-50 fixed right-4 top-4`}>
          <div className={`alert ${toast.type === 'success' ? 'alert-success' : 'alert-error'} shadow-lg`}>
            <span>{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}
