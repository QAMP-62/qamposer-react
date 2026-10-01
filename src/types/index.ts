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
// Circuit Editing Types
// ============================================================================

/** A gate to place: everything except its id and column */
export type GatePlacement = Omit<Gate, 'id' | 'position'>;

/** Grid cell addressed by row (qubit, top-most row for CNOT) and column */
export interface CellPosition {
  row: number;
  column: number;
}

/** A gate whose column changed as a side effect of an edit */
export interface Displacement {
  id: string;
  from: number;
  to: number;
}

/** Input that caused an edit */
export type EditOrigin = 'pointer' | 'keyboard' | 'code' | 'api';

/** Options accepted by every editing action */
export interface EditOptions {
  /** Input that caused the edit (default: 'api') */
  origin?: EditOrigin;
}

export type CircuitEditAction =
  | 'add'
  | 'move'
  | 'remove'
  | 'update'
  | 'undo'
  | 'redo'
  | 'add-qubit'
  | 'remove-qubit'
  | 'clear'
  | 'set'
  | 'import'
  | 'code';

/**
 * Resulting state change of an edit, matching gates by id. Describes what
 * changed, not why: gates pushed aside or renumbered appear in `updated` too.
 */
export interface CircuitChanges {
  /** Gates that only exist after the edit */
  added: Gate[];
  /** Gates that only existed before the edit */
  removed: Gate[];
  /** Gates whose type, qubits, parameter or column changed */
  updated: { before: Gate; after: Gate }[];
  /** Set when the qubit count changed */
  qubits?: { from: number; to: number };
}

/** The intent of an edit, as recorded in the undo history */
export interface CircuitEditSummary {
  action: CircuitEditAction;
  origin: EditOrigin;
  gateId?: string;
}

/**
 * Event passed to onCircuitEdit: one event per edit.
 * Gates pushed right or compacted left by the edit are listed in `displaced`,
 * never as the edit's own `gateId`.
 */
export interface CircuitEditEvent {
  action: CircuitEditAction;
  origin: EditOrigin;
  /** Gate the edit acted on (add / move / remove / update) */
  gateId?: string;
  /** Cell the gate moved from (move only) */
  from?: CellPosition;
  /** Cell the gate ended up in after left-compaction (move only) */
  to?: CellPosition;
  /** Other gates whose column changed as a side effect */
  displaced: Displacement[];
  /** The edit being undone or redone (undo / redo only) */
  reverts?: CircuitEditSummary;
  /** What changed, for every action (including bulk ones like code edits and undo) */
  changes: CircuitChanges;
  before: Circuit;
  after: Circuit;
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
 * What triggered a simulation
 * - 'realtime': automatic ideal simulation on circuit change (realtimeAdapter)
 * - 'run': explicit simulate() call, e.g. "Set up and run" (adapter)
 */
export type SimulationSource = 'realtime' | 'run';

/**
 * Event passed to onSimulationStart callback
 */
export interface SimulationStartEvent {
  /** Circuit being simulated */
  circuit: Circuit;
  /** OpenQASM 2.0 representation of the circuit */
  qasm: string;
  /** What triggered the simulation */
  source: SimulationSource;
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
  /** What triggered the simulation */
  source: SimulationSource;
}

/**
 * Event passed to onSimulationError callback
 */
export interface SimulationErrorEvent {
  /** Error thrown by the adapter */
  error: Error;
  /** Circuit that was simulated */
  circuit: Circuit;
  /** OpenQASM 2.0 representation of the circuit */
  qasm: string;
  /** What triggered the simulation */
  source: SimulationSource;
}

// ============================================================================
// Provider Types
// ============================================================================

export type SimulationStatus = 'idle' | 'simulating' | 'error';

/** Whether the main adapter (used by simulate()) can run simulations */
export type AdapterStatus = 'checking' | 'available' | 'unavailable';

/** Why the current simulation result changed */
export type ResultChangeReason =
  | 'simulation' // a simulation completed
  | 'empty-circuit' // the circuit has no gates left
  | 'clear' // clearCircuit()
  | 'remove-qubit'; // removeQubit() invalidated the result

/**
 * Event passed to onResultChange: fires whenever `result` changes,
 * including when it is cleared (result: null).
 */
export interface ResultChangeEvent {
  result: SimulationResult | null;
  /** What produced `result` (null when cleared) */
  source: SimulationSource | null;
  reason: ResultChangeReason;
}

export interface QamposerConfig {
  /** Maximum number of qubits (default: 5) */
  maxQubits?: number;
  /** Maximum number of gates (default: 500) */
  maxGates?: number;
  /** Maximum number of shots (default: 10000) */
  maxShots?: number;
  /** Shots for the automatic simulation on every edit (default: 1024, capped at maxShots) */
  realtimeShots?: number;
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
  /** Callback for every circuit edit, with what changed and why */
  onCircuitEdit?: (event: CircuitEditEvent) => void;
  /** Callback when a simulation starts */
  onSimulationStart?: (event: SimulationStartEvent) => void;
  /** Callback when simulation completes (includes circuit info) */
  onSimulationComplete?: (event: SimulationCompleteEvent) => void;
  /** Callback when a simulation fails */
  onSimulationError?: (event: SimulationErrorEvent) => void;
  /**
   * Callback whenever the displayed result changes, including when it is cleared.
   * Use this to mirror `result`; onSimulationComplete only reports completed runs.
   */
  onResultChange?: (event: ResultChangeEvent) => void;
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
  /** What produced `result` (null when there is no result) */
  resultSource: SimulationSource | null;
  status: SimulationStatus;
  error: Error | null;
  qasmCode: string;
  parseError: string | null;
  editingGate: Gate | null;

  // Circuit Actions
  /** Replace the whole circuit */
  setCircuit: (circuit: Circuit, options?: EditOptions) => void;
  /** Add a gate at its given position as-is (no shifting). Returns the new gate id */
  addGate: (gate: Omit<Gate, 'id'>, options?: EditOptions) => string | null;
  /**
   * Insert a gate at a column, pushing overlapping gates right and left-compacting.
   * Returns the new gate id, or null when the gate limit is reached.
   */
  insertGate: (placement: GatePlacement, column: number, options?: EditOptions) => string | null;
  /**
   * Move a placed gate (keeping its id). For CNOT, `to.row` is the new top-most
   * row. Returns false when the move changes nothing.
   */
  moveGate: (gateId: string, to: CellPosition, options?: EditOptions) => boolean;
  /** Remove a gate and left-compact the rest */
  removeGate: (id: string, options?: EditOptions) => void;
  updateGate: (id: string, updates: Partial<Gate>, options?: EditOptions) => void;
  /** Replace all gates at once (reported as action 'set') */
  updateGates: (gates: Gate[], options?: EditOptions) => void;
  setQubits: (count: number, options?: EditOptions) => void;
  addQubit: (options?: EditOptions) => void;
  removeQubit: (qubitIndex?: number, options?: EditOptions) => void;
  clearCircuit: (options?: EditOptions) => void;

  // History
  undo: (options?: EditOptions) => void;
  redo: (options?: EditOptions) => void;
  canUndo: boolean;
  canRedo: boolean;

  // Gate Editing
  setEditingGate: (gate: Gate | null) => void;

  // QASM
  importQasm: (code: string, options?: EditOptions) => QasmParseResult;
  exportQasm: () => string;
  setQasmCode: (code: string) => void;

  // Simulation
  simulate: (shots?: number, profile?: SimulationProfile) => Promise<SimulationResult>;
  canSimulate: boolean;
  /**
   * Availability of the main adapter. simulate() waits while 'checking', and
   * re-checks once when 'unavailable' (the backend may have started since).
   */
  adapterStatus: AdapterStatus;

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
