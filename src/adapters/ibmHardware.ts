/**
 * Real hardware through qamposer-backend's /api/ibm endpoints (IBM Quantum).
 *
 * The user's API key is sent once, in connect(), and exchanged for a server-side session
 * held in an HttpOnly cookie. This module never stores the key; requests carry only the
 * cookie (`credentials: 'include'`). The backend must be on the same site as the page
 * (e.g. app.example.com + api.example.com) for the cookie to be sent.
 */

import { HardwareRequestError } from './errors';
import type {
  CircuitRequest,
  HardwareDevice,
  HardwareJobInfo,
  HardwareProvider,
  HardwareSession,
  HardwareUsage,
} from '../types';

interface SessionResponse {
  connected: boolean;
  instance: string | null;
  expires_at: string | null;
}

interface DeviceResponse {
  name: string;
  num_qubits: number;
  pending_jobs: number;
  operational: boolean;
}

interface UsageResponse {
  remaining_seconds: number | null;
  consumed_seconds: number | null;
  limit_reached: boolean;
}

type JobResponse = HardwareJobInfo & {
  result?: HardwareJobInfo['result'] | null;
  error?: string | null;
};

export function ibmHardware(baseUrl: string, timeout: number): HardwareProvider {
  async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/api/ibm${path}`, {
        method,
        // Send the session cookie; the API key itself is never stored client-side
        credentials: 'include',
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new HardwareRequestError(`IBM Quantum request timed out after ${timeout}ms`);
      }
      throw new HardwareRequestError('Could not reach the server');
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const detail = payload && typeof payload.detail === 'string' ? payload.detail : null;
      throw new HardwareRequestError(
        detail ?? `Request failed (${response.status})`,
        response.status
      );
    }
    return (response.status === 204 ? undefined : await response.json()) as T;
  }

  const toSession = (s: SessionResponse): HardwareSession | null =>
    s.connected && s.expires_at ? { instance: s.instance, expiresAt: s.expires_at } : null;

  const toJob = (j: JobResponse): HardwareJobInfo => ({
    id: j.id,
    backend: j.backend,
    status: j.status,
    ...(j.result
      ? {
          result: {
            counts: j.result.counts,
            execution_time: j.result.execution_time,
            ...(j.result.qsphere ? { qsphere: j.result.qsphere } : {}),
          },
        }
      : {}),
    ...(j.error ? { error: j.error } : {}),
  });

  return {
    name: 'IBM Quantum',

    async getSession() {
      return toSession(await request<SessionResponse>('/session'));
    },

    async connect({ apiKey, instance }) {
      const session = toSession(
        await request<SessionResponse>('/session', 'POST', {
          api_key: apiKey,
          ...(instance ? { instance } : {}),
        })
      );
      if (!session) throw new HardwareRequestError('Could not connect to IBM Quantum');
      return session;
    },

    async disconnect() {
      await request<void>('/session', 'DELETE');
    },

    async listDevices(minQubits) {
      const devices = await request<DeviceResponse[]>(`/backends?min_qubits=${minQubits}`);
      return devices.map(
        (d): HardwareDevice => ({
          name: d.name,
          numQubits: d.num_qubits,
          pendingJobs: d.pending_jobs,
          operational: d.operational,
        })
      );
    },

    async getUsage() {
      const usage = await request<UsageResponse>('/usage');
      return {
        remainingSeconds: usage.remaining_seconds,
        consumedSeconds: usage.consumed_seconds,
        limitReached: usage.limit_reached,
      } satisfies HardwareUsage;
    },

    async submit(job: CircuitRequest & { backend_name: string }) {
      return toJob(
        await request<JobResponse>('/jobs', 'POST', {
          qubits: job.qubits,
          gates: job.gates,
          shots: job.shots,
          backend_name: job.backend_name,
        })
      );
    },

    async getJob(id) {
      return toJob(await request<JobResponse>(`/jobs/${encodeURIComponent(id)}`));
    },

    async cancel(id) {
      await request<void>(`/jobs/${encodeURIComponent(id)}`, 'DELETE');
    },
  };
}
