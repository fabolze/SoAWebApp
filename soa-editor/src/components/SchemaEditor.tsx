// soa-editor/src/components/SchemaEditor.tsx
// This file acts as a template for the other pages
import { useState, useEffect } from "react";
import SchemaForm from "../components/SchemaForm";
import Sidebar from "./Sidebar";
import VirtualizedTable from "./VirtualizedTable";

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
      alert("Saved successfully ✅");
      const updated = await fetch(`http://localhost:5000/api/${apiPath}`).then((r) => r.json());
      setEntries(updated);
      setReferenceOptionsVersion((v) => v + 1); // Trigger referenceOptions refresh in SchemaForm
    } else {
      let msg = "❌ Save failed";
      try {
        const err = await res.json();
        if (err && err.message) msg += `: ${err.message}`;
      } catch {}
      alert(msg);
    }
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
  const handleDelete = async (entry: any) => {
    if (!window.confirm('Are you sure you want to delete this entry?')) return;
    const res = await fetch(`http://localhost:5000/api/${apiPath}/${entry[idField]}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      setEntries(entries.filter((e) => e[idField] !== entry[idField]));
      if (data[idField] === entry[idField]) setData({});
    } else {
      let msg = '❌ Delete failed';
      try {
        const err = await res.json();
        if (err && err.message) msg += `: ${err.message}`;
      } catch {}
      alert(msg);
    }
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
    <div id="root">
      <Sidebar />
      <div className="main-content p-0">
        <div className="editor-2col grid md:grid-cols-2 gap-0 h-[calc(100vh-0px)]" style={{height: '100vh'}}>
          {/* Left: Entry List Panel */}
          <div className="entry-list-panel flex flex-col border-r bg-gray-50 h-full max-h-full" style={{minWidth: 0, overflow: 'hidden'}}>
            <div className="flex flex-col gap-2 p-4 border-b bg-white sticky top-0 z-10">
              <div className="flex gap-2 items-center mb-2">
                <button className="bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700" onClick={handleAddNew}>+ New {title.replace(/ Editor$/, '')}</button>
              </div>
              <div className="query-bar flex gap-2 items-center">
                <select
                  className="border rounded p-2 text-sm"
                  value={searchField}
                  onChange={e => setSearchField(e.target.value)}
                >
                  <option value="__all__">All Fields</option>
                  {fieldKeys.map((key) => (
                    <option key={key} value={key}>{key}</option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder={searchField === "__all__" ? `Search all fields...` : `Search ${searchField}...`}
                  className="w-full p-2 border rounded"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0">
              <div className="entry-list">
                {sortedEntries.length > 100 ? (
                  <VirtualizedTable
                    entries={sortedEntries}
                    listFields={listFields}
                    idField={idField}
                    editingId={editingId}
                    onEdit={handleEdit}
                    onDuplicate={handleDuplicate}
                    onDelete={handleDelete}
                  />
                ) : (
                  <table className="min-w-full border text-sm">
                    <thead>
                      <tr>
                        {listFields.map((key) => (
                          <th key={key} className="px-3 py-2 border-b bg-gray-50 font-semibold text-gray-700 whitespace-nowrap">{key}</th>
                        ))}
                        <th className="px-3 py-2 border-b bg-gray-50 font-semibold text-gray-700">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedEntries.map((entry) => (
                        <tr key={entry[idField]} className={editingId && entry[idField] === editingId ? "bg-yellow-100" : "hover:bg-blue-50"}>
                          {listFields.map((key) => {
                            const value = entry[key];
                            const isImage = typeof value === 'string' && (value.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i) && (value.startsWith('http') || value.startsWith('/')));
                            return (
                              <td key={key} className="px-3 py-2 border-b whitespace-nowrap max-w-xs overflow-x-auto">
                                {isImage ? (
                                  <img src={value} alt="asset" style={{ maxHeight: '40px', maxWidth: '80px', objectFit: 'contain' }} />
                                ) : (
                                  String(value ?? '')
                                )}
                              </td>
                            );
                          })}
                          <td className="px-3 py-2 border-b whitespace-nowrap">
                            <button
                              className="mr-2 px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
                              onClick={() => handleEdit(entry)}
                            >Edit</button>
                            <button
                              className="mr-2 px-2 py-1 bg-purple-500 text-white rounded hover:bg-purple-600"
                              onClick={() => handleDuplicate(entry)}
                            >Duplicate</button>
                            <button
                              className="px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600"
                              onClick={() => handleDelete(entry)}
                            >Delete</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
          {/* Right: Form Panel */}
          <div className="form-panel flex flex-col h-full max-h-full bg-white" style={{minWidth: 0, overflow: 'hidden'}}>
            <div className="sticky top-0 z-10 bg-white p-4 border-b">
              <h1 className="text-xl font-bold mb-2">{formHeader}</h1>
              {!isNew && editingId && (
                <span className="ml-2 text-blue-700 font-semibold">Editing: {editingId}</span>
              )}
            </div>
            <div className="flex-1 overflow-y-auto min-h-0 p-4">
              <SchemaForm 
                schema={schema} 
                data={data} 
                onChange={setData}
                referenceOptions={undefined}
                fetchReferenceOptions={undefined}
                isValidCallback={setFormValid}
                key={referenceOptionsVersion}
              />
              <div className="flex gap-2 mt-4">
                <button
                  className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={handleSave}
                  disabled={!formValid}
                >
                  💾 Save
                </button>
                {!isNew && (
                  <button
                    className="bg-gray-400 text-white px-4 py-2 rounded hover:bg-gray-500"
                    onClick={handleAddNew}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
