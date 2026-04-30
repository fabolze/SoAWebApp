import VirtualizedTable from "./VirtualizedTable";
import { memo, useMemo, useState, useEffect } from "react";
import { BUTTON_CLASSES, BUTTON_SIZES, TEXT_CLASSES } from "../styles/uiTokens";
import type { EntryRecord, RecentEntry } from "../types/editorQol";

interface EntryListPanelProps {
  schemaName: string;
  entries: EntryRecord[];
  listFields: string[];
  idField: string;
  editingId: string | null;
  onEdit: (entry: EntryRecord) => void;
  onDuplicate: (entry: EntryRecord) => void;
  onDelete: (entry: EntryRecord) => void;
  onAddNew: () => void;
  search: string;
  setSearch: (s: string) => void;
  searchField: string;
  setSearchField: (s: string) => void;
  fieldKeys: string[];
  onBulkDelete: (entries: EntryRecord[]) => void;
  onBulkDuplicate: (entries: EntryRecord[]) => void;
  onBulkEdit: (entries: EntryRecord[], field: string, value: string) => void;
  showEditor: boolean;
  onToggleEditor: () => void;
  recentEntries: RecentEntry[];
  onOpenRecentEntry: (id: string) => void;
}

const getEntryId = (entry: EntryRecord, idField: string): string => {
  const rawId = entry[idField];
  return typeof rawId === "string" ? rawId : String(rawId ?? "");
};

const getEntryLabel = (entry: EntryRecord, idField: string): string => {
  const candidates = [entry.name, entry.title, entry.slug, entry[idField]];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "Untitled";
};

const getEntryBadges = (entry: EntryRecord): string[] => {
  const candidates = [entry.type, entry.rarity, entry.category, entry.role, entry.enemy_type, entry.alignment];
  return candidates
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean)
    .slice(0, 3);
};

const formatCellValue = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map((item) => String(item)).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

const EntryListPanel = ({
  schemaName,
  entries,
  listFields,
  idField,
  editingId,
  onEdit,
  onDuplicate,
  onDelete,
  onAddNew,
  search,
  setSearch,
  searchField,
  setSearchField,
  fieldKeys,
  onBulkDelete,
  onBulkDuplicate,
  onBulkEdit,
  showEditor,
  onToggleEditor,
  recentEntries,
  onOpenRecentEntry,
}: EntryListPanelProps) => (
  <EntryListPanelInternal
    schemaName={schemaName}
    entries={entries}
    listFields={listFields}
    idField={idField}
    editingId={editingId}
    onEdit={onEdit}
    onDuplicate={onDuplicate}
    onDelete={onDelete}
    onAddNew={onAddNew}
    search={search}
    setSearch={setSearch}
    searchField={searchField}
    setSearchField={setSearchField}
    fieldKeys={fieldKeys}
    onBulkDelete={onBulkDelete}
    onBulkDuplicate={onBulkDuplicate}
    onBulkEdit={onBulkEdit}
    showEditor={showEditor}
    onToggleEditor={onToggleEditor}
    recentEntries={recentEntries}
    onOpenRecentEntry={onOpenRecentEntry}
  />
);

const EntryListPanelInternal = ({
  schemaName,
  entries,
  listFields,
  idField,
  editingId,
  onEdit,
  onDuplicate,
  onDelete,
  onAddNew,
  search,
  setSearch,
  searchField,
  setSearchField,
  fieldKeys,
  onBulkDelete,
  onBulkDuplicate,
  onBulkEdit,
  showEditor,
  onToggleEditor,
  recentEntries,
  onOpenRecentEntry,
}: EntryListPanelProps) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [bulkField, setBulkField] = useState<string>("");
  const [bulkValue, setBulkValue] = useState<string>("");
  const [showColumns, setShowColumns] = useState(false);
  const [visibleFields, setVisibleFields] = useState<string[]>(listFields);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allSelected = entries.length > 0 && entries.every((entry) => selectedSet.has(getEntryId(entry, idField)));

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => entries.some((entry) => getEntryId(entry, idField) === id)));
  }, [entries, idField]);

  useEffect(() => {
    const storageKey = `soa.columns.${schemaName}`;
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const parsedFields = parsed.filter(
            (field): field is string => typeof field === "string" && listFields.includes(field)
          );
          if (parsedFields.length > 0) {
            setVisibleFields(parsedFields);
            return;
          }
        }
        if (Array.isArray(parsed) && parsed.length > 0) {
          setVisibleFields(listFields);
          return;
        }
      } catch {
        // Ignore invalid localStorage payload.
      }
    }
    setVisibleFields(listFields);
  }, [schemaName, listFields]);

  useEffect(() => {
    const storageKey = `soa.columns.${schemaName}`;
    if (visibleFields.length > 0) {
      localStorage.setItem(storageKey, JSON.stringify(visibleFields));
    }
  }, [schemaName, visibleFields]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(entries.map((entry) => getEntryId(entry, idField)).filter((id) => id.length > 0));
    }
  };

  const selectedEntries = entries.filter((entry) => selectedSet.has(getEntryId(entry, idField)));
  const hasFilters = search.trim().length > 0 || searchField !== "__all__";

  const allFields = fieldKeys;
  const isFieldVisible = (field: string) => visibleFields.includes(field);
  const toggleField = (field: string) => {
    setVisibleFields((prev) => {
      if (prev.includes(field)) {
        const next = prev.filter((f) => f !== field);
        return next.length > 0 ? next : prev;
      }
      return [...prev, field];
    });
  };

  return (
    <div className="flex-1 min-w-0 flex flex-col h-full max-h-full overflow-hidden border-r border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex flex-col gap-3 border-b border-slate-200 bg-white px-5 py-4 sticky top-0 z-10 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <div>
            <div className="text-xs font-medium uppercase text-slate-500 dark:text-slate-400">{schemaName.replace(/_/g, " ")}</div>
            <div className="text-lg font-semibold text-slate-950 dark:text-slate-100">{entries.length} entries</div>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
          <button className={`${BUTTON_CLASSES.success} ${BUTTON_SIZES.sm}`} onClick={onAddNew}>+ New</button>
          <button
            className={`${BUTTON_CLASSES.neutral} ${BUTTON_SIZES.xs}`}
            onClick={onToggleEditor}
          >
            {showEditor ? 'Hide Editor' : 'Show Editor'}
          </button>
          <button
            className={`${BUTTON_CLASSES.secondary} ${BUTTON_SIZES.xs}`}
            onClick={() => setShowColumns((v) => !v)}
          >
            Columns
          </button>
          {selectedIds.length > 0 && (
            <>
              <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300">{selectedIds.length} selected</span>
              <button className={`${BUTTON_CLASSES.indigo} ${BUTTON_SIZES.xs}`} onClick={() => onBulkDuplicate(selectedEntries)}>Duplicate</button>
              <button className={`${BUTTON_CLASSES.danger} ${BUTTON_SIZES.xs}`} onClick={() => onBulkDelete(selectedEntries)}>Delete</button>
              <button className={`${BUTTON_CLASSES.neutral} ${BUTTON_SIZES.xs}`} onClick={() => setShowBulkEdit((v) => !v)}>Bulk edit</button>
            </>
          )}
          </div>
        </div>
        {showBulkEdit && selectedIds.length > 0 && (
          <div className="flex flex-wrap gap-2 items-center bg-slate-50 p-2 rounded border border-slate-200 dark:border-slate-800 dark:bg-slate-800">
            <select
              className="border rounded p-2 text-sm text-slate-900 bg-white dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              value={bulkField}
              onChange={(e) => setBulkField(e.target.value)}
            >
              <option value="">Select field</option>
              {fieldKeys.map((key) => (
                <option key={key} value={key}>{key}</option>
              ))}
            </select>
            <input
              type="text"
              className="border rounded p-2 text-sm text-slate-900 bg-white flex-1 min-w-[200px] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              placeholder="Value (use comma for arrays)"
              value={bulkValue}
              onChange={(e) => setBulkValue(e.target.value)}
            />
            <button
              className={`${BUTTON_CLASSES.primary} ${BUTTON_SIZES.xs}`}
              onClick={() => onBulkEdit(selectedEntries, bulkField, bulkValue)}
              disabled={!bulkField}
            >
              Apply
            </button>
            <button className={`${BUTTON_CLASSES.secondary} ${BUTTON_SIZES.xs}`} onClick={() => setShowBulkEdit(false)}>Cancel</button>
          </div>
        )}
        {showColumns && (
          <div className="flex flex-wrap gap-3 items-center bg-slate-50 p-2 rounded border border-slate-200 dark:border-slate-800 dark:bg-slate-800">
            {allFields.map((field) => (
              <label key={field} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={isFieldVisible(field)}
                  onChange={() => toggleField(field)}
                />
                {field}
              </label>
            ))}
          </div>
        )}
        {/* Search controls for filtering entries in the list. */}
        <div className="flex gap-2 items-center bg-slate-100 p-2 rounded-md border border-slate-200 dark:border-slate-800 dark:bg-slate-800">
          <select
            className="border rounded p-2 text-sm text-slate-900 bg-white dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            value={searchField}
            onChange={e => setSearchField(e.target.value)}
          >
            <option value="__all__">All Fields</option>
            {fieldKeys.map((key) => (
              <option key={key} value={key}>{key}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder={searchField === "__all__" ? `Search all fields...` : `Search ${searchField}...`}
            className="w-full p-2 border rounded text-slate-900 bg-white placeholder:text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className={`text-[11px] ${TEXT_CLASSES.subtle}`}>
          Shortcuts: <span className="font-medium">Ctrl/Cmd+S</span> save, <span className="font-medium">Ctrl/Cmd+N</span> new, <span className="font-medium">Ctrl/Cmd+D</span> duplicate
        </div>
        {recentEntries.length > 0 && (
          <div className="rounded border border-slate-200 bg-slate-50 px-2 py-2 dark:border-slate-800 dark:bg-slate-800">
            <div className={`text-xs font-semibold mb-1 ${TEXT_CLASSES.muted}`}>Recent</div>
            <div className="flex flex-wrap gap-1">
              {recentEntries.slice(0, 8).map((recent) => (
                <button
                  key={recent.id}
                  type="button"
                  className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs} max-w-[220px] truncate`}
                  title={`${recent.label} (${recent.id})`}
                  onClick={() => onOpenRecentEntry(recent.id)}
                >
                  {recent.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto min-h-0 px-5 py-4">
        {entries.length === 0 ? (
          <div className="flex min-h-[260px] items-center justify-center rounded-md border border-dashed border-slate-300 bg-white px-6 py-10 text-center dark:border-slate-700 dark:bg-slate-900">
            <div>
              <div className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {hasFilters ? "No matching entries" : "No entries yet"}
              </div>
              <div className="mt-1 max-w-md text-sm text-slate-600 dark:text-slate-400">
                {hasFilters
                  ? "Adjust the search or field filter to bring entries back into view."
                  : "Create the first entry for this dataset and use references, tags, and presets to keep it connected to the rest of the RPG data."}
              </div>
              {!hasFilters && (
                <button className={`mt-4 ${BUTTON_CLASSES.success} ${BUTTON_SIZES.sm}`} onClick={onAddNew}>
                  Create Entry
                </button>
              )}
            </div>
          </div>
        ) : entries.length > 100 ? (
          <VirtualizedTable
            entries={entries}
            listFields={visibleFields}
            idField={idField}
            editingId={editingId}
            onEdit={onEdit}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
            selectedIds={selectedSet}
            onToggleSelect={toggleSelect}
            onToggleSelectAll={toggleSelectAll}
            allSelected={allSelected}
          />
        ) : (
          <table className="min-w-full overflow-hidden rounded-md border border-slate-200 bg-white text-sm text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
            <thead>
              <tr>
                <th className="px-3 py-2 border-b border-slate-200 bg-slate-100 font-semibold text-slate-700 whitespace-nowrap dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                  />
                </th>
                {visibleFields.map((key) => (
                  <th key={key} className="px-3 py-2 border-b border-slate-200 bg-slate-100 font-semibold text-slate-700 whitespace-nowrap dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300">{key}</th>
                ))}
                <th className="px-3 py-2 border-b border-slate-200 bg-slate-100 font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300">Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const entryId = getEntryId(entry, idField);
                const isActive = !!editingId && entryId === editingId;
                const badges = getEntryBadges(entry);
                return (
                  <tr key={entryId} className={`${isActive ? "bg-blue-50 ring-1 ring-inset ring-blue-300 dark:bg-blue-950/60 dark:ring-blue-800" : "hover:bg-slate-50 dark:hover:bg-slate-800"} transition-colors`}>
                    <td className="px-3 py-2 border-b border-slate-100 whitespace-nowrap dark:border-slate-800">
                      <input
                        type="checkbox"
                        checked={selectedSet.has(entryId)}
                        onChange={() => toggleSelect(entryId)}
                      />
                    </td>
                    {visibleFields.map((key) => {
                      const value = entry[key];
                      const isImage = typeof value === 'string' && (value.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i) && (value.startsWith('http') || value.startsWith('/')));
                      const cellText = formatCellValue(value);
                      const isPrimaryField = key === "name" || key === "title" || key === "slug";
                      return (
                        <td key={key} className="px-3 py-2 border-b border-slate-100 whitespace-nowrap max-w-xs overflow-hidden text-slate-900 dark:border-slate-800 dark:text-slate-100">
                          {isImage ? (
                            <img src={value} alt="asset" style={{ maxHeight: '40px', maxWidth: '80px', objectFit: 'contain' }} />
                          ) : isPrimaryField ? (
                            <div className="min-w-0">
                              <div className={`truncate ${isActive ? "font-semibold text-blue-950 dark:text-blue-200" : "font-medium text-slate-950 dark:text-slate-100"}`} title={cellText || getEntryLabel(entry, idField)}>
                                {cellText || getEntryLabel(entry, idField)}
                              </div>
                              {badges.length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {badges.map((badge) => (
                                    <span key={badge} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                      {badge}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="block truncate" title={cellText}>{cellText}</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 border-b border-slate-100 whitespace-nowrap dark:border-slate-800">
                      <button
                        className={`mr-2 ${BUTTON_CLASSES.primary} ${BUTTON_SIZES.xs}`}
                        onClick={() => onEdit(entry)}
                      >Edit</button>
                      <button
                        className={`mr-2 ${BUTTON_CLASSES.violet} ${BUTTON_SIZES.xs}`}
                        onClick={() => onDuplicate(entry)}
                      >Duplicate</button>
                      <button
                        className={`${BUTTON_CLASSES.danger} ${BUTTON_SIZES.xs}`}
                        onClick={() => onDelete(entry)}
                        type="button"
                        aria-label="Delete entry"
                      >Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default memo(EntryListPanel);
