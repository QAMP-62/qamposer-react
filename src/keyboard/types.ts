import type { GateType } from '../types';

// Cursor position in the circuit grid
export interface CursorPosition {
  row: number; // qubit index (0-based)
  col: number; // column position (0-based)
}

// Input source for Layer A
export type InputSource = 'pointer' | 'keyboard';

// FSM States (Layer B)
export type InteractionState =
  | { type: 'idle' }
  | { type: 'placing'; gateType: GateType }
  | { type: 'cnot_control' }
  | { type: 'cnot_target'; controlRow: number };

// Device-agnostic Actions
export type InteractionAction =
  | { type: 'MOVE_CURSOR'; dRow: number; dCol: number }
  | { type: 'SELECT_GATE'; gateType: GateType }
  | { type: 'CYCLE_GATE'; direction: 1 | -1 }
  | { type: 'ACTIVATE_CELL' }
  | { type: 'DELETE_AT' }
  | { type: 'CANCEL' }
  | { type: 'UNDO' }
  | { type: 'REDO' };

// Circuit Commands emitted by FSM
export type CircuitCommand =
  | { type: 'PLACE_GATE'; gateType: GateType; row: number; col: number; parameter?: number }
  | { type: 'PLACE_CNOT'; controlRow: number; targetRow: number; col: number }
  | { type: 'DELETE_GATE'; row: number; col: number }
  | { type: 'UNDO' }
  | { type: 'REDO' };

// FSM transition result
export interface FsmResult {
  state: InteractionState;
  cursor: CursorPosition;
  command: CircuitCommand | null;
}

// Grid bounds for cursor clamping
export interface GridBounds {
  maxRow: number; // qubits - 1
  maxCol: number; // numPositions - 1
}
