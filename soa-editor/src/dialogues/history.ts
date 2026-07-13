export interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

export function createHistory<T>(present: T): HistoryState<T> {
  return { past: [], present, future: [] };
}

export function pushHistory<T>(history: HistoryState<T>, next: T, limit = 100): HistoryState<T> {
  if (Object.is(history.present, next)) return history;
  return { past: [...history.past, history.present].slice(-limit), present: next, future: [] };
}

export function undoHistory<T>(history: HistoryState<T>): HistoryState<T> {
  const previous = history.past[history.past.length - 1];
  if (previous === undefined) return history;
  return { past: history.past.slice(0, -1), present: previous, future: [history.present, ...history.future] };
}

export function redoHistory<T>(history: HistoryState<T>): HistoryState<T> {
  const next = history.future[0];
  if (next === undefined) return history;
  return { past: [...history.past, history.present], present: next, future: history.future.slice(1) };
}

export interface LocalSnapshot<T> { id: string; name: string; createdAt: number; value: T }

export function snapshotKey(dialogueId: string) { return `soa.dialogue-flow.snapshots.${dialogueId}`; }

export function readSnapshots<T>(dialogueId: string): LocalSnapshot<T>[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(snapshotKey(dialogueId)) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export function saveSnapshot<T>(dialogueId: string, snapshot: LocalSnapshot<T>, limit = 20) {
  const next = [...readSnapshots<T>(dialogueId), snapshot].slice(-limit);
  localStorage.setItem(snapshotKey(dialogueId), JSON.stringify(next));
  return next;
}
