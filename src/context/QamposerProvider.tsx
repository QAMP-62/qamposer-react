import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  useMemo,
  type RefObject,
} from 'react';
import { QamposerContext } from './QamposerContext';
import { circuitToQasm, qasmToCircuit, generateGateId, compactGates } from '../utils/openqasm';
import { noopAdapter } from '../adapters/noop';
import type {
  Circuit,
  Gate,
  SimulationResult,
  SimulationStatus,
  SimulationProfile,
  SimulationSource,
  QamposerConfig,
  QamposerContextValue,
  QamposerProviderProps,
  QasmParseResult,
} from '../types';

export type { QamposerProviderProps } from '../types';

const DEFAULT_CONFIG: Required<QamposerConfig> = {
  maxQubits: 5,
  maxGates: 500,
  maxShots: 10000,
};

const DEFAULT_CIRCUIT: Circuit = {
  qubits: 2,
  gates: [],
};

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * Keeps the latest value in a ref so callbacks and adapters passed inline
 * (new identity on every parent render) don't re-trigger effects.
 */
function useLatestRef<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  useIsomorphicLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}

export function QamposerProvider({
  circuit: controlledCircuit,
  onCircuitChange,
  defaultCircuit = DEFAULT_CIRCUIT,
  adapter = noopAdapter,
  realtimeAdapter,
  onSimulationStart,
  onSimulationComplete,
  onSimulationError,
  config: userConfig,
  children,
}: QamposerProviderProps) {
  const maxQubits = userConfig?.maxQubits ?? DEFAULT_CONFIG.maxQubits;
  const maxGates = userConfig?.maxGates ?? DEFAULT_CONFIG.maxGates;
  const maxShots = userConfig?.maxShots ?? DEFAULT_CONFIG.maxShots;
  const config = useMemo(
    () => ({ maxQubits, maxGates, maxShots }),
    [maxQubits, maxGates, maxShots]
  );

  // Callbacks and adapters are read through refs so that inline props
  // (arrow functions, `adapter={localAdapter()}`) never cause re-simulation loops.
  const callbacksRef = useLatestRef({
    onCircuitChange,
    onSimulationStart,
    onSimulationComplete,
    onSimulationError,
  });
  const adapterRef = useLatestRef(adapter);
  // Auto-simulation uses realtimeAdapter if provided, otherwise the main adapter
  const resolvedRealtimeAdapter = realtimeAdapter ?? adapter;
  const realtimeAdapterRef = useLatestRef(resolvedRealtimeAdapter);

  // Determine if we're in controlled mode
  const isControlled = controlledCircuit !== undefined;

  // Internal state for uncontrolled mode
  const [internalCircuit, setInternalCircuit] = useState<Circuit>(defaultCircuit);

  // Use controlled or internal circuit
  const circuit = isControlled ? controlledCircuit : internalCircuit;

  // Latest circuit, updated synchronously by updateCircuit so that actions called
  // back-to-back in one handler (e.g. importQasm() then simulate()) see each other's changes.
  const circuitRef = useRef(circuit);
  useIsomorphicLayoutEffect(() => {
    circuitRef.current = circuit;
  });

  // Helper to update circuit (handles both controlled and uncontrolled modes)
  const updateCircuit = useCallback(
    (newCircuit: Circuit) => {
      circuitRef.current = newCircuit;
      if (!isControlled) {
        setInternalCircuit(newCircuit);
      }
      // In uncontrolled mode this notifies external listeners
      callbacksRef.current.onCircuitChange?.(newCircuit);
    },
    [isControlled, callbacksRef]
  );

  // Simulation state
  const [resultState, setResultState] = useState<{
    result: SimulationResult | null;
    source: SimulationSource | null;
  }>({ result: null, source: null });
  const { result, source: resultSource } = resultState;
  const clearResult = useCallback(() => setResultState({ result: null, source: null }), []);
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

  // Check if adapter is available.
  // Availability is re-checked when the adapter identity changes, but simulation
  // only re-runs when availability actually flips (setState bails out on equal values).
  const [canSimulate, setCanSimulate] = useState(false);
  useEffect(() => {
    let cancelled = false;
    adapter.isAvailable().then((available) => {
      if (!cancelled) setCanSimulate(available);
    });
    return () => {
      cancelled = true;
    };
  }, [adapter]);

  const [canAutoSimulate, setCanAutoSimulate] = useState(false);
  useEffect(() => {
    let cancelled = false;
    resolvedRealtimeAdapter.isAvailable().then((available) => {
      if (!cancelled) setCanAutoSimulate(available);
    });
    return () => {
      cancelled = true;
    };
  }, [resolvedRealtimeAdapter]);

  // Runs one simulation and reports its lifecycle through state and callbacks.
  // Returns null when a newer simulation has superseded this one.
  const runSimulation = useCallback(
    async (
      source: SimulationSource,
      simCircuit: Circuit,
      shots: number,
      profile: SimulationProfile | undefined,
      isCurrent: () => boolean
    ): Promise<SimulationResult | null> => {
      const qasm = circuitToQasm(simCircuit);
      const simAdapter = source === 'realtime' ? realtimeAdapterRef.current : adapterRef.current;

      setStatus('simulating');
      setError(null);
      callbacksRef.current.onSimulationStart?.({ circuit: { ...simCircuit }, qasm, source });

      try {
        const simulationResult = await simAdapter.simulate({
          qubits: simCircuit.qubits,
          gates: simCircuit.gates.map(({ id: _, ...gate }) => gate),
          shots,
          profile,
        });
        if (!isCurrent()) return null;
        setResultState({ result: simulationResult, source });
        setStatus('idle');
        callbacksRef.current.onSimulationComplete?.({
          result: simulationResult,
          circuit: { ...simCircuit },
          qasm,
          source,
        });
        return simulationResult;
      } catch (err) {
        const simulationError = err instanceof Error ? err : new Error(String(err));
        if (!isCurrent()) return null;
        setError(simulationError);
        setStatus('error');
        callbacksRef.current.onSimulationError?.({
          error: simulationError,
          circuit: { ...simCircuit },
          qasm,
          source,
        });
        throw simulationError;
      }
    },
    [adapterRef, realtimeAdapterRef, callbacksRef]
  );

  // Auto-simulation: run ideal simulator whenever circuit changes
  const autoSimRequestId = useRef(0);
  // Circuit most recently passed to simulate(); its realtime result must not
  // overwrite the explicit run (e.g. importQasm() followed by simulate()).
  const lastRunCircuit = useRef<Circuit | null>(null);

  useEffect(() => {
    if (!canAutoSimulate || circuit.gates.length === 0) {
      if (circuit.gates.length === 0) {
        clearResult();
      }
      return;
    }
    if (circuit === lastRunCircuit.current) return;

    const requestId = ++autoSimRequestId.current;

    runSimulation(
      'realtime',
      circuit,
      1024,
      { type: 'ideal' },
      () => autoSimRequestId.current === requestId
    ).catch(() => {
      // Already reported via state and onSimulationError
    });
  }, [circuit, canAutoSimulate, runSimulation, clearResult]);

  // === Circuit Actions ===

  const setCircuit = useCallback(
    (newCircuit: Circuit) => {
      updateCircuit(newCircuit);
      setEditingGate(null);
    },
    [updateCircuit]
  );

  const addGate = useCallback(
    (gate: Omit<Gate, 'id'>) => {
      const circuit = circuitRef.current;
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
    [config.maxGates, updateCircuit]
  );

  const removeGate = useCallback(
    (id: string) => {
      const circuit = circuitRef.current;
      updateCircuit({
        ...circuit,
        gates: circuit.gates.filter((g) => g.id !== id),
      });
      // Clear editing gate if it was removed
      if (editingGate?.id === id) {
        setEditingGate(null);
      }
    },
    [editingGate, updateCircuit]
  );

  const updateGate = useCallback(
    (id: string, updates: Partial<Gate>) => {
      const circuit = circuitRef.current;
      const targetGate = circuit.gates.find((g) => g.id === id);
      if (!targetGate) return;

      const updatedGate = { ...targetGate, ...updates };

      // Helper to get qubits occupied by a gate (including all qubits between CNOT control/target)
      const getGateQubits = (gate: Gate): number[] => {
        if (gate.type === 'CNOT' && gate.control !== undefined && gate.target !== undefined) {
          const minQ = Math.min(gate.control, gate.target);
          const maxQ = Math.max(gate.control, gate.target);
          const qubits: number[] = [];
          for (let q = minQ; q <= maxQ; q++) {
            qubits.push(q);
          }
          return qubits;
        }
        return gate.qubit !== undefined ? [gate.qubit] : [];
      };

      // Check if updating CNOT control/target causes conflicts
      const isCnotUpdate =
        targetGate.type === 'CNOT' &&
        (updates.control !== undefined || updates.target !== undefined);

      let updatedGates: Gate[];

      if (isCnotUpdate) {
        const newQubits = getGateQubits(updatedGate);
        const gatePosition = updatedGate.position;

        // Find conflicting gates at the same position
        updatedGates = circuit.gates.map((g) => {
          if (g.id === id) {
            return updatedGate;
          }
          // Check if this gate conflicts with the updated CNOT
          if (g.position === gatePosition) {
            const gateQubits = getGateQubits(g);
            const hasConflict = gateQubits.some((q) => newQubits.includes(q));
            if (hasConflict) {
              // Shift conflicting gate to the right
              return { ...g, position: g.position + 1 };
            }
          }
          return g;
        });

        // Compact gates to resolve any further conflicts and left-align
        updatedGates = compactGates(updatedGates);
      } else {
        updatedGates = circuit.gates.map((g) => (g.id === id ? updatedGate : g));
      }

      updateCircuit({
        ...circuit,
        gates: updatedGates,
      });

      // Update editing gate if it's being edited
      if (editingGate?.id === id) {
        setEditingGate({ ...editingGate, ...updates });
      }
    },
    [editingGate, updateCircuit]
  );

  const updateGates = useCallback(
    (gates: Gate[]) => {
      const circuit = circuitRef.current;
      updateCircuit({
        ...circuit,
        gates,
      });
    },
    [updateCircuit]
  );

  const setQubits = useCallback(
    (count: number) => {
      const circuit = circuitRef.current;
      const newCount = Math.min(Math.max(1, count), config.maxQubits);
      updateCircuit({
        ...circuit,
        qubits: newCount,
      });
    },
    [config.maxQubits, updateCircuit]
  );

  const addQubit = useCallback(() => {
    const circuit = circuitRef.current;
    if (circuit.qubits < config.maxQubits) {
      updateCircuit({
        ...circuit,
        qubits: circuit.qubits + 1,
      });
    }
  }, [config.maxQubits, updateCircuit]);

  const removeQubit = useCallback(
    (qubitIndex?: number) => {
      const circuit = circuitRef.current;
      if (circuit.qubits <= 1) {
        return;
      }

      // Default to removing the last qubit if no index specified
      const removedIndex = qubitIndex ?? circuit.qubits - 1;

      // Filter out gates that act on the removed qubit and adjust indices
      const updatedGates = circuit.gates
        .filter((gate) => {
          // Remove gates that act on the deleted qubit
          if (gate.type === 'CNOT') {
            return gate.control !== removedIndex && gate.target !== removedIndex;
          }
          return gate.qubit !== removedIndex;
        })
        .map((gate) => {
          // Adjust qubit indices for gates on higher-indexed qubits
          if (gate.type === 'CNOT') {
            return {
              ...gate,
              control:
                gate.control !== undefined && gate.control > removedIndex
                  ? gate.control - 1
                  : gate.control,
              target:
                gate.target !== undefined && gate.target > removedIndex
                  ? gate.target - 1
                  : gate.target,
            };
          }
          return {
            ...gate,
            qubit:
              gate.qubit !== undefined && gate.qubit > removedIndex ? gate.qubit - 1 : gate.qubit,
          };
        });

      // Compact gates to remove gaps after deletion
      const compactedGates = compactGates(updatedGates);

      updateCircuit({
        ...circuit,
        qubits: circuit.qubits - 1,
        gates: compactedGates,
      });
      clearResult();
    },
    [updateCircuit, clearResult]
  );

  const clearCircuit = useCallback(() => {
    const circuit = circuitRef.current;
    updateCircuit({
      qubits: circuit.qubits,
      gates: [],
    });
    clearResult();
    setEditingGate(null);
  }, [updateCircuit, clearResult]);

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
    const circuit = circuitRef.current;
    return circuitToQasm(circuit);
  }, []);

  // === Simulation ===

  const simulate = useCallback(
    async (shots: number = 1024, profile?: SimulationProfile): Promise<SimulationResult> => {
      const circuit = circuitRef.current;
      // Invalidate any in-flight auto-simulation
      autoSimRequestId.current++;

      if (!canSimulate) {
        throw new Error('Simulation adapter is not available');
      }

      if (circuit.gates.length === 0) {
        throw new Error('Circuit has no gates');
      }

      const validShots = Math.min(Math.max(1, shots), config.maxShots);

      lastRunCircuit.current = circuit;

      // Explicit runs are never superseded, so the result is always non-null
      const simulationResult = await runSimulation('run', circuit, validShots, profile, () => true);
      return simulationResult as SimulationResult;
    },
    [canSimulate, config.maxShots, runSimulation]
  );

  // === Context Value ===

  const contextValue: QamposerContextValue = useMemo(
    () => ({
      // State
      circuit,
      result,
      resultSource,
      status,
      error,
      qasmCode,
      parseError,
      editingGate,

      // Circuit Actions
      setCircuit,
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

      // Adapter
      adapter,

      // Config
      config,
    }),
    [
      circuit,
      result,
      resultSource,
      status,
      error,
      qasmCode,
      parseError,
      editingGate,
      setCircuit,
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
      setQasmCode,
      simulate,
      canSimulate,
      adapter,
      config,
    ]
  );

  return <QamposerContext.Provider value={contextValue}>{children}</QamposerContext.Provider>;
}
