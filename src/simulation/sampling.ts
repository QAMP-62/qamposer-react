/**
 * Shot sampling over a probability distribution
 *
 * Produces counts with Qiskit-style bitstring keys (fixed width, leftmost
 * character = highest-index qubit). Seedable for reproducible results, like
 * `seed_simulator` on the server.
 */

/** Seeded PRNG returning floats in [0, 1). JS has no built-in seeded RNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Multinomial sampling: draw `shots` samples from `probs` and return counts
 * keyed by fixed-width bitstrings. States with zero counts are omitted,
 * matching Qiskit's get_counts().
 */
export function sampleCounts(
  probs: ArrayLike<number>,
  numQubits: number,
  shots: number,
  seed?: number
): Record<string, number> {
  const random = seed === undefined ? Math.random : mulberry32(seed);
  const dim = probs.length;

  const cumulative = new Float64Array(dim);
  let total = 0;
  for (let i = 0; i < dim; i++) {
    total += probs[i];
    cumulative[i] = total;
  }

  const hits = new Uint32Array(dim);
  for (let s = 0; s < shots; s++) {
    const r = random() * total;
    let lo = 0;
    let hi = dim - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cumulative[mid] > r) {
        hi = mid;
      } else {
        lo = mid + 1;
      }
    }
    hits[lo]++;
  }

  const counts: Record<string, number> = {};
  for (let i = 0; i < dim; i++) {
    if (hits[i] > 0) {
      counts[i.toString(2).padStart(numQubits, '0')] = hits[i];
    }
  }
  return counts;
}
