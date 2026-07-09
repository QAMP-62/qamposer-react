/**
 * Zero-dependency local simulation adapter
 *
 * Runs ideal state-vector simulation entirely in the browser. Intended as a
 * `realtimeAdapter` for instant results on every circuit edit, or as the main
 * adapter when no backend server is needed. Noisy fake devices and real
 * hardware still require a backend adapter such as `qiskitAdapter`.
 */

import type { SimulationAdapter, CircuitRequest, SimulationResult, BackendInfo } from '../types';
import { simulateStatevector, probabilities } from '../simulation/statevector';
import { sampleCounts } from '../simulation/sampling';
import { computeQspherePoints } from '../simulation/qsphere';

export interface LocalAdapterConfig {
  /** Display name of the adapter (default: 'Browser Simulator') */
  name?: string;
  /** Maximum circuit width accepted by simulate() (default: 12) */
  maxQubits?: number;
  /** Emit q-sphere points for small circuits (default: true) */
  qsphere?: boolean;
}

/** Q-sphere data is emitted for circuits up to this size, matching the backend. */
const QSPHERE_MAX_QUBITS = 5;

/**
 * Create a local, in-browser ideal simulation adapter
 *
 * @example
 * ```tsx
 * import { localAdapter, qiskitAdapter } from '@qamposer/react';
 *
 * <Qamposer
 *   adapter={qiskitAdapter(BACKEND_URL)}   // noisy fake devices, via "Set up and run"
 *   realtimeAdapter={localAdapter()}       // instant ideal results on every edit
 * />
 * ```
 */
export function localAdapter(config: LocalAdapterConfig = {}): SimulationAdapter {
  const { name = 'Browser Simulator', maxQubits = 12, qsphere = true } = config;

  return {
    name,

    async simulate(request: CircuitRequest): Promise<SimulationResult> {
      const profileType = request.profile?.type ?? 'ideal';
      if (profileType !== 'ideal') {
        throw new Error(
          `localAdapter only supports ideal simulation (got profile type '${profileType}'). ` +
            'Use a backend adapter such as qiskitAdapter for noisy or real devices.'
        );
      }
      if (!Number.isInteger(request.qubits) || request.qubits < 1) {
        throw new Error(`Invalid qubit count: ${request.qubits}`);
      }
      if (request.qubits > maxQubits) {
        throw new Error(
          `Circuit has ${request.qubits} qubits, exceeding the localAdapter limit of ${maxQubits}`
        );
      }
      if (!Number.isInteger(request.shots) || request.shots < 1) {
        throw new Error(`Invalid shot count: ${request.shots}`);
      }

      const start = performance.now();
      const state = simulateStatevector(request.qubits, request.gates);
      const counts = sampleCounts(
        probabilities(state),
        request.qubits,
        request.shots,
        request.profile?.seed
      );
      const executionTime = (performance.now() - start) / 1000;

      const result: SimulationResult = { counts, execution_time: executionTime };
      if (qsphere && request.qubits <= QSPHERE_MAX_QUBITS) {
        result.qsphere = computeQspherePoints(state, request.qubits);
      }
      return result;
    },

    async isAvailable(): Promise<boolean> {
      return true;
    },

    async getBackends(): Promise<BackendInfo[]> {
      return [{ id: 'ideal', name, num_qubits: maxQubits, backend_type: 'ideal' }];
    },
  };
}
