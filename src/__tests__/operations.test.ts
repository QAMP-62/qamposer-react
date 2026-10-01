import { describe, it, expect } from 'vitest';
import {
  insertGate,
  moveGate,
  removeGate,
  removeQubit,
  updateGate,
  findGateAt,
} from '../circuit/operations';
import type { Circuit, Gate } from '../types';

function h(id: string, qubit: number, position: number): Gate {
  return { id, type: 'H', qubit, position };
}

function cx(id: string, control: number, target: number, position: number): Gate {
  return { id, type: 'CNOT', control, target, position };
}

/** Compact "id@row:col" listing, sorted by id, for readable assertions */
function layout(circuit: Circuit): string[] {
  return circuit.gates
    .map((g) =>
      g.type === 'CNOT'
        ? `${g.id}@${g.control}>${g.target}:${g.position}`
        : `${g.id}@${g.qubit}:${g.position}`
    )
    .sort();
}

const ROW_ABC: Circuit = { qubits: 2, gates: [h('a', 0, 0), h('b', 0, 1), h('c', 0, 2)] };

describe('insertGate', () => {
  it('appends at the first free column (left-compaction)', () => {
    const result = insertGate(
      { qubits: 2, gates: [h('a', 0, 0)] },
      { type: 'X', qubit: 0 },
      5,
      'n'
    );
    expect(layout(result.circuit)).toEqual(['a@0:0', 'n@0:1']);
    expect(result.gateId).toBe('n');
    expect(result.displaced).toEqual([]);
  });

  it('pushes overlapping gates right and reports them as displaced', () => {
    const result = insertGate(ROW_ABC, { type: 'X', qubit: 0 }, 1, 'n');
    expect(layout(result.circuit)).toEqual(['a@0:0', 'b@0:2', 'c@0:3', 'n@0:1']);
    expect(result.displaced).toEqual([
      { id: 'b', from: 1, to: 2 },
      { id: 'c', from: 2, to: 3 },
    ]);
  });

  it('does not push gates on other qubits', () => {
    const circuit: Circuit = { qubits: 2, gates: [h('a', 0, 0), h('b', 1, 0)] };
    const result = insertGate(circuit, { type: 'X', qubit: 0 }, 0, 'n');
    expect(layout(result.circuit)).toEqual(['a@0:1', 'b@1:0', 'n@0:0']);
  });

  it('treats a CNOT as occupying every qubit between control and target', () => {
    const circuit: Circuit = { qubits: 3, gates: [h('mid', 1, 0)] };
    const result = insertGate(circuit, { type: 'CNOT', control: 0, target: 2 }, 0, 'n');
    expect(layout(result.circuit)).toEqual(['mid@1:1', 'n@0>2:0']);
  });

  it('generates an id when none is given', () => {
    const result = insertGate(ROW_ABC, { type: 'Z', qubit: 1 }, 0);
    expect(result.gateId).toMatch(/^gate-/);
  });
});

describe('removeGate', () => {
  it('removes and compacts, reporting displaced gates', () => {
    const result = removeGate(ROW_ABC, 'a');
    expect(layout(result.circuit)).toEqual(['b@0:0', 'c@0:1']);
    expect(result.displaced).toEqual([
      { id: 'b', from: 1, to: 0 },
      { id: 'c', from: 2, to: 1 },
    ]);
  });
});

describe('moveGate', () => {
  it('moves a gate right within its qubit (reorder)', () => {
    const result = moveGate(ROW_ABC, 'a', { row: 0, column: 1 })!;
    expect(layout(result.circuit)).toEqual(['a@0:1', 'b@0:0', 'c@0:2']);
    expect(result.gateId).toBe('a');
    expect(result.displaced).toEqual([{ id: 'b', from: 1, to: 0 }]);
  });

  it('moves a gate to the end of its qubit', () => {
    const result = moveGate(ROW_ABC, 'a', { row: 0, column: 2 })!;
    expect(layout(result.circuit)).toEqual(['a@0:2', 'b@0:0', 'c@0:1']);
  });

  it('moves a gate left within its qubit', () => {
    const result = moveGate(ROW_ABC, 'c', { row: 0, column: 0 })!;
    expect(layout(result.circuit)).toEqual(['a@0:1', 'b@0:2', 'c@0:0']);
    expect(result.displaced).toEqual([
      { id: 'a', from: 0, to: 1 },
      { id: 'b', from: 1, to: 2 },
    ]);
  });

  it('moves a gate to another qubit, compacting the source qubit', () => {
    const result = moveGate(ROW_ABC, 'a', { row: 1, column: 0 })!;
    expect(layout(result.circuit)).toEqual(['a@1:0', 'b@0:0', 'c@0:1']);
  });

  it('keeps the gate id and parameters', () => {
    const circuit: Circuit = {
      qubits: 2,
      gates: [{ id: 'r', type: 'RX', qubit: 0, position: 0, parameter: 1.23 }, h('b', 0, 1)],
    };
    const result = moveGate(circuit, 'r', { row: 0, column: 1 })!;
    const moved = result.circuit.gates.find((g) => g.id === 'r')!;
    expect(moved).toMatchObject({ type: 'RX', parameter: 1.23, qubit: 0, position: 1 });
  });

  it('returns null when the move changes nothing', () => {
    expect(moveGate(ROW_ABC, 'a', { row: 0, column: 0 })).toBeNull();
    // Right into empty space on the same qubit compacts back to the same place
    expect(moveGate(ROW_ABC, 'c', { row: 0, column: 9 })).toBeNull();
    expect(moveGate(ROW_ABC, 'missing', { row: 0, column: 0 })).toBeNull();
  });

  it('moves a CNOT keeping its span and orientation', () => {
    const circuit: Circuit = { qubits: 4, gates: [cx('c', 2, 0, 0)] };
    const result = moveGate(circuit, 'c', { row: 1, column: 0 })!;
    expect(layout(result.circuit)).toEqual(['c@3>1:0']);
  });

  it('clamps a CNOT to the circuit', () => {
    const circuit: Circuit = { qubits: 3, gates: [cx('c', 0, 1, 0)] };
    const result = moveGate(circuit, 'c', { row: 5, column: 0 })!;
    expect(layout(result.circuit)).toEqual(['c@1>2:0']);
  });

  it('reports gates on other qubits that compact after the move', () => {
    // q1's gate sits after the CNOT; moving the CNOT away lets it slide left
    const circuit: Circuit = {
      qubits: 3,
      gates: [h('x', 0, 0), cx('c', 0, 1, 1), h('y', 1, 2)],
    };
    const result = moveGate(circuit, 'c', { row: 1, column: 5 })!;
    expect(layout(result.circuit)).toEqual(['c@1>2:1', 'x@0:0', 'y@1:0']);
    expect(result.displaced).toEqual([{ id: 'y', from: 2, to: 0 }]);
  });
});

describe('updateGate', () => {
  it('updates a parameter without moving anything', () => {
    const circuit: Circuit = {
      qubits: 1,
      gates: [{ id: 'r', type: 'RZ', qubit: 0, position: 0, parameter: 0 }],
    };
    const result = updateGate(circuit, 'r', { parameter: 2 });
    expect(result.circuit.gates[0].parameter).toBe(2);
    expect(result.displaced).toEqual([]);
  });

  it('shifts gates that collide with a changed CNOT', () => {
    const circuit: Circuit = { qubits: 3, gates: [cx('c', 0, 1, 0), h('z', 2, 0)] };
    const result = updateGate(circuit, 'c', { target: 2 });
    expect(layout(result.circuit)).toEqual(['c@0>2:0', 'z@2:1']);
    expect(result.displaced).toEqual([{ id: 'z', from: 0, to: 1 }]);
  });
});

describe('removeQubit', () => {
  it('drops gates on the qubit and renumbers the rest', () => {
    const circuit: Circuit = {
      qubits: 3,
      gates: [h('a', 0, 0), h('b', 1, 0), cx('c', 0, 2, 1), h('d', 2, 0)],
    };
    const result = removeQubit(circuit, 1);
    expect(result.circuit.qubits).toBe(2);
    expect(layout(result.circuit)).toEqual(['a@0:0', 'c@0>1:1', 'd@1:0']);
  });

  it('does nothing with a single qubit', () => {
    const circuit: Circuit = { qubits: 1, gates: [h('a', 0, 0)] };
    expect(removeQubit(circuit).circuit).toBe(circuit);
  });
});

describe('findGateAt', () => {
  it('finds CNOTs by their control or target row only', () => {
    const gates = [cx('c', 0, 2, 0)];
    expect(findGateAt(gates, 0, 0)?.id).toBe('c');
    expect(findGateAt(gates, 2, 0)?.id).toBe('c');
    expect(findGateAt(gates, 1, 0)).toBeNull();
  });
});
