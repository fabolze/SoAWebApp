// soa-editor/src/components/SchemaEditor.tsx
// This file acts as a template for the other pages
import { useState, useEffect } from "react";
import SchemaForm from "../components/SchemaForm";
import Sidebar from "./Sidebar";

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

  useEffect(() => {
    import(`../../../backend/app/schemas/${schemaName}.json`).then(setSchema);
  }, [schemaName]);

  useEffect(() => {
    fetch(`http://localhost:5000/api/${apiPath}`)
      .then((res) => res.json())
      .then(setEntries);
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

  // Filtered and sorted entries
  const filteredEntries = entries.filter((entry) => {
    if (!search.trim()) return true;
    const searchLower = search.toLowerCase();
    return fieldKeys.some((key) =>
      String(entry[key] ?? "").toLowerCase().includes(searchLower)
    );
  });
  // Sort alphabetically by name, fallback to id
  const sortedEntries = [...filteredEntries].sort((a, b) => {
    const aName = (a.name || a[idField] || "").toLowerCase();
    const bName = (b.name || b[idField] || "").toLowerCase();
    return aName.localeCompare(bName);
  });

  if (!schema) return <p className="p-4">Loading schema…</p>;

  return (
    <div id="root">
      <Sidebar />
      <div className="main-content">
        <div className="editor-panel">
          <h1>{title}</h1>
          <SchemaForm 
            schema={schema} 
            data={data} 
            onChange={setData}
            // Pass a callback to get validity from SchemaForm
            referenceOptions={undefined}
            fetchReferenceOptions={undefined}
            // Add a prop to get validity
            isValidCallback={setFormValid}
          />
          <button
            className="mt-4 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleSave}
            disabled={!formValid}
          >
            💾 Save
          </button>
        </div>

        <div className="query-bar">
          <input
            type="text"
            placeholder="Search or filter..."
            className="w-full p-2 border rounded"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="entry-list overflow-x-auto mt-6">
          <table className="min-w-full border text-sm">
            <thead>
              <tr>
                {fieldKeys.map((key) => (
                  <th key={key} className="px-3 py-2 border-b bg-gray-50 font-semibold text-gray-700 whitespace-nowrap">{key}</th>
                ))}
                <th className="px-3 py-2 border-b bg-gray-50 font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedEntries.map((entry) => (
                <tr key={entry[idField]} className="hover:bg-blue-50">
                  {fieldKeys.map((key) => (
                    <td key={key} className="px-3 py-2 border-b whitespace-nowrap max-w-xs overflow-x-auto">{String(entry[key] ?? '')}</td>
                  ))}
                  <td className="px-3 py-2 border-b whitespace-nowrap">
                    <button
                      className="mr-2 px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
                      onClick={() => handleEdit(entry)}
                    >Edit</button>
                    <button
                      className="px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600"
                      onClick={() => handleDelete(entry)}
                    >Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
