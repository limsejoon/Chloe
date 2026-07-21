import { generateObject } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';

const batchGradingSchema = z.object({
  results: z.array(
    z.object({
      index: z.number(),
      correct: z.boolean(),
      feedback: z.string(),
    })
  ),
});

export interface GradingResult {
  correct: boolean;
  feedback: string;
}

export interface GradingItem {
  word: string;
  userAnswer: string;
}

const MODEL = process.env.CLAUDE_GRADING_MODEL ?? 'claude-sonnet-4-5';

export async function gradeAnswers(items: GradingItem[]): Promise<GradingResult[]> {
  const prompt = [
    '다음은 영단어 퀴즈의 문제와 사용자 답변 목록입니다. 각 항목에 대해 정답 여부와 이유를 판정하세요.',
    '',
    '판정 기준의 핵심은 형식이 아니라 "이 단어의 의미를 정확히 이해하고 있는가"입니다. 아래 중 어떤 방식으로 답했든, 의미를 정확히 알고 있다는 것이 드러나면 정답으로 처리하세요:',
    '1. 단어의 한글 뜻을 정확히 또는 유사하게 맞췄다 (동의어, 비슷한말 포함).',
    '2. 한글로 그 단어의 의미를 풀어서 설명했다 (직역 단어가 아니어도, 뜻을 정확히 설명하면 정답).',
    '3. 그 단어의 영어 동의어를 댔다.',
    '4. 그 단어를 문법적으로 올바르고 의미에 맞게 사용한 영어 예문을 만들었다.',
    '단, 의미가 틀렸거나 무관한 답변, 혹은 단어와 상관없이 아무 말이나 쓴 경우는 오답으로 처리하세요.',
    '',
    ...items.map((item, i) => `${i}. 영단어: "${item.word}", 사용자 답변: "${item.userAnswer}"`),
    '',
    'results 배열에 각 항목마다 index(위 번호와 정확히 동일한 값), correct(boolean), feedback(판정 이유를 한국어 한 줄로)을 모두 포함해서 반환하세요. 항목 순서는 입력 순서와 달라도 되지만, index는 반드시 정확해야 합니다.',
  ].join('\n');

  const { object } = await generateObject({
    model: anthropic(MODEL),
    schema: batchGradingSchema,
    prompt,
  });

  if (object.results.length !== items.length) {
    throw new Error(`Grading result count mismatch: expected ${items.length}, got ${object.results.length}`);
  }

  const byIndex = new Map(object.results.map((r) => [r.index, r]));

  return items.map((_, i) => {
    const r = byIndex.get(i);
    if (!r) {
      throw new Error(`Missing grading result for index ${i}`);
    }
    return { correct: r.correct, feedback: r.feedback };
  });
}
