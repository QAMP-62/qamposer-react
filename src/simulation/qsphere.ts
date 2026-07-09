/**
 * Q-sphere point placement
 *
 * Port of Qiskit's official `plot_state_qsphere` layout algorithm
 * (qiskit/visualization/state_visualization.py, stable/2.5), specialized to
 * pure states: latitude is linear in Hamming weight (z = 1 - 2*weight/n),
 * longitude is assigned by combinatorial rank within each weight ring with a
 * per-ring offset and a southern-hemisphere mirror rule, and the global phase
 * is removed before computing per-state phases.
 */

import type { QSpherePoint } from '../types';
import type { StateVector } from './statevector';

/** Points with probability below this are omitted from the output. */
const PROBABILITY_THRESHOLD = 1e-12;

const TWO_PI = 2 * Math.PI;

/** Binomial coefficient, with the official implementation's n === 0 → 0 quirk. */
function nChooseK(n: number, k: number): number {
  if (n === 0) return 0;
  let result = 1;
  for (let i = 1; i <= k; i++) {
    result = (result * (n - k + i)) / i;
  }
  return result;
}

/**
 * Lexicographic rank of a bitstring among all bitstrings of the same length
 * and Hamming weight ('1' positions counted from the left).
 */
function bitStringIndex(s: string): number {
  const n = s.length;
  const ones: number[] = [];
  for (let pos = 0; pos < n; pos++) {
    if (s[pos] === '1') ones.push(pos);
  }
  const k = ones.length;
  const comb = ones.map((x) => n - 1 - x);
  let index = 0;
  for (let i = 0; i < k; i++) {
    index += nChooseK(comb[k - 1 - i], i + 1);
  }
  return index;
}

function countOnes(value: number): number {
  let count = 0;
  let v = value;
  while (v) {
    v &= v - 1;
    count++;
  }
  return count;
}

export function computeQspherePoints(state: StateVector, numQubits: number): QSpherePoint[] {
  const dim = 1 << numQubits;

  // Global phase removal: rotate so the largest-magnitude amplitude has phase 0.
  // Magnitudes are rounded to 13 decimals before argmax, as in the official code,
  // so machine-epsilon noise cannot change which amplitude wins.
  let loc = 0;
  let best = -1;
  for (let i = 0; i < dim; i++) {
    const magnitude = Math.round(Math.hypot(state.re[i], state.im[i]) * 1e13) / 1e13;
    if (magnitude > best) {
      best = magnitude;
      loc = i;
    }
  }
  const gamma = Math.atan2(state.im[loc], state.re[loc]);
  const cosGamma = Math.cos(gamma);
  const sinGamma = Math.sin(gamma);

  const points: QSpherePoint[] = [];
  for (let i = 0; i < dim; i++) {
    // amplitude * e^{-i*gamma}
    const re = state.re[i] * cosGamma + state.im[i] * sinGamma;
    const im = state.im[i] * cosGamma - state.re[i] * sinGamma;
    const probability = Math.min(re * re + im * im, 1);
    if (probability < PROBABILITY_THRESHOLD) continue;

    const element = i.toString(2).padStart(numQubits, '0');
    const weight = countOnes(i);
    const z = 1 - (2 * weight) / numQubits;
    const numberOfDivisions = nChooseK(numQubits, weight);
    const weightOrder = bitStringIndex(element);

    let angle = (weight / numQubits) * TWO_PI + (weightOrder * TWO_PI) / numberOfDivisions;
    if (
      weight > numQubits / 2 ||
      (weight === numQubits / 2 && weightOrder >= numberOfDivisions / 2)
    ) {
      angle = Math.PI - angle - TWO_PI / numberOfDivisions;
    }

    const radius = Math.sqrt(Math.max(0, 1 - z * z));
    points.push({
      state: element,
      x: radius * Math.cos(angle),
      y: radius * Math.sin(angle),
      z,
      probability,
      phase: Math.atan2(im, re),
    });
  }

  return points;
}
