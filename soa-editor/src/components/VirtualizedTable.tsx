import { memo, useMemo } from "react";
import { FixedSizeList as List, type ListChildComponentProps } from "react-window";
import { BUTTON_CLASSES, BUTTON_SIZES } from "../styles/uiTokens";

type TableEntry = Record<string, unknown>;

interface VirtualizedTableProps {
  entries: TableEntry[];
  listFields: string[];
  idField: string;
  editingId: string | null;
  onEdit: (entry: TableEntry) => void;
  onDuplicate: (entry: TableEntry) => void;
  onDelete: (entry: TableEntry) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  allSelected: boolean;
}

interface RowData {
  entries: TableEntry[];
  listFields: string[];
  idField: string;
  editingId: string | null;
  selectedIds: Set<string>;
  onEdit: (entry: TableEntry) => void;
  onDuplicate: (entry: TableEntry) => void;
  onDelete: (entry: TableEntry) => void;
  onToggleSelect: (id: string) => void;
  gridTemplateColumns: string;
}

const ROW_HEIGHT = 58;
const MAX_HEIGHT = 520;
const MIN_VISIBLE_ROWS = 6;

function resolveEntryId(entry: TableEntry, idField: string, index: number): string {
  const raw = entry[idField];
  if (typeof raw === "string" && raw.trim()) return raw;
  if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  return `row-${index}`;
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map((item) => String(item)).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function getEntryBadges(entry: TableEntry): string[] {
  return [entry.type, entry.rarity, entry.category, entry.role, entry.enemy_type, entry.alignment]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean)
    .slice(0, 2);
}

const Row = memo(({ index, style, data }: ListChildComponentProps<RowData>) => {
  const entry = data.entries[index];
  const entryId = resolveEntryId(entry, data.idField, index);
  const isActive = !!data.editingId && entryId === data.editingId;
  const badges = getEntryBadges(entry);

  return (
    <div
      style={{ ...style, display: "grid", gridTemplateColumns: data.gridTemplateColumns }}
      className={`items-center border-b border-slate-100 transition-colors dark:border-slate-800 ${isActive ? "bg-blue-50 ring-1 ring-inset ring-blue-300 dark:bg-blue-950/60 dark:ring-blue-800" : "hover:bg-slate-50 dark:hover:bg-slate-800"}`}
    >
      <div className="px-3 py-2">
        <input
          type="checkbox"
          checked={data.selectedIds.has(entryId)}
          onChange={() => data.onToggleSelect(entryId)}
        />
      </div>
      {data.listFields.map((fieldKey) => {
        const cellText = formatCellValue(entry[fieldKey]);
        const isPrimaryField = fieldKey === "name" || fieldKey === "title" || fieldKey === "slug";
        return (
          <div key={`${entryId}-${fieldKey}`} className="px-3 py-2 text-slate-900 truncate dark:text-slate-100" title={cellText}>
            {isPrimaryField ? (
              <div className="min-w-0">
                <div className={`truncate ${isActive ? "font-semibold text-blue-950 dark:text-blue-200" : "font-medium text-slate-950 dark:text-slate-100"}`}>
                  {cellText}
                </div>
                {badges.length > 0 && (
                  <div className="mt-0.5 flex gap-1">
                    {badges.map((badge) => (
                      <span key={badge} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {badge}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              cellText
            )}
          </div>
        );
      })}
      <div className="px-3 py-2 whitespace-nowrap">
        <button className={`mr-2 ${BUTTON_CLASSES.primary} ${BUTTON_SIZES.xs}`} onClick={() => data.onEdit(entry)}>
          Edit
        </button>
        <button className={`mr-2 ${BUTTON_CLASSES.violet} ${BUTTON_SIZES.xs}`} onClick={() => data.onDuplicate(entry)}>
          Duplicate
        </button>
        <button
          className={`${BUTTON_CLASSES.danger} ${BUTTON_SIZES.xs}`}
          onClick={() => data.onDelete(entry)}
          type="button"
          aria-label="Delete entry"
        >
          Delete
        </button>
      </div>
    </div>
  );
});

Row.displayName = "VirtualizedTableRow";

export default function VirtualizedTable({
  entries,
  listFields,
  idField,
  editingId,
  onEdit,
  onDuplicate,
  onDelete,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  allSelected,
}: VirtualizedTableProps) {
  const safeEntries = useMemo(() => (Array.isArray(entries) ? entries : []), [entries]);
  const rowCount = safeEntries.length;
  const listHeight = Math.min(MAX_HEIGHT, Math.max(ROW_HEIGHT * MIN_VISIBLE_ROWS, rowCount * ROW_HEIGHT));
  const gridTemplateColumns = useMemo(
    () => ["48px", ...listFields.map(() => "minmax(160px, 1fr)"), "220px"].join(" "),
    [listFields]
  );

  const rowData = useMemo<RowData>(
    () => ({
      entries: safeEntries,
      listFields,
      idField,
      editingId,
      selectedIds,
      onEdit,
      onDuplicate,
      onDelete,
      onToggleSelect,
      gridTemplateColumns,
    }),
    [
      safeEntries,
      listFields,
      idField,
      editingId,
      selectedIds,
      onEdit,
      onDuplicate,
      onDelete,
      onToggleSelect,
      gridTemplateColumns,
    ]
  );

  return (
    <div className="rounded-md bg-white border border-slate-200 overflow-hidden dark:border-slate-800 dark:bg-slate-900">
      <div className="overflow-x-auto">
        <div className="min-w-[780px]">
          <div
            className="sticky top-0 z-10 bg-slate-100 border-b border-slate-200 text-slate-700 text-xs font-semibold uppercase dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300"
            style={{ display: "grid", gridTemplateColumns }}
          >
            <div className="px-3 py-2">
              <input type="checkbox" checked={allSelected} onChange={onToggleSelectAll} />
            </div>
            {listFields.map((fieldKey) => (
              <div key={fieldKey} className="px-3 py-2">
                {fieldKey}
              </div>
            ))}
            <div className="px-3 py-2">Actions</div>
          </div>
          {rowCount === 0 ? (
            <div className="px-3 py-6 text-sm text-slate-500 dark:text-slate-400">No entries found.</div>
          ) : (
            <List height={listHeight} itemCount={rowCount} itemSize={ROW_HEIGHT} width="100%" itemData={rowData}>
              {Row}
            </List>
          )}
        </div>
      </div>
    </div>
  );
}
