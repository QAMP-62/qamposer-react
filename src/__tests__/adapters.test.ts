import { describe, it, expect } from 'vitest';
import { noopAdapter } from '../adapters/noop';

describe('noopAdapter', () => {
  it('has correct name', () => {
    expect(noopAdapter.name).toBe('Editor Only');
  });

  it('isAvailable returns false', async () => {
    const available = await noopAdapter.isAvailable();
    expect(available).toBe(false);
  });

  it('simulate throws an error', async () => {
    await expect(
      noopAdapter.simulate({
        qubits: 2,
        gates: [],
        shots: 1024,
      })
    ).rejects.toThrow('editor-only mode');
  });
});
