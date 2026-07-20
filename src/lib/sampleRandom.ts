export function sampleRandom<T>(candidates: T[], count: number, rng: () => number = Math.random): T[] {
  const pool = [...candidates];
  const result: T[] = [];
  const n = Math.min(count, pool.length);

  for (let i = 0; i < n; i++) {
    const idx = Math.floor(rng() * pool.length);
    result.push(pool[idx]);
    pool.splice(idx, 1);
  }

  return result;
}
