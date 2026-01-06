/**
 * Simulation adapter types
 */

export type { SimulationAdapter, CircuitRequest, SimulationResult } from '../types';

export interface QiskitAdapterConfig {
  /** Base URL of the Qiskit backend API */
  baseUrl: string;
  /** Additional headers to include in requests */
  headers?: Record<string, string>;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
}
