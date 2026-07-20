import { generateObject } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';

const gradingSchema = z.object({
  correct: z.boolean(),
  feedback: z.string(),
});

export type GradingResult = z.infer<typeof gradingSchema>;

const MODEL = process.env.CLAUDE_GRADING_MODEL ?? 'claude-sonnet-4-5';

export async function gradeAnswer(word: string, userAnswer: string): Promise<GradingResult> {
  const { object } = await generateObject({
    model: anthropic(MODEL),
    schema: gradingSchema,
    prompt: [
      `영단어: "${word}"`,
      `사용자 답변: "${userAnswer}"`,
      '',
      '다음 중 하나라도 충족하면 정답으로 판정하세요:',
      '1. 사용자 답변이 이 단어의 한글 뜻을 정확히 또는 유사하게 맞췄다.',
      '2. 사용자 답변이 이 단어를 문법적으로 올바르고 의미에 맞게 사용한 영어 예문이다.',
      '',
      'correct 필드에 정답 여부(boolean)를, feedback 필드에 판정 이유를 한국어 한 줄로 설명하세요.',
    ].join('\n'),
  });

  return object;
}
