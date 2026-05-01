import { useEffect, useMemo, useState } from "react";
import { applyPresetData } from "../../presets/apply";
import type { PresetApplyMode } from "../../presets";
import { BUTTON_CLASSES, BUTTON_SIZES } from "../../styles/uiTokens";
import { asRecord, isRecord, type UnknownRecord } from "../../types/common";

interface PatchPreviewProps {
  currentData: UnknownRecord;
  patch: UnknownRecord;
  mode: PresetApplyMode;
  title: string;
  summary?: string;
  schema?: UnknownRecord;
  onApply: (patch: UnknownRecord, mode: PresetApplyMode) => void;
  onClose: () => void;
}

interface DiffRow {
  key: string;
  beforeValue: unknown;
  afterValue: unknown;
  section: string;
}

function stringifyStable(value: unknown): string {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return String(value);
  }
}

function formatPreviewValue(value: unknown): string {
  if (value === undefined) return "(unset)";
  if (value === null) return "null";
  if (typeof value === "string") return value || "(empty)";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function inferSectionName(key: string, schema?: UnknownRecord): string {
  const properties = asRecord(schema?.properties);
  const fieldConfig = asRecord(properties[key]);
  const ui = asRecord(fieldConfig.ui);
  const explicit = ui.section;
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim();

  const normalized = key.toLowerCase();
  if (["id", "slug", "name", "title", "description", "summary"].includes(normalized)) return "Identity";
  if (normalized.includes("requirement") || normalized.includes("flag") || normalized.includes("condition")) return "Gating";
  if (normalized.includes("reward") || normalized.includes("currency") || normalized.includes("price") || normalized.includes("cost") || normalized.includes("loot") || normalized.includes("xp")) return "Economy";
  if (normalized.includes("effect") || normalized.includes("status") || normalized.includes("modifier") || normalized.includes("scaling") || normalized.includes("stat") || normalized.includes("attribute") || normalized.includes("damage") || normalized.includes("cooldown") || normalized.includes("target")) return "Mechanics";
  if (normalized.includes("location") || normalized.includes("biome") || normalized.includes("faction") || normalized.includes("character") || normalized.includes("encounter") || normalized.includes("event") || normalized.includes("quest") || normalized.includes("dialogue")) return "World Links";
  if (normalized.includes("tag") || normalized.includes("icon") || normalized.includes("notes") || normalized.includes("content_pack")) return "Metadata";
  return "Core";
}

function pickPatchFields(patch: UnknownRecord, selectedKeys: Set<string>): UnknownRecord {
  return Object.fromEntries(
    Object.entries(patch).filter(([key]) => selectedKeys.has(key))
  );
}

export default function PatchPreview({
  currentData,
  patch,
  mode,
  title,
  summary,
  schema,
  onApply,
  onClose,
}: PatchPreviewProps) {
  const rows = useMemo<DiffRow[]>(() => {
    const after = applyPresetData(currentData, patch, mode);
    return Object.keys(patch)
      .filter((key) => stringifyStable(currentData[key]) !== stringifyStable(after[key]))
      .map((key) => ({
        key,
        beforeValue: currentData[key],
        afterValue: after[key],
        section: inferSectionName(key, schema),
      }));
  }, [currentData, mode, patch, schema]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set(rows.map((row) => row.key)));

  useEffect(() => {
    setSelectedKeys(new Set(rows.map((row) => row.key)));
  }, [rows]);

  const groups = useMemo(() => {
    const map = new Map<string, DiffRow[]>();
    for (const row of rows) {
      const existing = map.get(row.section) || [];
      existing.push(row);
      map.set(row.section, existing);
    }
    return Array.from(map.entries()).map(([section, sectionRows]) => ({ section, rows: sectionRows }));
  }, [rows]);

  const selectedCount = selectedKeys.size;
  const hasPatch = Object.keys(patch).length > 0;
  const hasChanges = rows.length > 0;

  const toggleKey = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSection = (sectionRows: DiffRow[]) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      const allSelected = sectionRows.every((row) => next.has(row.key));
      sectionRows.forEach((row) => {
        if (allSelected) next.delete(row.key);
        else next.add(row.key);
      });
      return next;
    });
  };

  const applySelected = () => {
    const selectedPatch = pickPatchFields(patch, selectedKeys);
    if (!isRecord(selectedPatch) || Object.keys(selectedPatch).length === 0) return;
    onApply(selectedPatch, mode);
  };

  return (
    <div className="mt-4 border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-slate-100 px-3 py-3 dark:border-slate-800 dark:bg-slate-800">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</div>
          {summary && <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">{summary}</div>}
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {hasChanges ? `${selectedCount}/${rows.length} changed fields selected` : hasPatch ? "Patch has no visible changes in this apply mode." : "Patch is empty."}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Apply mode: <span className="font-semibold">{mode}</span>. Only checked fields will be applied.
          </div>
        </div>
        <button type="button" className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`} onClick={onClose}>
          Close
        </button>
      </div>

      {hasChanges ? (
        <div className="max-h-[360px] overflow-y-auto">
          {groups.map((group) => {
            const allSelected = group.rows.every((row) => selectedKeys.has(row.key));
            return (
              <div key={group.section} className="border-b border-slate-100 last:border-b-0 dark:border-slate-800">
                <button
                  type="button"
                  className="flex w-full items-center justify-between bg-slate-50 px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800"
                  onClick={() => toggleSection(group.rows)}
                >
                  <span>{group.section}</span>
                  <span>{allSelected ? "Deselect group" : "Select group"}</span>
                </button>
                {group.rows.map((row) => (
                  <label key={row.key} className="grid grid-cols-[28px_minmax(120px,180px)_1fr_1fr] gap-2 border-t border-slate-100 px-3 py-2 text-xs dark:border-slate-800">
                    <input
                      type="checkbox"
                      checked={selectedKeys.has(row.key)}
                      onChange={() => toggleKey(row.key)}
                    />
                    <span className="font-mono text-slate-700 dark:text-slate-300">{row.key}</span>
                    <span className="truncate text-slate-500 dark:text-slate-400" title={formatPreviewValue(row.beforeValue)}>
                      {formatPreviewValue(row.beforeValue)}
                    </span>
                    <span className="truncate font-medium text-slate-900 dark:text-slate-100" title={formatPreviewValue(row.afterValue)}>
                      {formatPreviewValue(row.afterValue)}
                    </span>
                  </label>
                ))}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="px-3 py-4 text-sm text-slate-600 dark:text-slate-400">Nothing would change with the current data and apply mode.</div>
      )}

      <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-800 dark:bg-slate-950">
        <button type="button" className={`${BUTTON_CLASSES.secondary} ${BUTTON_SIZES.sm}`} onClick={() => setSelectedKeys(new Set(rows.map((row) => row.key)))} disabled={!hasChanges}>
          Select All
        </button>
        <button type="button" className={`${BUTTON_CLASSES.primary} ${BUTTON_SIZES.sm}`} onClick={applySelected} disabled={!hasChanges || selectedCount === 0}>
          Apply Selected
        </button>
      </div>
    </div>
  );
}
