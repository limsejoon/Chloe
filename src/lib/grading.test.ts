import { describe, expect, it, vi } from 'vitest';

vi.mock('ai', () => ({
  generateObject: vi.fn(),
}));

import { generateObject } from 'ai';
import { gradeAnswers } from './grading';

describe('gradeAnswers', () => {
  it('maps results back to items by index, regardless of response order', async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        results: [
          { index: 1, correct: false, feedback: '오답입니다' },
          { index: 0, correct: true, feedback: '정답입니다' },
        ],
      },
    } as never);

    const result = await gradeAnswers([
      { word: 'car', userAnswer: '자동차' },
      { word: 'dog', userAnswer: '고양이' },
    ]);

    expect(result).toEqual([
      { correct: true, feedback: '정답입니다' },
      { correct: false, feedback: '오답입니다' },
    ]);
  });

  it('includes every word and answer in the prompt', async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: { results: [{ index: 0, correct: true, feedback: 'ok' }] },
    } as never);

    await gradeAnswers([{ word: 'car', userAnswer: '자동차' }]);

    const call = vi.mocked(generateObject).mock.calls[0][0];
    expect(call.prompt).toContain('car');
    expect(call.prompt).toContain('자동차');
  });

  it('throws when the result count does not match the input count', async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: { results: [{ index: 0, correct: true, feedback: 'ok' }] },
    } as never);

    await expect(
      gradeAnswers([
        { word: 'car', userAnswer: '자동차' },
        { word: 'dog', userAnswer: '개' },
      ])
    ).rejects.toThrow('count mismatch');
  });

  it('throws when a result is missing for a given index', async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        results: [
          { index: 0, correct: true, feedback: 'ok' },
          { index: 0, correct: true, feedback: 'dup' },
        ],
      },
    } as never);

    await expect(
      gradeAnswers([
        { word: 'car', userAnswer: '자동차' },
        { word: 'dog', userAnswer: '개' },
      ])
    ).rejects.toThrow('Missing grading result for index 1');
  });
});
