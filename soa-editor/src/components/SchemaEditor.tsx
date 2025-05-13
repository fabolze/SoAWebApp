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

  useEffect(() => {
    import(`../../../backend/app/schemas/${schemaName}.json`).then(setSchema);
  }, [schemaName]);

  useEffect(() => {
    fetch(`http://localhost:5000/api/${apiPath}`)
      .then((res) => res.json())
      .then(setEntries);
  }, [apiPath]);

  const handleSave = async () => {
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
      alert("❌ Save failed");
    }
  };

  if (!schema) return <p className="p-4">Loading schema…</p>;

  return (
    <div id="root">
      <Sidebar />
      <div className="main-content">
        <div className="editor-panel">
          <h1>{title}</h1>
          <SchemaForm schema={schema} data={data} onChange={setData} />
          <button
            className="mt-4 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            onClick={handleSave}
          >
            💾 Save
          </button>
        </div>

        <div className="query-bar">
          <input
            type="text"
            placeholder="Search or filter..."
            className="w-full p-2 border rounded"
          />
        </div>

        <div className="entry-list">
          {entries.map((entry) => (
            <div key={entry[idField]} className="entry-card">
              <div className="font-medium">{entry.name || entry[idField]}</div>
              <div className="text-sm text-gray-600">{entry.type || ""} - {entry.description || ""}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
