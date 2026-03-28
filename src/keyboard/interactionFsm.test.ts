import { describe, it, expect } from 'vitest';
import { interactionFsm } from './interactionFsm';
import type { InteractionState, CursorPosition, GridBounds } from './types';

const bounds: GridBounds = { maxRow: 4, maxCol: 19 };
const cursor: CursorPosition = { row: 1, col: 3 };

describe('interactionFsm', () => {
  describe('MOVE_CURSOR', () => {
    it('moves cursor within bounds', () => {
      const result = interactionFsm(
        { type: 'idle' }, cursor,
        { type: 'MOVE_CURSOR', dRow: 0, dCol: 1 }, bounds
      );
      expect(result.cursor).toEqual({ row: 1, col: 4 });
      expect(result.command).toBeNull();
    });

    it('clamps at upper boundary', () => {
      const result = interactionFsm(
        { type: 'idle' }, { row: 0, col: 0 },
        { type: 'MOVE_CURSOR', dRow: -1, dCol: -1 }, bounds
      );
      expect(result.cursor).toEqual({ row: 0, col: 0 });
    });

    it('clamps at lower boundary', () => {
      const result = interactionFsm(
        { type: 'idle' }, { row: 4, col: 19 },
        { type: 'MOVE_CURSOR', dRow: 1, dCol: 1 }, bounds
      );
      expect(result.cursor).toEqual({ row: 4, col: 19 });
    });

    it('preserves state during movement', () => {
      const state: InteractionState = { type: 'placing', gateType: 'H' };
      const result = interactionFsm(
        state, cursor,
        { type: 'MOVE_CURSOR', dRow: 1, dCol: 0 }, bounds
      );
      expect(result.state).toEqual(state);
    });
  });

  describe('idle state', () => {
    const idle: InteractionState = { type: 'idle' };

    it('SELECT_GATE transitions to placing', () => {
      const result = interactionFsm(
        idle, cursor,
        { type: 'SELECT_GATE', gateType: 'H' }, bounds
      );
      expect(result.state).toEqual({ type: 'placing', gateType: 'H' });
      expect(result.command).toBeNull();
    });

    it('SELECT_GATE CNOT transitions to cnot_control', () => {
      const result = interactionFsm(
        idle, cursor,
        { type: 'SELECT_GATE', gateType: 'CNOT' }, bounds
      );
      expect(result.state).toEqual({ type: 'cnot_control' });
      expect(result.command).toBeNull();
    });

    it('ACTIVATE_CELL does nothing', () => {
      const result = interactionFsm(
        idle, cursor,
        { type: 'ACTIVATE_CELL' }, bounds
      );
      expect(result.state).toEqual(idle);
      expect(result.command).toBeNull();
    });

    it('CANCEL stays idle', () => {
      const result = interactionFsm(
        idle, cursor,
        { type: 'CANCEL' }, bounds
      );
      expect(result.state).toEqual({ type: 'idle' });
    });
  });

  describe('placing state', () => {
    const placing: InteractionState = { type: 'placing', gateType: 'X' };

    it('ACTIVATE_CELL emits PLACE_GATE and stays placing', () => {
      const result = interactionFsm(
        placing, cursor,
        { type: 'ACTIVATE_CELL' }, bounds
      );
      expect(result.state).toEqual(placing);
      expect(result.command).toEqual({
        type: 'PLACE_GATE',
        gateType: 'X',
        row: 1,
        col: 3,
      });
    });

    it('ACTIVATE_CELL advances cursor right', () => {
      const result = interactionFsm(
        placing, cursor,
        { type: 'ACTIVATE_CELL' }, bounds
      );
      expect(result.cursor.col).toBe(4);
    });

    it('ACTIVATE_CELL with rotation gate includes parameter', () => {
      const result = interactionFsm(
        { type: 'placing', gateType: 'RX' }, cursor,
        { type: 'ACTIVATE_CELL' }, bounds
      );
      expect(result.command).toMatchObject({
        type: 'PLACE_GATE',
        gateType: 'RX',
        parameter: Math.PI / 2,
      });
    });

    it('SELECT_GATE changes equipped gate', () => {
      const result = interactionFsm(
        placing, cursor,
        { type: 'SELECT_GATE', gateType: 'Z' }, bounds
      );
      expect(result.state).toEqual({ type: 'placing', gateType: 'Z' });
      expect(result.command).toBeNull();
    });

    it('SELECT_GATE CNOT transitions to cnot_control', () => {
      const result = interactionFsm(
        placing, cursor,
        { type: 'SELECT_GATE', gateType: 'CNOT' }, bounds
      );
      expect(result.state).toEqual({ type: 'cnot_control' });
    });

    it('CANCEL returns to idle', () => {
      const result = interactionFsm(
        placing, cursor,
        { type: 'CANCEL' }, bounds
      );
      expect(result.state).toEqual({ type: 'idle' });
    });
  });

  describe('cnot_control state', () => {
    const cnotControl: InteractionState = { type: 'cnot_control' };

    it('ACTIVATE_CELL transitions to cnot_target with controlRow', () => {
      const result = interactionFsm(
        cnotControl, { row: 2, col: 5 },
        { type: 'ACTIVATE_CELL' }, bounds
      );
      expect(result.state).toEqual({ type: 'cnot_target', controlRow: 2 });
      expect(result.command).toBeNull();
    });

    it('CANCEL returns to idle', () => {
      const result = interactionFsm(
        cnotControl, cursor,
        { type: 'CANCEL' }, bounds
      );
      expect(result.state).toEqual({ type: 'idle' });
    });

    it('SELECT_GATE non-CNOT switches to placing', () => {
      const result = interactionFsm(
        cnotControl, cursor,
        { type: 'SELECT_GATE', gateType: 'H' }, bounds
      );
      expect(result.state).toEqual({ type: 'placing', gateType: 'H' });
    });
  });

  describe('cnot_target state', () => {
    const cnotTarget: InteractionState = { type: 'cnot_target', controlRow: 1 };

    it('ACTIVATE_CELL on different row emits PLACE_CNOT', () => {
      const result = interactionFsm(
        cnotTarget, { row: 3, col: 5 },
        { type: 'ACTIVATE_CELL' }, bounds
      );
      expect(result.state).toEqual({ type: 'idle' });
      expect(result.command).toEqual({
        type: 'PLACE_CNOT',
        controlRow: 1,
        targetRow: 3,
        col: 5,
      });
    });

    it('ACTIVATE_CELL on same row as control does nothing', () => {
      const result = interactionFsm(
        cnotTarget, { row: 1, col: 5 },
        { type: 'ACTIVATE_CELL' }, bounds
      );
      expect(result.state).toEqual(cnotTarget);
      expect(result.command).toBeNull();
    });

    it('CANCEL returns to idle', () => {
      const result = interactionFsm(
        cnotTarget, cursor,
        { type: 'CANCEL' }, bounds
      );
      expect(result.state).toEqual({ type: 'idle' });
    });

    it('SELECT_GATE CNOT restarts CNOT flow', () => {
      const result = interactionFsm(
        cnotTarget, cursor,
        { type: 'SELECT_GATE', gateType: 'CNOT' }, bounds
      );
      expect(result.state).toEqual({ type: 'cnot_control' });
    });
  });

  describe('global actions', () => {
    const states: InteractionState[] = [
      { type: 'idle' },
      { type: 'placing', gateType: 'H' },
      { type: 'cnot_control' },
      { type: 'cnot_target', controlRow: 0 },
    ];

    it('DELETE_AT emits DELETE_GATE from any state', () => {
      for (const state of states) {
        const result = interactionFsm(
          state, cursor,
          { type: 'DELETE_AT' }, bounds
        );
        expect(result.command).toEqual({
          type: 'DELETE_GATE',
          row: cursor.row,
          col: cursor.col,
        });
      }
    });

    it('UNDO emits UNDO command from any state', () => {
      for (const state of states) {
        const result = interactionFsm(
          state, cursor,
          { type: 'UNDO' }, bounds
        );
        expect(result.command).toEqual({ type: 'UNDO' });
      }
    });

    it('REDO emits REDO command from any state', () => {
      for (const state of states) {
        const result = interactionFsm(
          state, cursor,
          { type: 'REDO' }, bounds
        );
        expect(result.command).toEqual({ type: 'REDO' });
      }
    });
  });

  describe('CYCLE_GATE', () => {
    it('cycles forward from idle', () => {
      const result = interactionFsm(
        { type: 'idle' }, cursor,
        { type: 'CYCLE_GATE', direction: 1 }, bounds
      );
      expect(result.state).toEqual({ type: 'placing', gateType: 'H' });
    });

    it('cycles forward from placing H', () => {
      const result = interactionFsm(
        { type: 'placing', gateType: 'H' }, cursor,
        { type: 'CYCLE_GATE', direction: 1 }, bounds
      );
      expect(result.state).toEqual({ type: 'placing', gateType: 'X' });
    });

    it('cycles backward with wrap', () => {
      const result = interactionFsm(
        { type: 'placing', gateType: 'H' }, cursor,
        { type: 'CYCLE_GATE', direction: -1 }, bounds
      );
      // CNOT is last in cycle order, so should transition to cnot_control
      expect(result.state).toEqual({ type: 'cnot_control' });
    });

    it('cycles backward from idle selects last gate', () => {
      const result = interactionFsm(
        { type: 'idle' }, cursor,
        { type: 'CYCLE_GATE', direction: -1 }, bounds
      );
      // Last in GATE_CYCLE_ORDER is CNOT
      expect(result.state).toEqual({ type: 'cnot_control' });
    });
  });
});
