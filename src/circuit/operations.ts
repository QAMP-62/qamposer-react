/**
 * Pure circuit editing operations.
 *
 * Every edit path (pointer, keyboard, programmatic API) goes through these
 * functions so that insertion, shifting and left-compaction follow one rule.
 * No React dependencies — fully unit-testable.
 */
import type { CellPosition, Circuit, Displacement, Gate, GatePlacement } from '../types';

export type { CellPosition, Displacement, GatePlacement };

export interface OpResult {
  circuit: Circuit;
  /** The gate the operation acted on (absent for circuit-wide operations) */
  gateId?: string;
  /** Other gates whose column changed (shifted right or compacted left) */
  displaced: Displacement[];
}

export function generateGateId(): string {
  return `gate-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Get all qubit indices a gate occupies.
 * For CNOT, this includes all qubits between control and target
 * (the vertical line spans through them).
 */
export function getGateQubits(gate: Pick<Gate, 'type' | 'qubit' | 'control' | 'target'>): number[] {
  if (gate.type === 'CNOT' && gate.control !== undefined && gate.target !== undefined) {
    const minQubit = Math.min(gate.control, gate.target);
    const maxQubit = Math.max(gate.control, gate.target);
    const qubits: number[] = [];
    for (let q = minQubit; q <= maxQubit; q++) {
      qubits.push(q);
    }
    return qubits;
  }
  return gate.qubit !== undefined ? [gate.qubit] : [];
}

/** Top-most row a gate occupies (the qubit for single-qubit gates) */
export function getGateRow(gate: Pick<Gate, 'type' | 'qubit' | 'control' | 'target'>): number {
  return Math.min(...getGateQubits(gate));
}

/**
 * Compact gates to left-align them (remove gaps)
 */
export function compactGates(gatesToCompact: Gate[]): Gate[] {
  const qubitMinPositions = new Map<number, number>();
  const sorted = [...gatesToCompact].sort((a, b) => a.position - b.position);

  return sorted.map((gate) => {
    const gateQubits = getGateQubits(gate);

    // Calculate minimum available position for this gate
    let newPosition = 0;
    gateQubits.forEach((q) => {
      const minPos = qubitMinPositions.get(q) || 0;
      newPosition = Math.max(newPosition, minPos);
    });

    // Update next available position for all qubits this gate occupies
    gateQubits.forEach((q) => {
      qubitMinPositions.set(q, newPosition + 1);
    });

    return { ...gate, position: newPosition };
  });
}

/** Find the gate occupying a cell (CNOT occupies its control and target rows) */
export function findGateAt(gates: Gate[], row: number, column: number): Gate | null {
  return (
    gates.find((g) => {
      if (g.position !== column) return false;
      if (g.type === 'CNOT') {
        return g.control === row || g.target === row;
      }
      return g.qubit === row;
    }) ?? null
  );
}

/** Gates (other than `excludeId`) whose column differs between two gate lists */
function diffPositions(before: Gate[], after: Gate[], excludeId?: string): Displacement[] {
  const beforeById = new Map(before.map((g) => [g.id, g.position]));
  const displaced: Displacement[] = [];
  for (const gate of after) {
    if (gate.id === excludeId) continue;
    const from = beforeById.get(gate.id);
    if (from !== undefined && from !== gate.position) {
      displaced.push({ id: gate.id, from, to: gate.position });
    }
  }
  return displaced;
}

/** Shift every gate that overlaps `qubits` at or after `column` one column right */
function shiftRight(gates: Gate[], qubits: number[], column: number): Gate[] {
  return gates.map((g) => {
    if (g.position < column) return g;
    const overlaps = getGateQubits(g).some((q) => qubits.includes(q));
    return overlaps ? { ...g, position: g.position + 1 } : g;
  });
}

/**
 * Insert a gate at `column`, pushing overlapping gates at or after that column
 * one step right, then left-compacting.
 */
export function insertGate(
  circuit: Circuit,
  placement: GatePlacement,
  column: number,
  id: string = generateGateId()
): OpResult {
  const newGate: Gate = { ...placement, id, position: Math.max(0, column) };
  const shifted = shiftRight(circuit.gates, getGateQubits(newGate), newGate.position);
  const gates = compactGates([...shifted, newGate]);
  return {
    circuit: { ...circuit, gates },
    gateId: id,
    displaced: diffPositions(circuit.gates, gates, id),
  };
}

/** Remove a gate and left-compact the rest */
export function removeGate(circuit: Circuit, gateId: string): OpResult {
  const gates = compactGates(circuit.gates.filter((g) => g.id !== gateId));
  return {
    circuit: { ...circuit, gates },
    gateId,
    displaced: diffPositions(circuit.gates, gates, gateId),
  };
}

/**
 * Move an existing gate to a new cell, keeping its id.
 *
 * The gate is removed (and the rest compacted), then inserted at `to.column`.
 * So on its own qubit, `A B C` with A moved to column 1 becomes `B A C`. For CNOT, `to.row` is the
 * new top-most row and the control/target spacing is preserved (clamped to the
 * circuit). Returns null when the gate does not exist or the move changes nothing.
 */
export function moveGate(circuit: Circuit, gateId: string, to: CellPosition): OpResult | null {
  const gate = circuit.gates.find((g) => g.id === gateId);
  if (!gate) return null;

  const rest = toPlacement(gate);
  let placement: GatePlacement;

  if (gate.type === 'CNOT' && gate.control !== undefined && gate.target !== undefined) {
    const top = Math.min(gate.control, gate.target);
    const span = Math.abs(gate.target - gate.control);
    const newTop = clamp(to.row, 0, circuit.qubits - 1 - span);
    const offset = newTop - top;
    placement = { ...rest, control: gate.control + offset, target: gate.target + offset };
  } else {
    placement = { ...rest, qubit: clamp(to.row, 0, circuit.qubits - 1) };
  }

  const remaining = removeGate(circuit, gateId).circuit;
  const inserted = insertGate(remaining, placement, to.column, gateId);

  // Left-compaction can put the gate right back where it was: nothing changed
  const result = inserted.circuit.gates;
  const unchanged =
    result.length === circuit.gates.length &&
    result.every((g) => {
      const original = circuit.gates.find((o) => o.id === g.id);
      return (
        original !== undefined &&
        original.position === g.position &&
        original.qubit === g.qubit &&
        original.control === g.control &&
        original.target === g.target
      );
    });
  if (unchanged) return null;

  return {
    circuit: inserted.circuit,
    gateId,
    displaced: diffPositions(circuit.gates, result, gateId),
  };
}

/**
 * Update a gate's properties. Changing a CNOT's control/target shifts gates it
 * now collides with to the right, then left-compacts.
 */
export function updateGate(circuit: Circuit, gateId: string, updates: Partial<Gate>): OpResult {
  const targetGate = circuit.gates.find((g) => g.id === gateId);
  if (!targetGate) {
    return { circuit, gateId, displaced: [] };
  }

  const updatedGate = { ...targetGate, ...updates, id: gateId };
  const isCnotUpdate =
    targetGate.type === 'CNOT' && (updates.control !== undefined || updates.target !== undefined);

  let gates: Gate[];
  if (isCnotUpdate) {
    const newQubits = getGateQubits(updatedGate);
    gates = circuit.gates.map((g) => {
      if (g.id === gateId) return updatedGate;
      // Shift gates in the same column that collide with the updated CNOT
      if (g.position === updatedGate.position) {
        const hasConflict = getGateQubits(g).some((q) => newQubits.includes(q));
        if (hasConflict) return { ...g, position: g.position + 1 };
      }
      return g;
    });
    gates = compactGates(gates);
  } else {
    gates = circuit.gates.map((g) => (g.id === gateId ? updatedGate : g));
  }

  return {
    circuit: { ...circuit, gates },
    gateId,
    displaced: diffPositions(circuit.gates, gates, gateId),
  };
}

/**
 * Remove a qubit: drop gates acting on it, renumber higher qubits, left-compact.
 */
export function removeQubit(circuit: Circuit, qubitIndex: number = circuit.qubits - 1): OpResult {
  if (circuit.qubits <= 1) {
    return { circuit, displaced: [] };
  }

  const renumber = (q: number | undefined) => (q !== undefined && q > qubitIndex ? q - 1 : q);

  const gates = compactGates(
    circuit.gates
      .filter((gate) =>
        gate.type === 'CNOT'
          ? gate.control !== qubitIndex && gate.target !== qubitIndex
          : gate.qubit !== qubitIndex
      )
      .map((gate) =>
        gate.type === 'CNOT'
          ? { ...gate, control: renumber(gate.control), target: renumber(gate.target) }
          : { ...gate, qubit: renumber(gate.qubit) }
      )
  );

  return {
    circuit: { qubits: circuit.qubits - 1, gates },
    displaced: diffPositions(circuit.gates, gates),
  };
}

function toPlacement({ id: _id, position: _position, ...placement }: Gate): GatePlacement {
  return placement;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
