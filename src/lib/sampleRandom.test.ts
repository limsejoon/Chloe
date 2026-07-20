import { describe, expect, it } from 'vitest';
import { sampleRandom } from './sampleRandom';

describe('sampleRandom', () => {
  it('returns the requested count with no duplicates', () => {
    const candidates = [1, 2, 3, 4, 5];
    const result = sampleRandom(candidates, 3, () => 0.5);
    expect(result).toHaveLength(3);
    expect(new Set(result).size).toBe(3);
    for (const item of result) expect(candidates).toContain(item);
  });

  it('returns all items if count exceeds candidate length', () => {
    const candidates = ['a', 'b'];
    const result = sampleRandom(candidates, 5, () => 0.5);
    expect(result).toHaveLength(2);
    expect(new Set(result)).toEqual(new Set(candidates));
  });

  it('returns an empty array for an empty candidate list', () => {
    expect(sampleRandom([], 5)).toEqual([]);
  });
});
