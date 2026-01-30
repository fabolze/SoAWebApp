import { useState, type ReactNode } from 'react';

interface ArrayStringMultiSelectFieldProps {
  label: string;
  description?: string;
  value: string[];
  options: any[];
  refType?: string | null;
  recentlyAddedId?: string;
  onChange: (next: string[]) => void;
  onCreateReference?: () => Promise<string | null>;
  onMarkRecentlyAdded?: (id: string) => void;
  renderFieldLabel: (label: string, description?: string, action?: ReactNode) => ReactNode;
}

export default function ArrayStringMultiSelectField({
  label,
  description,
  value,
  options,
  refType,
  recentlyAddedId,
  onChange,
  onCreateReference,
  onMarkRecentlyAdded,
  renderFieldLabel,
}: ArrayStringMultiSelectFieldProps) {
  const [filter, setFilter] = useState('');
  const currentValues = Array.isArray(value) ? value : [];
  const safeOptions = Array.isArray(options) ? options : [];

  const filteredOptions = safeOptions.filter((opt: any) => {
    const display = opt?.name || opt?.title || opt?.id || opt?.[`${refType?.slice(0, -1)}_id`] || opt?.[`${refType}_id`] || opt;
    const displayText = String(display ?? '');
    return displayText.toLowerCase().includes(filter.toLowerCase());
  });

  const handleCreate = async () => {
    if (!onCreateReference) return;
    const createdId = await onCreateReference();
    if (!createdId) return;
    if (!currentValues.includes(createdId)) {
      onChange([...currentValues, createdId]);
      if (onMarkRecentlyAdded) onMarkRecentlyAdded(createdId);
    }
  };

  const createAction = onCreateReference ? (
    <button
      type="button"
      className="text-xs px-2 py-1 rounded border border-slate-300 text-slate-700 bg-slate-100 hover:bg-slate-200"
      onClick={handleCreate}
    >
      Create new
    </button>
  ) : null;

  return (
    <div className="form-field">
      {renderFieldLabel(label, description, createAction)}
      <div className="border border-gray-300 rounded-md p-3 bg-white">
        <input
          type="text"
          className="mb-2 w-full border border-gray-200 rounded px-2 py-1 text-sm text-gray-800 placeholder:text-gray-500"
          placeholder={`Type to filter ${label}...`}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        {filteredOptions.length === 0 ? (
          <p className="text-sm text-gray-500">No options available</p>
        ) : (
          <div className="flex flex-col gap-1">
            {filteredOptions.map((opt: any) => {
              const display = opt?.name || opt?.title || opt?.id || opt?.[`${refType?.slice(0, -1)}_id`] || opt?.[`${refType}_id`] || opt;
              const val = opt?.id || opt?.[`${refType?.slice(0, -1)}_id`] || opt?.[`${refType}_id`] || opt;
              const checked = currentValues.includes(val);
              const isRecent = recentlyAddedId === val;
              return (
                <label
                  key={val}
                  className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer transition-colors ${checked ? 'bg-blue-100 border border-blue-200' : 'hover:bg-blue-50'} ${isRecent ? 'ring-2 ring-emerald-300 bg-emerald-50 border border-emerald-200' : ''}`}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-slate-700 accent-slate-600 focus:ring-slate-400"
                    checked={checked}
                    onChange={() => {
                      if (checked) {
                        onChange(currentValues.filter((v: string) => v !== val));
                      } else {
                        onChange([...currentValues, val]);
                      }
                    }}
                  />
                  <span className="text-sm text-gray-800">{String(display ?? '')}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
