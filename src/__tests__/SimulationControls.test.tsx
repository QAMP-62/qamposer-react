import { describe, it, expect, vi, afterEach } from 'vitest';
import { useEffect } from 'react';
import { render, screen, fireEvent, act, waitFor, cleanup } from '@testing-library/react';
import { QamposerProvider } from '../context/QamposerProvider';
import { SimulationControls } from '../components/SimulationControls';
import { useQamposer } from '../hooks/useQamposer';
import type {
  BackendInfo,
  Circuit,
  QamposerContextValue,
  SimulationAdapter,
  SimulationErrorEvent,
  SimulationResult,
} from '../types';

const BELL: Circuit = {
  qubits: 2,
  gates: [
    { id: 'g1', type: 'H', qubit: 0, position: 0 },
    { id: 'g2', type: 'CNOT', control: 0, target: 1, position: 1 },
  ],
};

const RESULT: SimulationResult = { counts: { '00': 500, '11': 524 }, execution_time: 0 };

const BACKENDS: BackendInfo[] = [
  {
    id: 'fake_manila',
    name: 'Fake Manila',
    num_qubits: 5,
    backend_type: 'noisy_fake',
    description: 'noisy',
  },
];

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function makeAdapter(overrides: Partial<SimulationAdapter> = {}): SimulationAdapter {
  return {
    name: 'backend',
    simulate: vi.fn(async () => RESULT),
    isAvailable: vi.fn(async () => true),
    getBackends: vi.fn(async () => BACKENDS),
    ...overrides,
  };
}

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

// The realtime adapter is irrelevant here; keep it from touching the main adapter
const idleRealtime = makeAdapter({ isAvailable: async () => false });

afterEach(cleanup);

describe('simulate() and adapter availability', () => {
  it('waits for an availability check that is still in flight', async () => {
    const check = deferred<boolean>();
    const adapter = makeAdapter({ isAvailable: vi.fn(() => check.promise) });
    const { ctx, Probe } = captureContext();
    render(
      <QamposerProvider defaultCircuit={BELL} adapter={adapter} realtimeAdapter={idleRealtime}>
        <Probe />
      </QamposerProvider>
    );
    await waitFor(() => expect(ctx.current).not.toBeNull());
    expect(ctx.current!.adapterStatus).toBe('checking');

    let run!: Promise<SimulationResult>;
    act(() => {
      run = ctx.current!.simulate(100);
    });
    expect(adapter.simulate).not.toHaveBeenCalled();

    await act(async () => check.resolve(true));
    await expect(run).resolves.toEqual(RESULT);
    expect(adapter.simulate).toHaveBeenCalledTimes(1);
    expect(adapter.isAvailable).toHaveBeenCalledTimes(1); // the check was shared
    expect(ctx.current!.adapterStatus).toBe('available');
  });

  it('rejects and reports an error when the adapter is unavailable', async () => {
    const adapter = makeAdapter({ isAvailable: vi.fn(async () => false) });
    const onSimulationError = vi.fn<(event: SimulationErrorEvent) => void>();
    const { ctx, Probe } = captureContext();
    render(
      <QamposerProvider
        defaultCircuit={BELL}
        adapter={adapter}
        realtimeAdapter={idleRealtime}
        onSimulationError={onSimulationError}
      >
        <Probe />
      </QamposerProvider>
    );
    await waitFor(() => expect(ctx.current?.adapterStatus).toBe('unavailable'));

    await act(async () => {
      await expect(ctx.current!.simulate()).rejects.toThrow('Simulation adapter is not available');
    });

    expect(adapter.simulate).not.toHaveBeenCalled();
    expect(ctx.current!.status).toBe('error');
    expect(ctx.current!.error?.message).toBe('Simulation adapter is not available');
    expect(onSimulationError).toHaveBeenCalledWith(expect.objectContaining({ source: 'run' }));
  });

  it('re-checks an unavailable adapter, so a backend started later works', async () => {
    const isAvailable = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
    const adapter = makeAdapter({ isAvailable });
    const { ctx, Probe } = captureContext();
    render(
      <QamposerProvider defaultCircuit={BELL} adapter={adapter} realtimeAdapter={idleRealtime}>
        <Probe />
      </QamposerProvider>
    );
    await waitFor(() => expect(ctx.current?.adapterStatus).toBe('unavailable'));

    await act(async () => {
      await expect(ctx.current!.simulate()).resolves.toEqual(RESULT);
    });
    expect(ctx.current!.adapterStatus).toBe('available');
  });

  it('treats a failing availability check as unavailable', async () => {
    const adapter = makeAdapter({
      isAvailable: vi.fn(async () => {
        throw new Error('network down');
      }),
    });
    const { ctx, Probe } = captureContext();
    render(
      <QamposerProvider defaultCircuit={BELL} adapter={adapter} realtimeAdapter={idleRealtime}>
        <Probe />
      </QamposerProvider>
    );
    await waitFor(() => expect(ctx.current?.adapterStatus).toBe('unavailable'));
  });
});

describe('SimulationControls', () => {
  function renderControls(adapter: SimulationAdapter, buttonOnly = false) {
    return render(
      <QamposerProvider defaultCircuit={BELL} adapter={adapter} realtimeAdapter={idleRealtime}>
        <SimulationControls buttonOnly={buttonOnly} />
      </QamposerProvider>
    );
  }

  it('shows Connecting... until the availability check finishes', async () => {
    const check = deferred<boolean>();
    renderControls(makeAdapter({ isAvailable: () => check.promise }));

    fireEvent.click(screen.getByText('Set up and run'));
    const run = await screen.findByText('Connecting...');
    expect(run.closest('button')).toBeDisabled();

    await act(async () => check.resolve(true));
    expect(screen.getByText('Run circuit').closest('button')).toBeEnabled();
  });

  it('shows a failed run in the dialog and keeps it open', async () => {
    renderControls(
      makeAdapter({
        simulate: vi.fn(async () => {
          throw new Error('Backend returned 500');
        }),
      })
    );

    fireEvent.click(screen.getByText('Set up and run'));
    fireEvent.click(await screen.findByText('Run circuit'));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Run failed');
    expect(alert).toHaveTextContent('Backend returned 500');
    expect(screen.getByText('Set up and run your circuit')).toBeInTheDocument();
  });

  it('closes the dialog after a successful run', async () => {
    const adapter = makeAdapter();
    renderControls(adapter);

    fireEvent.click(screen.getByText('Set up and run'));
    fireEvent.click(await screen.findByText('Run circuit'));

    await waitFor(() =>
      expect(screen.queryByText('Set up and run your circuit')).not.toBeInTheDocument()
    );
    expect(adapter.simulate).toHaveBeenCalledWith(
      expect.objectContaining({ profile: { type: 'noisy_fake', backend_name: 'fake_manila' } })
    );
  });

  it('disables Run when the backend is unavailable', async () => {
    renderControls(
      makeAdapter({ isAvailable: vi.fn(async () => false), getBackends: vi.fn(async () => []) })
    );

    fireEvent.click(screen.getByText('Set up and run'));

    expect(await screen.findByText('Backend unavailable')).toBeInTheDocument();
    expect(screen.getByText('Run circuit').closest('button')).toBeDisabled();
  });

  it('offers Retry with the error as a tooltip in button-only mode', async () => {
    renderControls(makeAdapter({ isAvailable: vi.fn(async () => false) }), true);

    fireEvent.click(screen.getByText('Run'));

    const retry = await screen.findByText('Retry');
    expect(retry.closest('button')).toHaveAttribute('title', 'Simulation adapter is not available');
  });
});
