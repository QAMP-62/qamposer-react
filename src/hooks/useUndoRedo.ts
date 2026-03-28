import { useState, useRef, useCallback, useEffect } from 'react';
import type { Gate } from '../types';

const MAX_HISTORY = 50;

/**
 * Lightweight undo/redo stack for circuit gate operations.
 * Tracks gate arrays only (not qubit count changes).
 */
export function useUndoRedo(
  currentGates: Gate[],
  updateGates: (gates: Gate[]) => void
) {
  const pastRef = useRef<Gate[][]>([]);
  const futureRef = useRef<Gate[][]>([]);
  const currentRef = useRef<Gate[]>(currentGates);

  useEffect(() => {
    currentRef.current = currentGates;
  }, [currentGates]);

  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const syncFlags = useCallback(() => {
    setCanUndo(pastRef.current.length > 0);
    setCanRedo(futureRef.current.length > 0);
  }, []);

  const pushState = useCallback(
    (newGates: Gate[]) => {
      pastRef.current = [...pastRef.current.slice(-MAX_HISTORY + 1), currentRef.current];
      futureRef.current = [];
      updateGates(newGates);
      syncFlags();
    },
    [updateGates, syncFlags]
  );

  const undo = useCallback(() => {
    if (pastRef.current.length === 0) return;
    const prev = pastRef.current[pastRef.current.length - 1];
    pastRef.current = pastRef.current.slice(0, -1);
    futureRef.current = [...futureRef.current, currentRef.current];
    updateGates(prev);
    syncFlags();
  }, [updateGates, syncFlags]);

  const redo = useCallback(() => {
    if (futureRef.current.length === 0) return;
    const next = futureRef.current[futureRef.current.length - 1];
    futureRef.current = futureRef.current.slice(0, -1);
    pastRef.current = [...pastRef.current, currentRef.current];
    updateGates(next);
    syncFlags();
  }, [updateGates, syncFlags]);

  return { pushState, undo, redo, canUndo, canRedo };
}
