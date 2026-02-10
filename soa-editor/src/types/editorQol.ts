export type EntryRecord = Record<string, unknown>;

export interface RecentEntry {
  id: string;
  label: string;
  ts: number;
}

export interface ReferenceHit {
  schemaName: string;
  routePath: string;
  apiPath: string;
  schemaLabel: string;
  sourceId: string;
  sourceLabel: string;
  paths: string[];
}

export interface ReferenceSchemaGroup {
  schemaName: string;
  schemaLabel: string;
  routePath: string;
  count: number;
  hits: ReferenceHit[];
}

export interface ReferenceSummary {
  targetId: string;
  total: number;
  scannedAt: number;
  groups: ReferenceSchemaGroup[];
}
