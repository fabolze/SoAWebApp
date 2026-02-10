import { useMemo, useRef, useState, type ReactNode } from 'react';
import useDebouncedValue from '../hooks/useDebouncedValue';
import { BUTTON_CLASSES, BUTTON_SIZES } from '../../styles/uiTokens';
import { asRecord } from '../schemaForm/types';

interface ArrayStringMultiSelectFieldProps {
  label: string;
  description?: string;
  value: string[];
  options: unknown[];
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
  const [bulkNotice, setBulkNotice] = useState<{ type: 'success' | 'warning'; message: string } | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const currentValues = useMemo(() => (Array.isArray(value) ? value : []), [value]);
  const safeOptions = useMemo(() => (Array.isArray(options) ? options : []), [options]);
  const listRef = useRef<HTMLDivElement>(null);
  const debouncedFilter = useDebouncedValue(filter, 120);
  const rowHeight = 34;
  const overscan = 8;
  const viewportHeight = 288;

  const normalizedOptions = useMemo(
    () =>
      safeOptions.map((opt) => {
        const record = asRecord(opt);
        const display =
          record.name ||
          record.title ||
          record.id ||
          record[`${refType?.slice(0, -1)}_id`] ||
          record[`${refType}_id`] ||
          opt;
        const val =
          record.id ||
          record[`${refType?.slice(0, -1)}_id`] ||
          record[`${refType}_id`] ||
          opt;
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
  const normalizedCurrentValues = useMemo(() => currentValues.map((val) => String(val)), [currentValues]);
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

  const handleSelectVisible = () => {
    if (filteredOptions.length === 0) return;
    const nextValues = [...normalizedCurrentValues];
    let added = 0;
    for (const opt of filteredOptions) {
      if (!selectedSet.has(opt.value)) {
        nextValues.push(opt.value);
        added += 1;
      }
    }
    if (added === 0) {
      setBulkNotice({ type: 'warning', message: 'All visible options are already selected.' });
      return;
    }
    onChange(nextValues);
    setBulkNotice({ type: 'success', message: `Added ${added} option(s).` });
  };

  const handleClearVisible = () => {
    if (filteredOptions.length === 0) return;
    const visibleValueSet = new Set(filteredOptions.map((opt) => opt.value));
    const nextValues = normalizedCurrentValues.filter((val) => !visibleValueSet.has(val));
    const removed = normalizedCurrentValues.length - nextValues.length;
    if (removed === 0) {
      setBulkNotice({ type: 'warning', message: 'No visible selections to clear.' });
      return;
    }
    onChange(nextValues);
    setBulkNotice({ type: 'success', message: `Removed ${removed} option(s).` });
  };

  const handlePasteBulkIds = () => {
    const raw = window.prompt(`Paste ${label} IDs or labels (comma/newline separated):`);
    if (raw === null) return;
    const tokens = raw
      .split(/[\n,;]+/g)
      .map((token) => token.trim())
      .filter(Boolean);
    if (tokens.length === 0) {
      setBulkNotice({ type: 'warning', message: 'No IDs or labels detected.' });
      return;
    }

    const byValue = new Map(normalizedOptions.map((opt) => [opt.value.toLowerCase(), opt.value]));
    const byLabel = new Map(normalizedOptions.map((opt) => [opt.label.toLowerCase(), opt.value]));

    const resolved: string[] = [];
    const unmatched: string[] = [];
    for (const token of tokens) {
      const normalized = token.toLowerCase();
      const hit = byValue.get(normalized) || byLabel.get(normalized);
      if (hit) {
        resolved.push(hit);
      } else {
        unmatched.push(token);
      }
    }

    if (resolved.length === 0) {
      setBulkNotice({ type: 'warning', message: `No matches found. Unmatched: ${unmatched.slice(0, 3).join(', ')}` });
      return;
    }

    const deduped = Array.from(new Set(resolved));
    const nextValues = [...normalizedCurrentValues];
    let added = 0;
    for (const val of deduped) {
      if (!selectedSet.has(val) && !nextValues.includes(val)) {
        nextValues.push(val);
        added += 1;
      }
    }

    if (added > 0) {
      onChange(nextValues);
    }

    if (unmatched.length > 0) {
      const preview = unmatched.slice(0, 3).join(', ');
      const suffix = unmatched.length > 3 ? '...' : '';
      setBulkNotice({ type: 'warning', message: `Added ${added}. Unmatched ${unmatched.length}: ${preview}${suffix}` });
      return;
    }

    setBulkNotice({ type: 'success', message: `Added ${added} option(s) from pasted values.` });
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
        <div className="mb-2 flex items-center gap-1 flex-wrap">
          <button
            type="button"
            className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`}
            onClick={handleSelectVisible}
            disabled={filteredOptions.length === 0}
          >
            Select Visible
          </button>
          <button
            type="button"
            className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`}
            onClick={handleClearVisible}
            disabled={filteredOptions.length === 0}
          >
            Clear Visible
          </button>
          <button
            type="button"
            className={`${BUTTON_CLASSES.secondary} ${BUTTON_SIZES.xs}`}
            onClick={handlePasteBulkIds}
          >
            Paste IDs/Labels
          </button>
        </div>
        {bulkNotice && (
          <div
            className={`mb-2 rounded border px-2 py-1 text-xs ${
              bulkNotice.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-amber-200 bg-amber-50 text-amber-800'
            }`}
          >
            {bulkNotice.message}
          </div>
        )}
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
                  const nextValues = [...normalizedCurrentValues];
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
