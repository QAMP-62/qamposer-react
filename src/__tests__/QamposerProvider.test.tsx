import { describe, it, expect, vi, afterEach } from 'vitest';
import { useEffect, useState } from 'react';
import { render, screen, waitFor, act, cleanup } from '@testing-library/react';
import { QamposerProvider } from '../context/QamposerProvider';
import { QamposerMicro } from '../presets/QamposerMicro';
import { useQamposer } from '../hooks/useQamposer';
import type {
  Circuit,
  CircuitEditEvent,
  ResultChangeEvent,
  QamposerContextValue,
  SimulationAdapter,
  SimulationCompleteEvent,
  SimulationResult,
} from '../types';

const BELL: Circuit = {
  qubits: 2,
  gates: [
    { id: 'g1', type: 'H', qubit: 0, position: 0 },
    { id: 'g2', type: 'CNOT', control: 0, target: 1, position: 1 },
  ],
};

const RESULT: SimulationResult = {
  counts: { '00': 512, '11': 512 },
  execution_time: 0,
};

// Returns a fresh adapter object on every call (like `localAdapter()` inline in JSX)
// while sharing a single spy across instances.
function makeAdapterFactory(simulate = vi.fn(async () => RESULT)) {
  return {
    simulate,
    create: (): SimulationAdapter => ({
      name: 'test',
      simulate,
      isAvailable: async () => true,
    }),
  };
}

// Exposes the context value to the test body without mutating outer state during render
function captureContext() {
  const ctx: { current: QamposerContextValue | null } = { current: null };
  function Probe() {
    const value = useQamposer();
    useEffect(() => {
      ctx.current = value;
    });
    return null;
  }
  return { ctx, Probe };
}

function flush() {
  return act(() => new Promise((resolve) => setTimeout(resolve, 20)));
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('QamposerProvider', () => {
  it('does not loop with inline callbacks and inline adapters', async () => {
    const factory = makeAdapterFactory();

    function App() {
      const [events, setEvents] = useState<SimulationCompleteEvent[]>([]);
      return (
        <QamposerProvider
          defaultCircuit={BELL}
          adapter={factory.create()}
          onSimulationComplete={(event) => setEvents((prev) => [...prev, event])}
        >
          <span data-testid="count">{events.length}</span>
        </QamposerProvider>
      );
    }

    render(<App />);
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('1'));
    await flush();
    await flush();

    expect(factory.simulate).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('count')).toHaveTextContent('1');
  });

  it('reports simulation source for realtime and run simulations', async () => {
    const realtime = makeAdapterFactory();
    const main = makeAdapterFactory();
    const onStart = vi.fn();
    const onComplete = vi.fn();
    const { ctx, Probe } = captureContext();

    render(
      <QamposerProvider
        defaultCircuit={BELL}
        adapter={main.create()}
        realtimeAdapter={realtime.create()}
        onSimulationStart={onStart}
        onSimulationComplete={onComplete}
      >
        <Probe />
      </QamposerProvider>
    );

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(onStart).toHaveBeenLastCalledWith(expect.objectContaining({ source: 'realtime' }));
    expect(onComplete).toHaveBeenLastCalledWith(
      expect.objectContaining({ source: 'realtime', result: RESULT })
    );

    await waitFor(() => expect(ctx.current!.canSimulate).toBe(true));
    await act(() => ctx.current!.simulate(100));

    expect(main.simulate).toHaveBeenCalledTimes(1);
    expect(onStart).toHaveBeenLastCalledWith(expect.objectContaining({ source: 'run' }));
    expect(onComplete).toHaveBeenLastCalledWith(expect.objectContaining({ source: 'run' }));
  });

  it('calls onSimulationError when the adapter fails', async () => {
    const failing = makeAdapterFactory(
      vi.fn(async () => {
        throw new Error('boom');
      })
    );
    const onError = vi.fn();
    const { ctx, Probe } = captureContext();

    render(
      <QamposerProvider
        defaultCircuit={BELL}
        adapter={failing.create()}
        onSimulationError={onError}
      >
        <Probe />
      </QamposerProvider>
    );

    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    const event = onError.mock.calls[0][0];
    expect(event.source).toBe('realtime');
    expect(event.error.message).toBe('boom');
    expect(event.circuit.gates).toHaveLength(2);
    expect(ctx.current!.status).toBe('error');
  });
});

describe('programmatic control via useQamposer()', () => {
  const QASM = 'OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[3];\nh q[0];\nx q[2];\n';

  it('applies actions called back-to-back in one handler', async () => {
    const { ctx, Probe } = captureContext();

    render(
      <QamposerProvider>
        <Probe />
      </QamposerProvider>
    );
    await waitFor(() => expect(ctx.current).not.toBeNull());

    act(() => {
      ctx.current!.setQubits(3);
      ctx.current!.updateGates([{ id: 'a', type: 'X', qubit: 2, position: 0 }]);
    });

    expect(ctx.current!.circuit.qubits).toBe(3);
    expect(ctx.current!.circuit.gates).toHaveLength(1);
  });

  it('replaces the whole circuit with setCircuit and reports a realtime result', async () => {
    const factory = makeAdapterFactory();
    const { ctx, Probe } = captureContext();

    render(
      <QamposerProvider adapter={factory.create()}>
        <Probe />
      </QamposerProvider>
    );
    await waitFor(() => expect(ctx.current).not.toBeNull());
    expect(ctx.current!.resultSource).toBeNull();

    act(() => ctx.current!.setCircuit(BELL));

    await waitFor(() => expect(ctx.current!.resultSource).toBe('realtime'));
    expect(ctx.current!.circuit).toEqual(BELL);
    expect(ctx.current!.result).toEqual(RESULT);
  });

  it('simulates the imported circuit when importQasm and simulate run in one handler', async () => {
    const realtime = makeAdapterFactory();
    const main = makeAdapterFactory(vi.fn(async () => ({ ...RESULT, counts: { '101': 100 } })));
    const { ctx, Probe } = captureContext();

    render(
      <QamposerProvider
        defaultCircuit={BELL}
        adapter={main.create()}
        realtimeAdapter={realtime.create()}
      >
        <Probe />
      </QamposerProvider>
    );
    await waitFor(() => expect(ctx.current?.canSimulate).toBe(true));
    await waitFor(() => expect(realtime.simulate).toHaveBeenCalledTimes(1));

    await act(async () => {
      ctx.current!.importQasm(QASM);
      await ctx.current!.simulate(100);
    });
    await flush();

    expect(main.simulate).toHaveBeenCalledWith(expect.objectContaining({ qubits: 3, shots: 100 }));
    // The realtime run for the imported circuit must not overwrite the explicit run
    expect(realtime.simulate).toHaveBeenCalledTimes(1);
    expect(ctx.current!.resultSource).toBe('run');
    expect(ctx.current!.result?.counts).toEqual({ '101': 100 });
  });
});

describe('presets inside an outer QamposerProvider', () => {
  it('shares state with sibling components using useQamposer()', async () => {
    const factory = makeAdapterFactory();

    function Controls() {
      const { circuit, result, importQasm } = useQamposer();
      return (
        <div>
          <span data-testid="gates">{circuit.gates.length}</span>
          <span data-testid="has-result">{result ? 'yes' : 'no'}</span>
          <button
            onClick={() =>
              importQasm(
                'OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[2];\nh q[0];\nx q[1];\nz q[0];\n'
              )
            }
          >
            load
          </button>
        </div>
      );
    }

    const { container } = render(
      <QamposerProvider defaultCircuit={BELL} adapter={factory.create()}>
        <QamposerMicro />
        <Controls />
      </QamposerProvider>
    );

    // No drag in progress, so no preview gates are rendered
    const renderedGates = () =>
      container.querySelectorAll('.circuit-editor__gate, .circuit-editor__cnot').length;

    expect(screen.getByTestId('gates')).toHaveTextContent('2');
    expect(renderedGates()).toBe(2);
    await waitFor(() => expect(screen.getByTestId('has-result')).toHaveTextContent('yes'));

    await act(async () => screen.getByText('load').click());
    expect(screen.getByTestId('gates')).toHaveTextContent('3');
    expect(renderedGates()).toBe(3);
    await waitFor(() => expect(factory.simulate).toHaveBeenCalledTimes(2));
  });

  it('warns when provider props are passed to a preset inside a provider', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(
      <QamposerProvider>
        <QamposerMicro defaultCircuit={BELL} onSimulationComplete={() => {}} />
      </QamposerProvider>
    );

    await waitFor(() => expect(warn).toHaveBeenCalled());
    const message = warn.mock.calls[0][0] as string;
    expect(message).toContain('QamposerMicro');
    expect(message).toContain('defaultCircuit');
    expect(message).toContain('onSimulationComplete');
  });

  it('does not warn when used standalone', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(<QamposerMicro defaultCircuit={BELL} />);
    await flush();

    expect(warn).not.toHaveBeenCalled();
  });
});

describe('editing actions, history and onCircuitEdit', () => {
  function setup(props: Partial<React.ComponentProps<typeof QamposerProvider>> = {}) {
    const { ctx, Probe } = captureContext();
    const onCircuitEdit = vi.fn<(event: CircuitEditEvent) => void>();
    const utils = render(
      <QamposerProvider defaultCircuit={BELL} onCircuitEdit={onCircuitEdit} {...props}>
        <Probe />
      </QamposerProvider>
    );
    return { ctx, onCircuitEdit, ...utils };
  }

  it('reports a move with the moved gate, its cells and the displaced gates', async () => {
    const { ctx, onCircuitEdit } = setup();
    await waitFor(() => expect(ctx.current).not.toBeNull());

    // Bell: H(q0, col 0), CNOT(0→1, col 1). Moving H after the CNOT on q1 lets the
    // CNOT slide left to column 0, which is reported as a displacement.
    let moved = false;
    act(() => {
      moved = ctx.current!.moveGate('g1', { row: 1, column: 1 }, { origin: 'pointer' });
    });

    expect(moved).toBe(true);
    const event = onCircuitEdit.mock.calls[0][0];
    expect(event).toMatchObject({
      action: 'move',
      origin: 'pointer',
      gateId: 'g1',
      from: { row: 0, column: 0 },
      to: { row: 1, column: 1 },
      displaced: [{ id: 'g2', from: 1, to: 0 }],
    });
    expect(event.before).toEqual(BELL);
  });

  it('returns false and emits nothing for a move that changes nothing', async () => {
    const { ctx, onCircuitEdit } = setup();
    await waitFor(() => expect(ctx.current).not.toBeNull());

    let moved = true;
    act(() => {
      moved = ctx.current!.moveGate('g1', { row: 0, column: 0 });
    });

    expect(moved).toBe(false);
    expect(onCircuitEdit).not.toHaveBeenCalled();
    expect(ctx.current!.canUndo).toBe(false);
  });

  it('reports inserted gates and the gates they push right', async () => {
    const { ctx, onCircuitEdit } = setup();
    await waitFor(() => expect(ctx.current).not.toBeNull());

    let id: string | null = null;
    act(() => {
      id = ctx.current!.insertGate({ type: 'X', qubit: 0 }, 0, { origin: 'keyboard' });
    });

    expect(onCircuitEdit.mock.calls[0][0]).toMatchObject({
      action: 'add',
      origin: 'keyboard',
      gateId: id,
      displaced: [
        { id: 'g1', from: 0, to: 1 },
        { id: 'g2', from: 1, to: 2 },
      ],
    });
  });

  it('undoes and redoes every kind of edit in one history', async () => {
    const { ctx, onCircuitEdit } = setup();
    await waitFor(() => expect(ctx.current).not.toBeNull());

    act(() => {
      ctx.current!.insertGate({ type: 'Z', qubit: 1 }, 0, { origin: 'pointer' });
    });
    act(() => {
      ctx.current!.addQubit();
    });
    act(() => {
      ctx.current!.removeGate('g1', { origin: 'keyboard' });
    });
    expect(ctx.current!.circuit.qubits).toBe(3);
    expect(ctx.current!.canUndo).toBe(true);

    act(() => ctx.current!.undo());
    act(() => ctx.current!.undo());
    act(() => ctx.current!.undo());

    expect(ctx.current!.circuit).toEqual(BELL);
    expect(ctx.current!.canUndo).toBe(false);
    expect(ctx.current!.canRedo).toBe(true);
    expect(onCircuitEdit.mock.lastCall![0]).toMatchObject({ action: 'undo', origin: 'api' });

    act(() => ctx.current!.redo({ origin: 'keyboard' }));
    expect(ctx.current!.circuit.gates).toHaveLength(3);
    expect(onCircuitEdit.mock.lastCall![0]).toMatchObject({
      action: 'redo',
      origin: 'keyboard',
    });
  });

  it('collapses consecutive code-editor edits into one undo step', async () => {
    const { ctx, onCircuitEdit } = setup();
    await waitFor(() => expect(ctx.current).not.toBeNull());

    const qasm = (body: string) =>
      `OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[2];\ncreg c[2];\n${body}`;
    act(() => ctx.current!.setQasmCode(qasm('h q[0];\n')));
    act(() => ctx.current!.setQasmCode(qasm('h q[0];\nx q[1];\n')));
    act(() => ctx.current!.setQasmCode(qasm('h q[0];\nx q[1];\nz q[0];\n')));

    expect(onCircuitEdit).toHaveBeenCalledTimes(3);
    expect(onCircuitEdit.mock.calls[0][0]).toMatchObject({ action: 'code', origin: 'code' });

    act(() => ctx.current!.undo());
    expect(ctx.current!.circuit).toEqual(BELL);
    expect(ctx.current!.canUndo).toBe(false);
  });

  it('keeps the edited gate in sync with the circuit', async () => {
    const rotation: Circuit = {
      qubits: 1,
      gates: [{ id: 'r', type: 'RX', qubit: 0, position: 0, parameter: 1 }],
    };
    const { ctx } = setup({ defaultCircuit: rotation });
    await waitFor(() => expect(ctx.current).not.toBeNull());

    act(() => ctx.current!.setEditingGate(ctx.current!.circuit.gates[0]));
    act(() => ctx.current!.updateGate('r', { parameter: 2 }));
    expect(ctx.current!.editingGate?.parameter).toBe(2);

    act(() => ctx.current!.undo());
    expect(ctx.current!.editingGate?.parameter).toBe(1);

    act(() => ctx.current!.removeGate('r'));
    expect(ctx.current!.editingGate).toBeNull();
  });

  it('clears history when a controlled parent replaces the circuit', async () => {
    const { ctx, Probe } = captureContext();
    let replace: (circuit: Circuit) => void = () => {};

    function Parent() {
      const [circuit, setCircuit] = useState<Circuit>(BELL);
      useEffect(() => {
        replace = (next) => setCircuit(next);
      });
      return (
        <QamposerProvider circuit={circuit} onCircuitChange={setCircuit}>
          <Probe />
        </QamposerProvider>
      );
    }

    render(<Parent />);
    await waitFor(() => expect(ctx.current).not.toBeNull());

    act(() => {
      ctx.current!.insertGate({ type: 'X', qubit: 1 }, 0);
    });
    // Edits made through the provider stay undoable in controlled mode
    expect(ctx.current!.canUndo).toBe(true);

    act(() => replace({ qubits: 3, gates: [] }));
    expect(ctx.current!.canUndo).toBe(false);
  });
});

describe('onCircuitEdit changes and reverts', () => {
  const HEADER = 'OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[2];\ncreg c[2];\n';

  function setup(circuit: Circuit = BELL) {
    const { ctx, Probe } = captureContext();
    const onCircuitEdit = vi.fn<(event: CircuitEditEvent) => void>();
    render(
      <QamposerProvider defaultCircuit={circuit} onCircuitEdit={onCircuitEdit}>
        <Probe />
      </QamposerProvider>
    );
    const last = () => onCircuitEdit.mock.lastCall![0];
    return { ctx, onCircuitEdit, last };
  }

  it('attaches changes to every action', async () => {
    const { ctx, onCircuitEdit } = setup();
    await waitFor(() => expect(ctx.current).not.toBeNull());

    act(() => {
      ctx.current!.insertGate({ type: 'X', qubit: 1 }, 0);
    });
    act(() => ctx.current!.addQubit());
    act(() => ctx.current!.setQubits(2));
    act(() => ctx.current!.undo());
    act(() => ctx.current!.redo());
    act(() => ctx.current!.clearCircuit());
    act(() => {
      ctx.current!.importQasm(`${HEADER}h q[0];\n`);
    });
    act(() => ctx.current!.setQasmCode(`${HEADER}h q[0];\nx q[1];\n`));

    for (const [event] of onCircuitEdit.mock.calls) {
      expect(event.changes).toEqual(
        expect.objectContaining({
          added: expect.any(Array),
          removed: expect.any(Array),
          updated: expect.any(Array),
        })
      );
    }
    expect(onCircuitEdit).toHaveBeenCalledTimes(8);
  });

  it('agrees with gateId and displaced for single-gate edits', async () => {
    const { ctx, last } = setup();
    await waitFor(() => expect(ctx.current).not.toBeNull());

    // Insert pushes both Bell gates right
    act(() => {
      ctx.current!.insertGate({ type: 'X', qubit: 0 }, 0);
    });
    let event = last();
    expect(event.changes.added.map((g) => g.id)).toEqual([event.gateId]);
    expect(event.changes.updated.map((u) => u.after.id).sort()).toEqual(
      event.displaced.map((d) => d.id).sort()
    );

    // Move: updated = the moved gate + displaced gates
    act(() => {
      ctx.current!.moveGate('g1', { row: 1, column: 5 });
    });
    event = last();
    expect(event.changes.updated.map((u) => u.after.id).sort()).toEqual(
      [event.gateId!, ...event.displaced.map((d) => d.id)].sort()
    );

    // Remove
    act(() => ctx.current!.removeGate('g2'));
    event = last();
    expect(event.changes.removed.map((g) => g.id)).toEqual(['g2']);
    expect(event.changes.updated.map((u) => u.after.id).sort()).toEqual(
      event.displaced.map((d) => d.id).sort()
    );
  });

  it('keeps gate ids across code edits, so one added line is one added gate', async () => {
    const { ctx, last } = setup();
    await waitFor(() => expect(ctx.current).not.toBeNull());

    act(() => ctx.current!.setQasmCode(`${HEADER}h q[0];\ncx q[0], q[1];\nx q[1];\n`));

    const event = last();
    expect(event).toMatchObject({ action: 'code', origin: 'code' });
    expect(event.gateId).toBeUndefined();
    expect(event.changes.added).toMatchObject([{ type: 'X', qubit: 1 }]);
    expect(event.changes.removed).toEqual([]);
    expect(ctx.current!.circuit.gates.map((g) => g.id)).toEqual(
      expect.arrayContaining(['g1', 'g2'])
    );
  });

  it('keeps the edited gate open across code edits', async () => {
    const rotation: Circuit = {
      qubits: 2,
      gates: [{ id: 'r', type: 'RX', qubit: 0, position: 0, parameter: Math.PI / 2 }],
    };
    const { ctx } = setup(rotation);
    await waitFor(() => expect(ctx.current).not.toBeNull());

    act(() => ctx.current!.setEditingGate(ctx.current!.circuit.gates[0]));
    act(() => ctx.current!.setQasmCode(`${HEADER}rx(pi) q[0];\nh q[1];\n`));

    expect(ctx.current!.editingGate).toMatchObject({ id: 'r', parameter: Math.PI });
  });

  it('reports importQasm as a full replacement', async () => {
    const { ctx, last } = setup();
    await waitFor(() => expect(ctx.current).not.toBeNull());

    act(() => {
      ctx.current!.importQasm(`${HEADER}h q[0];\ncx q[0], q[1];\n`);
    });

    const { changes } = last();
    expect(changes.removed.map((g) => g.id).sort()).toEqual(['g1', 'g2']);
    expect(changes.added).toHaveLength(2);
  });

  it('reports gates dropped and renumbered by removing a qubit', async () => {
    const circuit: Circuit = {
      qubits: 3,
      gates: [
        { id: 'a', type: 'H', qubit: 0, position: 0 },
        { id: 'b', type: 'X', qubit: 1, position: 0 },
        { id: 'c', type: 'Z', qubit: 2, position: 0 },
      ],
    };
    const { ctx, last } = setup(circuit);
    await waitFor(() => expect(ctx.current).not.toBeNull());

    act(() => ctx.current!.removeQubit(1));

    const { changes } = last();
    expect(changes.removed.map((g) => g.id)).toEqual(['b']);
    expect(changes.updated).toEqual([
      { before: circuit.gates[2], after: { ...circuit.gates[2], qubit: 1 } },
    ]);
    expect(changes.qubits).toEqual({ from: 3, to: 2 });
  });

  it('says which edit undo and redo revert', async () => {
    const { ctx, last } = setup();
    await waitFor(() => expect(ctx.current).not.toBeNull());

    act(() => {
      ctx.current!.moveGate('g1', { row: 1, column: 5 }, { origin: 'pointer' });
    });
    act(() => ctx.current!.setQasmCode(`${HEADER}h q[0];\n`));
    act(() => ctx.current!.setQasmCode(`${HEADER}h q[0];\nx q[1];\n`));

    act(() => ctx.current!.undo());
    expect(last().reverts).toEqual({ action: 'code', origin: 'code' });

    act(() => ctx.current!.undo());
    expect(last().reverts).toEqual({ action: 'move', origin: 'pointer', gateId: 'g1' });
    expect(last().changes.updated.map((u) => u.after.id)).toContain('g1');

    act(() => ctx.current!.redo());
    expect(last()).toMatchObject({
      action: 'redo',
      reverts: { action: 'move', origin: 'pointer', gateId: 'g1' },
    });
  });
});

describe('realtimeShots and onResultChange', () => {
  function setup(props: Partial<React.ComponentProps<typeof QamposerProvider>> = {}) {
    const factory = makeAdapterFactory();
    const { ctx, Probe } = captureContext();
    const onResultChange = vi.fn<(event: ResultChangeEvent) => void>();
    render(
      <QamposerProvider
        defaultCircuit={BELL}
        adapter={factory.create()}
        onResultChange={onResultChange}
        {...props}
      >
        <Probe />
      </QamposerProvider>
    );
    return { ctx, factory, onResultChange };
  }

  it('uses 1024 shots for automatic simulation by default', async () => {
    const { factory } = setup();
    await waitFor(() => expect(factory.simulate).toHaveBeenCalled());
    expect(factory.simulate).toHaveBeenLastCalledWith(expect.objectContaining({ shots: 1024 }));
  });

  it('uses config.realtimeShots, capped at maxShots', async () => {
    const custom = setup({ config: { realtimeShots: 256 } });
    await waitFor(() => expect(custom.factory.simulate).toHaveBeenCalled());
    expect(custom.factory.simulate).toHaveBeenLastCalledWith(
      expect.objectContaining({ shots: 256 })
    );
    cleanup();

    const capped = setup({ config: { realtimeShots: 5000, maxShots: 2000 } });
    await waitFor(() => expect(capped.factory.simulate).toHaveBeenCalled());
    expect(capped.factory.simulate).toHaveBeenLastCalledWith(
      expect.objectContaining({ shots: 2000 })
    );
  });

  it('reports new results and cleared results with a reason', async () => {
    const { ctx, onResultChange } = setup();
    await waitFor(() => expect(onResultChange).toHaveBeenCalledTimes(1));
    expect(onResultChange).toHaveBeenLastCalledWith({
      result: RESULT,
      source: 'realtime',
      reason: 'simulation',
    });

    // Removing the last gates empties the circuit
    act(() => ctx.current!.removeGate('g1'));
    await waitFor(() => expect(onResultChange).toHaveBeenCalledTimes(2));
    act(() => ctx.current!.removeGate('g2'));
    await waitFor(() =>
      expect(onResultChange).toHaveBeenLastCalledWith({
        result: null,
        source: null,
        reason: 'empty-circuit',
      })
    );
    expect(ctx.current!.result).toBeNull();
  });

  it('reports clearCircuit once, as a clear', async () => {
    const { ctx, onResultChange } = setup();
    await waitFor(() => expect(onResultChange).toHaveBeenCalledTimes(1));

    act(() => ctx.current!.clearCircuit());
    await flush();

    expect(onResultChange).toHaveBeenCalledTimes(2);
    expect(onResultChange).toHaveBeenLastCalledWith({
      result: null,
      source: null,
      reason: 'clear',
    });
  });

  it('reports removeQubit as a clear, then the result of the new circuit', async () => {
    const circuit: Circuit = {
      qubits: 3,
      gates: [
        { id: 'a', type: 'H', qubit: 0, position: 0 },
        { id: 'b', type: 'X', qubit: 2, position: 0 },
      ],
    };
    const { ctx, onResultChange } = setup({ defaultCircuit: circuit });
    await waitFor(() => expect(onResultChange).toHaveBeenCalledTimes(1));

    act(() => ctx.current!.removeQubit(2));

    await waitFor(() => expect(onResultChange).toHaveBeenCalledTimes(3));
    expect(onResultChange.mock.calls[1][0]).toMatchObject({ result: null, reason: 'remove-qubit' });
    expect(onResultChange.mock.calls[2][0]).toMatchObject({ reason: 'simulation' });
  });

  it('does not report clearing when there is no result', async () => {
    const { onResultChange } = setup({ defaultCircuit: { qubits: 2, gates: [] } });
    await flush();
    expect(onResultChange).not.toHaveBeenCalled();
  });

  it('drops an in-flight simulation when the circuit becomes empty', async () => {
    let resolve: (result: SimulationResult) => void = () => {};
    const slow = vi.fn(
      () =>
        new Promise<SimulationResult>((r) => {
          resolve = r;
        })
    );
    const { ctx, onResultChange } = setup({ adapter: makeAdapterFactory(slow).create() });
    await waitFor(() => expect(slow).toHaveBeenCalledTimes(1));

    act(() => ctx.current!.clearCircuit());
    await act(async () => resolve(RESULT));
    await flush();

    expect(ctx.current!.result).toBeNull();
    expect(onResultChange).not.toHaveBeenCalled();
  });
});
