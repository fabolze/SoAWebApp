import { useMemo, useRef, useState, type ReactNode } from 'react';
import useDebouncedValue from '../hooks/useDebouncedValue';
import { BUTTON_CLASSES, BUTTON_SIZES } from '../../styles/uiTokens';

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
  const [scrollTop, setScrollTop] = useState(0);
  const currentValues = Array.isArray(value) ? value : [];
  const safeOptions = Array.isArray(options) ? options : [];
  const listRef = useRef<HTMLDivElement>(null);
  const debouncedFilter = useDebouncedValue(filter, 120);
  const rowHeight = 34;
  const overscan = 8;
  const viewportHeight = 288;

  const normalizedOptions = useMemo(
    () =>
      safeOptions.map((opt: any) => {
        const display = opt?.name || opt?.title || opt?.id || opt?.[`${refType?.slice(0, -1)}_id`] || opt?.[`${refType}_id`] || opt;
        const val = opt?.id || opt?.[`${refType?.slice(0, -1)}_id`] || opt?.[`${refType}_id`] || opt;
        return { label: String(display ?? ''), value: String(val ?? '') };
      }),
    [safeOptions, refType]
  );

  const filteredOptions = useMemo(() => {
    const query = debouncedFilter.toLowerCase().trim();
    if (!query) return normalizedOptions;
    return normalizedOptions.filter((opt) => opt.label.toLowerCase().includes(query));
  }, [normalizedOptions, debouncedFilter]);

  const selectedSet = useMemo(() => new Set(currentValues.map((val) => String(val))), [currentValues]);
  const isVirtualized = filteredOptions.length >= 150;
  const startIndex = isVirtualized ? Math.max(0, Math.floor(scrollTop / rowHeight) - overscan) : 0;
  const visibleCount = isVirtualized ? Math.ceil(viewportHeight / rowHeight) + overscan * 2 : filteredOptions.length;
  const endIndex = isVirtualized ? Math.min(filteredOptions.length, startIndex + visibleCount) : filteredOptions.length;
  const visibleOptions = isVirtualized ? filteredOptions.slice(startIndex, endIndex) : filteredOptions;
  const totalHeight = filteredOptions.length * rowHeight;

  const handleCreate = async () => {
    if (!onCreateReference) return;
    const createdId = await onCreateReference();
    if (!createdId) return;
    const normalizedCreatedId = String(createdId);
    if (!selectedSet.has(normalizedCreatedId)) {
      onChange([...currentValues.map((val) => String(val)), normalizedCreatedId]);
      if (onMarkRecentlyAdded) onMarkRecentlyAdded(normalizedCreatedId);
    }
  };

  const createAction = onCreateReference ? (
    <button
      type="button"
      className={`${BUTTON_CLASSES.secondary} ${BUTTON_SIZES.xs}`}
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
          onChange={(e) => {
            setFilter(e.target.value);
            setScrollTop(0);
            if (listRef.current) listRef.current.scrollTop = 0;
          }}
        />
        <div className="mb-2 text-xs text-gray-500">
          Selected: {selectedSet.size} / Matches: {filteredOptions.length}
        </div>
        {filteredOptions.length === 0 ? (
          <p className="text-sm text-gray-500">No options available</p>
        ) : (
          <div
            ref={listRef}
            className="overflow-y-auto max-h-72"
            onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
          >
            <div className={isVirtualized ? '' : 'flex flex-col gap-1'} style={isVirtualized ? { height: totalHeight, position: 'relative' } : undefined}>
              <div
                className="flex flex-col gap-1"
                style={isVirtualized ? { position: 'absolute', top: startIndex * rowHeight, left: 0, right: 0 } : undefined}
              >
                {visibleOptions.map((opt, index) => {
                  const val = opt.value;
                  const checked = selectedSet.has(val);
                  const isRecent = String(recentlyAddedId || '') === val;
                  const nextValues = currentValues.map((v) => String(v));
                  return (
                    <label
                      key={`${val}-${isVirtualized ? startIndex + index : index}`}
                      className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer transition-colors ${checked ? 'bg-blue-100 border border-blue-200' : 'hover:bg-blue-50'} ${isRecent ? 'ring-2 ring-emerald-300 bg-emerald-50 border border-emerald-200' : ''}`}
                      style={isVirtualized ? { height: rowHeight } : undefined}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-slate-700 accent-slate-600 focus:ring-slate-400"
                        checked={checked}
                        onChange={() => {
                          if (checked) {
                            onChange(nextValues.filter((v) => v !== val));
                          } else {
                            onChange([...nextValues, val]);
                          }
                        }}
                      />
                      <span className="text-sm text-gray-800">{opt.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
