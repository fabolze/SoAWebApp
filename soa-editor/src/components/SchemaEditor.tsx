// soa-editor/src/components/SchemaEditor.tsx
// This file acts as a template for the other pages
import { useState, useEffect, useMemo } from "react";
import { useRef } from "react";
import EntryListPanel from "./EntryListPanel";
import EntryFormPanel from "./EntryFormPanel";
import { generateUlid, generateSlug } from "../utils/generateId";
import { ParentSummary } from "./EditorStackContext";

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
  const parentSummary: ParentSummary = {
    title: title.replace(/ Editor$/, ''),
    data,
  };

  useEffect(() => {
    // Load the JSON schema definition for the current editor page.
    import(`../../../backend/app/schemas/${schemaName}.json`).then(setSchema);
  }, [schemaName]);

  useEffect(() => {
    // Load current entries from the API endpoint backing this schema.
    fetch(`http://localhost:5000/api/${apiPath}`)
      .then((res) => res.json())
      .then((result) => {
        if (!Array.isArray(result)) {
          console.warn("API did not return an array for entries:", result);
          setEntries([]);
        } else {
          setEntries(result);
        }
      });
  }, [apiPath]);

  const handleSave = async () => {
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
    const res = await fetch(`http://localhost:5000/api/${apiPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });
    

    if (res.ok) {
      setToast({ type: 'success', message: 'Saved successfully' });
      const updated = await fetch(`http://localhost:5000/api/${apiPath}`).then((r) => r.json());
      setEntries(updated);
      setReferenceOptionsVersion((v) => v + 1); // Trigger referenceOptions refresh in SchemaForm
      setOriginalData(data);
      setIsDirty(false);
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
  };

  // Get all field names from schema for table columns.
  const fieldKeys = schema ? Object.keys(schema.properties || {}) : [];

  // Determine which fields to display in the table list view.
  let listFields: string[] = [];
  const dedupeFields = (fields: string[]) => {
    // Avoid duplicated columns when idField matches a fallback candidate.
    const seen = new Set<string>();
    return fields.filter((field) => {
      if (seen.has(field)) return false;
      seen.add(field);
      return true;
    });
  };
  if (schema) {
    listFields = Object.entries(schema.properties || {})
      .filter(([_, config]: any) => config.ui && config.ui.list_display)
      .map(([key]) => key);
    listFields = dedupeFields(listFields);
    // Fallback: if none marked, use id/slug/name/title etc. if present
    if (listFields.length === 0) {
      const candidates = [idField, 'slug', 'name', 'title', 'type', 'role', 'value_type', 'created_at', 'default_value'];
      listFields = candidates.filter(f => f && fieldKeys.includes(f as string)) as string[];
      listFields = dedupeFields(listFields);
      if (listFields.length === 0) listFields = fieldKeys.slice(0, 3); // fallback to first 3 fields
    }
  }

  // Track which entry is being edited (by id).
  const editingId = data && data[idField] ? data[idField] : null;

  const confirmDiscard = () => {
    if (!isDirty) return true;
    return window.confirm('You have unsaved changes. Discard them?');
  };

  // Add New handler.
  const handleAddNew = () => {
    if (!confirmDiscard()) return;
    const newData = { id: generateUlid() };
    setData(newData);
    setOriginalData(newData);
    setShowEditor(true);
  };
  // Duplicate handler.
  const handleDuplicate = (entry: any) => {
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
    setShowEditor(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Edit entry handler.
  const handleEdit = (entry: any) => {
    if (!confirmDiscard()) return;
    const draftKey = `soa.draft.${schemaName}.${entry?.[idField] || 'new'}`;
    const draftRaw = localStorage.getItem(draftKey);
    if (draftRaw) {
      try {
        const parsed = JSON.parse(draftRaw);
        if (parsed?.data) {
          setData(parsed.data);
          setOriginalData(parsed.data);
          setDraftRestored(true);
          setShowEditor(true);
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }
      } catch {}
    }
    setData(entry);
    setOriginalData(entry);
    setShowEditor(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Delete entry handler.
  const confirmDelete = useRef<any>(null);
  const handleDelete = (entry: any) => {
    confirmDelete.current = entry;
    setTimeout(() => confirmRef.current?.showModal(), 0);
  };
  const confirmDeleteAction = async () => {
    const entry = confirmDelete.current;
    if (!entry) return;
    confirmRef.current?.close();
    confirmDelete.current = null;
    const res = await fetch(`http://localhost:5000/api/${apiPath}/${entry[idField]}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      setEntries(entries.filter((e) => e[idField] !== entry[idField]));
      if (data[idField] === entry[idField]) setData({});
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
  };
  const cancelDelete = () => {
    confirmRef.current?.close();
    confirmDelete.current = null;
  };

  const buildDuplicate = (entry: any, usedSlugs: Set<string>) => {
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
  };

  const handleBulkDelete = async (selected: any[]) => {
    if (selected.length === 0) return;
    if (!window.confirm(`Delete ${selected.length} entries? This cannot be undone.`)) return;
    await Promise.all(
      selected.map((entry) =>
        fetch(`http://localhost:5000/api/${apiPath}/${entry[idField]}`, { method: 'DELETE' })
      )
    );
    const updated = await fetch(`http://localhost:5000/api/${apiPath}`).then((r) => r.json());
    setEntries(updated);
    if (selected.some((e) => e[idField] === data[idField])) setData({});
  };

  const coerceValue = (template: any, value: string) => {
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
    return value;
  };

  const handleBulkEdit = async (selected: any[], field: string, value: string) => {
    if (selected.length === 0) return;
    if (!field) return;
    if (!window.confirm(`Apply "${field}" to ${selected.length} entries?`)) return;
    await Promise.all(
      selected.map((entry) => {
        const updated = { ...entry, [field]: coerceValue(entry[field], value) };
        return fetch(`http://localhost:5000/api/${apiPath}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updated),
        });
      })
    );
    const updated = await fetch(`http://localhost:5000/api/${apiPath}`).then((r) => r.json());
    setEntries(updated);
  };

  const handleBulkDuplicate = async (selected: any[]) => {
    if (selected.length === 0) return;
    const usedSlugs = new Set((entries || []).map((e) => e?.slug).filter(Boolean));
    const duplicates = selected.map((entry) => buildDuplicate(entry, usedSlugs));
    await Promise.all(
      duplicates.map((copy) =>
        fetch(`http://localhost:5000/api/${apiPath}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(copy),
        })
      )
    );
    const updated = await fetch(`http://localhost:5000/api/${apiPath}`).then((r) => r.json());
    setEntries(updated);
    setReferenceOptionsVersion((v) => v + 1);
  };

  // Field selection for search.
  const [searchField, setSearchField] = useState<string>("__all__");

  // Filtered and sorted entries.
  const filteredEntries = entries.filter((entry) => {
    if (!search.trim()) return true;
    const searchLower = search.toLowerCase();
    if (searchField === "__all__") {
      return fieldKeys.some((key: string) => {
        const val = entry[key];
        if (Array.isArray(val)) {
          return val.some((v) => String(v ?? "").toLowerCase().includes(searchLower));
        }
        return String(val ?? "").toLowerCase().includes(searchLower);
      });
    } else {
      const val = entry[searchField];
      if (Array.isArray(val)) {
        return val.some((v) => String(v ?? "").toLowerCase().includes(searchLower));
      }
      return String(val ?? "").toLowerCase().includes(searchLower);
    }
  });
  // Sort alphabetically by name, fallback to id.
  const sortedEntries = [...filteredEntries].sort((a, b) => {
    const aName = (a.name || a[idField] || "").toLowerCase();
    const bName = (b.name || b[idField] || "").toLowerCase();
    return aName.localeCompare(bName);
  });

  // Determine if creating new entry.
  const isNew = !editingId;
  const formHeader = isNew ? `New ${title.replace(/ Editor$/, '')}` : `Edit ${title.replace(/ Editor$/, '')}`;

  const stableStringify = (value: any): string => {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  };

  const dirty = useMemo(() => {
    return stableStringify(data) !== stableStringify(originalData);
  }, [data, originalData]);

  useEffect(() => {
    setIsDirty(dirty);
  }, [dirty]);

  useEffect(() => {
    if (!data || Object.keys(data).length === 0) return;
    if (!dirty) return;
    const draftKey = `soa.draft.${schemaName}.${data?.[idField] || 'new'}`;
    const lastKey = `soa.draft.last.${schemaName}`;
    const handle = setTimeout(() => {
      localStorage.setItem(draftKey, JSON.stringify({ data, ts: Date.now() }));
      localStorage.setItem(lastKey, draftKey);
    }, 600);
    return () => clearTimeout(handle);
  }, [data, dirty, idField, schemaName]);

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
    const res = await fetch(`http://localhost:5000/api/import/csv/${schemaName}`, {
      method: "POST",
      body: formData,
    });
    if (res.ok) {
      setToast({ type: "success", message: "Imported successfully" });
      // Refresh entries
      const updated = await fetch(`http://localhost:5000/api/${apiPath}`).then((r) => r.json());
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

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-6 pb-0">
        <h2 className="text-2xl font-bold text-slate-900">{title}</h2>
        <div className="flex gap-2 items-center">
          <a
            href={`http://localhost:5000/api/export/all-csv-zip`}
            className="bg-indigo-600 text-white px-3 py-1 rounded hover:bg-indigo-700"
            download
          >
            Download All (ZIP)
          </a>
          <a
            href={`http://localhost:5000/api/export/csv/${schemaName}`}
            className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
            download
          >
            Download CSV
          </a>
          <form onSubmit={handleImportCSV} className="flex items-center gap-2">
            <label htmlFor="csvFile" className="bg-gray-200 px-2 py-1 rounded cursor-pointer border border-gray-300 hover:bg-gray-300">
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
            <span className="text-xs text-gray-700 min-w-[80px] truncate" title={importFileName}>{importFileName || "No file chosen"}</span>
            <button
              type="submit"
              className={`bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700 ${!importFile ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={!importFile}
            >
              Import CSV
            </button>
          </form>
        </div>
      </div>
      <div className="flex flex-row gap-6 flex-1 min-h-0">
        <EntryListPanel
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
          onToggleEditor={() => setShowEditor((v) => !v)}
        />
        {showEditor && (
          <EntryFormPanel
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
            <button type="button" className="btn btn-error" onClick={confirmDeleteAction}>Delete</button>
            <button type="button" className="btn" onClick={cancelDelete}>Cancel</button>
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
