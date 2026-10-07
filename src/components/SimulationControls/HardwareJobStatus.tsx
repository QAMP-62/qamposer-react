import { useEffect, useState } from 'react';
import { useQamposer } from '../../hooks/useQamposer';
import { isFinalStatus } from '../../context/useHardwareJob';
import type { HardwareJobStatus as Status } from '../../types';

const LABELS: Record<Status, string> = {
  queued: 'Queued',
  running: 'Running',
  done: 'Done',
  error: 'Failed',
  cancelled: 'Cancelled',
};

function elapsed(since: string, now: number): string {
  const seconds = Math.max(0, Math.round((now - new Date(since).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export interface HardwareJobStatusProps {
  /** Called when the session ended and the user needs to reconnect */
  onReconnect?: () => void;
}

/** Compact status of the tracked hardware job, with cancel / dismiss */
export function HardwareJobStatus({ onReconnect }: HardwareJobStatusProps) {
  const { hardwareJob: job, cancelHardwareJob, dismissHardwareJob, resultSource } = useQamposer();
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const active = job ? !isFinalStatus(job.status) : false;

  // Tick the elapsed time while the job is active
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);

  if (!job) return null;

  const cancel = async () => {
    setError(null);
    try {
      await cancelHardwareJob();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const shownAsResult = job.status === 'done' && resultSource === 'hardware';

  return (
    <div
      className={`simulation-controls__job simulation-controls__job--${job.status}`}
      role="status"
      title={error ?? job.error ?? undefined}
    >
      <span className="simulation-controls__job-label">
        {job.backend}: {LABELS[job.status]}
        {active && ` · ${elapsed(job.submittedAt, now)}`}
        {job.status === 'done' && !shownAsResult && ' (circuit changed since submitting)'}
      </span>
      {job.needsReconnect ? (
        <button type="button" className="simulation-controls__link-btn" onClick={onReconnect}>
          Reconnect
        </button>
      ) : active ? (
        <button type="button" className="simulation-controls__link-btn" onClick={cancel}>
          Cancel
        </button>
      ) : (
        <button
          type="button"
          className="simulation-controls__link-btn"
          onClick={dismissHardwareJob}
          aria-label="Dismiss job"
        >
          Dismiss
        </button>
      )}
    </div>
  );
}
