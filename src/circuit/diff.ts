/**
 * Circuit diffing and gate identity reconciliation.
 * No React dependencies — fully unit-testable.
 */
import type { Circuit, CircuitChanges, Gate } from '../types';

const GATE_FIELDS = ['type', 'qubit', 'control', 'target', 'parameter', 'position'] as const;

/**
 * What changed between two circuits, matching gates by id.
 * Describes the resulting state only; see CircuitEditEvent for the intent.
 */
export function diffCircuits(before: Circuit, after: Circuit): CircuitChanges {
  const beforeById = new Map(before.gates.map((g) => [g.id, g]));
  const afterIds = new Set(after.gates.map((g) => g.id));

  const changes: CircuitChanges = {
    added: after.gates.filter((g) => !beforeById.has(g.id)),
    removed: before.gates.filter((g) => !afterIds.has(g.id)),
    updated: [],
  };

  for (const gate of after.gates) {
    const previous = beforeById.get(gate.id);
    if (previous && GATE_FIELDS.some((field) => previous[field] !== gate[field])) {
      changes.updated.push({ before: previous, after: gate });
    }
  }

  if (before.qubits !== after.qubits) {
    changes.qubits = { from: before.qubits, to: after.qubits };
  }

  return changes;
}

/** Gate identity as it appears in QASM, ignoring id and column */
function qasmKey(gate: Gate): string {
  // Parameters round-trip through QASM with 6 decimals
  const parameter = gate.parameter === undefined ? '' : gate.parameter.toFixed(6);
  return `${operandKey(gate)}|${parameter}`;
}

/** Gate type and qubits, ignoring the parameter */
function operandKey(gate: Gate): string {
  return `${gate.type}|${gate.qubit ?? ''}|${gate.control ?? ''}|${gate.target ?? ''}`;
}

/** Gates in QASM statement order (as circuitToQasm writes them) */
function inQasmOrder(gates: Gate[]): Gate[] {
  return [...gates].sort((a, b) => a.position - b.position);
}

/**
 * Carry gate ids over from `prev` to a freshly parsed `next`, so that editing
 * QASM text keeps the identity of gates the edit did not touch.
 *
 * Gates are aligned in QASM statement order with a longest common subsequence;
 * within the unaligned stretches, a gate with the same type and qubits but a
 * different parameter keeps its id (an angle edit). Identical gates (e.g. two
 * `h q[0];`) cannot be told apart, so which of them keeps an id is arbitrary.
 */
export function reconcileGateIds(prev: Gate[], next: Gate[]): Gate[] {
  const a = inQasmOrder(prev);
  const b = next;
  const idFor = new Map<number, string>(); // index in b -> id from a

  // Common prefix and suffix: the usual single-line edit touches neither
  let start = 0;
  while (start < a.length && start < b.length && qasmKey(a[start]) === qasmKey(b[start])) {
    idFor.set(start, a[start].id);
    start++;
  }
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && qasmKey(a[endA - 1]) === qasmKey(b[endB - 1])) {
    endA--;
    endB--;
    idFor.set(endB, a[endA].id);
  }

  // LCS over the middle stretch
  const n = endA - start;
  const m = endB - start;
  const keysA = a.slice(start, endA).map(qasmKey);
  const keysB = b.slice(start, endB).map(qasmKey);
  const table = new Int32Array((n + 1) * (m + 1));
  const at = (i: number, j: number) => i * (m + 1) + j;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[at(i, j)] =
        keysA[i] === keysB[j]
          ? table[at(i + 1, j + 1)] + 1
          : Math.max(table[at(i + 1, j)], table[at(i, j + 1)]);
    }
  }

  // Walk the table; pair unaligned gates with equal type and qubits (angle edits)
  let gapA: number[] = [];
  let gapB: number[] = [];
  const closeGap = () => {
    const unused = [...gapA];
    for (const j of gapB) {
      const k = unused.findIndex((i) => operandKey(a[start + i]) === operandKey(b[start + j]));
      if (k !== -1) {
        idFor.set(start + j, a[start + unused[k]].id);
        unused.splice(k, 1);
      }
    }
    gapA = [];
    gapB = [];
  };

  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && keysA[i] === keysB[j]) {
      closeGap();
      idFor.set(start + j, a[start + i].id);
      i++;
      j++;
    } else if (j >= m || (i < n && table[at(i + 1, j)] >= table[at(i, j + 1)])) {
      gapA.push(i++);
    } else {
      gapB.push(j++);
    }
  }
  closeGap();

  return b.map((gate, index) => {
    const id = idFor.get(index);
    return id === undefined ? gate : { ...gate, id };
  });
}
