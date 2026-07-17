import { normalizeCreationFlowDraft, originKey, type CreationFlowDraft } from "./creationFlow";

const INDEX_KEY = "soa.creation-flow.index.v1";
const DRAFT_PREFIX = "soa.creation-flow.draft.v1.";
const SNAPSHOT_PREFIX = "soa.creation-flow.snapshots.v1.";

export interface CreationFlowDraftSummary {
  id: string;
  title: string;
  shape: CreationFlowDraft["shape"];
  originKey: string;
  updatedAt: number;
  stepCount: number;
  placeholderCount: number;
}
export interface CreationFlowSnapshot {
  id: string;
  name: string;
  createdAt: number;
  draft: CreationFlowDraft;
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function readArray(storage: StorageLike, key: string): unknown[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function summary(draft: CreationFlowDraft): CreationFlowDraftSummary {
  return { id: draft.id, title: draft.title, shape: draft.shape, originKey: originKey(draft.origin), updatedAt: draft.updatedAt, stepCount: draft.steps.length, placeholderCount: draft.placeholders.length };
}

export function listCreationFlowDrafts(storage: StorageLike = localStorage): CreationFlowDraftSummary[] {
  return readArray(storage, INDEX_KEY).flatMap((value): CreationFlowDraftSummary[] => {
    if (!value || typeof value !== "object") return [];
    const row = value as Partial<CreationFlowDraftSummary>;
    return typeof row.id === "string" && typeof row.title === "string" ? [{ id: row.id, title: row.title, shape: row.shape ?? "sequence", originKey: row.originKey ?? "unscoped", updatedAt: Number(row.updatedAt) || 0, stepCount: Number(row.stepCount) || 0, placeholderCount: Number(row.placeholderCount) || 0 }] : [];
  }).sort((left, right) => right.updatedAt - left.updatedAt);
}

export function saveCreationFlowDraft(draftValue: CreationFlowDraft, storage: StorageLike = localStorage): CreationFlowDraft {
  const draft = normalizeCreationFlowDraft(draftValue);
  storage.setItem(`${DRAFT_PREFIX}${draft.id}`, JSON.stringify(draft));
  const next = [summary(draft), ...listCreationFlowDrafts(storage).filter((row) => row.id !== draft.id)];
  storage.setItem(INDEX_KEY, JSON.stringify(next));
  if (typeof window !== "undefined" && storage === window.localStorage) window.dispatchEvent(new Event("soa:creation-flow-drafts-changed"));
  return draft;
}

export function loadCreationFlowDraft(id: string, storage: StorageLike = localStorage): CreationFlowDraft | null {
  const raw = storage.getItem(`${DRAFT_PREFIX}${id}`);
  if (!raw) return null;
  try { return normalizeCreationFlowDraft(JSON.parse(raw)); } catch { return null; }
}

export function deleteCreationFlowDraft(id: string, storage: StorageLike = localStorage): void {
  storage.removeItem(`${DRAFT_PREFIX}${id}`);
  storage.removeItem(`${SNAPSHOT_PREFIX}${id}`);
  storage.setItem(INDEX_KEY, JSON.stringify(listCreationFlowDrafts(storage).filter((row) => row.id !== id)));
  if (typeof window !== "undefined" && storage === window.localStorage) window.dispatchEvent(new Event("soa:creation-flow-drafts-changed"));
}

export function draftsForOrigin(origin: CreationFlowDraft["origin"], storage: StorageLike = localStorage): CreationFlowDraftSummary[] {
  const key = originKey(origin);
  return listCreationFlowDrafts(storage).filter((row) => row.originKey === key);
}

export function readCreationFlowSnapshots(draftId: string, storage: StorageLike = localStorage): CreationFlowSnapshot[] {
  return readArray(storage, `${SNAPSHOT_PREFIX}${draftId}`).flatMap((value): CreationFlowSnapshot[] => {
    if (!value || typeof value !== "object") return [];
    const row = value as Record<string, unknown>;
    try {
      return [{ id: String(row.id || ""), name: String(row.name || "Snapshot"), createdAt: Number(row.createdAt) || 0, draft: normalizeCreationFlowDraft(row.draft) }];
    } catch { return []; }
  });
}

export function saveCreationFlowSnapshot(snapshot: CreationFlowSnapshot, storage: StorageLike = localStorage, limit = 20): CreationFlowSnapshot[] {
  const next = [...readCreationFlowSnapshots(snapshot.draft.id, storage), { ...snapshot, draft: normalizeCreationFlowDraft(snapshot.draft) }].slice(-limit);
  storage.setItem(`${SNAPSHOT_PREFIX}${snapshot.draft.id}`, JSON.stringify(next));
  return next;
}

export function exportCreationFlowDraft(draft: CreationFlowDraft): string {
  return `${JSON.stringify(normalizeCreationFlowDraft(draft), null, 2)}\n`;
}

export function importCreationFlowDraft(source: string): CreationFlowDraft {
  let parsed: unknown;
  try { parsed = JSON.parse(source); } catch { throw new Error("Creation Flow import is not valid JSON."); }
  return normalizeCreationFlowDraft(parsed);
}
