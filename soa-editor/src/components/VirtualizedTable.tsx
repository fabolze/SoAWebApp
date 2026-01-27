// VirtualizedTable.tsx
import { FixedSizeList as List, ListChildComponentProps } from 'react-window';
import React from 'react';

interface VirtualizedTableProps {
  entries: any[];
  listFields: string[];
  idField: string;
  editingId: string | null;
  onEdit: (entry: any) => void;
  onDuplicate: (entry: any) => void;
  onDelete: (entry: any) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  allSelected: boolean;
}

const ROW_HEIGHT = 40;

const VirtualizedTable: React.FC<VirtualizedTableProps> = ({ entries, listFields, idField, editingId, onEdit, onDuplicate, onDelete, selectedIds, onToggleSelect, onToggleSelectAll, allSelected }) => {
  // Defensive: ensure entries is always an array
  if (!Array.isArray(entries)) {
    console.warn("VirtualizedTable: 'entries' is not an array:", entries);
    entries = [];
  }

  // Render a virtualized row to keep large lists responsive.
  const Row = ({ index, style }: ListChildComponentProps) => {
    const entry = entries[index];
    return (
      <tr
        style={style}
        key={entry[idField]}
        className={editingId && entry[idField] === editingId ? "bg-yellow-100" : "hover:bg-blue-50"}
      >
        <td className="px-3 py-2 border-b whitespace-nowrap">
          <input
            type="checkbox"
            checked={selectedIds.has(entry[idField])}
            onChange={() => onToggleSelect(entry[idField])}
          />
        </td>
        {listFields.map((key) => (
          <td key={key} className="px-3 py-2 border-b whitespace-nowrap max-w-xs overflow-x-auto text-slate-900">
            {String(entry[key] ?? '')}
          </td>
        ))}
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
    );
  };

  return (
    <div style={{ height: Math.min(400, entries.length * ROW_HEIGHT), width: '100%' }} className="rounded-xl shadow-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 overflow-hidden">
      {/* Static header stays visible while rows are virtualized below. */}
      <table className="min-w-full text-sm text-slate-900">
        <thead>
          <tr>
            <th className="px-3 py-2 border-b bg-gray-50 dark:bg-gray-800 font-semibold text-slate-700 dark:text-gray-200 whitespace-nowrap text-left uppercase tracking-wider text-xs">
              <input type="checkbox" checked={allSelected} onChange={onToggleSelectAll} />
            </th>
            {listFields.map((key) => (
              <th key={key} className="px-3 py-2 border-b bg-gray-50 dark:bg-gray-800 font-semibold text-slate-700 dark:text-gray-200 whitespace-nowrap text-left uppercase tracking-wider text-xs">{key}</th>
            ))}
            <th className="px-3 py-2 border-b bg-gray-50 dark:bg-gray-800 font-semibold text-slate-700 dark:text-gray-200 text-left uppercase tracking-wider text-xs">Actions</th>
          </tr>
        </thead>
      </table>
      <div style={{ height: Math.min(400, entries.length * ROW_HEIGHT), overflow: 'auto' }}>
        <table className="min-w-full text-sm text-slate-900">
          <tbody>
            <List
              height={Math.min(400, entries.length * ROW_HEIGHT)}
              itemCount={entries.length}
              itemSize={ROW_HEIGHT}
              width={"100%"}
            >
              {Row}
            </List>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default VirtualizedTable;
