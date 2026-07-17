import { generateUlid } from "../utils/generateId";
import {
  CREATION_FLOW_FORMAT,
  normalizeCreationFlowDraft,
  sameCreationFlowRef,
  type CreationFlowDraft,
  type CreationFlowOrigin,
} from "./creationFlow";

export interface StorageLike {
  readonly length: number;
  clear(): void;
  getItem(key: string): string | null;
  key(index: number): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

export interface CreationFlowSnapshot {
  id: string;
  name: string;
  createdAt: number;
  draft: CreationFlowDraft;
}

const DRAFT_PREFIX = "soa.creation-flow.draft.";
const SNAPSHOT_PREFIX = "soa.creation-flow.snapshots.";

function defaultStorage(): StorageLike {
  if (typeof window === "undefined" || !window.localStorage) throw new Error("Browser-local storage is unavailable.");
  return window.localStorage;
}

export function creationFlowDraftKey(id: string): string {
  return `${DRAFT_PREFIX}${id}`;
}

export function saveCreationFlowDraft(draft: CreationFlowDraft, storage: StorageLike = defaultStorage()): CreationFlowDraft {
  const normalized = normalizeCreationFlowDraft(draft);
  storage.setItem(creationFlowDraftKey(normalized.id), JSON.stringify(normalized));
  return normalized;
}

export function readCreationFlowDraft(id: string, storage: StorageLike = defaultStorage()): CreationFlowDraft | null {
  const raw = storage.getItem(creationFlowDraftKey(id));
  if (!raw) return null;
  try { return normalizeCreationFlowDraft(JSON.parse(raw)); } catch { return null; }
}

export function listCreationFlowDrafts(storage: StorageLike = defaultStorage()): CreationFlowDraft[] {
  const drafts: CreationFlowDraft[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index) || "";
    if (!key.startsWith(DRAFT_PREFIX)) continue;
    const id = key.slice(DRAFT_PREFIX.length);
    const draft = readCreationFlowDraft(id, storage);
    if (draft) drafts.push(draft);
  }
  return drafts.sort((left, right) => right.updatedAt - left.updatedAt || left.title.localeCompare(right.title));
}

export function findCreationFlowDrafts(origin: CreationFlowOrigin, storage: StorageLike = defaultStorage()): CreationFlowDraft[] {
  return listCreationFlowDrafts(storage).filter((draft) => sameCreationFlowRef(draft.origin?.ref, origin.ref)
    && (!origin.subRef || sameCreationFlowRef(draft.origin?.subRef, origin.subRef)));
}

export function deleteCreationFlowDraft(id: string, storage: StorageLike = defaultStorage()): void {
  storage.removeItem(creationFlowDraftKey(id));
  storage.removeItem(`${SNAPSHOT_PREFIX}${id}`);
}

export function exportCreationFlowDraft(draft: CreationFlowDraft): string {
  return `${JSON.stringify(normalizeCreationFlowDraft(draft), null, 2)}\n`;
}

export function importCreationFlowDraft(raw: string, storage: StorageLike = defaultStorage()): CreationFlowDraft {
  const parsed: unknown = JSON.parse(raw);
  const draft = normalizeCreationFlowDraft(parsed);
  return saveCreationFlowDraft(draft, storage);
}

export function readCreationFlowSnapshots(id: string, storage: StorageLike = defaultStorage()): CreationFlowSnapshot[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(`${SNAPSHOT_PREFIX}${id}`) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry): CreationFlowSnapshot[] => {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return [];
      const row = entry as Record<string, unknown>;
      if (typeof row.name !== "string") return [];
      try { return [{ id: String(row.id || generateUlid()), name: row.name, createdAt: Number(row.createdAt) || 0, draft: normalizeCreationFlowDraft(row.draft) }]; } catch { return []; }
    });
  } catch { return []; }
}

export function saveCreationFlowSnapshot(draft: CreationFlowDraft, name: string, storage: StorageLike = defaultStorage(), limit = 20): CreationFlowSnapshot[] {
  const next = [...readCreationFlowSnapshots(draft.id, storage), {
    id: generateUlid(), name: name.trim() || `Snapshot ${new Date().toLocaleString()}`, createdAt: Date.now(), draft: normalizeCreationFlowDraft(draft),
  }].slice(-limit);
  storage.setItem(`${SNAPSHOT_PREFIX}${draft.id}`, JSON.stringify(next));
  return next;
}

export function downloadCreationFlowDraft(draft: CreationFlowDraft): void {
  const blob = new Blob([exportCreationFlowDraft(draft)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${draft.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || CREATION_FLOW_FORMAT.toLowerCase()}.creation-flow.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
