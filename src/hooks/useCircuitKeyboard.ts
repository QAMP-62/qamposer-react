import { useState, useCallback, useEffect, useRef } from 'react';
import { interactionFsm } from '../keyboard/interactionFsm';
import { useInputSource } from './useInputSource';
import { useKeyRepeat } from './useKeyRepeat';
import { useUndoRedo } from './useUndoRedo';
import { compactGates, generateGateId } from '../utils/openqasm';
import type { Circuit, Gate } from '../types';
import type {
  CursorPosition,
  InteractionState,
  InteractionAction,
  InputSource,
  CircuitCommand,
} from '../keyboard/types';

export interface UseCircuitKeyboardOptions {
  circuit: Circuit;
  updateGates: (gates: Gate[]) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  numPositions: number;
  columnLeftXs?: Record<number, number>;
  columnWidths?: Record<number, number>;
  enabled?: boolean;
}

export interface UseCircuitKeyboardResult {
  cursor: CursorPosition;
  interactionState: InteractionState;
  inputSource: InputSource;
  canUndo: boolean;
  canRedo: boolean;
}

export function useCircuitKeyboard({
  circuit,
  updateGates,
  containerRef,
  numPositions,
  columnLeftXs,
  columnWidths,
  enabled = true,
}: UseCircuitKeyboardOptions): UseCircuitKeyboardResult {
  const [cursor, setCursor] = useState<CursorPosition>({ row: 0, col: 0 });
  const [interactionState, setInteractionState] = useState<InteractionState>({ type: 'idle' });

  const inputSource = useInputSource(containerRef);
  const { pushState, undo, redo, canUndo, canRedo } = useUndoRedo(circuit.gates, updateGates);

  // Keep refs for values used in callbacks
  const circuitRef = useRef(circuit);
  circuitRef.current = circuit;
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;
  const interactionStateRef = useRef(interactionState);
  interactionStateRef.current = interactionState;

  // Clamp cursor when grid bounds change
  useEffect(() => {
    setCursor((prev) => ({
      row: Math.min(prev.row, Math.max(0, circuit.qubits - 1)),
      col: Math.min(prev.col, Math.max(0, numPositions - 1)),
    }));
  }, [circuit.qubits, numPositions]);

  // Execute a circuit command
  const executeCommand = useCallback(
    (command: CircuitCommand) => {
      const { gates } = circuitRef.current;

      switch (command.type) {
        case 'PLACE_GATE': {
          const newGate: Gate = {
            id: generateGateId(),
            type: command.gateType,
            qubit: command.row,
            position: command.col,
            ...(command.parameter !== undefined ? { parameter: command.parameter } : {}),
          };

          // Shift existing gates on the same qubit at or after this position
          const shifted = gates.map((g) => {
            if (g.qubit === command.row && g.position >= command.col) {
              return { ...g, position: g.position + 1 };
            }
            // Also shift CNOT gates that span this qubit
            if (
              g.type === 'CNOT' &&
              g.control !== undefined &&
              g.target !== undefined &&
              g.position >= command.col
            ) {
              const minQ = Math.min(g.control, g.target);
              const maxQ = Math.max(g.control, g.target);
              if (command.row >= minQ && command.row <= maxQ) {
                return { ...g, position: g.position + 1 };
              }
            }
            return g;
          });

          pushState(compactGates([...shifted, newGate]));
          break;
        }

        case 'PLACE_CNOT': {
          const newGate: Gate = {
            id: generateGateId(),
            type: 'CNOT',
            control: command.controlRow,
            target: command.targetRow,
            position: command.col,
          };

          const minQ = Math.min(command.controlRow, command.targetRow);
          const maxQ = Math.max(command.controlRow, command.targetRow);

          // Shift existing gates on any qubit in the CNOT range at or after this position
          const shifted = gates.map((g) => {
            if (g.position < command.col) return g;

            const gateQubits = getGateQubits(g);
            const overlaps = gateQubits.some((q) => q >= minQ && q <= maxQ);
            if (overlaps) {
              return { ...g, position: g.position + 1 };
            }
            return g;
          });

          pushState(compactGates([...shifted, newGate]));
          break;
        }

        case 'DELETE_GATE': {
          const gateAtCursor = findGateAt(gates, command.row, command.col);
          if (!gateAtCursor) return;
          const remaining = gates.filter((g) => g.id !== gateAtCursor.id);
          pushState(compactGates(remaining));
          break;
        }

        case 'UNDO':
          undo();
          break;

        case 'REDO':
          redo();
          break;
      }
    },
    [pushState, undo, redo]
  );

  // Handle an FSM action
  const handleAction = useCallback(
    (action: InteractionAction) => {
      const bounds = {
        maxRow: Math.max(0, circuitRef.current.qubits - 1),
        maxCol: Math.max(0, numPositions - 1),
      };

      const result = interactionFsm(
        interactionStateRef.current,
        cursorRef.current,
        action,
        bounds
      );

      setInteractionState(result.state);
      setCursor(result.cursor);

      if (result.command) {
        executeCommand(result.command);
      }

      // Auto-scroll to keep cursor visible
      if (action.type === 'MOVE_CURSOR' && containerRef.current && columnLeftXs && columnWidths) {
        const container = containerRef.current;
        const colLeft = columnLeftXs[result.cursor.col] ?? 0;
        const colWidth = columnWidths[result.cursor.col] ?? 32;
        const colRight = colLeft + colWidth;

        const visibleLeft = container.scrollLeft;
        const visibleRight = container.scrollLeft + container.clientWidth;

        if (colRight > visibleRight - 20) {
          container.scrollLeft = colRight - container.clientWidth + 40;
        } else if (colLeft < visibleLeft + 20) {
          container.scrollLeft = Math.max(0, colLeft - 40);
        }
      }
    },
    [numPositions, executeCommand, containerRef, columnLeftXs, columnWidths]
  );

  // Wire up key repeat handler
  useKeyRepeat(handleAction, containerRef, enabled);

  return {
    cursor,
    interactionState,
    inputSource,
    canUndo,
    canRedo,
  };
}

// --- Helpers ---

function getGateQubits(gate: Gate): number[] {
  if (gate.type === 'CNOT' && gate.control !== undefined && gate.target !== undefined) {
    const minQ = Math.min(gate.control, gate.target);
    const maxQ = Math.max(gate.control, gate.target);
    const qubits: number[] = [];
    for (let q = minQ; q <= maxQ; q++) {
      qubits.push(q);
    }
    return qubits;
  }
  return gate.qubit !== undefined ? [gate.qubit] : [];
}

function findGateAt(gates: Gate[], row: number, col: number): Gate | null {
  return (
    gates.find((g) => {
      if (g.position !== col) return false;
      if (g.type === 'CNOT') {
        return g.control === row || g.target === row;
      }
      return g.qubit === row;
    }) ?? null
  );
}
