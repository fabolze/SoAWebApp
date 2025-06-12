// soa-editor/src/components/SchemaEditor.tsx
// This file acts as a template for the other pages
import { useState, useEffect } from "react";
import { useRef } from "react";
import Sidebar from "./Sidebar";
import EntryListPanel from "./EntryListPanel";
import EntryFormPanel from "./EntryFormPanel";

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
  const [collapsed, setCollapsed] = useState(false);
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirmRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    import(`../../../backend/app/schemas/${schemaName}.json`).then(setSchema);
  }, [schemaName]);

  useEffect(() => {
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
      setToast({ type: 'success', message: 'Saved successfully ✅' });
      const updated = await fetch(`http://localhost:5000/api/${apiPath}`).then((r) => r.json());
      setEntries(updated);
      setReferenceOptionsVersion((v) => v + 1); // Trigger referenceOptions refresh in SchemaForm
    } else {
      let msg = '❌ Save failed';
      try {
        const err = await res.json();
        if (err && err.message) msg += `: ${err.message}`;
      } catch {}
      setToast({ type: 'error', message: msg });
    }
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    toastTimeout.current = setTimeout(() => setToast(null), 3000);
  };

  // Get all field names from schema for table columns
  const fieldKeys = schema ? Object.keys(schema.properties || {}) : [];

  // Determine which fields to display in the table
  let listFields: string[] = [];
  if (schema) {
    listFields = Object.entries(schema.properties || {})
      .filter(([_, config]: any) => config.ui && config.ui.list_display)
      .map(([key]) => key);
    // Fallback: if none marked, use idField, name/title, type, role if present
    if (listFields.length === 0) {
      const candidates = [idField, 'id', 'npc_id', 'name', 'title', 'type', 'role'];
      listFields = candidates.filter(f => f && fieldKeys.includes(f as string)) as string[];
      if (listFields.length === 0) listFields = fieldKeys.slice(0, 3); // fallback to first 3 fields
    }
  }

  // Track which entry is being edited (by id)
  const editingId = data && data[idField] ? data[idField] : null;

  // Add New handler
  const handleAddNew = () => setData({});
  // Duplicate handler
  const handleDuplicate = (entry: any) => {
    const copy = { ...entry };
    if (idField) copy[idField] = '';
    setData(copy);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Edit entry handler
  const handleEdit = (entry: any) => {
    setData(entry);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Delete entry handler
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
      setToast({ type: 'success', message: 'Deleted successfully 🗑️' });
    } else {
      let msg = '❌ Delete failed';
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

  // Field selection for search
  const [searchField, setSearchField] = useState<string>("__all__");

  // Filtered and sorted entries
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
  // Sort alphabetically by name, fallback to id
  const sortedEntries = [...filteredEntries].sort((a, b) => {
    const aName = (a.name || a[idField] || "").toLowerCase();
    const bName = (b.name || b[idField] || "").toLowerCase();
    return aName.localeCompare(bName);
  });

  if (!schema) return <p className="p-4">Loading schema…</p>;

  // Determine if creating new entry
  const isNew = !editingId;
  const formHeader = isNew ? `New ${title.replace(/ Editor$/, '')}` : `Edit ${title.replace(/ Editor$/, '')}`;

  return (
    <div className="min-h-screen flex flex-row bg-gray-100 font-sans">
      <Sidebar collapsed={collapsed} onToggleCollapse={() => setCollapsed((c) => !c)} />
      <div className="flex flex-1 flex-row h-screen">
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
        />
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
        />
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
