/**
 * Undo/redo history of immutable song snapshots. Because operations return new songs with
 * structural sharing, a snapshot costs only the changed path, and undo is exact by construction.
 */
import type { Position, Song } from '../model/types';

export interface HistoryEntry {
  /** Song before the command ran. */
  song: Song;
  /** Cursor before the command ran, restored on undo. */
  cursor: Position;
  label: string;
  mergeKey?: string;
  time: number;
}

export interface History {
  past: HistoryEntry[];
  future: HistoryEntry[];
}

export const HISTORY_LIMIT = 300;
/** Commands with the same merge key within this window collapse into one undo step. */
export const MERGE_WINDOW_MS = 1200;

export const emptyHistory = (): History => ({ past: [], future: [] });

export function pushHistory(history: History, entry: HistoryEntry): History {
  const last = history.past[history.past.length - 1];
  if (entry.mergeKey && last && last.mergeKey === entry.mergeKey && entry.time - last.time < MERGE_WINDOW_MS) {
    // Keep the older "before" snapshot so one undo reverts the whole merged edit.
    const merged = { ...last, time: entry.time, label: entry.label };
    return { past: [...history.past.slice(0, -1), merged], future: [] };
  }
  const past = [...history.past, entry];
  if (past.length > HISTORY_LIMIT) past.splice(0, past.length - HISTORY_LIMIT);
  return { past, future: [] };
}

export const canUndo = (h: History) => h.past.length > 0;
export const canRedo = (h: History) => h.future.length > 0;
