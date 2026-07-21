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
    '다음 중 하나라도 충족하면 정답으로 판정하세요:',
    '1. 사용자 답변이 이 단어의 한글 뜻을 정확히 또는 유사하게 맞췄다.',
    '2. 사용자 답변이 이 단어를 문법적으로 올바르고 의미에 맞게 사용한 영어 예문이다.',
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
