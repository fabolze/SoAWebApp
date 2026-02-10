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

const ROW_HEIGHT = 44;
const MAX_HEIGHT = 520;
const MIN_VISIBLE_ROWS = 6;

function resolveEntryId(entry: TableEntry, idField: string, index: number): string {
  const raw = entry[idField];
  if (typeof raw === "string" && raw.trim()) return raw;
  if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  return `row-${index}`;
}

const Row = memo(({ index, style, data }: ListChildComponentProps<RowData>) => {
  const entry = data.entries[index];
  const entryId = resolveEntryId(entry, data.idField, index);
  const isActive = !!data.editingId && entryId === data.editingId;

  return (
    <div
      style={{ ...style, display: "grid", gridTemplateColumns: data.gridTemplateColumns }}
      className={`items-center border-b border-slate-200 ${isActive ? "bg-yellow-100" : "hover:bg-blue-50"}`}
    >
      <div className="px-3 py-2">
        <input
          type="checkbox"
          checked={data.selectedIds.has(entryId)}
          onChange={() => data.onToggleSelect(entryId)}
        />
      </div>
      {data.listFields.map((fieldKey) => (
        <div key={`${entryId}-${fieldKey}`} className="px-3 py-2 text-slate-900 truncate" title={String(entry[fieldKey] ?? "")}>
          {String(entry[fieldKey] ?? "")}
        </div>
      ))}
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
    <div className="rounded-xl shadow-lg bg-white border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <div className="min-w-[780px]">
          <div
            className="sticky top-0 z-10 bg-gray-50 border-b border-slate-300 text-slate-700 text-xs font-semibold uppercase tracking-wider"
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
            <div className="px-3 py-6 text-sm text-slate-500">No entries found.</div>
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
