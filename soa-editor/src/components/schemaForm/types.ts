export type UnknownRecord = Record<string, unknown>;

export interface SchemaFieldUiConfig extends UnknownRecord {
  label?: string;
  description?: string;
  widget?: string;
  visible_if?: Record<string, unknown>;
  reference?: string;
  options_source?: unknown;
  options?: unknown[];
  disabled?: boolean;
  list_display?: boolean;
}

export interface SchemaFieldConfig extends UnknownRecord {
  type?: string;
  description?: string;
  enum?: unknown[];
  properties?: Record<string, SchemaFieldConfig>;
  items?: SchemaFieldConfig;
  required?: string[];
  ui?: SchemaFieldUiConfig;
}

export interface SchemaDefinition extends UnknownRecord {
  title?: string;
  properties?: Record<string, SchemaFieldConfig>;
  required?: string[];
}

export type EntryData = UnknownRecord;
export type ReferenceOptionsMap = Record<string, unknown[]>;

export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asRecord(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {};
}
