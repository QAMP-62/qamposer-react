import { describe, it, expect } from 'vitest';
import { diffCircuits, reconcileGateIds } from '../circuit/diff';
import { qasmToCircuit } from '../utils/openqasm';
import type { Circuit, Gate } from '../types';

const h = (id: string, qubit: number, position: number): Gate => ({
  id,
  type: 'H',
  qubit,
  position,
});

describe('diffCircuits', () => {
  it('reports added, removed and updated gates by id', () => {
    const before: Circuit = { qubits: 2, gates: [h('a', 0, 0), h('b', 1, 0), h('c', 0, 1)] };
    const after: Circuit = {
      qubits: 2,
      gates: [h('a', 0, 0), { ...h('c', 0, 1), position: 2 }, h('n', 1, 0)],
    };

    const changes = diffCircuits(before, after);

    expect(changes.added.map((g) => g.id)).toEqual(['n']);
    expect(changes.removed.map((g) => g.id)).toEqual(['b']);
    expect(changes.updated).toEqual([
      { before: h('c', 0, 1), after: { ...h('c', 0, 1), position: 2 } },
    ]);
    expect(changes.qubits).toBeUndefined();
  });

  it('reports parameter and qubit-count changes', () => {
    const rx: Gate = { id: 'r', type: 'RX', qubit: 0, position: 0, parameter: 1 };
    const changes = diffCircuits(
      { qubits: 1, gates: [rx] },
      { qubits: 2, gates: [{ ...rx, parameter: 2 }] }
    );
    expect(changes.updated).toHaveLength(1);
    expect(changes.qubits).toEqual({ from: 1, to: 2 });
  });

  it('is empty for identical circuits', () => {
    const circuit: Circuit = { qubits: 2, gates: [h('a', 0, 0)] };
    expect(diffCircuits(circuit, { ...circuit, gates: [...circuit.gates] })).toEqual({
      added: [],
      removed: [],
      updated: [],
    });
  });
});

describe('reconcileGateIds', () => {
  const HEADER = 'OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[3];\ncreg c[3];\n';
  const parse = (body: string) => qasmToCircuit(HEADER + body).circuit!;

  /** Parse `prevBody`, give its gates stable ids, then reconcile a parse of `nextBody` */
  function edit(prevBody: string, nextBody: string) {
    const prev = parse(prevBody).gates.map((g, i) => ({ ...g, id: `old${i}` }));
    const next = reconcileGateIds(prev, parse(nextBody).gates);
    return {
      prev,
      next,
      changes: diffCircuits({ qubits: 3, gates: prev }, { qubits: 3, gates: next }),
    };
  }

  it('keeps every id when a line is added', () => {
    const { changes } = edit('h q[0];\nx q[1];\n', 'h q[0];\nz q[2];\nx q[1];\n');
    expect(changes.added).toHaveLength(1);
    expect(changes.added[0]).toMatchObject({ type: 'Z', qubit: 2 });
    expect(changes.removed).toEqual([]);
  });

  it('keeps the remaining ids when a line is removed', () => {
    const { changes } = edit('h q[0];\nx q[1];\nz q[2];\n', 'h q[0];\nz q[2];\n');
    expect(changes.removed.map((g) => g.id)).toEqual(['old1']);
    expect(changes.added).toEqual([]);
  });

  it('treats an angle edit as an update of the same gate', () => {
    const { changes } = edit('h q[0];\nrx(pi/2) q[1];\n', 'h q[0];\nrx(pi) q[1];\n');
    expect(changes.added).toEqual([]);
    expect(changes.removed).toEqual([]);
    expect(changes.updated).toHaveLength(1);
    expect(changes.updated[0].after).toMatchObject({ id: 'old1', parameter: Math.PI });
  });

  it('treats changing a gate type as remove + add', () => {
    const { changes } = edit('h q[0];\n', 'x q[0];\n');
    expect(changes.removed.map((g) => g.id)).toEqual(['old0']);
    expect(changes.added).toMatchObject([{ type: 'X' }]);
  });

  it('keeps ids when lines are swapped, reporting one gate as re-added', () => {
    const { next } = edit('h q[0];\nx q[0];\n', 'x q[0];\nh q[0];\n');
    // An LCS keeps one of the two gates; the other is re-created
    const kept = next.filter((g) => g.id.startsWith('old'));
    expect(kept).toHaveLength(1);
  });

  it('handles runs of identical gates without duplicating ids', () => {
    const { next, changes } = edit('h q[0];\nh q[0];\nh q[0];\n', 'h q[0];\nh q[0];\n');
    expect(new Set(next.map((g) => g.id)).size).toBe(2);
    expect(changes.removed).toHaveLength(1);
    expect(changes.added).toEqual([]);
  });

  it('handles empty circuits on either side', () => {
    expect(edit('', 'h q[0];\n').changes.added).toHaveLength(1);
    expect(edit('h q[0];\n', '').changes.removed).toHaveLength(1);
  });

  it('keeps a parameter that only differs by QASM rounding as the same gate', () => {
    const prev: Gate[] = [{ id: 'r', type: 'RZ', qubit: 0, position: 0, parameter: 1.23456789 }];
    const next = reconcileGateIds(prev, parse('rz(1.234568) q[0];\n').gates);
    expect(next[0].id).toBe('r');
  });

  it('reconciles 500 gates quickly', () => {
    const lines = Array.from({ length: 500 }, (_, i) => `${['h', 'x', 'z'][i % 3]} q[${i % 3}];`);
    const prev = parse(lines.join('\n')).gates.map((g, i) => ({ ...g, id: `old${i}` }));
    // Worst case for the prefix/suffix shortcut: edits at both ends
    const nextLines = ['y q[0];', ...lines.slice(1, -1), 'y q[2];'];
    const next = parse(nextLines.join('\n')).gates;

    const startedAt = performance.now();
    reconcileGateIds(prev, next);
    const elapsed = performance.now() - startedAt;

    console.info(`reconcileGateIds: 500 gates in ${elapsed.toFixed(2)} ms`);
    expect(elapsed).toBeLessThan(1000); // sanity bound only; timing is logged
  });
});
