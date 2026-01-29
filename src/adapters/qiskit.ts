/**
 * Qiskit backend simulation adapter
 */

import type { SimulationAdapter, CircuitRequest, SimulationResult, BackendInfo } from '../types';
import type { QiskitAdapterConfig } from './types';

/**
 * Create a simulation adapter for Qiskit backend
 *
 * @example
 * ```tsx
 * // Simple usage with just URL
 * const adapter = qiskitAdapter('https://api.example.com');
 *
 * // With configuration
 * const adapter = qiskitAdapter({
 *   baseUrl: 'https://api.example.com',
 *   headers: { 'Authorization': 'Bearer token' },
 *   timeout: 30000,
 * });
 * ```
 */
export function qiskitAdapter(configOrUrl: string | QiskitAdapterConfig): SimulationAdapter {
  const config: QiskitAdapterConfig =
    typeof configOrUrl === 'string' ? { baseUrl: configOrUrl } : configOrUrl;

  const { baseUrl, headers = {}, timeout = 30000 } = config;

  return {
    name: 'Qiskit Simulator',

    async simulate(request: CircuitRequest): Promise<SimulationResult> {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(`${baseUrl}/api/circuit/simulate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...headers,
          },
          body: JSON.stringify(request),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => response.statusText);
          throw new Error(`Simulation failed: ${errorText}`);
        }

        return response.json();
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error(`Simulation timed out after ${timeout}ms`);
        }
        throw error;
      } finally {
        clearTimeout(timeoutId);
      }
    },

    async isAvailable(): Promise<boolean> {
      try {
        const response = await fetch(`${baseUrl}/health`, {
          method: 'GET',
          headers,
        });
        return response.ok;
      } catch {
        return false;
      }
    },

    async getBackends(): Promise<BackendInfo[]> {
      try {
        const response = await fetch(`${baseUrl}/api/circuit/backends`, {
          method: 'GET',
          headers,
        });

        if (!response.ok) {
          console.warn('Failed to fetch backends, using default');
          return [{ id: 'ideal', name: 'Ideal Simulator', num_qubits: 32, backend_type: 'ideal' }];
        }

        return response.json();
      } catch {
        return [{ id: 'ideal', name: 'Ideal Simulator', num_qubits: 32, backend_type: 'ideal' }];
      }
    },
  };
}
