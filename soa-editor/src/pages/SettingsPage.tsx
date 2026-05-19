import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../lib/api";
import { BUTTON_CLASSES, BUTTON_SIZES } from "../styles/uiTokens";
import { asRecord, getErrorMessage } from "../types/common";

type RecoveryTableReport = {
  table?: string;
  rows?: number;
  status?: string;
  errors?: string[];
};

type RecoveryExportReport = {
  status?: string;
  message?: string;
  timestamp?: string;
  source_dir?: string;
  tables?: RecoveryTableReport[];
  errors?: { table?: string | null; message?: string }[];
};

export default function SettingsPage() {
  const [dbs, setDbs] = useState<string[]>([]);
  const [activeDb, setActiveDb] = useState<string>("");
  const [newDb, setNewDb] = useState("");
  const [resetting, setResetting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [endingSession, setEndingSession] = useState(false);
  const [endSessionReport, setEndSessionReport] = useState<RecoveryExportReport | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const readError = useCallback(async (res: Response, fallback: string) => {
    try {
      const payload = asRecord(await res.json());
      const errorText = payload.error;
      if (typeof errorText === "string" && errorText.trim()) return errorText;
      const messageText = payload.message;
      if (typeof messageText === "string" && messageText.trim()) return messageText;
      return fallback;
    } catch {
      return fallback;
    }
  }, []);

  const fetchDbs = useCallback(async () => {
    const res = await apiFetch("/api/db/list");
    if (!res.ok) {
      throw new Error(await readError(res, "Failed to load databases"));
    }
    const data = asRecord(await res.json());
    const databases = Array.isArray(data.databases) ? data.databases.map((db) => String(db)) : [];
    const active = typeof data.active === "string" ? data.active : "";
    setDbs(databases);
    setActiveDb(active);
  }, [readError]);

  useEffect(() => {
    void fetchDbs().catch((e: unknown) => setError(getErrorMessage(e, "Failed to load databases")));
  }, [fetchDbs]);

  const handleReset = async () => {
    setResetting(true);
    setError(null);
    try {
      const res = await apiFetch("/api/db/reset", { method: "POST" });
      if (!res.ok) throw new Error(await readError(res, "Reset failed"));
      await fetchDbs();
      setShowResetModal(false);
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Reset failed"));
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
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Create failed"));
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
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Delete failed"));
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
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Switch failed"));
    } finally {
      setSelecting(null);
    }
  };

  const handleEndSession = async () => {
    setEndingSession(true);
    setError(null);
    setEndSessionReport(null);
    try {
      const res = await apiFetch("/api/recovery/export-source", { method: "POST" });
      const payload = asRecord(await res.json()) as RecoveryExportReport;
      setEndSessionReport(payload);
      if (!res.ok) {
        throw new Error(typeof payload.message === "string" ? payload.message : "End session export failed");
      }
    } catch (e: unknown) {
      setError(getErrorMessage(e, "End session export failed"));
    } finally {
      setEndingSession(false);
    }
  };

  const exportedTables = endSessionReport?.tables?.filter((table) => table.status === "success") ?? [];
  const failedTables = endSessionReport?.tables?.filter((table) => table.status === "error") ?? [];
  const safeToClose = endSessionReport?.status === "success";

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
          className={`${BUTTON_CLASSES.danger} px-6 py-2 text-lg font-semibold shadow`}
          onClick={() => setShowResetModal(true)}
        >
          Reset Active Database
        </button>
      </div>
      <div className="mb-8 rounded border border-slate-700 bg-slate-800 px-4 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-primary">End Session</h2>
            <p className="mt-1 text-sm text-slate-300">
              Export recovery source CSVs to backend/data before closing.
            </p>
          </div>
          <button
            className={`${BUTTON_CLASSES.primary} ${BUTTON_SIZES.md} font-semibold shadow`}
            onClick={handleEndSession}
            disabled={endingSession}
          >
            {endingSession ? "Exporting..." : "End Session"}
          </button>
        </div>
        {endSessionReport && (
          <div className="mt-4 rounded border border-slate-700 bg-slate-900 p-3 text-sm">
            <div className={safeToClose ? "font-semibold text-emerald-300" : "font-semibold text-amber-300"}>
              {safeToClose ? "Safe to close" : "Export needs attention"}
            </div>
            <div className="mt-1 text-slate-300">{endSessionReport.message || "Export finished."}</div>
            {endSessionReport.timestamp && (
              <div className="mt-1 text-xs text-slate-400">
                {new Date(endSessionReport.timestamp).toLocaleString()} · {endSessionReport.source_dir}
              </div>
            )}
            {safeToClose && (
              <div className="mt-3 rounded border border-blue-800 bg-blue-950 p-2 text-xs text-blue-100">
                Git handoff: commit and push the changed backend/data/*_seed.csv files, then pull them on the other machine.
              </div>
            )}
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded border border-slate-700 p-2">
                <div className="text-xs uppercase text-slate-400">Exported</div>
                <div className="text-lg font-semibold text-slate-100">{exportedTables.length} tables</div>
                <div className="text-xs text-slate-400">
                  {exportedTables.reduce((total, table) => total + (table.rows || 0), 0)} rows
                </div>
              </div>
              <div className="rounded border border-slate-700 p-2">
                <div className="text-xs uppercase text-slate-400">Failed</div>
                <div className={failedTables.length ? "text-lg font-semibold text-red-300" : "text-lg font-semibold text-slate-100"}>
                  {failedTables.length} tables
                </div>
                <div className="text-xs text-slate-400">Recovery CSV write status</div>
              </div>
            </div>
            {failedTables.length > 0 && (
              <ul className="mt-3 space-y-1 text-red-200">
                {failedTables.map((table) => (
                  <li key={table.table || "unknown"}>
                    {table.table || "unknown"}: {(table.errors || []).join("; ") || "Export failed"}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
      {showResetModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
          <div className="bg-slate-800 p-6 rounded shadow-lg max-w-sm w-full border border-slate-700">
            <h2 className="text-lg font-bold mb-2 text-primary">Confirm Reset</h2>
            <p className="mb-4 text-slate-200">Are you sure you want to reset the active database? This will delete all data and recreate all tables.</p>
            <div className="flex gap-2 justify-end">
              <button className={`${BUTTON_CLASSES.neutral} ${BUTTON_SIZES.md}`} onClick={() => setShowResetModal(false)}>Cancel</button>
              <button className={`${BUTTON_CLASSES.danger} ${BUTTON_SIZES.md} font-semibold`} onClick={handleReset} disabled={resetting}>
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
          <button type="submit" className={`${BUTTON_CLASSES.primary} ${BUTTON_SIZES.sm} font-semibold shadow`} disabled={creating}>
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
                  className={`${BUTTON_CLASSES.primary} ${BUTTON_SIZES.sm} font-semibold shadow`}
                  onClick={() => handleSelect(name)}
                  disabled={name === activeDb || selecting === name}
                >
                  {selecting === name ? "Switching..." : "Use"}
                </button>
                <button
                  className={`${BUTTON_CLASSES.danger} ${BUTTON_SIZES.sm} font-semibold shadow`}
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
