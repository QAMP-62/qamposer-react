import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import { QamposerContext } from './QamposerContext';
import { circuitToQasm, qasmToCircuit, generateGateId } from '../utils/openqasm';
import { noopAdapter } from '../adapters/noop';
import type {
  Circuit,
  Gate,
  SimulationResult,
  SimulationCompleteEvent,
  SimulationStatus,
  SimulationAdapter,
  QamposerConfig,
  QamposerContextValue,
  QasmParseResult,
} from '../types';

const DEFAULT_CONFIG: Required<QamposerConfig> = {
  maxQubits: 5,
  maxGates: 500,
  maxShots: 10000,
};

const DEFAULT_CIRCUIT: Circuit = {
  qubits: 2,
  gates: [],
};

export interface QamposerProviderProps {
  /** Controlled mode: external circuit state */
  circuit?: Circuit;
  /** Controlled mode: callback when circuit changes */
  onCircuitChange?: (circuit: Circuit) => void;
  /** Uncontrolled mode: initial circuit */
  defaultCircuit?: Circuit;
  /** Simulation adapter for backend communication */
  adapter?: SimulationAdapter;
  /** Callback when simulation completes (includes circuit info) */
  onSimulationComplete?: (event: SimulationCompleteEvent) => void;
  /** Configuration options */
  config?: QamposerConfig;
  children: ReactNode;
}

export function QamposerProvider({
  circuit: controlledCircuit,
  onCircuitChange,
  defaultCircuit = DEFAULT_CIRCUIT,
  adapter = noopAdapter,
  onSimulationComplete,
  config: userConfig,
  children,
}: QamposerProviderProps) {
  const config = useMemo(
    () => ({ ...DEFAULT_CONFIG, ...userConfig }),
    [userConfig]
  );

  // Determine if we're in controlled mode
  const isControlled = controlledCircuit !== undefined;

  // Internal state for uncontrolled mode
  const [internalCircuit, setInternalCircuit] = useState<Circuit>(defaultCircuit);

  // Use controlled or internal circuit
  const circuit = isControlled ? controlledCircuit : internalCircuit;

  // Helper to update circuit (handles both controlled and uncontrolled modes)
  const updateCircuit = useCallback(
    (newCircuit: Circuit) => {
      if (isControlled) {
        onCircuitChange?.(newCircuit);
      } else {
        setInternalCircuit(newCircuit);
      }
    },
    [isControlled, onCircuitChange]
  );

  // Simulation state
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [status, setStatus] = useState<SimulationStatus>('idle');
  const [error, setError] = useState<Error | null>(null);

  // Gate editing state
  const [editingGate, setEditingGate] = useState<Gate | null>(null);

  // QASM state
  const [qasmCode, setQasmCodeState] = useState(() => circuitToQasm(circuit));
  const [parseError, setParseError] = useState<string | null>(null);
  const isUpdatingFromCode = useRef(false);

  // Sync QASM code when circuit changes (unless change came from code editor)
  useEffect(() => {
    if (isUpdatingFromCode.current) {
      isUpdatingFromCode.current = false;
      return;
    }
    setQasmCodeState(circuitToQasm(circuit));
    setParseError(null);
  }, [circuit]);

  // Handle QASM code changes with parsing
  const setQasmCode = useCallback(
    (code: string) => {
      setQasmCodeState(code);
      const parseResult = qasmToCircuit(code);

      if (parseResult.errors.length > 0) {
        setParseError(parseResult.errors[0]);
      } else {
        setParseError(null);
      }

      if (parseResult.circuit && (parseResult.success || parseResult.circuit.gates.length > 0)) {
        isUpdatingFromCode.current = true;
        updateCircuit(parseResult.circuit);
      }
    },
    [updateCircuit]
  );

  // Check if adapter is available
  const [canSimulate, setCanSimulate] = useState(false);
  useEffect(() => {
    adapter.isAvailable().then(setCanSimulate);
  }, [adapter]);

  // === Circuit Actions ===

  const addGate = useCallback(
    (gate: Omit<Gate, 'id'>) => {
      if (circuit.gates.length >= config.maxGates) {
        console.warn(`Maximum gate limit (${config.maxGates}) reached`);
        return;
      }
      const newGate: Gate = {
        ...gate,
        id: generateGateId(),
      };
      updateCircuit({
        ...circuit,
        gates: [...circuit.gates, newGate],
      });
    },
    [circuit, config.maxGates, updateCircuit]
  );

  const removeGate = useCallback(
    (id: string) => {
      updateCircuit({
        ...circuit,
        gates: circuit.gates.filter((g) => g.id !== id),
      });
      // Clear editing gate if it was removed
      if (editingGate?.id === id) {
        setEditingGate(null);
      }
    },
    [circuit, editingGate, updateCircuit]
  );

  const updateGate = useCallback(
    (id: string, updates: Partial<Gate>) => {
      updateCircuit({
        ...circuit,
        gates: circuit.gates.map((g) => (g.id === id ? { ...g, ...updates } : g)),
      });
      // Update editing gate if it's being edited
      if (editingGate?.id === id) {
        setEditingGate({ ...editingGate, ...updates });
      }
    },
    [circuit, editingGate, updateCircuit]
  );

  const updateGates = useCallback(
    (gates: Gate[]) => {
      updateCircuit({
        ...circuit,
        gates,
      });
    },
    [circuit, updateCircuit]
  );

  const setQubits = useCallback(
    (count: number) => {
      const newCount = Math.min(Math.max(2, count), config.maxQubits);
      updateCircuit({
        ...circuit,
        qubits: newCount,
      });
    },
    [circuit, config.maxQubits, updateCircuit]
  );

  const addQubit = useCallback(() => {
    if (circuit.qubits < config.maxQubits) {
      updateCircuit({
        ...circuit,
        qubits: circuit.qubits + 1,
      });
    }
  }, [circuit, config.maxQubits, updateCircuit]);

  const removeQubit = useCallback(() => {
    if (circuit.qubits <= 2) {
      return;
    }
    updateCircuit({
      ...circuit,
      qubits: circuit.qubits - 1,
    });
    setResult(null);
  }, [circuit, updateCircuit]);

  const clearCircuit = useCallback(() => {
    updateCircuit({
      qubits: circuit.qubits,
      gates: [],
    });
    setResult(null);
    setEditingGate(null);
  }, [circuit.qubits, updateCircuit]);

  // === QASM Actions ===

  const importQasm = useCallback(
    (code: string): QasmParseResult => {
      setQasmCodeState(code);
      const parseResult = qasmToCircuit(code);

      if (parseResult.errors.length > 0) {
        setParseError(parseResult.errors[0]);
      } else {
        setParseError(null);
      }

      if (parseResult.circuit && (parseResult.success || parseResult.circuit.gates.length > 0)) {
        isUpdatingFromCode.current = true;
        updateCircuit(parseResult.circuit);
      }

      return parseResult;
    },
    [updateCircuit]
  );

  const exportQasm = useCallback(() => {
    return circuitToQasm(circuit);
  }, [circuit]);

  // === Simulation ===

  const simulate = useCallback(
    async (shots: number = 1024): Promise<SimulationResult> => {
      if (!canSimulate) {
        throw new Error('Simulation adapter is not available');
      }

      if (circuit.gates.length === 0) {
        throw new Error('Circuit has no gates');
      }

      const validShots = Math.min(Math.max(1, shots), config.maxShots);

      setStatus('simulating');
      setError(null);

      try {
        const request = {
          qubits: circuit.qubits,
          gates: circuit.gates.map(({ id: _, ...gate }) => gate),
          shots: validShots,
        };

        const simulationResult = await adapter.simulate(request);
        setResult(simulationResult);
        setStatus('idle');

        // Create event with circuit info
        const event: SimulationCompleteEvent = {
          result: simulationResult,
          circuit: { ...circuit },
          qasm: circuitToQasm(circuit),
        };
        onSimulationComplete?.(event);
        return simulationResult;
      } catch (err) {
        const simulationError = err instanceof Error ? err : new Error(String(err));
        setError(simulationError);
        setStatus('error');
        throw simulationError;
      }
    },
    [adapter, canSimulate, circuit, config.maxShots, onSimulationComplete]
  );

  // === Context Value ===

  const contextValue: QamposerContextValue = useMemo(
    () => ({
      // State
      circuit,
      result,
      status,
      error,
      qasmCode,
      parseError,
      editingGate,

      // Circuit Actions
      addGate,
      removeGate,
      updateGate,
      updateGates,
      setQubits,
      addQubit,
      removeQubit,
      clearCircuit,

      // Gate Editing
      setEditingGate,

      // QASM
      importQasm,
      exportQasm,
      setQasmCode,

      // Simulation
      simulate,
      canSimulate,

      // Config
      config,
    }),
    [
      circuit,
      result,
      status,
      error,
      qasmCode,
      parseError,
      editingGate,
      addGate,
      removeGate,
      updateGate,
      updateGates,
      setQubits,
      addQubit,
      removeQubit,
      clearCircuit,
      importQasm,
      exportQasm,
      simulate,
      canSimulate,
      config,
    ]
  );

  return (
    <QamposerContext.Provider value={contextValue}>
      {children}
    </QamposerContext.Provider>
  );
}
