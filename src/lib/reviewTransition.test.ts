import { describe, expect, it } from 'vitest';
import { applyAnswer, initialProgress, isWeakWord, type WordProgressState } from './reviewTransition';

describe('applyAnswer', () => {
  it('retires a word answered correctly on the first try', () => {
    const next = applyAnswer(initialProgress(), true);
    expect(next).toEqual({
      round: 1,
      status: 'correct',
      missedThisRound: false,
      wrongRounds: [],
      retired: true,
    });
  });

  it('keeps a word pending and flags it missed on a wrong answer', () => {
    const next = applyAnswer(initialProgress(), false);
    expect(next).toEqual({
      round: 1,
      status: 'pending',
      missedThisRound: true,
      wrongRounds: [],
      retired: false,
    });
  });

  it('advances to the next round when corrected after a miss', () => {
    const missed = applyAnswer(initialProgress(), false);
    const next = applyAnswer(missed, true);
    expect(next).toEqual({
      round: 2,
      status: 'pending',
      missedThisRound: false,
      wrongRounds: [1],
      retired: false,
    });
  });

  it('throws if a retired word is answered again', () => {
    const retired = applyAnswer(initialProgress(), true);
    expect(() => applyAnswer(retired, true)).toThrow();
  });
});

describe('isWeakWord', () => {
  it('is false below 3 wrong rounds', () => {
    const state: WordProgressState = { round: 3, status: 'pending', missedThisRound: false, wrongRounds: [1, 2], retired: false };
    expect(isWeakWord(state)).toBe(false);
  });

  it('is true once wrong in 3 or more rounds', () => {
    const state: WordProgressState = { round: 4, status: 'pending', missedThisRound: false, wrongRounds: [1, 2, 3], retired: false };
    expect(isWeakWord(state)).toBe(true);
  });
});
