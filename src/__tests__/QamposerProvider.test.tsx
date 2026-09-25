import { describe, it, expect, vi, afterEach } from 'vitest';
import { useEffect, useState } from 'react';
import { render, screen, waitFor, act, cleanup } from '@testing-library/react';
import { QamposerProvider } from '../context/QamposerProvider';
import { QamposerMicro } from '../presets/QamposerMicro';
import { useQamposer } from '../hooks/useQamposer';
import type {
  Circuit,
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
