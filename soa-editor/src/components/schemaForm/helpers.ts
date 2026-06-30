import { asRecord } from './types';

export type NumberValueType = 'number' | 'integer';
export type NumberInputFormat = 'standard' | 'dragon_era_year';

const schemaNameOverrides: Record<string, string> = {
  'content-packs': 'content_packs',
  'dialogue-nodes': 'dialogue_nodes',
  'lore-entries': 'lore_entries',
  'story-arcs': 'story_arcs',
  'talent-nodes': 'talent_nodes',
  'talent-node-links': 'talent_node_links',
  'talent-trees': 'talent_trees',
  'shop-inventory': 'shops_inventory',
};

const schemaToApiPathOverrides: Record<string, string> = {
  content_packs: 'content-packs',
  dialogue_nodes: 'dialogue-nodes',
  lore_entries: 'lore-entries',
  story_arcs: 'story-arcs',
  talent_nodes: 'talent-nodes',
  talent_node_links: 'talent-node-links',
  talent_trees: 'talent-trees',
  shops_inventory: 'shop-inventory',
};

export function resolveSchemaName(refType: string): string {
  return schemaNameOverrides[refType] || refType;
}

function resolveApiPathFromSchemaName(schemaName: string): string {
  return schemaToApiPathOverrides[schemaName] || schemaName;
}

export function resolveReferenceFromOptionsSource(source: unknown): string | null {
  if (typeof source !== 'string') return null;
  const normalized = source.replace(/\\/g, '/').trim();
  const fileName = normalized.split('/').pop();
  if (!fileName || !fileName.toLowerCase().endsWith('.json')) return null;
  const schemaName = fileName.replace(/\.json$/i, '');
  if (!schemaName) return null;
  return resolveApiPathFromSchemaName(schemaName);
}

export function isMissingScalarValue(val: unknown): boolean {
  if (val === null || val === undefined) return true;
  if (typeof val === 'string') return val.trim() === '';
  return false;
}

export function normalizeDecimalInput(raw: string): string {
  return raw.replace(',', '.');
}

function groupThousands(value: string): string {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function formatDragonEraYear(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || !Number.isInteger(numeric)) return String(value);
  const absolute = Math.abs(numeric);
  const formatted = groupThousands(String(absolute));
  if (numeric < 0) return `-${formatted} b.D.`;
  return `${formatted} a.D.`;
}

export function parseDragonEraYear(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const eraMatch = trimmed.match(/^([+-]?)\s*([0-9][0-9.\s_]*)\s*([ab])\s*\.?\s*d\s*\.?\s*$/i);
  const plainMatch = trimmed.match(/^([+-]?)\s*([0-9][0-9.\s_]*)\s*$/);
  const match = eraMatch || plainMatch;
  if (!match) return null;

  const sign = match[1];
  const digits = match[2].replace(/[.\s_]/g, '');
  if (!/^\d+$/.test(digits)) return null;

  const year = Number.parseInt(digits, 10);
  if (!Number.isFinite(year)) return null;

  const era = eraMatch ? match[3].toLowerCase() : '';
  if (era === 'b') return -year;
  if (era === 'a') return sign === '-' ? null : year;
  return sign === '-' ? -year : year;
}

export function parseNumberByType(raw: string, valueType: NumberValueType, inputFormat: NumberInputFormat = 'standard'): number | null {
  if (inputFormat === 'dragon_era_year') return parseDragonEraYear(raw);
  if (valueType === 'integer') {
    if (!/^-?\d+$/.test(raw)) return null;
    const parsedInt = parseInt(raw, 10);
    return Number.isNaN(parsedInt) ? null : parsedInt;
  }
  const parsedFloat = parseFloat(raw);
  return Number.isNaN(parsedFloat) ? null : parsedFloat;
}

export function formatNumberInputValue(value: unknown, inputFormat: NumberInputFormat = 'standard'): string {
  if (value === null || value === undefined) return '';
  if (inputFormat === 'dragon_era_year') return formatDragonEraYear(value);
  return String(value);
}

export function normalizeNumberInput(raw: string, inputFormat: NumberInputFormat = 'standard'): string {
  if (inputFormat === 'dragon_era_year') return raw;
  return normalizeDecimalInput(raw);
}

export function getNumberPlaceholder(labelText: string, keyName?: string, inputFormat: NumberInputFormat = 'standard'): string {
  if (inputFormat === 'dragon_era_year') return 'e.g. -50.000 b.D. or 10.000 a.D.';
  const lower = `${labelText} ${keyName || ''}`.toLowerCase();
  if (lower.includes('multiplier')) return 'e.g. 0.8';
  if (lower.includes('chance') || lower.includes('%')) return 'e.g. 25';
  if (lower.includes('min') || lower.includes('max')) return 'e.g. 0';
  return 'e.g. 1.0';
}

export function mapSelectOptions(selectOptions: unknown[]): { label: string; value: string }[] {
  return (selectOptions || []).map((opt) => ({
    label: String(opt),
    value: String(opt),
  }));
}

export function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export function getReferenceOptionLabel(opt: unknown, refType: string): string {
  const record = asRecord(opt);
  const labelText =
    record.name ||
    record.title ||
    record.slug ||
    record.id ||
    record[`${refType.slice(0, -1)}_id`] ||
    record[`${refType}_id`] ||
    JSON.stringify(opt);
  return String(labelText);
}

export function getReferenceOptionValue(opt: unknown, refType: string): string {
  const record = asRecord(opt);
  const valueText =
    record.id ||
    record[`${refType.slice(0, -1)}_id`] ||
    record[`${refType}_id`] ||
    opt;
  return String(valueText);
}

export function mapReferenceOptions(options: unknown[], refType: string): { label: string; value: string }[] {
  return (Array.isArray(options) ? options : []).map((opt) => ({
    label: getReferenceOptionLabel(opt, refType),
    value: getReferenceOptionValue(opt, refType),
  }));
}

export function formatCompactNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
