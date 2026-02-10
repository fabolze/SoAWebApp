import { asRecord } from './types';

export type NumberValueType = 'number' | 'integer';

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

export function parseNumberByType(raw: string, valueType: NumberValueType): number | null {
  if (valueType === 'integer') {
    if (!/^-?\d+$/.test(raw)) return null;
    const parsedInt = parseInt(raw, 10);
    return Number.isNaN(parsedInt) ? null : parsedInt;
  }
  const parsedFloat = parseFloat(raw);
  return Number.isNaN(parsedFloat) ? null : parsedFloat;
}

export function getNumberPlaceholder(labelText: string, keyName?: string): string {
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
