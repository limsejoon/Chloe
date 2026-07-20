import { describe, expect, it, vi } from 'vitest';

vi.mock('ai', () => ({
  generateObject: vi.fn().mockResolvedValue({ object: { correct: true, feedback: '정답입니다' } }),
}));

import { generateObject } from 'ai';
import { gradeAnswer } from './grading';

describe('gradeAnswer', () => {
  it('returns the graded result from generateObject', async () => {
    const result = await gradeAnswer('car', '자동차');
    expect(result).toEqual({ correct: true, feedback: '정답입니다' });
  });

  it('includes the word and answer in the prompt', async () => {
    await gradeAnswer('car', '자동차');
    const call = vi.mocked(generateObject).mock.calls[0][0];
    expect(call.prompt).toContain('car');
    expect(call.prompt).toContain('자동차');
  });
});
