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
import { circuitToQasm, qasmToCircuit } from '../utils/openqasm';
import * as ops from '../circuit/operations';
import { useCircuitHistory } from './useCircuitHistory';
import { diffCircuits, reconcileGateIds } from '../circuit/diff';
import { GateDragProvider } from '../dnd/GateDragContext';
import { noopAdapter } from '../adapters/noop';
import type {
  Circuit,
  CircuitEditEvent,
  CellPosition,
  EditOptions,
  Gate,
  GatePlacement,
  SimulationResult,
  SimulationStatus,
  SimulationProfile,
  SimulationSource,
  ResultChangeReason,
  AdapterStatus,
  SimulationAdapter,
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
  realtimeShots: 1024,
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
  onCircuitEdit,
  onSimulationStart,
  onSimulationComplete,
  onSimulationError,
  onResultChange,
  config: userConfig,
  children,
}: QamposerProviderProps) {
  const maxQubits = userConfig?.maxQubits ?? DEFAULT_CONFIG.maxQubits;
  const maxGates = userConfig?.maxGates ?? DEFAULT_CONFIG.maxGates;
  const maxShots = userConfig?.maxShots ?? DEFAULT_CONFIG.maxShots;
  const realtimeShots = Math.min(
    Math.max(1, userConfig?.realtimeShots ?? DEFAULT_CONFIG.realtimeShots),
    maxShots
  );
  const config = useMemo(
    () => ({ maxQubits, maxGates, maxShots, realtimeShots }),
    [maxQubits, maxGates, maxShots, realtimeShots]
  );

  // Callbacks and adapters are read through refs so that inline props
  // (arrow functions, `adapter={localAdapter()}`) never cause re-simulation loops.
  const callbacksRef = useLatestRef({
    onCircuitChange,
    onCircuitEdit,
    onSimulationStart,
    onSimulationComplete,
    onSimulationError,
    onResultChange,
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

  // Single place the result changes, so onResultChange mirrors `result` exactly
  const resultRef = useRef<SimulationResult | null>(null);
  const applyResult = useCallback(
    (
      next: SimulationResult | null,
      source: SimulationSource | null,
      reason: ResultChangeReason
    ) => {
      if (next === null && resultRef.current === null) return; // already cleared
      resultRef.current = next;
      setResultState({ result: next, source });
      callbacksRef.current.onResultChange?.({ result: next, source, reason });
    },
    [callbacksRef]
  );
  const clearResult = useCallback(
    (reason: ResultChangeReason) => applyResult(null, null, reason),
    [applyResult]
  );
  const [status, setStatus] = useState<SimulationStatus>('idle');
  const [error, setError] = useState<Error | null>(null);

  // Gate editing state: tracked by id so the edited gate always reflects the
  // current circuit (after undo, moves, code edits) and clears when it disappears
  const [editingGateId, setEditingGateId] = useState<string | null>(null);
  const editingGate = useMemo(
    () => (editingGateId ? (circuit.gates.find((g) => g.id === editingGateId) ?? null) : null),
    [circuit, editingGateId]
  );
  const setEditingGate = useCallback((gate: Gate | null) => setEditingGateId(gate?.id ?? null), []);

  // === Edit pipeline: every circuit edit goes through commit() ===

  const history = useCircuitHistory();
  const { record: recordHistory, clear: clearHistory } = history;

  // The circuit this provider last produced. A different circuit arriving via the
  // controlled `circuit` prop was changed by the parent, so older history no longer applies.
  const lastCommittedRef = useRef(circuit);
  useEffect(() => {
    if (circuit !== lastCommittedRef.current) {
      lastCommittedRef.current = circuit;
      clearHistory();
    }
  }, [circuit, clearHistory]);

  const commit = useCallback(
    (
      after: Circuit,
      edit: Omit<CircuitEditEvent, 'before' | 'after' | 'origin' | 'changes'>,
      options: EditOptions | undefined,
      recordInHistory = true
    ) => {
      const before = circuitRef.current;
      const origin = options?.origin ?? 'api';
      if (recordInHistory) {
        recordHistory(before, {
          action: edit.action,
          origin,
          ...(edit.gateId !== undefined ? { gateId: edit.gateId } : {}),
        });
      }
      lastCommittedRef.current = after;
      updateCircuit(after);
      callbacksRef.current.onCircuitEdit?.({
        ...edit,
        origin,
        changes: diffCircuits(before, after),
        before,
        after,
      });
    },
    [recordHistory, updateCircuit, callbacksRef]
  );

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
        // Keep the ids of gates the text edit did not touch
        const gates = reconcileGateIds(circuitRef.current.gates, parseResult.circuit.gates);
        commit(
          { ...parseResult.circuit, gates },
          { action: 'code', displaced: [] },
          { origin: 'code' }
        );
      }
    },
    [commit]
  );

  // Availability of the main adapter. One check is shared per adapter instance, so
  // simulate() can wait for a check that is still in flight (e.g. right after mount)
  // instead of failing. Re-checked when the adapter identity changes; the status keeps
  // its last value meanwhile, so inline adapters don't flicker back to 'checking'.
  const [adapterStatus, setAdapterStatus] = useState<AdapterStatus>('checking');
  const availabilityRef = useRef<{ adapter: SimulationAdapter; check: Promise<boolean> } | null>(
    null
  );

  const checkAvailability = useCallback(
    (force = false): Promise<boolean> => {
      const current = adapterRef.current;
      const cached = availabilityRef.current;
      if (force || !cached || cached.adapter !== current) {
        const check = current.isAvailable().catch(() => false);
        availabilityRef.current = { adapter: current, check };
        check.then((available) => {
          // Ignore results of checks that have since been superseded
          if (availabilityRef.current?.check === check) {
            setAdapterStatus(available ? 'available' : 'unavailable');
          }
        });
        return check;
      }
      return cached.check;
    },
    [adapterRef]
  );

  useEffect(() => {
    checkAvailability();
  }, [adapter, checkAvailability]);

  const canSimulate = adapterStatus === 'available';

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
        applyResult(simulationResult, source, 'simulation');
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
    [adapterRef, realtimeAdapterRef, callbacksRef, applyResult]
  );

  // Auto-simulation: run ideal simulator whenever circuit changes
  const autoSimRequestId = useRef(0);
  // Circuit most recently passed to simulate(); its realtime result must not
  // overwrite the explicit run (e.g. importQasm() followed by simulate()).
  const lastRunCircuit = useRef<Circuit | null>(null);

  useEffect(() => {
    if (circuit.gates.length === 0) {
      // Drop any in-flight simulation of the previous circuit, then clear its result
      autoSimRequestId.current++;
      clearResult('empty-circuit');
      return;
    }
    if (!canAutoSimulate) return;
    if (circuit === lastRunCircuit.current) return;

    const requestId = ++autoSimRequestId.current;

    runSimulation(
      'realtime',
      circuit,
      realtimeShots,
      { type: 'ideal' },
      () => autoSimRequestId.current === requestId
    ).catch(() => {
      // Already reported via state and onSimulationError
    });
  }, [circuit, canAutoSimulate, realtimeShots, runSimulation, clearResult]);

  // === Circuit Actions ===

  const setCircuit = useCallback(
    (newCircuit: Circuit, options?: EditOptions) => {
      commit(newCircuit, { action: 'set', displaced: [] }, options);
    },
    [commit]
  );

  const addGate = useCallback(
    (gate: Omit<Gate, 'id'>, options?: EditOptions) => {
      const circuit = circuitRef.current;
      if (circuit.gates.length >= config.maxGates) {
        console.warn(`Maximum gate limit (${config.maxGates}) reached`);
        return null;
      }
      const newGate: Gate = { ...gate, id: ops.generateGateId() };
      commit(
        { ...circuit, gates: [...circuit.gates, newGate] },
        { action: 'add', gateId: newGate.id, displaced: [] },
        options
      );
      return newGate.id;
    },
    [config.maxGates, commit]
  );

  const insertGate = useCallback(
    (placement: GatePlacement, column: number, options?: EditOptions) => {
      const circuit = circuitRef.current;
      if (circuit.gates.length >= config.maxGates) {
        console.warn(`Maximum gate limit (${config.maxGates}) reached`);
        return null;
      }
      const result = ops.insertGate(circuit, placement, column);
      commit(
        result.circuit,
        { action: 'add', gateId: result.gateId, displaced: result.displaced },
        options
      );
      return result.gateId ?? null;
    },
    [config.maxGates, commit]
  );

  const moveGate = useCallback(
    (gateId: string, to: CellPosition, options?: EditOptions) => {
      const circuit = circuitRef.current;
      const gate = circuit.gates.find((g) => g.id === gateId);
      const result = gate ? ops.moveGate(circuit, gateId, to) : null;
      if (!gate || !result) return false;
      const moved = result.circuit.gates.find((g) => g.id === gateId)!;
      commit(
        result.circuit,
        {
          action: 'move',
          gateId,
          from: { row: ops.getGateRow(gate), column: gate.position },
          to: { row: ops.getGateRow(moved), column: moved.position },
          displaced: result.displaced,
        },
        options
      );
      return true;
    },
    [commit]
  );

  const removeGate = useCallback(
    (id: string, options?: EditOptions) => {
      const circuit = circuitRef.current;
      if (!circuit.gates.some((g) => g.id === id)) return;
      const result = ops.removeGate(circuit, id);
      commit(
        result.circuit,
        { action: 'remove', gateId: id, displaced: result.displaced },
        options
      );
    },
    [commit]
  );

  const updateGate = useCallback(
    (id: string, updates: Partial<Gate>, options?: EditOptions) => {
      const circuit = circuitRef.current;
      const gate = circuit.gates.find((g) => g.id === id);
      if (!gate) return;
      // Re-applying current values (e.g. the editor saving on blur) is not an edit
      const changes = Object.entries(updates) as [keyof Gate, Gate[keyof Gate]][];
      if (changes.every(([key, value]) => gate[key] === value)) return;
      const result = ops.updateGate(circuit, id, updates);
      commit(
        result.circuit,
        { action: 'update', gateId: id, displaced: result.displaced },
        options
      );
    },
    [commit]
  );

  const updateGates = useCallback(
    (gates: Gate[], options?: EditOptions) => {
      commit({ ...circuitRef.current, gates }, { action: 'set', displaced: [] }, options);
    },
    [commit]
  );

  const setQubits = useCallback(
    (count: number, options?: EditOptions) => {
      const circuit = circuitRef.current;
      const qubits = Math.min(Math.max(1, count), config.maxQubits);
      commit({ ...circuit, qubits }, { action: 'set', displaced: [] }, options);
    },
    [config.maxQubits, commit]
  );

  const addQubit = useCallback(
    (options?: EditOptions) => {
      const circuit = circuitRef.current;
      if (circuit.qubits >= config.maxQubits) return;
      commit(
        { ...circuit, qubits: circuit.qubits + 1 },
        { action: 'add-qubit', displaced: [] },
        options
      );
    },
    [config.maxQubits, commit]
  );

  const removeQubit = useCallback(
    (qubitIndex?: number, options?: EditOptions) => {
      const circuit = circuitRef.current;
      if (circuit.qubits <= 1) return;
      const result = ops.removeQubit(circuit, qubitIndex);
      commit(result.circuit, { action: 'remove-qubit', displaced: result.displaced }, options);
      clearResult('remove-qubit');
    },
    [commit, clearResult]
  );

  const clearCircuit = useCallback(
    (options?: EditOptions) => {
      const circuit = circuitRef.current;
      commit({ qubits: circuit.qubits, gates: [] }, { action: 'clear', displaced: [] }, options);
      clearResult('clear');
    },
    [commit, clearResult]
  );

  // === History ===

  const { takeUndo, takeRedo } = history;

  const undo = useCallback(
    (options?: EditOptions) => {
      const entry = takeUndo(circuitRef.current);
      if (entry) {
        commit(
          entry.circuit,
          { action: 'undo', reverts: entry.edit, displaced: [] },
          options,
          false
        );
      }
    },
    [takeUndo, commit]
  );

  const redo = useCallback(
    (options?: EditOptions) => {
      const entry = takeRedo(circuitRef.current);
      if (entry) {
        commit(
          entry.circuit,
          { action: 'redo', reverts: entry.edit, displaced: [] },
          options,
          false
        );
      }
    },
    [takeRedo, commit]
  );

  // === QASM Actions ===

  const importQasm = useCallback(
    (code: string, options?: EditOptions): QasmParseResult => {
      setQasmCodeState(code);
      const parseResult = qasmToCircuit(code);

      if (parseResult.errors.length > 0) {
        setParseError(parseResult.errors[0]);
      } else {
        setParseError(null);
      }

      if (parseResult.circuit && (parseResult.success || parseResult.circuit.gates.length > 0)) {
        isUpdatingFromCode.current = true;
        commit(parseResult.circuit, { action: 'import', displaced: [] }, options);
      }

      return parseResult;
    },
    [commit]
  );

  const exportQasm = useCallback(() => {
    const circuit = circuitRef.current;
    return circuitToQasm(circuit);
  }, []);

  // === Simulation ===

  const simulate = useCallback(
    async (shots: number = 1024, profile?: SimulationProfile): Promise<SimulationResult> => {
      // Simulate the circuit as it is now, even if the availability check below takes a while
      const circuit = circuitRef.current;
      if (circuit.gates.length === 0) {
        throw new Error('Circuit has no gates');
      }

      // Invalidate any in-flight auto-simulation
      autoSimRequestId.current++;
      lastRunCircuit.current = circuit;

      // Wait for a pending check; if the adapter was unavailable, check again in case
      // the backend has come up since
      setStatus('simulating');
      setError(null);
      const available = (await checkAvailability()) || (await checkAvailability(true));
      if (!available) {
        const unavailable = new Error('Simulation adapter is not available');
        setError(unavailable);
        setStatus('error');
        callbacksRef.current.onSimulationError?.({
          error: unavailable,
          circuit: { ...circuit },
          qasm: circuitToQasm(circuit),
          source: 'run',
        });
        throw unavailable;
      }

      const validShots = Math.min(Math.max(1, shots), config.maxShots);

      // Explicit runs are never superseded, so the result is always non-null
      const simulationResult = await runSimulation('run', circuit, validShots, profile, () => true);
      return simulationResult as SimulationResult;
    },
    [checkAvailability, config.maxShots, runSimulation, callbacksRef]
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
      insertGate,
      moveGate,
      removeGate,
      updateGate,
      updateGates,
      setQubits,
      addQubit,
      removeQubit,
      clearCircuit,

      // History
      undo,
      redo,
      canUndo: history.canUndo,
      canRedo: history.canRedo,

      // Gate Editing
      setEditingGate,

      // QASM
      importQasm,
      exportQasm,
      setQasmCode,

      // Simulation
      simulate,
      canSimulate,
      adapterStatus,

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
      insertGate,
      moveGate,
      removeGate,
      updateGate,
      updateGates,
      setQubits,
      addQubit,
      removeQubit,
      clearCircuit,
      undo,
      redo,
      history.canUndo,
      history.canRedo,
      setEditingGate,
      importQasm,
      exportQasm,
      setQasmCode,
      simulate,
      canSimulate,
      adapterStatus,
      adapter,
      config,
    ]
  );

  return (
    <QamposerContext.Provider value={contextValue}>
      <GateDragProvider>{children}</GateDragProvider>
    </QamposerContext.Provider>
  );
}
