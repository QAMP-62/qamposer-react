/**
 * Ideal state-vector simulation
 *
 * Pure functions with no runtime dependencies. Amplitudes follow the Qiskit
 * convention: qubit k corresponds to bit k of the basis-state index, so the
 * bitstring for index i (MSB first) has q[n-1] leftmost — the same order as
 * Qiskit counts keys.
 */

import type { Gate } from '../types';

export interface StateVector {
  re: Float64Array;
  im: Float64Array;
}

export type SimulationGate = Omit<Gate, 'id'>;

/**
 * Default rotation angle when `parameter` is missing.
 * Matches the backend's literal (circuit.py), which is not exactly Math.PI / 4.
 */
export const DEFAULT_ROTATION_ANGLE = 0.785398163;

/** 2x2 complex matrix; each entry is a [re, im] pair, row-major. */
type Matrix2x2 = readonly (readonly [number, number])[][];

function rotationAngle(gate: SimulationGate): number {
  return gate.parameter ?? DEFAULT_ROTATION_ANGLE;
}

function singleQubitMatrix(gate: SimulationGate): Matrix2x2 {
  const h = Math.SQRT1_2;
  switch (gate.type) {
    case 'H':
      return [
        [
          [h, 0],
          [h, 0],
        ],
        [
          [h, 0],
          [-h, 0],
        ],
      ];
    case 'X':
      return [
        [
          [0, 0],
          [1, 0],
        ],
        [
          [1, 0],
          [0, 0],
        ],
      ];
    case 'Y':
      return [
        [
          [0, 0],
          [0, -1],
        ],
        [
          [0, 1],
          [0, 0],
        ],
      ];
    case 'Z':
      return [
        [
          [1, 0],
          [0, 0],
        ],
        [
          [0, 0],
          [-1, 0],
        ],
      ];
    case 'RX': {
      const theta = rotationAngle(gate);
      const c = Math.cos(theta / 2);
      const s = Math.sin(theta / 2);
      return [
        [
          [c, 0],
          [0, -s],
        ],
        [
          [0, -s],
          [c, 0],
        ],
      ];
    }
    case 'RY': {
      const theta = rotationAngle(gate);
      const c = Math.cos(theta / 2);
      const s = Math.sin(theta / 2);
      return [
        [
          [c, 0],
          [-s, 0],
        ],
        [
          [s, 0],
          [c, 0],
        ],
      ];
    }
    case 'RZ': {
      const half = rotationAngle(gate) / 2;
      return [
        [
          [Math.cos(half), -Math.sin(half)],
          [0, 0],
        ],
        [
          [0, 0],
          [Math.cos(half), Math.sin(half)],
        ],
      ];
    }
    default:
      throw new Error(`Unsupported gate type: ${gate.type}`);
  }
}

function applySingleQubitGate(
  state: StateVector,
  matrix: Matrix2x2,
  target: number,
  numQubits: number
): void {
  const dim = 1 << numQubits;
  const bit = 1 << target;
  const [[m00, m01], [m10, m11]] = matrix;

  for (let i0 = 0; i0 < dim; i0++) {
    if (i0 & bit) continue;
    const i1 = i0 | bit;
    const re0 = state.re[i0];
    const im0 = state.im[i0];
    const re1 = state.re[i1];
    const im1 = state.im[i1];
    state.re[i0] = m00[0] * re0 - m00[1] * im0 + m01[0] * re1 - m01[1] * im1;
    state.im[i0] = m00[0] * im0 + m00[1] * re0 + m01[0] * im1 + m01[1] * re1;
    state.re[i1] = m10[0] * re0 - m10[1] * im0 + m11[0] * re1 - m11[1] * im1;
    state.im[i1] = m10[0] * im0 + m10[1] * re0 + m11[0] * im1 + m11[1] * re1;
  }
}

function applyCnot(state: StateVector, control: number, target: number, numQubits: number): void {
  const dim = 1 << numQubits;
  const controlBit = 1 << control;
  const targetBit = 1 << target;

  for (let i = 0; i < dim; i++) {
    if (i & controlBit && !(i & targetBit)) {
      const j = i | targetBit;
      const re = state.re[i];
      const im = state.im[i];
      state.re[i] = state.re[j];
      state.im[i] = state.im[j];
      state.re[j] = re;
      state.im[j] = im;
    }
  }
}

function validateGate(gate: SimulationGate, numQubits: number): void {
  if (gate.type === 'CNOT') {
    if (gate.control === undefined || gate.target === undefined) {
      throw new Error('CNOT gate requires control and target qubits');
    }
    if (gate.control === gate.target) {
      throw new Error('CNOT gate requires distinct control and target qubits');
    }
    if (
      gate.control < 0 ||
      gate.control >= numQubits ||
      gate.target < 0 ||
      gate.target >= numQubits
    ) {
      throw new Error(
        `CNOT gate qubits (control=${gate.control}, target=${gate.target}) out of range for ${numQubits} qubit(s)`
      );
    }
  } else {
    if (gate.qubit === undefined) {
      throw new Error(`${gate.type} gate requires a qubit index`);
    }
    if (gate.qubit < 0 || gate.qubit >= numQubits) {
      throw new Error(
        `${gate.type} gate qubit (${gate.qubit}) out of range for ${numQubits} qubit(s)`
      );
    }
  }
}

/**
 * Simulate a circuit and return the final state vector.
 * Gates are applied in ascending `position` order (stable for ties).
 */
export function simulateStatevector(numQubits: number, gates: SimulationGate[]): StateVector {
  const dim = 1 << numQubits;
  const state: StateVector = { re: new Float64Array(dim), im: new Float64Array(dim) };
  state.re[0] = 1;

  const sortedGates = [...gates].sort((a, b) => a.position - b.position);
  for (const gate of sortedGates) {
    validateGate(gate, numQubits);
    if (gate.type === 'CNOT') {
      applyCnot(state, gate.control!, gate.target!, numQubits);
    } else {
      applySingleQubitGate(state, singleQubitMatrix(gate), gate.qubit!, numQubits);
    }
  }

  return state;
}

/** Measurement probabilities |amplitude|^2 for each basis state. */
export function probabilities(state: StateVector): Float64Array {
  const probs = new Float64Array(state.re.length);
  for (let i = 0; i < probs.length; i++) {
    probs[i] = state.re[i] * state.re[i] + state.im[i] * state.im[i];
  }
  return probs;
}
