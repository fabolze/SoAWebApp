import VirtualizedTable from "./VirtualizedTable";
import { useMemo, useState, useEffect } from "react";

interface EntryListPanelProps {
  schemaName: string;
  entries: any[];
  listFields: string[];
  idField: string;
  editingId: string | null;
  onEdit: (entry: any) => void;
  onDuplicate: (entry: any) => void;
  onDelete: (entry: any) => void;
  onAddNew: () => void;
  search: string;
  setSearch: (s: string) => void;
  searchField: string;
  setSearchField: (s: string) => void;
  fieldKeys: string[];
  onBulkDelete: (entries: any[]) => void;
  onBulkDuplicate: (entries: any[]) => void;
  onBulkEdit: (entries: any[], field: string, value: string) => void;
  showEditor: boolean;
  onToggleEditor: () => void;
}

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
}: EntryListPanelProps) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [bulkField, setBulkField] = useState<string>("");
  const [bulkValue, setBulkValue] = useState<string>("");
  const [showColumns, setShowColumns] = useState(false);
  const [visibleFields, setVisibleFields] = useState<string[]>(listFields);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allSelected = entries.length > 0 && selectedIds.length === entries.length;

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => entries.some((e) => e[idField] === id)));
  }, [entries, idField]);

  useEffect(() => {
    const storageKey = `soa.columns.${schemaName}`;
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setVisibleFields(parsed);
          return;
        }
      } catch {}
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
      setSelectedIds(entries.map((e) => e[idField]));
    }
  };

  const selectedEntries = entries.filter((e) => selectedSet.has(e[idField]));

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
    <div className="flex-1 min-w-0 flex flex-col h-full max-h-full overflow-hidden border-r border-slate-200 bg-gray-50 p-6">
      <div className="flex flex-col gap-2 p-4 border-b bg-white sticky top-0 z-10">
        <div className="flex flex-wrap gap-2 items-center mb-2">
          <button className="bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700" onClick={onAddNew}>+ New</button>
          <button
            className="px-2 py-1 rounded bg-slate-700 text-white text-xs hover:bg-slate-800"
            onClick={onToggleEditor}
          >
            {showEditor ? 'Hide Editor' : 'Show Editor'}
          </button>
          <button
            className="px-2 py-1 rounded bg-slate-200 text-slate-700 text-xs hover:bg-slate-300"
            onClick={() => setShowColumns((v) => !v)}
          >
            Columns
          </button>
          {selectedIds.length > 0 && (
            <>
              <span className="text-xs text-slate-600">{selectedIds.length} selected</span>
              <button className="px-2 py-1 rounded bg-indigo-600 text-white text-xs hover:bg-indigo-700" onClick={() => onBulkDuplicate(selectedEntries)}>Duplicate</button>
              <button className="px-2 py-1 rounded bg-red-600 text-white text-xs hover:bg-red-700" onClick={() => onBulkDelete(selectedEntries)}>Delete</button>
              <button className="px-2 py-1 rounded bg-slate-600 text-white text-xs hover:bg-slate-700" onClick={() => setShowBulkEdit((v) => !v)}>Bulk edit</button>
            </>
          )}
        </div>
        {showBulkEdit && selectedIds.length > 0 && (
          <div className="flex flex-wrap gap-2 items-center bg-slate-50 p-2 rounded border border-slate-200">
            <select
              className="border rounded p-2 text-sm text-slate-900 bg-white"
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
              className="border rounded p-2 text-sm text-slate-900 bg-white flex-1 min-w-[200px]"
              placeholder="Value (use comma for arrays)"
              value={bulkValue}
              onChange={(e) => setBulkValue(e.target.value)}
            />
            <button
              className="px-2 py-1 rounded bg-blue-600 text-white text-xs hover:bg-blue-700"
              onClick={() => onBulkEdit(selectedEntries, bulkField, bulkValue)}
              disabled={!bulkField}
            >
              Apply
            </button>
            <button className="px-2 py-1 rounded bg-slate-300 text-slate-700 text-xs hover:bg-slate-400" onClick={() => setShowBulkEdit(false)}>Cancel</button>
          </div>
        )}
        {showColumns && (
          <div className="flex flex-wrap gap-3 items-center bg-slate-50 p-2 rounded border border-slate-200">
            {allFields.map((field) => (
              <label key={field} className="flex items-center gap-2 text-xs text-slate-700">
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
        <div className="flex gap-2 items-center mb-2 bg-gray-100 p-2.5 rounded shadow">
          <select
            className="border rounded p-2 text-sm text-slate-900 bg-white"
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
            className="w-full p-2 border rounded text-slate-900 bg-white placeholder:text-slate-500"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        {entries.length > 100 ? (
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
          <table className="min-w-full border text-sm text-slate-900">
            <thead>
              <tr>
                <th className="px-3 py-2 border-b bg-gray-50 font-semibold text-slate-700 whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                  />
                </th>
                {visibleFields.map((key) => (
                  <th key={key} className="px-3 py-2 border-b bg-gray-50 font-semibold text-slate-700 whitespace-nowrap">{key}</th>
                ))}
                <th className="px-3 py-2 border-b bg-gray-50 font-semibold text-slate-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                // Highlight the currently edited row.
                <tr key={entry[idField]} className={editingId && entry[idField] === editingId ? "bg-yellow-100" : "hover:bg-blue-50"}>
                  <td className="px-3 py-2 border-b whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={selectedSet.has(entry[idField])}
                      onChange={() => toggleSelect(entry[idField])}
                    />
                  </td>
                  {visibleFields.map((key) => {
                    const value = entry[key];
                    const isImage = typeof value === 'string' && (value.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i) && (value.startsWith('http') || value.startsWith('/')));
                    return (
                      <td key={key} className="px-3 py-2 border-b whitespace-nowrap max-w-xs overflow-x-auto text-slate-900">
                        {isImage ? (
                          <img src={value} alt="asset" style={{ maxHeight: '40px', maxWidth: '80px', objectFit: 'contain' }} />
                        ) : (
                          String(value ?? '')
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 border-b whitespace-nowrap">
                    <button
                      className="mr-2 px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
                      onClick={() => onEdit(entry)}
                    >Edit</button>
                    <button
                      className="mr-2 px-2 py-1 bg-purple-500 text-white rounded hover:bg-purple-600"
                      onClick={() => onDuplicate(entry)}
                    >Duplicate</button>
                    <button
                      className="px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600"
                      onClick={() => onDelete(entry)}
                      type="button"
                      aria-label="Delete entry"
                    >Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default EntryListPanel;
