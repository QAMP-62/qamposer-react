import { useState, useRef, useCallback } from 'react';
import type { Circuit, CircuitEditSummary } from '../types';

const MAX_HISTORY = 50;

/** A snapshot plus the edit that leads from it to the neighbouring state */
export interface HistoryEntry {
  circuit: Circuit;
  edit: CircuitEditSummary;
}

/**
 * Undo/redo stack of whole-circuit snapshots (gates and qubit count).
 * Every edit path records here, so pointer, keyboard, code and API edits
 * are all undoable in one history.
 */
export function useCircuitHistory() {
  // past: states before each edit; future: states after each undone edit
  const pastRef = useRef<HistoryEntry[]>([]);
  const futureRef = useRef<HistoryEntry[]>([]);
  const lastActionRef = useRef<CircuitEditSummary['action'] | null>(null);

  const [flags, setFlags] = useState({ canUndo: false, canRedo: false });

  const syncFlags = useCallback(() => {
    const canUndo = pastRef.current.length > 0;
    const canRedo = futureRef.current.length > 0;
    setFlags((prev) =>
      prev.canUndo === canUndo && prev.canRedo === canRedo ? prev : { canUndo, canRedo }
    );
  }, []);

  /** Record the circuit as it was before an edit, with that edit's intent */
  const record = useCallback(
    (before: Circuit, edit: CircuitEditSummary) => {
      // Consecutive code-editor keystrokes collapse into one undo step
      const coalesce = edit.action === 'code' && lastActionRef.current === 'code';
      if (!coalesce) {
        pastRef.current = [...pastRef.current.slice(-MAX_HISTORY + 1), { circuit: before, edit }];
      }
      futureRef.current = [];
      lastActionRef.current = edit.action;
      syncFlags();
    },
    [syncFlags]
  );

  /** Pop the previous snapshot and the edit it undoes, pushing `current` onto the redo stack */
  const takeUndo = useCallback(
    (current: Circuit): HistoryEntry | null => {
      const prev = pastRef.current[pastRef.current.length - 1];
      if (!prev) return null;
      pastRef.current = pastRef.current.slice(0, -1);
      futureRef.current = [...futureRef.current, { circuit: current, edit: prev.edit }];
      lastActionRef.current = null;
      syncFlags();
      return prev;
    },
    [syncFlags]
  );

  /** Pop the next snapshot and the edit it redoes, pushing `current` onto the undo stack */
  const takeRedo = useCallback(
    (current: Circuit): HistoryEntry | null => {
      const next = futureRef.current[futureRef.current.length - 1];
      if (!next) return null;
      futureRef.current = futureRef.current.slice(0, -1);
      pastRef.current = [...pastRef.current, { circuit: current, edit: next.edit }];
      lastActionRef.current = null;
      syncFlags();
      return next;
    },
    [syncFlags]
  );

  const clear = useCallback(() => {
    pastRef.current = [];
    futureRef.current = [];
    lastActionRef.current = null;
    syncFlags();
  }, [syncFlags]);

  return { ...flags, record, takeUndo, takeRedo, clear };
}
