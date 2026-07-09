import { describe, it, expect } from 'vitest';
import { localAdapter } from '../adapters/local';
import type { CircuitRequest } from '../types';

function bellRequest(overrides: Partial<CircuitRequest> = {}): CircuitRequest {
  return {
    qubits: 2,
    gates: [
      { type: 'H', qubit: 0, position: 0 },
      { type: 'CNOT', control: 0, target: 1, position: 1 },
    ],
    shots: 1024,
    ...overrides,
  };
}

describe('localAdapter', () => {
  it('has the default name and accepts an override', () => {
    expect(localAdapter().name).toBe('Browser Simulator');
    expect(localAdapter({ name: 'My Sim' }).name).toBe('My Sim');
  });

  it('isAvailable returns true', async () => {
    expect(await localAdapter().isAvailable()).toBe(true);
  });

  it('getBackends returns a single ideal entry', async () => {
    const backends = await localAdapter({ maxQubits: 10 }).getBackends!();
    expect(backends).toEqual([
      { id: 'ideal', name: 'Browser Simulator', num_qubits: 10, backend_type: 'ideal' },
    ]);
  });

  it('simulates a Bell circuit with a well-formed result', async () => {
    const result = await localAdapter().simulate(bellRequest());
    expect(Object.keys(result.counts).sort()).toEqual(['00', '11']);
    expect(Object.values(result.counts).reduce((a, b) => a + b, 0)).toBe(1024);
    expect(result.execution_time).toBeGreaterThanOrEqual(0);
    expect(result.qsphere).toHaveLength(2);
  });

  it('is deterministic when the profile carries a seed', async () => {
    const adapter = localAdapter();
    const request = bellRequest({ profile: { type: 'ideal', seed: 123 } });
    const a = await adapter.simulate(request);
    const b = await adapter.simulate(request);
    expect(a.counts).toEqual(b.counts);
  });

  it('returns all shots on |0...0> for an empty circuit', async () => {
    const result = await localAdapter().simulate(bellRequest({ gates: [], qubits: 3 }));
    expect(result.counts).toEqual({ '000': 1024 });
  });

  it('rejects noisy_fake and real profiles', async () => {
    const adapter = localAdapter();
    await expect(
      adapter.simulate(
        bellRequest({ profile: { type: 'noisy_fake', backend_name: 'fake_manila' } })
      )
    ).rejects.toThrow('only supports ideal simulation');
    await expect(adapter.simulate(bellRequest({ profile: { type: 'real' } }))).rejects.toThrow(
      'only supports ideal simulation'
    );
  });

  it('rejects circuits wider than maxQubits', async () => {
    await expect(localAdapter().simulate(bellRequest({ qubits: 13, gates: [] }))).rejects.toThrow(
      'exceeding the localAdapter limit of 12'
    );
    await expect(
      localAdapter({ maxQubits: 3 }).simulate(bellRequest({ qubits: 4, gates: [] }))
    ).rejects.toThrow('exceeding the localAdapter limit of 3');
  });

  it('rejects invalid qubit and shot counts', async () => {
    await expect(localAdapter().simulate(bellRequest({ qubits: 0 }))).rejects.toThrow(
      'Invalid qubit count'
    );
    await expect(localAdapter().simulate(bellRequest({ shots: 0 }))).rejects.toThrow(
      'Invalid shot count'
    );
  });

  it('omits qsphere above 5 qubits and includes it at 5', async () => {
    const adapter = localAdapter();
    const atFive = await adapter.simulate(bellRequest({ qubits: 5 }));
    expect(atFive.qsphere).toBeDefined();
    const atSix = await adapter.simulate(bellRequest({ qubits: 6 }));
    expect(atSix.qsphere).toBeUndefined();
  });

  it('never emits qsphere when disabled in config', async () => {
    const result = await localAdapter({ qsphere: false }).simulate(bellRequest());
    expect(result.qsphere).toBeUndefined();
  });
});
