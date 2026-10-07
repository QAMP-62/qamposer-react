import { useState, useRef, useCallback, useEffect, type RefObject } from 'react';
import { circuitToQasm } from '../utils/openqasm';
import { HardwareRequestError } from '../adapters/errors';
import type {
  Circuit,
  HardwareJob,
  HardwareJobInfo,
  HardwareJobStatus,
  ResultChangeReason,
  SimulationAdapter,
  SimulationCompleteEvent,
  SimulationErrorEvent,
  SimulationResult,
  SimulationSource,
  SimulationStartEvent,
} from '../types';

/** sessionStorage key: the job id and circuit only (no credentials) */
export const HARDWARE_JOB_STORAGE_KEY = 'qamposer:hardware-job';

/** Polling backs off from 5s to 30s; hidden tabs poll three times less often */
export const HARDWARE_POLL_INTERVALS = [5_000, 10_000, 30_000];
const HIDDEN_TAB_FACTOR = 3;

const FINAL_STATUSES: ReadonlySet<HardwareJobStatus> = new Set(['done', 'error', 'cancelled']);

export const isFinalStatus = (status: HardwareJobStatus) => FINAL_STATUSES.has(status);

interface HardwareCallbacks {
  onHardwareJobChange?: (job: HardwareJob | null) => void;
  onSimulationStart?: (event: SimulationStartEvent) => void;
  onSimulationComplete?: (event: SimulationCompleteEvent) => void;
  onSimulationError?: (event: SimulationErrorEvent) => void;
}

interface UseHardwareJobOptions {
  adapterRef: RefObject<SimulationAdapter>;
  /** Whether the current adapter offers hardware (re-renders do not restart polling) */
  hasHardware: boolean;
  circuitRef: RefObject<Circuit>;
  maxShots: number;
  callbacksRef: RefObject<HardwareCallbacks>;
  applyResult: (
    result: SimulationResult,
    source: SimulationSource,
    reason: ResultChangeReason
  ) => void;
}

function readStoredJob(): HardwareJob | null {
  try {
    const raw = window.sessionStorage.getItem(HARDWARE_JOB_STORAGE_KEY);
    if (!raw) return null;
    const job = JSON.parse(raw) as HardwareJob;
    return typeof job?.id === 'string' && job.circuit ? job : null;
  } catch {
    return null;
  }
}

function storeJob(job: HardwareJob | null) {
  try {
    if (job) window.sessionStorage.setItem(HARDWARE_JOB_STORAGE_KEY, JSON.stringify(job));
    else window.sessionStorage.removeItem(HARDWARE_JOB_STORAGE_KEY);
  } catch {
    // Storage may be unavailable (private mode, SSR); the job is then not resumable
  }
}

function getHardware(adapterRef: RefObject<SimulationAdapter>) {
  const hardware = adapterRef.current.hardware;
  if (!hardware) throw new Error('This adapter does not support real hardware');
  return hardware;
}

/**
 * Tracks one real-hardware job: submit, poll with backoff, apply the result, and resume
 * after a page reload (within the tab).
 */
export function useHardwareJob({
  adapterRef,
  hasHardware,
  circuitRef,
  maxShots,
  callbacksRef,
  applyResult,
}: UseHardwareJobOptions) {
  const [hardwareJob, setHardwareJobState] = useState<HardwareJob | null>(() =>
    typeof window === 'undefined' ? null : readStoredJob()
  );
  const jobRef = useRef(hardwareJob);

  const updateJob = useCallback(
    (job: HardwareJob | null) => {
      jobRef.current = job;
      setHardwareJobState(job);
      storeJob(job);
      callbacksRef.current.onHardwareJobChange?.(job);
    },
    [callbacksRef]
  );

  /** Merge a status update into the tracked job and react to completion */
  const handleInfo = useCallback(
    (info: HardwareJobInfo) => {
      const current = jobRef.current;
      if (!current || current.id !== info.id) return;
      const finishing = !isFinalStatus(current.status) && isFinalStatus(info.status);
      updateJob({ ...current, ...info, needsReconnect: false });
      if (!finishing) return;

      const qasm = circuitToQasm(current.circuit);
      if (info.status === 'done' && info.result) {
        // Only replace the display while the circuit is still the one that ran
        if (circuitToQasm(circuitRef.current) === qasm) {
          applyResult(info.result, 'hardware', 'simulation');
        }
        callbacksRef.current.onSimulationComplete?.({
          result: info.result,
          circuit: current.circuit,
          qasm,
          source: 'hardware',
        });
      } else if (info.status === 'error') {
        callbacksRef.current.onSimulationError?.({
          error: new Error(info.error ?? 'The job failed on the device'),
          circuit: current.circuit,
          qasm,
          source: 'hardware',
        });
      }
    },
    [updateJob, applyResult, circuitRef, callbacksRef]
  );

  const markNeedsReconnect = useCallback(() => {
    const current = jobRef.current;
    if (current && !current.needsReconnect) updateJob({ ...current, needsReconnect: true });
  }, [updateJob]);

  const pollOnce = useCallback(async () => {
    const current = jobRef.current;
    if (!current) return;
    try {
      handleInfo(await getHardware(adapterRef).getJob(current.id));
    } catch (error) {
      if (error instanceof HardwareRequestError && error.needsReconnect) {
        markNeedsReconnect();
        return;
      }
      throw error;
    }
  }, [adapterRef, handleInfo, markNeedsReconnect]);

  // Poll while the job is queued or running
  const jobId = hardwareJob?.id;
  const active = hardwareJob ? !isFinalStatus(hardwareJob.status) : false;
  const needsReconnect = hardwareJob?.needsReconnect ?? false;

  useEffect(() => {
    if (!jobId || !active || needsReconnect || !hasHardware) return;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const schedule = () => {
      const base = HARDWARE_POLL_INTERVALS[Math.min(attempt, HARDWARE_POLL_INTERVALS.length - 1)];
      const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
      timer = setTimeout(tick, hidden ? base * HIDDEN_TAB_FACTOR : base);
    };
    const tick = async () => {
      try {
        await pollOnce();
      } catch {
        // Transient failure (network, server restart): keep polling
      }
      if (cancelled) return;
      const current = jobRef.current;
      if (
        current &&
        current.id === jobId &&
        !isFinalStatus(current.status) &&
        !current.needsReconnect
      ) {
        attempt++;
        schedule();
      }
    };

    schedule();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [jobId, active, needsReconnect, hasHardware, pollOnce]);

  const submitHardwareJob = useCallback(
    async ({
      backend,
      shots = 1024,
    }: {
      backend: string;
      shots?: number;
    }): Promise<HardwareJob> => {
      const hardware = getHardware(adapterRef);
      const current = jobRef.current;
      if (current && !isFinalStatus(current.status)) {
        throw new Error('A hardware job is already queued or running');
      }
      const circuit = circuitRef.current;
      if (circuit.gates.length === 0) {
        throw new Error('Circuit has no gates');
      }
      const validShots = Math.min(Math.max(1, Math.round(shots)), maxShots);

      const info = await hardware.submit({
        qubits: circuit.qubits,
        gates: circuit.gates.map(({ id: _, ...gate }) => gate),
        shots: validShots,
        backend_name: backend,
      });
      const job: HardwareJob = {
        ...info,
        circuit,
        shots: validShots,
        submittedAt: new Date().toISOString(),
      };
      updateJob(job);
      callbacksRef.current.onSimulationStart?.({
        circuit: { ...circuit },
        qasm: circuitToQasm(circuit),
        source: 'hardware',
      });
      return job;
    },
    [adapterRef, circuitRef, maxShots, updateJob, callbacksRef]
  );

  const cancelHardwareJob = useCallback(async () => {
    const current = jobRef.current;
    if (!current || isFinalStatus(current.status)) return;
    try {
      await getHardware(adapterRef).cancel(current.id);
    } catch (error) {
      if (error instanceof HardwareRequestError && error.needsReconnect) {
        markNeedsReconnect();
      }
      throw error;
    }
    handleInfo({ id: current.id, backend: current.backend, status: 'cancelled' });
  }, [adapterRef, handleInfo, markNeedsReconnect]);

  const dismissHardwareJob = useCallback(() => {
    const current = jobRef.current;
    if (current && (isFinalStatus(current.status) || current.needsReconnect)) updateJob(null);
  }, [updateJob]);

  return {
    hardwareJob,
    submitHardwareJob,
    cancelHardwareJob,
    refreshHardwareJob: pollOnce,
    dismissHardwareJob,
  };
}
