import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";
import { BUTTON_CLASSES, BUTTON_SIZES } from "../styles/uiTokens";
import { asRecord, getErrorMessage } from "../types/common";

type RecoverySyncStatus = {
  restore_recommended?: boolean;
  latest_csv_mtime_iso?: string | null;
  active_db_mtime_iso?: string | null;
  source_dir?: string;
};

type RecoveryStatusPayload = {
  source_dir?: string;
  restore_recommended?: boolean;
  latest_csv_mtime_iso?: string | null;
  active_db_mtime_iso?: string | null;
  sync?: RecoverySyncStatus;
};

type RecoveryTableReport = {
  table?: string;
  imported?: number;
  status?: string;
  errors?: string[];
};

type RecoveryRestoreReport = {
  status?: string;
  message?: string;
  tables?: RecoveryTableReport[];
};

const DISMISSED_RECOVERY_KEY = "soa.recovery.dismissedCsvMtime";

function readMessage(payload: unknown, fallback: string): string {
  const record = asRecord(payload);
  if (typeof record.message === "string" && record.message.trim()) return record.message;
  if (typeof record.error === "string" && record.error.trim()) return record.error;
  return fallback;
}

export default function RecoverySyncBanner() {
  const [status, setStatus] = useState<RecoveryStatusPayload | null>(null);
  const [dismissedMtime, setDismissedMtime] = useState(() => localStorage.getItem(DISMISSED_RECOVERY_KEY));
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const sync = status?.sync ?? status ?? {};
  const latestCsvMtime = sync.latest_csv_mtime_iso ?? status?.latest_csv_mtime_iso ?? null;
  const restoreRecommended = Boolean(sync.restore_recommended ?? status?.restore_recommended);
  const visible = restoreRecommended && latestCsvMtime !== dismissedMtime;

  const loadStatus = useCallback(async () => {
    try {
      const res = await apiFetch("/api/recovery/status");
      if (!res.ok) return;
      setStatus((await res.json()) as RecoveryStatusPayload);
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const handleDismiss = () => {
    if (latestCsvMtime) {
      localStorage.setItem(DISMISSED_RECOVERY_KEY, latestCsvMtime);
      setDismissedMtime(latestCsvMtime);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    setMessage(null);
    try {
      const res = await apiFetch("/api/recovery/restore-source", { method: "POST" });
      const payload = (await res.json()) as RecoveryRestoreReport;
      if (!res.ok || payload.status !== "success") {
        throw new Error(readMessage(payload, "Restore from recovery CSVs failed"));
      }
      const imported = (payload.tables ?? []).reduce((total, table) => total + (table.imported || 0), 0);
      setMessage(`Restore completed. Imported ${imported} rows. Reloading...`);
      setConfirmOpen(false);
      window.setTimeout(() => window.location.reload(), 1200);
    } catch (error: unknown) {
      setMessage(getErrorMessage(error, "Restore from recovery CSVs failed"));
    } finally {
      setRestoring(false);
    }
  };

  const formattedCsvTime = useMemo(() => {
    if (!latestCsvMtime) return "";
    return new Date(latestCsvMtime).toLocaleString();
  }, [latestCsvMtime]);

  if (!visible && !message) return null;

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-semibold">
            {message || "Recovery CSVs are newer than this local database."}
          </div>
          {visible && (
            <div className="mt-1 text-xs text-amber-800 dark:text-amber-200">
              Latest CSV: {formattedCsvTime || "unknown"} · {sync.source_dir || status?.source_dir || "backend/data"}
            </div>
          )}
        </div>
        {visible && (
          <div className="flex items-center gap-2">
            <button className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.sm}`} onClick={handleDismiss}>
              Dismiss
            </button>
            <button className={`${BUTTON_CLASSES.danger} ${BUTTON_SIZES.sm}`} onClick={() => setConfirmOpen(true)}>
              Restore from CSVs
            </button>
          </div>
        )}
      </div>
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-md border border-slate-700 bg-slate-900 p-5 text-slate-100 shadow-xl">
            <h2 className="text-lg font-semibold">Restore from recovery CSVs?</h2>
            <p className="mt-2 text-sm text-slate-300">
              This resets the active local SQLite database and imports the tracked source CSVs from backend/data.
            </p>
            {message && <div className="mt-3 rounded border border-red-800 bg-red-950 p-2 text-sm text-red-100">{message}</div>}
            <div className="mt-5 flex justify-end gap-2">
              <button className={`${BUTTON_CLASSES.neutral} ${BUTTON_SIZES.md}`} onClick={() => setConfirmOpen(false)} disabled={restoring}>
                Cancel
              </button>
              <button className={`${BUTTON_CLASSES.danger} ${BUTTON_SIZES.md}`} onClick={handleRestore} disabled={restoring}>
                {restoring ? "Restoring..." : "Reset and Restore"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
