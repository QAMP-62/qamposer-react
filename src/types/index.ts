/**
 * Qamposer type definitions
 */

// ============================================================================
// Gate Types
// ============================================================================

export type GateType = 'H' | 'X' | 'Y' | 'Z' | 'CNOT' | 'RX' | 'RY' | 'RZ';

export interface Gate {
  id: string;
  type: GateType;
  /** Target qubit for single-qubit gates */
  qubit?: number;
  /** Control qubit for CNOT */
  control?: number;
  /** Target qubit for CNOT */
  target?: number;
  /** Parameter in radians for rotation gates (RX, RY, RZ) */
  parameter?: number;
  /** Position in the circuit (column index) */
  position: number;
}

export interface GateInfo {
  type: GateType;
  label: string;
  description: string;
  category: 'single' | 'rotation' | 'multi';
  color: string;
}

// ============================================================================
// Circuit Types
// ============================================================================

export interface Circuit {
  qubits: number;
  gates: Gate[];
}

// ============================================================================
// Backend Types
// ============================================================================

export type BackendType = 'ideal' | 'noisy_fake' | 'real';

export interface SimulationProfile {
  type: BackendType;
  backend_name?: string;
  seed?: number;
}

export interface BackendInfo {
  id: string;
  name: string;
  num_qubits: number;
  backend_type: BackendType;
  description?: string;
}

// ============================================================================
// Simulation Types
// ============================================================================

export interface CircuitRequest {
  qubits: number;
  gates: Omit<Gate, 'id'>[];
  shots: number;
  profile?: SimulationProfile;
}

export interface QSpherePoint {
  state: string;
  x: number;
  y: number;
  z: number;
  probability: number;
  phase: number;
}

export interface SimulationResult {
  counts: Record<string, number>;
  execution_time: number;
  qsphere?: QSpherePoint[];
}

/**
 * Event passed to onSimulationComplete callback
 * Contains simulation result along with circuit information
 */
export interface SimulationCompleteEvent {
  /** Simulation result from the adapter */
  result: SimulationResult;
  /** Circuit that was simulated */
  circuit: Circuit;
  /** OpenQASM 2.0 representation of the circuit */
  qasm: string;
}

// ============================================================================
// Provider Types
// ============================================================================

export type SimulationStatus = 'idle' | 'simulating' | 'error';

export interface QamposerConfig {
  /** Maximum number of qubits (default: 5) */
  maxQubits?: number;
  /** Maximum number of gates (default: 500) */
  maxGates?: number;
  /** Maximum number of shots (default: 10000) */
  maxShots?: number;
}

export interface QamposerProviderProps {
  /** Controlled mode: external circuit state */
  circuit?: Circuit;
  /** Controlled mode: callback when circuit changes */
  onCircuitChange?: (circuit: Circuit) => void;
  /** Uncontrolled mode: initial circuit */
  defaultCircuit?: Circuit;
  /** Simulation adapter for backend communication (used by "Set up and run") */
  adapter?: SimulationAdapter;
  /**
   * Adapter for real-time ideal simulation on circuit changes.
   * If provided, auto-simulation uses this adapter instead of the main adapter.
   * This allows using a client-side simulator for instant results
   * while keeping the main adapter for noisy/real backend simulations.
   * If not provided, auto-simulation uses the main adapter.
   */
  realtimeAdapter?: SimulationAdapter;
  /** Callback when simulation completes (includes circuit info) */
  onSimulationComplete?: (event: SimulationCompleteEvent) => void;
  /** Configuration options */
  config?: QamposerConfig;
  children: React.ReactNode;
}

// ============================================================================
// Adapter Types
// ============================================================================

export interface SimulationAdapter {
  /** Adapter name for display */
  name: string;
  /** Execute simulation */
  simulate(request: CircuitRequest): Promise<SimulationResult>;
  /** Check if adapter is available */
  isAvailable(): Promise<boolean>;
  /** Get available backends (optional) */
  getBackends?(): Promise<BackendInfo[]>;
}

// ============================================================================
// Context Types
// ============================================================================

export interface QamposerContextValue {
  // State
  circuit: Circuit;
  result: SimulationResult | null;
  status: SimulationStatus;
  error: Error | null;
  qasmCode: string;
  parseError: string | null;
  editingGate: Gate | null;

  // Circuit Actions
  addGate: (gate: Omit<Gate, 'id'>) => void;
  removeGate: (id: string) => void;
  updateGate: (id: string, updates: Partial<Gate>) => void;
  updateGates: (gates: Gate[]) => void;
  setQubits: (count: number) => void;
  addQubit: () => void;
  removeQubit: (qubitIndex?: number) => void;
  clearCircuit: () => void;

  // Gate Editing
  setEditingGate: (gate: Gate | null) => void;

  // QASM
  importQasm: (code: string) => QasmParseResult;
  exportQasm: () => string;
  setQasmCode: (code: string) => void;

  // Simulation
  simulate: (shots?: number, profile?: SimulationProfile) => Promise<SimulationResult>;
  canSimulate: boolean;

  // Adapter
  adapter: SimulationAdapter;

  // Config
  config: Required<QamposerConfig>;
}

export interface QasmParseResult {
  success: boolean;
  circuit?: Circuit;
  errors: string[];
}
