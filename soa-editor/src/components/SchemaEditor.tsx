import { useState, useEffect } from "react";
import SchemaForm from "../components/SchemaForm";

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
    <main className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">{title}</h1>
      <SchemaForm schema={schema} data={data} onChange={setData} />
      <button
        className="mt-4 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        onClick={handleSave}
      >
        💾 Save
      </button>

      <section className="mt-10">
        <h2 className="text-xl font-semibold mb-2">Existing Entries</h2>
        <div className="border rounded divide-y">
          {entries.map((entry) => (
            <div key={entry[idField]} className="p-3 hover:bg-gray-50">
              <div className="font-medium">{entry.name || entry[idField]}</div>
              <div className="text-sm text-gray-600">{entry.type || ""} - {entry.description || ""}</div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
