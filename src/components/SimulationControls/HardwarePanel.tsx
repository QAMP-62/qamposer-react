import { useEffect, useState, type FormEvent } from 'react';
import { useQamposer } from '../../hooks/useQamposer';
import type { HardwareDevice, HardwareProvider, HardwareSession, HardwareUsage } from '../../types';

const SERVICE_ID_KEY_DOCS = 'https://cloud.ibm.com/docs/account?topic=account-serviceidapikeys';

export interface HardwarePanelProps {
  hardware: HardwareProvider;
  minQubits: number;
  selectedDevice: string | null;
  onSelectDevice: (device: string | null) => void;
  confirmed: boolean;
  onConfirmChange: (confirmed: boolean) => void;
  jobActive: boolean;
}

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const formatMinutes = (seconds: number) =>
  `${Math.floor(seconds / 60)} min ${Math.round(seconds % 60)} s`;

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Connect with an API key, then pick a device. The key lives only in this form's state
 * until it is submitted, and is cleared whether or not connecting succeeds.
 */
export function HardwarePanel({
  hardware,
  minQubits,
  selectedDevice,
  onSelectDevice,
  confirmed,
  onConfirmChange,
  jobActive,
}: HardwarePanelProps) {
  // undefined = still checking for an existing session
  const [session, setSession] = useState<HardwareSession | null | undefined>(undefined);
  const [apiKey, setApiKey] = useState('');
  const [instance, setInstance] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<HardwareDevice[] | null>(null);
  const [usage, setUsage] = useState<HardwareUsage | null>(null);

  useEffect(() => {
    let cancelled = false;
    hardware
      .getSession()
      .then((s) => !cancelled && setSession(s))
      .catch(() => !cancelled && setSession(null));
    return () => {
      cancelled = true;
    };
  }, [hardware]);

  // Once connected again, pick up a job whose tracking stopped when the old session ended
  const { hardwareJob, refreshHardwareJob } = useQamposer();
  const jobNeedsReconnect = hardwareJob?.needsReconnect ?? false;
  useEffect(() => {
    if (!session || !jobNeedsReconnect) return;
    refreshHardwareJob().catch((e) => setError(message(e)));
  }, [session, jobNeedsReconnect, refreshHardwareJob]);

  // Load devices and usage once connected
  useEffect(() => {
    if (!session) {
      setDevices(null);
      setUsage(null);
      return;
    }
    let cancelled = false;
    hardware
      .listDevices(minQubits)
      .then((list) => {
        if (cancelled) return;
        setDevices(list);
        // Pre-select the device with the shortest queue
        const operational = list.filter((d) => d.operational);
        if (operational.length > 0 && !operational.some((d) => d.name === selectedDevice)) {
          onSelectDevice(operational[0].name);
        }
      })
      .catch((e) => !cancelled && setError(message(e)));
    hardware
      .getUsage()
      .then((u) => !cancelled && setUsage(u))
      .catch(() => {
        // Usage is informational only
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when the session changes
  }, [session, hardware, minQubits]);

  const connect = async (event: FormEvent) => {
    event.preventDefault();
    const key = apiKey.trim();
    // Clear the key from state immediately; it is only passed on to connect()
    setApiKey('');
    if (!key) return;
    setBusy(true);
    setError(null);
    try {
      setSession(await hardware.connect({ apiKey: key, instance: instance.trim() || undefined }));
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    setError(null);
    try {
      await hardware.disconnect();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
      setSession(null);
      onSelectDevice(null);
      onConfirmChange(false);
    }
  };

  if (session === undefined) {
    return <div className="simulation-controls__loading">Checking connection...</div>;
  }

  if (!session) {
    return (
      <form className="simulation-controls__hardware-connect" onSubmit={connect} autoComplete="off">
        <div className="simulation-controls__field">
          <label htmlFor="hardware-api-key">{hardware.name} API key</label>
          <input
            id="hardware-api-key"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            data-1p-ignore
            data-lpignore="true"
            required
          />
        </div>
        <div className="simulation-controls__field">
          <label htmlFor="hardware-instance">Instance CRN (optional)</label>
          <input
            id="hardware-instance"
            type="text"
            value={instance}
            onChange={(e) => setInstance(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder="crn:v1:bluemix:public:quantum-computing:..."
          />
        </div>
        <p className="simulation-controls__hardware-note">
          Use an API key for a{' '}
          <a href={SERVICE_ID_KEY_DOCS} target="_blank" rel="noopener noreferrer">
            service ID
          </a>{' '}
          that can only access your Qiskit Runtime instance, not your personal key. The key is sent
          once to this app&apos;s server, kept encrypted for this session only, and never stored in
          your browser. Jobs run on your account and use your QPU time.
        </p>
        {error && (
          <p className="simulation-controls__hardware-error" role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          className="simulation-controls__btn simulation-controls__btn--secondary"
          disabled={busy}
        >
          {busy ? 'Connecting...' : `Connect to ${hardware.name}`}
        </button>
      </form>
    );
  }

  return (
    <div className="simulation-controls__hardware">
      <div className="simulation-controls__hardware-session">
        <span>
          Connected to {hardware.name} · until {formatTime(session.expiresAt)}
        </span>
        <button
          type="button"
          className="simulation-controls__link-btn"
          onClick={disconnect}
          disabled={busy}
        >
          Disconnect
        </button>
      </div>

      {usage?.remainingSeconds != null && (
        <p className="simulation-controls__hardware-note">
          QPU time left this period: {formatMinutes(usage.remainingSeconds)}
          {usage.limitReached && ' (limit reached: jobs will not run)'}
        </p>
      )}

      {error && (
        <p className="simulation-controls__hardware-error" role="alert">
          {error}
        </p>
      )}

      {devices === null ? (
        <div className="simulation-controls__loading">Loading devices...</div>
      ) : devices.length === 0 ? (
        <p className="simulation-controls__hardware-note">
          No operational device with at least {minQubits} qubits is available to this instance.
        </p>
      ) : (
        <div className="simulation-controls__backend-list" role="radiogroup" aria-label="Device">
          {devices.map((device) => (
            <button
              key={device.name}
              type="button"
              role="radio"
              aria-checked={selectedDevice === device.name}
              className={`simulation-controls__backend-item ${
                selectedDevice === device.name ? 'simulation-controls__backend-item--selected' : ''
              }`}
              onClick={() => onSelectDevice(device.name)}
            >
              <div className="simulation-controls__backend-item-content">
                <span className="simulation-controls__backend-name">{device.name}</span>
                <p className="simulation-controls__backend-desc">
                  {device.numQubits} qubits · {device.pendingJobs} jobs in queue
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {jobActive ? (
        <p className="simulation-controls__hardware-note">
          A job is already queued or running. Wait for it to finish or cancel it first.
        </p>
      ) : (
        <label className="simulation-controls__hardware-confirm">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => onConfirmChange(e.target.checked)}
          />
          <span>
            I understand this job uses QPU time from my {hardware.name} account and may wait in a
            queue before it runs.
          </span>
        </label>
      )}
    </div>
  );
}
