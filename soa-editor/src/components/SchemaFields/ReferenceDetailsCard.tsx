import { useMemo } from 'react';
import { asRecord } from '../schemaForm/types';

interface ReferenceDetailsCardProps {
  entry: unknown;
  refType?: string | null;
  className?: string;
  maxRows?: number;
}

type PreviewRow = {
  key: string;
  label: string;
  value: string;
};

const PREFERRED_KEYS = [
  'type',
  'target',
  'trigger_condition',
  'value_type',
  'value',
  'duration',
  'apply_chance',
  'resource_cost',
  'cooldown',
  'scaling_stat_id',
  'status_id',
  'attribute_id',
  'rarity',
  'category',
  'stackable',
  'tags',
] as const;

const EXCLUDED_KEYS = new Set<string>([
  'id',
  'name',
  'title',
  'slug',
  'description',
  'icon_path',
  'created_at',
  'updated_at',
]);

function toLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : null;
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  if (Array.isArray(value)) {
    const entries = value
      .map((item) => {
        if (item === null || item === undefined) return '';
        if (typeof item === 'string') return item.trim();
        if (typeof item === 'number' || typeof item === 'boolean') return String(item);
        return '';
      })
      .filter((item) => item.length > 0);
    if (entries.length === 0) return null;
    const shown = entries.slice(0, 4);
    const suffix = entries.length > shown.length ? ` (+${entries.length - shown.length} more)` : '';
    return `${shown.join(', ')}${suffix}`;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(asRecord(value));
    if (keys.length === 0) return null;
    return `${keys.length} fields`;
  }
  return String(value);
}

function getDisplayName(entry: unknown): string {
  const record = asRecord(entry);
  const displayValue = record.name ?? record.title ?? record.slug ?? record.id;
  if (typeof displayValue === 'string' && displayValue.trim()) return displayValue;
  if (typeof displayValue === 'number') return String(displayValue);
  return 'Selected entry';
}

function getDisplayId(entry: unknown, refType?: string | null): string {
  const record = asRecord(entry);
  const idCandidate =
    record.id ||
    (refType ? record[`${refType.slice(0, -1)}_id`] : undefined) ||
    (refType ? record[`${refType}_id`] : undefined);
  return typeof idCandidate === 'string' ? idCandidate : '';
}

function getSummary(entry: unknown): string {
  const record = asRecord(entry);
  const summaryCandidate = record.description ?? record.lore ?? record.text;
  if (typeof summaryCandidate !== 'string') return '';
  const trimmed = summaryCandidate.trim();
  if (!trimmed) return '';
  return trimmed.length > 180 ? `${trimmed.slice(0, 177)}...` : trimmed;
}

function getPreviewRows(entry: unknown, maxRows: number): PreviewRow[] {
  const record = asRecord(entry);
  const seen = new Set<string>();
  const rows: PreviewRow[] = [];

  const tryPush = (key: string) => {
    if (seen.has(key)) return;
    const value = formatValue(record[key]);
    if (!value) return;
    seen.add(key);
    rows.push({ key, label: toLabel(key), value });
  };

  PREFERRED_KEYS.forEach((key) => {
    if (rows.length < maxRows) tryPush(key);
  });

  if (rows.length >= maxRows) return rows;

  Object.keys(record).forEach((key) => {
    if (rows.length >= maxRows) return;
    if (EXCLUDED_KEYS.has(key)) return;
    tryPush(key);
  });

  return rows;
}

export default function ReferenceDetailsCard({
  entry,
  refType,
  className,
  maxRows = 6,
}: ReferenceDetailsCardProps) {
  const displayName = useMemo(() => getDisplayName(entry), [entry]);
  const displayId = useMemo(() => getDisplayId(entry, refType), [entry, refType]);
  const summary = useMemo(() => getSummary(entry), [entry]);
  const rows = useMemo(() => getPreviewRows(entry, maxRows), [entry, maxRows]);

  return (
    <div className={`rounded-md border border-slate-200 bg-slate-50 p-3 ${className || ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 text-sm font-semibold text-slate-900 truncate">{displayName}</div>
        {displayId && (
          <code className="text-[11px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 shrink-0">
            {displayId}
          </code>
        )}
      </div>
      {summary && <p className="mt-1 text-xs text-slate-600 leading-relaxed">{summary}</p>}
      {rows.length > 0 ? (
        <dl className="mt-2 grid grid-cols-1 gap-1.5">
          {rows.map((row) => (
            <div key={row.key} className="flex items-start gap-2 text-xs">
              <dt className="w-32 shrink-0 text-slate-500">{row.label}</dt>
              <dd className="text-slate-800 break-words">{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <div className="mt-2 text-xs text-slate-500">No additional structured fields available.</div>
      )}
    </div>
  );
}
