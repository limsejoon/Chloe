import { describe, expect, it } from 'vitest';
import { selectReviewPool } from './reviewPool';

describe('selectReviewPool', () => {
  it('excludes retired words', () => {
    const entries = [
      { wordId: 1, round: 1, retired: true },
      { wordId: 2, round: 1, retired: false },
    ];
    expect(selectReviewPool(entries)).toEqual([{ wordId: 2, round: 1, retired: false }]);
  });

  it('only returns the smallest round among eligible words when rounds are mixed', () => {
    const entries = [
      { wordId: 1, round: 1, retired: false }, // untested / round 1
      { wordId: 2, round: 2, retired: false }, // carried over from a wrong answer
      { wordId: 3, round: 1, retired: false },
    ];
    const result = selectReviewPool(entries);
    expect(result.map((e) => e.wordId).sort()).toEqual([1, 3]);
  });

  it('moves on to round 2 once no round-1 words remain', () => {
    const entries = [
      { wordId: 1, round: 2, retired: false },
      { wordId: 2, round: 3, retired: false },
    ];
    expect(selectReviewPool(entries)).toEqual([{ wordId: 1, round: 2, retired: false }]);
  });

  it('returns an empty array when every word is retired', () => {
    const entries = [{ wordId: 1, round: 1, retired: true }];
    expect(selectReviewPool(entries)).toEqual([]);
  });
});
