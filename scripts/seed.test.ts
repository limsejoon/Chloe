import { describe, expect, it } from 'vitest';
import { parseWordFile } from './seed';

describe('parseWordFile', () => {
  it('parses day headers and numbered word lines', () => {
    const content = [
      '[day01]',
      '1. significant',
      '2. exhibit',
      '',
      '[day02]',
      '31. interaction',
      '32. come up with',
    ].join('\n');

    expect(parseWordFile(content)).toEqual([
      { day: 1, word: 'significant' },
      { day: 1, word: 'exhibit' },
      { day: 2, word: 'interaction' },
      { day: 2, word: 'come up with' },
    ]);
  });

  it('ignores lines before the first day header', () => {
    const content = ['1. orphan', '[day01]', '1. significant'].join('\n');
    expect(parseWordFile(content)).toEqual([{ day: 1, word: 'significant' }]);
  });
});
