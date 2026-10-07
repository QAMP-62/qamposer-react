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
  /**
   * Enable real hardware (IBM Quantum) through the backend's /api/ibm endpoints.
   * Users connect with their own API key; the backend must be on the same site as the
   * page, because the session is an HttpOnly cookie. Default: false
   */
  hardware?: boolean;
}
