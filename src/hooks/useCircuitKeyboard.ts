import { useState, useCallback, useEffect, useRef } from 'react';
import { interactionFsm } from '../keyboard/interactionFsm';
import { useInputSource } from './useInputSource';
import { useKeyRepeat } from './useKeyRepeat';
import { useQamposer } from './useQamposer';
import { findGateAt, getGateRow } from '../circuit/operations';
import type {
  CursorPosition,
  InteractionState,
  InteractionAction,
  InputSource,
  CircuitCommand,
} from '../keyboard/types';

export interface UseCircuitKeyboardOptions {
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
}

export function useCircuitKeyboard({
  containerRef,
  numPositions,
  columnLeftXs,
  columnWidths,
  enabled = true,
}: UseCircuitKeyboardOptions): UseCircuitKeyboardResult {
  const [cursor, setCursor] = useState<CursorPosition>({ row: 0, col: 0 });
  const [interactionState, setInteractionState] = useState<InteractionState>({ type: 'idle' });

  const { circuit, insertGate, removeGate, moveGate, undo, redo } = useQamposer();
  const inputSource = useInputSource(containerRef);

  // Refs for latest values — synced in effects, read only in event handlers
  const circuitRef = useRef(circuit);
  const cursorRef = useRef(cursor);
  const interactionStateRef = useRef(interactionState);
  const numPositionsRef = useRef(numPositions);
  const columnLeftXsRef = useRef(columnLeftXs);
  const columnWidthsRef = useRef(columnWidths);

  useEffect(() => {
    circuitRef.current = circuit;
  }, [circuit]);
  useEffect(() => {
    cursorRef.current = cursor;
  }, [cursor]);
  useEffect(() => {
    interactionStateRef.current = interactionState;
  }, [interactionState]);
  useEffect(() => {
    numPositionsRef.current = numPositions;
  }, [numPositions]);
  useEffect(() => {
    columnLeftXsRef.current = columnLeftXs;
  }, [columnLeftXs]);
  useEffect(() => {
    columnWidthsRef.current = columnWidths;
  }, [columnWidths]);

  // Clamp cursor when grid bounds change
  useEffect(() => {
    setCursor((prev) => ({
      row: Math.min(prev.row, Math.max(0, circuit.qubits - 1)),
      col: Math.min(prev.col, Math.max(0, numPositions - 1)),
    }));
  }, [circuit.qubits, numPositions]);

  // Execute a circuit command through the provider (recorded in its undo history)
  const executeCommand = useCallback(
    (command: CircuitCommand) => {
      const options = { origin: 'keyboard' as const };

      switch (command.type) {
        case 'PLACE_GATE':
          insertGate(
            {
              type: command.gateType,
              qubit: command.row,
              ...(command.parameter !== undefined ? { parameter: command.parameter } : {}),
            },
            command.col,
            options
          );
          break;

        case 'PLACE_CNOT':
          insertGate(
            { type: 'CNOT', control: command.controlRow, target: command.targetRow },
            command.col,
            options
          );
          break;

        case 'MOVE_GATE':
          moveGate(command.gateId, { row: command.row, column: command.col }, options);
          break;

        case 'DELETE_GATE': {
          const gateAtCursor = findGateAt(circuitRef.current.gates, command.row, command.col);
          if (gateAtCursor) removeGate(gateAtCursor.id, options);
          break;
        }

        case 'UNDO':
          undo(options);
          break;

        case 'REDO':
          redo(options);
          break;
      }
    },
    [insertGate, removeGate, moveGate, undo, redo]
  );

  // Handle an FSM action
  const handleAction = useCallback(
    (action: InteractionAction) => {
      const bounds = {
        maxRow: Math.max(0, circuitRef.current.qubits - 1),
        maxCol: Math.max(0, numPositionsRef.current - 1),
      };

      const gateAt = (row: number, col: number) => {
        const gate = findGateAt(circuitRef.current.gates, row, col);
        return gate ? { gateId: gate.id, grabOffset: row - getGateRow(gate) } : null;
      };

      const result = interactionFsm(
        interactionStateRef.current,
        cursorRef.current,
        action,
        bounds,
        gateAt
      );

      setInteractionState(result.state);
      setCursor(result.cursor);

      if (result.command) {
        executeCommand(result.command);
      }

      // Auto-scroll to keep cursor visible
      const colLeftXs = columnLeftXsRef.current;
      const colWidths = columnWidthsRef.current;
      if (action.type === 'MOVE_CURSOR' && containerRef.current && colLeftXs && colWidths) {
        const container = containerRef.current;
        const colLeft = colLeftXs[result.cursor.col] ?? 0;
        const colWidth = colWidths[result.cursor.col] ?? 32;
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
    [executeCommand, containerRef]
  );

  useKeyRepeat(handleAction, containerRef, enabled);

  return {
    cursor,
    interactionState,
    inputSource,
  };
}
