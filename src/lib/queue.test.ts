import { describe, expect, it } from 'vitest';
import { requeueWrongAnswer } from './queue';

describe('requeueWrongAnswer', () => {
  it('inserts the item 5-10 questions later when enough remain', () => {
    const queue = Array.from({ length: 20 }, (_, i) => i);
    const result = requeueWrongAnswer(queue, 0, 'X' as unknown as number, () => 0); // offset = 5 (min)
    expect(result).toHaveLength(21);
    expect(result[6]).toBe('X'); // currentIndex(0) + 1 + offset(5) = 6
  });

  it('never reinserts immediately after the current question', () => {
    const queue = Array.from({ length: 20 }, (_, i) => i);
    const result = requeueWrongAnswer(queue, 3, 'X' as unknown as number, () => 0.999);
    const insertedAt = result.indexOf('X' as unknown as number);
    expect(insertedAt).toBeGreaterThanOrEqual(3 + 1 + 5);
    expect(insertedAt).toBeLessThanOrEqual(3 + 1 + 10);
  });

  it('appends to the end when fewer than 5 questions remain', () => {
    const queue = [0, 1, 2, 3]; // currentIndex 2 -> only 1 remaining after it
    const result = requeueWrongAnswer(queue, 2, 'X' as unknown as number);
    expect(result[result.length - 1]).toBe('X');
    expect(result).toHaveLength(5);
  });
});
