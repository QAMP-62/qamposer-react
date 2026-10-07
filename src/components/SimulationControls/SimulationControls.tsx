import { useState, useEffect } from 'react';
import { useQamposer } from '../../hooks/useQamposer';
import { HardwarePanel } from './HardwarePanel';
import { HardwareJobStatus } from './HardwareJobStatus';
import { isFinalStatus } from '../../context/useHardwareJob';
import type { BackendInfo, SimulationProfile } from '../../types';
import './SimulationControls.scss';

// Simple icons
const PlayIcon = () => (
  <svg width="16" height="16" viewBox="0 0 32 32" fill="currentColor">
    <path d="M7 28a1 1 0 01-1-1V5a1 1 0 011.5-.87l21 11a1 1 0 010 1.74l-21 11A1 1 0 017 28z" />
  </svg>
);

const CloseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 32 32" fill="currentColor">
    <path d="M24 9.4L22.6 8 16 14.6 9.4 8 8 9.4l6.6 6.6L8 22.6 9.4 24l6.6-6.6 6.6 6.6 1.4-1.4-6.6-6.6L24 9.4z" />
  </svg>
);

const LoadingSpinner = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" className="simulation-controls__spinner">
    <circle
      cx="8"
      cy="8"
      r="6"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeDasharray="25 75"
    />
  </svg>
);

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 32 32" fill="currentColor">
    <path d="M13 24l-9-9 1.4-1.4L13 21.2 26.6 7.6 28 9z" />
  </svg>
);

export interface SimulationControlsProps {
  /** Render as button only (without dialog) */
  buttonOnly?: boolean;
  /** Custom button label */
  buttonLabel?: string;
  /** Additional CSS class */
  className?: string;
}

export function SimulationControls({
  buttonOnly = false,
  buttonLabel = 'Set up and run',
  className = '',
}: SimulationControlsProps) {
  const { simulate, status, circuit, adapter, adapterStatus, submitHardwareJob, hardwareJob } =
    useQamposer();
  const hardware = adapter.hardware;
  const isSimulating = status === 'simulating';
  const isConnecting = adapterStatus === 'checking';
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  // Message of the last failed run, shown instead of failing silently
  const [runError, setRunError] = useState<string | null>(null);
  const [shots, setShots] = useState(1024);

  // Backend selection state
  const [backends, setBackends] = useState<BackendInfo[]>([]);
  const [selectedBackendId, setSelectedBackendId] = useState<string>('');
  const [isLoadingBackends, setIsLoadingBackends] = useState(false);
  const [backendError, setBackendError] = useState(false);

  // Real hardware selection (Step 3)
  const [hardwareDevice, setHardwareDevice] = useState<string | null>(null);
  const [hardwareConfirmed, setHardwareConfirmed] = useState(false);
  // Opened from the job's Reconnect button: start on the real-hardware entry
  const [preferHardware, setPreferHardware] = useState(false);
  const hardwareJobActive = hardwareJob ? !isFinalStatus(hardwareJob.status) : false;

  // Load backends when dialog opens (ideal is excluded since it runs automatically)
  useEffect(() => {
    if (isDialogOpen && adapter.getBackends) {
      setIsLoadingBackends(true);
      setBackendError(false);
      adapter
        .getBackends()
        .then((result) => {
          // Keep only noisy_fake backends, then append static real hardware entry
          const fakeBackends = result.filter((b) => b.backend_type === 'noisy_fake');
          const realHardwareEntry: BackendInfo = {
            id: 'real_hardware',
            name: hardware ? `${hardware.name} (real hardware)` : 'Real Hardware',
            num_qubits: 0,
            backend_type: 'real',
            description: hardware
              ? 'Runs on a real quantum computer with your own account (uses your QPU time)'
              : 'Coming soon',
          };
          setBackends([...fakeBackends, realHardwareEntry]);

          // Auto-select first fake backend (or real hardware when reconnecting)
          if (preferHardware && hardware) {
            setSelectedBackendId(realHardwareEntry.id);
          } else if (fakeBackends.length > 0) {
            setSelectedBackendId(fakeBackends[0].id);
          }

          if (fakeBackends.length === 0 && adapterStatus === 'unavailable') {
            setBackendError(true);
          }
        })
        .catch(() => setBackendError(true))
        .finally(() => setIsLoadingBackends(false));
    }
  }, [isDialogOpen, adapter, adapterStatus, hardware, preferHardware]);

  const openDialog = (options: { hardware?: boolean } = {}) => {
    setRunError(null);
    setHardwareConfirmed(false);
    setPreferHardware(options.hardware ?? false);
    setIsDialogOpen(true);
  };

  /** Run and report failures in the UI (never leave the rejection unhandled) */
  const runAndReport = async (profile?: SimulationProfile): Promise<boolean> => {
    setRunError(null);
    try {
      await simulate(shots, profile);
      return true;
    } catch (err) {
      setRunError(err instanceof Error ? err.message : String(err));
      return false;
    }
  };

  const selectedBackend = backends.find((b) => b.id === selectedBackendId);
  const isRealSelected = selectedBackend?.backend_type === 'real';
  const canSubmitHardware =
    Boolean(hardwareDevice) && hardwareConfirmed && !hardwareJobActive && !isSimulating;

  const buildProfile = (): SimulationProfile | undefined => {
    if (!selectedBackend || selectedBackend.backend_type === 'noisy_fake') {
      return selectedBackend ? { type: 'noisy_fake', backend_name: selectedBackend.id } : undefined;
    }
    return undefined;
  };

  const handleRun = async () => {
    if (circuit.gates.length === 0) {
      alert('Please add gates to the circuit before running simulation');
      return;
    }

    if (isRealSelected) {
      if (!hardwareDevice) return;
      setRunError(null);
      try {
        await submitHardwareJob({ backend: hardwareDevice, shots });
        setIsDialogOpen(false);
      } catch (err) {
        setRunError(err instanceof Error ? err.message : String(err));
      }
      return;
    }

    if (await runAndReport(buildProfile())) {
      setIsDialogOpen(false);
    }
  };

  const handleQuickRun = async () => {
    if (circuit.gates.length === 0) {
      alert('Please add gates to the circuit before running simulation');
      return;
    }
    await runAndReport();
  };

  if (buttonOnly) {
    return (
      <button
        className={`simulation-controls__run-btn simulation-controls__run-btn--primary ${className}`.trim()}
        onClick={handleQuickRun}
        disabled={isSimulating}
        title={runError ?? undefined}
        aria-invalid={runError ? true : undefined}
      >
        {isSimulating ? <LoadingSpinner /> : <PlayIcon />}
        <span>{isSimulating ? 'Running...' : runError ? 'Retry' : 'Run'}</span>
      </button>
    );
  }

  return (
    <>
      <button
        className={`simulation-controls__run-btn simulation-controls__run-btn--primary ${className}`.trim()}
        onClick={() => openDialog()}
        disabled={isSimulating}
      >
        <PlayIcon />
        <span>{buttonLabel}</span>
      </button>

      {hardwareJob && <HardwareJobStatus onReconnect={() => openDialog({ hardware: true })} />}

      {isDialogOpen && (
        <div className="simulation-controls__overlay" onClick={() => setIsDialogOpen(false)}>
          <div className="simulation-controls__dialog" onClick={(e) => e.stopPropagation()}>
            <div className="simulation-controls__dialog-header">
              <h2>Set up and run your circuit</h2>
              <button
                className="simulation-controls__close-btn"
                onClick={() => setIsDialogOpen(false)}
                aria-label="Close"
              >
                <CloseIcon />
              </button>
            </div>

            <div className="simulation-controls__dialog-content">
              <div className="simulation-controls__section">
                <h3>Step 1: Configure settings</h3>
                <div className="simulation-controls__field">
                  <label htmlFor="shots-input">Shots</label>
                  <input
                    id="shots-input"
                    type="number"
                    value={shots}
                    min={1}
                    max={10000}
                    onChange={(e) => setShots(Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="simulation-controls__section">
                <h3>Step 2: Choose a backend</h3>
                {isLoadingBackends ? (
                  <div className="simulation-controls__loading">
                    <LoadingSpinner />
                    <span>Loading backends...</span>
                  </div>
                ) : backendError ? (
                  <div className="simulation-controls__error">
                    <span className="simulation-controls__error-icon">!</span>
                    <div className="simulation-controls__error-content">
                      <p className="simulation-controls__error-title">Backend unavailable</p>
                      <p className="simulation-controls__error-desc">
                        Cannot connect to the simulation backend. Please check that the server is
                        running and CORS is configured correctly.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="simulation-controls__backend-list">
                    {backends.map((backend) => {
                      const isReal = backend.backend_type === 'real';
                      return (
                        <button
                          key={backend.id}
                          type="button"
                          className={`simulation-controls__backend-item ${
                            selectedBackendId === backend.id
                              ? 'simulation-controls__backend-item--selected'
                              : ''
                          } ${isReal && !hardware ? 'simulation-controls__backend-item--disabled' : ''}`}
                          onClick={() => (!isReal || hardware) && setSelectedBackendId(backend.id)}
                          disabled={isReal && !hardware}
                        >
                          <div className="simulation-controls__backend-item-content">
                            <div className="simulation-controls__backend-item-header">
                              <span className="simulation-controls__backend-name">
                                {backend.name}
                              </span>
                              <span
                                className={`simulation-controls__backend-type simulation-controls__backend-type--${backend.backend_type}`}
                              >
                                {backend.backend_type === 'noisy_fake' ? 'Noisy' : 'Real'}
                              </span>
                            </div>
                            <p className="simulation-controls__backend-desc">
                              {backend.description || `${backend.num_qubits} qubits`}
                            </p>
                          </div>
                          {selectedBackendId === backend.id && (
                            <span className="simulation-controls__backend-check">
                              <CheckIcon />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {isRealSelected && hardware && (
                <div className="simulation-controls__section">
                  <h3>Step 3: Connect and choose a device</h3>
                  <HardwarePanel
                    hardware={hardware}
                    minQubits={circuit.qubits}
                    selectedDevice={hardwareDevice}
                    onSelectDevice={setHardwareDevice}
                    confirmed={hardwareConfirmed}
                    onConfirmChange={setHardwareConfirmed}
                    jobActive={hardwareJobActive}
                  />
                </div>
              )}

              {runError && (
                <div
                  className="simulation-controls__error simulation-controls__run-error"
                  role="alert"
                >
                  <span className="simulation-controls__error-icon">!</span>
                  <div className="simulation-controls__error-content">
                    <p className="simulation-controls__error-title">Run failed</p>
                    <p className="simulation-controls__error-desc">{runError}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="simulation-controls__dialog-footer">
              <button
                className="simulation-controls__btn simulation-controls__btn--secondary"
                onClick={() => setIsDialogOpen(false)}
                disabled={isSimulating}
              >
                Cancel
              </button>
              <button
                className="simulation-controls__btn simulation-controls__btn--primary"
                onClick={handleRun}
                disabled={
                  isSimulating ||
                  isConnecting ||
                  backendError ||
                  (isRealSelected && !canSubmitHardware)
                }
              >
                {isSimulating || isConnecting ? (
                  <>
                    <LoadingSpinner />
                    <span>{isSimulating ? 'Running...' : 'Connecting...'}</span>
                  </>
                ) : isRealSelected ? (
                  'Submit job'
                ) : (
                  'Run circuit'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
