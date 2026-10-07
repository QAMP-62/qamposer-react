import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { useEffect } from 'react';
import { render, screen, fireEvent, act, waitFor, within, cleanup } from '@testing-library/react';
import { QamposerProvider } from '../context/QamposerProvider';
import { SimulationControls } from '../components/SimulationControls';
import { useQamposer } from '../hooks/useQamposer';
import { ibmHardware } from '../adapters/ibmHardware';
import { HardwareRequestError } from '../adapters/errors';
import { HARDWARE_JOB_STORAGE_KEY, HARDWARE_POLL_INTERVALS } from '../context/useHardwareJob';
import type {
  Circuit,
  HardwareJob,
  HardwareJobInfo,
  HardwareProvider,
  QamposerContextValue,
  SimulationAdapter,
  SimulationResult,
} from '../types';

const API_KEY = 'secret-ibm-api-key-0123456789';

const BELL: Circuit = {
  qubits: 2,
  gates: [
    { id: 'g1', type: 'H', qubit: 0, position: 0 },
    { id: 'g2', type: 'CNOT', control: 0, target: 1, position: 1 },
  ],
};

const HW_RESULT: SimulationResult = {
  counts: { '00': 470, '11': 490, '01': 30, '10': 34 },
  execution_time: 2,
};

function makeHardware(overrides: Partial<HardwareProvider> = {}): HardwareProvider {
  return {
    name: 'IBM Quantum',
    getSession: vi.fn(async () => ({ instance: 'crn:x', expiresAt: '2030-01-01T12:00:00+00:00' })),
    connect: vi.fn(async () => ({ instance: 'crn:x', expiresAt: '2030-01-01T12:00:00+00:00' })),
    disconnect: vi.fn(async () => {}),
    listDevices: vi.fn(async () => [
      { name: 'ibm_short_queue', numQubits: 127, pendingJobs: 2, operational: true },
      { name: 'ibm_long_queue', numQubits: 156, pendingJobs: 40, operational: true },
    ]),
    getUsage: vi.fn(async () => ({
      remainingSeconds: 540,
      consumedSeconds: 60,
      limitReached: false,
    })),
    submit: vi.fn(
      async (): Promise<HardwareJobInfo> => ({
        id: 'job-1',
        backend: 'ibm_short_queue',
        status: 'queued',
      })
    ),
    getJob: vi.fn(
      async (): Promise<HardwareJobInfo> => ({
        id: 'job-1',
        backend: 'ibm_short_queue',
        status: 'queued',
      })
    ),
    cancel: vi.fn(async () => {}),
    ...overrides,
  };
}

function makeAdapter(hardware?: HardwareProvider): SimulationAdapter {
  return {
    name: 'backend',
    simulate: vi.fn(async () => ({ counts: { '00': 512, '11': 512 }, execution_time: 0 })),
    isAvailable: async () => true,
    getBackends: async () => [],
    ...(hardware ? { hardware } : {}),
  };
}

// Keep the realtime simulation from interfering
const idleRealtime: SimulationAdapter = { ...makeAdapter(), isAvailable: async () => false };

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

function renderProvider(
  hardware: HardwareProvider,
  extra: Partial<React.ComponentProps<typeof QamposerProvider>> = {}
) {
  const { ctx, Probe } = captureContext();
  const utils = render(
    <QamposerProvider
      defaultCircuit={BELL}
      adapter={makeAdapter(hardware)}
      realtimeAdapter={idleRealtime}
      {...extra}
    >
      <Probe />
    </QamposerProvider>
  );
  return { ctx, ...utils };
}

beforeEach(() => window.sessionStorage.clear());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

describe('ibmHardware adapter', () => {
  function mockFetch(responses: Array<{ status?: number; body?: unknown }>) {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      const next = responses.shift() ?? { status: 200, body: {} };
      const status = next.status ?? 200;
      return new Response(status === 204 ? null : JSON.stringify(next.body ?? {}), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    return calls;
  }

  it('sends the key only in the connect request, and cookies on every request', async () => {
    const calls = mockFetch([
      { body: { connected: true, instance: 'crn:x', expires_at: '2030-01-01T00:00:00+00:00' } },
      { body: [{ name: 'ibm_a', num_qubits: 127, pending_jobs: 3, operational: true }] },
      { body: { id: 'job-1', backend: 'ibm_a', status: 'queued', result: null, error: null } },
    ]);
    const hardware = ibmHardware('https://api.example.com', 5000);

    const session = await hardware.connect({ apiKey: API_KEY });
    const devices = await hardware.listDevices(2);
    const job = await hardware.submit({ qubits: 2, gates: [], shots: 100, backend_name: 'ibm_a' });

    expect(session).toEqual({ instance: 'crn:x', expiresAt: '2030-01-01T00:00:00+00:00' });
    expect(devices).toEqual([{ name: 'ibm_a', numQubits: 127, pendingJobs: 3, operational: true }]);
    expect(job).toEqual({ id: 'job-1', backend: 'ibm_a', status: 'queued' });

    expect(calls.map((c) => c.url)).toEqual([
      'https://api.example.com/api/ibm/session',
      'https://api.example.com/api/ibm/backends?min_qubits=2',
      'https://api.example.com/api/ibm/jobs',
    ]);
    expect(calls.every((c) => c.init.credentials === 'include')).toBe(true);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ api_key: API_KEY });
    expect(calls.slice(1).some((c) => JSON.stringify(c).includes(API_KEY))).toBe(false);
    // The adapter keeps no copy of the key
    expect(JSON.stringify(hardware)).not.toContain(API_KEY);
  });

  it('turns failures into HardwareRequestError with the server message', async () => {
    mockFetch([{ status: 401, body: { detail: 'Not connected to IBM Quantum' } }]);
    const error = await ibmHardware('https://api', 5000)
      .getJob('job-1')
      .catch((e) => e);
    expect(error).toBeInstanceOf(HardwareRequestError);
    expect(error.message).toBe('Not connected to IBM Quantum');
    expect(error.needsReconnect).toBe(true);
  });

  it('reports a missing session as null', async () => {
    mockFetch([{ body: { connected: false, instance: null, expires_at: null } }]);
    expect(await ibmHardware('https://api', 5000).getSession()).toBeNull();
  });
});

describe('hardware jobs in the provider', () => {
  it('submits the current circuit and tracks the job', async () => {
    const hardware = makeHardware();
    const onHardwareJobChange = vi.fn();
    const { ctx } = renderProvider(hardware, { onHardwareJobChange });
    await waitFor(() => expect(ctx.current).not.toBeNull());

    let job!: HardwareJob;
    await act(async () => {
      job = await ctx.current!.submitHardwareJob({ backend: 'ibm_short_queue', shots: 500 });
    });

    expect(hardware.submit).toHaveBeenCalledWith(
      expect.objectContaining({ qubits: 2, shots: 500, backend_name: 'ibm_short_queue' })
    );
    expect(job).toMatchObject({ id: 'job-1', status: 'queued', shots: 500, circuit: BELL });
    expect(ctx.current!.hardwareJob?.id).toBe('job-1');
    expect(onHardwareJobChange).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'job-1' }));
    // Only the job and circuit are persisted
    expect(window.sessionStorage.getItem(HARDWARE_JOB_STORAGE_KEY)).toContain('job-1');
  });

  it('polls with backoff and shows the result while the circuit is unchanged', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let status: HardwareJobInfo['status'] = 'queued';
    const hardware = makeHardware({
      getJob: vi.fn(async () =>
        status === 'done'
          ? { id: 'job-1', backend: 'ibm_short_queue', status, result: HW_RESULT }
          : { id: 'job-1', backend: 'ibm_short_queue', status }
      ),
    });
    const onSimulationComplete = vi.fn();
    const { ctx } = renderProvider(hardware, { onSimulationComplete });
    await waitFor(() => expect(ctx.current).not.toBeNull());
    await act(async () => {
      await ctx.current!.submitHardwareJob({ backend: 'ibm_short_queue' });
    });

    await act(async () => vi.advanceTimersByTime(HARDWARE_POLL_INTERVALS[0]));
    expect(hardware.getJob).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTime(HARDWARE_POLL_INTERVALS[0]));
    expect(hardware.getJob).toHaveBeenCalledTimes(1); // backed off to the second interval
    await act(async () =>
      vi.advanceTimersByTime(HARDWARE_POLL_INTERVALS[1] - HARDWARE_POLL_INTERVALS[0])
    );
    expect(hardware.getJob).toHaveBeenCalledTimes(2);

    status = 'done';
    await act(async () => vi.advanceTimersByTime(HARDWARE_POLL_INTERVALS[2]));

    expect(ctx.current!.hardwareJob?.status).toBe('done');
    expect(ctx.current!.result).toEqual(HW_RESULT);
    expect(ctx.current!.resultSource).toBe('hardware');
    expect(onSimulationComplete).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'hardware' })
    );

    // Polling stops once the job is final
    const calls = (hardware.getJob as ReturnType<typeof vi.fn>).mock.calls.length;
    await act(async () => vi.advanceTimersByTime(HARDWARE_POLL_INTERVALS[2] * 3));
    expect(hardware.getJob).toHaveBeenCalledTimes(calls);
  });

  it('does not replace the display when the circuit changed since submitting', async () => {
    const hardware = makeHardware({
      getJob: vi.fn(async () => ({
        id: 'job-1',
        backend: 'ibm_short_queue',
        status: 'done' as const,
        result: HW_RESULT,
      })),
    });
    const onSimulationComplete = vi.fn();
    const { ctx } = renderProvider(hardware, { onSimulationComplete });
    await waitFor(() => expect(ctx.current).not.toBeNull());
    await act(async () => {
      await ctx.current!.submitHardwareJob({ backend: 'ibm_short_queue' });
    });

    act(() => {
      ctx.current!.insertGate({ type: 'X', qubit: 1 }, 5);
    });
    await act(async () => ctx.current!.refreshHardwareJob());

    expect(ctx.current!.hardwareJob?.result).toEqual(HW_RESULT);
    expect(ctx.current!.resultSource).not.toBe('hardware');
    expect(onSimulationComplete).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'hardware', circuit: BELL })
    );
  });

  it('resumes a job after a page reload', async () => {
    const stored: HardwareJob = {
      id: 'job-9',
      backend: 'ibm_short_queue',
      status: 'running',
      circuit: BELL,
      shots: 100,
      submittedAt: new Date().toISOString(),
    };
    window.sessionStorage.setItem(HARDWARE_JOB_STORAGE_KEY, JSON.stringify(stored));
    const hardware = makeHardware();

    const { ctx } = renderProvider(hardware);
    await waitFor(() => expect(ctx.current?.hardwareJob?.id).toBe('job-9'));
  });

  it('stops polling and asks to reconnect when the session ended', async () => {
    const hardware = makeHardware({
      getJob: vi.fn(async () => {
        throw new HardwareRequestError('Not connected', 401);
      }),
    });
    const { ctx } = renderProvider(hardware);
    await waitFor(() => expect(ctx.current).not.toBeNull());
    await act(async () => {
      await ctx.current!.submitHardwareJob({ backend: 'ibm_short_queue' });
    });

    await act(async () => ctx.current!.refreshHardwareJob());
    expect(ctx.current!.hardwareJob?.needsReconnect).toBe(true);

    // After reconnecting, a refresh clears the flag
    (hardware.getJob as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'job-1',
      backend: 'ibm_short_queue',
      status: 'running',
    });
    await act(async () => ctx.current!.refreshHardwareJob());
    expect(ctx.current!.hardwareJob).toMatchObject({ status: 'running', needsReconnect: false });
  });

  it('allows one active job, cancels, and dismisses finished jobs', async () => {
    const hardware = makeHardware();
    const { ctx } = renderProvider(hardware);
    await waitFor(() => expect(ctx.current).not.toBeNull());
    await act(async () => {
      await ctx.current!.submitHardwareJob({ backend: 'ibm_short_queue' });
    });

    await expect(ctx.current!.submitHardwareJob({ backend: 'ibm_short_queue' })).rejects.toThrow(
      'already queued or running'
    );

    await act(async () => ctx.current!.cancelHardwareJob());
    expect(hardware.cancel).toHaveBeenCalledWith('job-1');
    expect(ctx.current!.hardwareJob?.status).toBe('cancelled');

    act(() => ctx.current!.dismissHardwareJob());
    expect(ctx.current!.hardwareJob).toBeNull();
    expect(window.sessionStorage.getItem(HARDWARE_JOB_STORAGE_KEY)).toBeNull();
  });

  it('rejects real-hardware profiles in simulate()', async () => {
    const { ctx } = renderProvider(makeHardware());
    await waitFor(() => expect(ctx.current).not.toBeNull());
    await expect(ctx.current!.simulate(100, { type: 'real' })).rejects.toThrow('submitHardwareJob');
  });

  it('rejects submissions when the adapter has no hardware', async () => {
    const { ctx, Probe } = captureContext();
    render(
      <QamposerProvider
        defaultCircuit={BELL}
        adapter={makeAdapter()}
        realtimeAdapter={idleRealtime}
      >
        <Probe />
      </QamposerProvider>
    );
    await waitFor(() => expect(ctx.current).not.toBeNull());
    await expect(ctx.current!.submitHardwareJob({ backend: 'x' })).rejects.toThrow(
      'does not support'
    );
  });
});

describe('real hardware UI', () => {
  function renderControls(hardware: HardwareProvider) {
    return render(
      <QamposerProvider
        defaultCircuit={BELL}
        adapter={makeAdapter(hardware)}
        realtimeAdapter={idleRealtime}
      >
        <SimulationControls />
      </QamposerProvider>
    );
  }

  async function openRealHardware() {
    fireEvent.click(screen.getByText('Set up and run'));
    fireEvent.click(await screen.findByText('IBM Quantum (real hardware)'));
  }

  it('connects with a key and clears it from the form, the DOM and storage', async () => {
    const hardware = makeHardware({ getSession: vi.fn(async () => null) });
    const { container } = renderControls(hardware);
    await openRealHardware();

    const input = (await screen.findByLabelText('IBM Quantum API key')) as HTMLInputElement;
    expect(input.type).toBe('password');
    expect(input.autocomplete).toBe('off');
    fireEvent.change(input, { target: { value: API_KEY } });
    fireEvent.click(screen.getByText('Connect to IBM Quantum'));

    await screen.findByText(/Connected to IBM Quantum/);
    expect(hardware.connect).toHaveBeenCalledWith({ apiKey: API_KEY, instance: undefined });
    expect(container.innerHTML).not.toContain(API_KEY);
    expect(JSON.stringify({ ...window.sessionStorage })).not.toContain(API_KEY);
    expect(JSON.stringify({ ...window.localStorage })).not.toContain(API_KEY);
  });

  it('clears the key and shows the error when connecting fails', async () => {
    const hardware = makeHardware({
      getSession: vi.fn(async () => null),
      connect: vi.fn(async () => {
        throw new HardwareRequestError(
          'Could not connect to IBM Quantum with this API key and instance.',
          401
        );
      }),
    });
    renderControls(hardware);
    await openRealHardware();

    const input = (await screen.findByLabelText('IBM Quantum API key')) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'wrong-key' } });
    fireEvent.click(screen.getByText('Connect to IBM Quantum'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not connect');
    expect((screen.getByLabelText('IBM Quantum API key') as HTMLInputElement).value).toBe('');
  });

  it('requires a device and confirmation before submitting, then tracks the job', async () => {
    const hardware = makeHardware();
    renderControls(hardware);
    await openRealHardware();

    // Shortest queue is pre-selected
    const shortQueue = await screen.findByRole('radio', { name: /ibm_short_queue/ });
    await waitFor(() => expect(shortQueue).toHaveAttribute('aria-checked', 'true'));
    const submit = screen.getByText('Submit job').closest('button')!;
    expect(submit).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox'));
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() => expect(hardware.submit).toHaveBeenCalled());
    expect(await screen.findByRole('status')).toHaveTextContent('ibm_short_queue: Queued');
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('resumes tracking after reconnecting from the job status', async () => {
    // A job whose session expired (e.g. still queued after 2 hours)
    const stored: HardwareJob = {
      id: 'job-1',
      backend: 'ibm_short_queue',
      status: 'queued',
      circuit: BELL,
      shots: 100,
      submittedAt: new Date().toISOString(),
      needsReconnect: true,
    };
    window.sessionStorage.setItem(HARDWARE_JOB_STORAGE_KEY, JSON.stringify(stored));
    const hardware = makeHardware({
      getSession: vi.fn(async () => null),
      getJob: vi.fn(async () => ({
        id: 'job-1',
        backend: 'ibm_short_queue',
        status: 'running' as const,
      })),
    });
    renderControls(hardware);

    // Polling is stopped while the session is gone
    expect(await screen.findByRole('status')).toHaveTextContent('ibm_short_queue: Queued');
    expect(hardware.getJob).not.toHaveBeenCalled();

    // Reconnect opens the dialog on the real-hardware entry
    fireEvent.click(screen.getByText('Reconnect'));
    const input = await screen.findByLabelText('IBM Quantum API key');
    fireEvent.change(input, { target: { value: API_KEY } });
    fireEvent.click(screen.getByText('Connect to IBM Quantum'));

    await waitFor(() => expect(hardware.getJob).toHaveBeenCalledWith('job-1'));
    const status = await screen.findByRole('status');
    await waitFor(() => expect(status).toHaveTextContent('ibm_short_queue: Running'));
    expect(within(status).queryByText('Reconnect')).not.toBeInTheDocument();
    expect(within(status).getByText('Cancel')).toBeInTheDocument();
  });

  it('keeps the entry disabled when the adapter has no hardware', async () => {
    render(
      <QamposerProvider
        defaultCircuit={BELL}
        adapter={makeAdapter()}
        realtimeAdapter={idleRealtime}
      >
        <SimulationControls />
      </QamposerProvider>
    );
    fireEvent.click(screen.getByText('Set up and run'));
    const entry = (await screen.findByText('Real Hardware')).closest('button')!;
    expect(entry).toBeDisabled();
  });
});
