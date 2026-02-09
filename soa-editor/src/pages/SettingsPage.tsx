import { useState, useEffect } from "react";
import { apiFetch } from "../lib/api";

export default function SettingsPage() {
  const [dbs, setDbs] = useState<string[]>([]);
  const [activeDb, setActiveDb] = useState<string>("");
  const [newDb, setNewDb] = useState("");
  const [resetting, setResetting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const readError = async (res: Response, fallback: string) => {
    try {
      const payload = await res.json();
      return payload?.error || payload?.message || fallback;
    } catch {
      return fallback;
    }
  };

  const fetchDbs = async () => {
    const res = await apiFetch("/api/db/list");
    if (!res.ok) {
      throw new Error(await readError(res, "Failed to load databases"));
    }
    const data = await res.json();
    setDbs(data.databases || []);
    setActiveDb(data.active || "");
  };

  useEffect(() => {
    fetchDbs().catch((e: any) => setError(e?.message || "Failed to load databases"));
  }, []);

  const handleReset = async () => {
    setResetting(true);
    setError(null);
    try {
      const res = await apiFetch("/api/db/reset", { method: "POST" });
      if (!res.ok) throw new Error(await readError(res, "Reset failed"));
      await fetchDbs();
      setShowResetModal(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setResetting(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const res = await apiFetch("/api/db/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newDb })
      });
      if (!res.ok) throw new Error(await readError(res, "Create failed"));
      setNewDb("");
      await fetchDbs();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (name: string) => {
    setDeleting(name);
    setError(null);
    try {
      const res = await apiFetch("/api/db/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name })
      });
      if (!res.ok) throw new Error(await readError(res, "Delete failed"));
      await fetchDbs();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDeleting(null);
    }
  };

  const handleSelect = async (name: string) => {
    setSelecting(name);
    setError(null);
    try {
      const res = await apiFetch("/api/db/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error(await readError(res, "Switch failed"));
      await fetchDbs();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSelecting(null);
    }
  };

  return (
    <div className="p-8 max-w-2xl mx-auto text-white bg-slate-900 min-h-screen rounded-lg shadow-lg">
      <h1 className="text-2xl font-bold mb-6 text-primary">Admin / Database Settings</h1>
      {error && <div className="bg-red-900 text-red-200 p-2 mb-4 rounded">{error}</div>}
      <div className="mb-6 rounded border border-slate-700 bg-slate-800 px-4 py-3 text-sm">
        <span className="text-slate-300">Active Database:</span>{" "}
        <span className="font-semibold text-emerald-300">{activeDb || "unknown"}</span>
      </div>
      <div className="mb-8">
        <button
          className="bg-red-600 text-white px-6 py-2 rounded hover:bg-red-700 font-semibold text-lg shadow transition"
          onClick={() => setShowResetModal(true)}
        >
          Reset Active Database
        </button>
      </div>
      {showResetModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
          <div className="bg-slate-800 p-6 rounded shadow-lg max-w-sm w-full border border-slate-700">
            <h2 className="text-lg font-bold mb-2 text-primary">Confirm Reset</h2>
            <p className="mb-4 text-slate-200">Are you sure you want to reset the active database? This will delete all data and recreate all tables.</p>
            <div className="flex gap-2 justify-end">
              <button className="bg-slate-700 text-white px-4 py-2 rounded hover:bg-slate-600" onClick={() => setShowResetModal(false)}>Cancel</button>
              <button className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 font-semibold" onClick={handleReset} disabled={resetting}>
                {resetting ? "Resetting..." : "Confirm Reset"}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="mb-8">
        <h2 className="text-lg font-bold mb-2 text-primary">Databases</h2>
        <form onSubmit={handleCreate} className="flex gap-2 mb-4">
          <input
            type="text"
            value={newDb}
            onChange={e => setNewDb(e.target.value)}
            placeholder="New DB name"
            className="border border-slate-700 bg-slate-800 text-white px-2 py-1 rounded focus:outline-none focus:ring-2 focus:ring-primary"
            required
          />
          <button type="submit" className="bg-blue-600 text-white px-4 py-1 rounded hover:bg-blue-700 font-semibold shadow transition" disabled={creating}>
            {creating ? "Creating..." : "Create"}
          </button>
        </form>
        <ul className="divide-y divide-slate-700">
          {dbs.map(name => (
            <li key={name} className="flex items-center justify-between py-2">
              <div className="flex items-center gap-2">
                <span className="text-slate-200">{name}</span>
                {name === activeDb && (
                  <span className="text-xs bg-emerald-700 text-emerald-100 px-2 py-0.5 rounded">Active</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 font-semibold shadow transition disabled:opacity-50"
                  onClick={() => handleSelect(name)}
                  disabled={name === activeDb || selecting === name}
                >
                  {selecting === name ? "Switching..." : "Use"}
                </button>
                <button
                  className="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600 font-semibold shadow transition disabled:opacity-50"
                  onClick={() => handleDelete(name)}
                  disabled={deleting === name || name === activeDb}
                >
                  {deleting === name ? "Deleting..." : "Delete"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
