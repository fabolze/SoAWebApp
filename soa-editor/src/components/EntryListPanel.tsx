import VirtualizedTable from "./VirtualizedTable";

interface EntryListPanelProps {
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
}

const EntryListPanel = ({
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
}: EntryListPanelProps) => (
  <div className="flex-1 min-w-0 flex flex-col h-full max-h-full overflow-hidden border-r border-slate-200 bg-gray-50 p-6">
    <div className="flex flex-col gap-2 p-4 border-b bg-white sticky top-0 z-10">
      <div className="flex gap-2 items-center mb-2">
        <button className="bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700" onClick={onAddNew}>+ New</button>
      </div>
      <div className="flex gap-2 items-center mb-2 bg-gray-100 p-2.5 rounded shadow">
        <select
          className="border rounded p-2 text-sm"
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
          className="w-full p-2 border rounded"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
    </div>
    <div className="flex-1 overflow-y-auto min-h-0">
      {entries.length > 100 ? (
        <VirtualizedTable
          entries={entries}
          listFields={listFields}
          idField={idField}
          editingId={editingId}
          onEdit={onEdit}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
        />
      ) : (
        <table className="min-w-full border text-sm">
          <thead>
            <tr>
              {listFields.map((key) => (
                <th key={key} className="px-3 py-2 border-b bg-gray-50 font-semibold text-gray-700 whitespace-nowrap">{key}</th>
              ))}
              <th className="px-3 py-2 border-b bg-gray-50 font-semibold text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry[idField]} className={editingId && entry[idField] === editingId ? "bg-yellow-100" : "hover:bg-blue-50"}>
                {listFields.map((key) => {
                  const value = entry[key];
                  const isImage = typeof value === 'string' && (value.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i) && (value.startsWith('http') || value.startsWith('/')));
                  return (
                    <td key={key} className="px-3 py-2 border-b whitespace-nowrap max-w-xs overflow-x-auto">
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

export default EntryListPanel;
