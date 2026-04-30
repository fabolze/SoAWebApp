import { useMemo, useState } from "react";
import { BUTTON_CLASSES, BUTTON_SIZES } from "../../styles/uiTokens";
import type { StudioBundle, StudioBundleEntry } from "../../studio/types";

interface BundlePreviewProps {
  bundle: StudioBundle;
  onClose: () => void;
  onApplyDrafts: (bundle: StudioBundle, selectedIds: Set<string>) => void;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "(empty)";
  if (typeof value === "string") return value || "(empty)";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function summarizeEntry(entry: StudioBundleEntry): string[] {
  const keys = ["slug", "name", "title", "description", "character_id", "location_id", "requirements_id", "tags"];
  return keys
    .filter((key) => entry.data[key] !== undefined && entry.data[key] !== "")
    .slice(0, 4)
    .map((key) => `${key}: ${formatValue(entry.data[key])}`);
}

export default function BundlePreview({ bundle, onClose, onApplyDrafts }: BundlePreviewProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(bundle.entries.map((entry) => entry.tempId)));
  const groups = useMemo(() => {
    const grouped = new Map<string, StudioBundleEntry[]>();
    for (const entry of bundle.entries) {
      const group = grouped.get(entry.schemaName) || [];
      group.push(entry);
      grouped.set(entry.schemaName, group);
    }
    return Array.from(grouped.entries()).map(([schemaName, entries]) => ({ schemaName, entries }));
  }, [bundle.entries]);

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="mt-4 border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-slate-100 px-3 py-3 dark:border-slate-800 dark:bg-slate-800">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{bundle.title}</div>
            <span className="rounded bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200">bundle</span>
            <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200">{bundle.risk}</span>
          </div>
          {bundle.summary && <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">{bundle.summary}</div>}
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {selectedIds.size}/{bundle.entries.length} draft entries selected
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Create Drafts stores selected entries locally and opens the first draft. It does not save them to the backend.
          </div>
        </div>
        <button type="button" className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`} onClick={onClose}>
          Close
        </button>
      </div>

      {(bundle.warnings || []).length > 0 && (
        <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {(bundle.warnings || []).join(" ")}
        </div>
      )}

      <div className="max-h-[420px] overflow-y-auto">
        {groups.map((group) => (
          <div key={group.schemaName} className="border-b border-slate-100 last:border-b-0 dark:border-slate-800">
            <div className="bg-slate-50 px-3 py-2 text-xs font-semibold uppercase text-slate-500 dark:bg-slate-950 dark:text-slate-400">
              {group.schemaName} ({group.entries.length})
            </div>
            {group.entries.map((entry) => (
              <label key={entry.tempId} className="grid grid-cols-[28px_minmax(160px,220px)_1fr] gap-2 border-t border-slate-100 px-3 py-2 text-xs dark:border-slate-800">
                <input type="checkbox" checked={selectedIds.has(entry.tempId)} onChange={() => toggle(entry.tempId)} />
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-slate-800 dark:text-slate-200">{entry.label}</span>
                  <span className="block truncate font-mono text-[11px] text-slate-500 dark:text-slate-400">{entry.tempId}</span>
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-slate-600 dark:text-slate-300">{summarizeEntry(entry).join(" - ") || "Draft data"}</span>
                  {(entry.dependsOn || []).length > 0 && (
                    <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">Depends on: {(entry.dependsOn || []).join(", ")}</span>
                  )}
                </span>
              </label>
            ))}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-800 dark:bg-slate-950">
        <button type="button" className={`${BUTTON_CLASSES.secondary} ${BUTTON_SIZES.sm}`} onClick={() => setSelectedIds(new Set(bundle.entries.map((entry) => entry.tempId)))}>
          Select All
        </button>
        <button type="button" className={`${BUTTON_CLASSES.primary} ${BUTTON_SIZES.sm}`} disabled={selectedIds.size === 0} onClick={() => onApplyDrafts(bundle, selectedIds)}>
          Create Drafts
        </button>
      </div>
    </div>
  );
}
