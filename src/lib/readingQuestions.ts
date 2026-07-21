import { generateObject } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';

const questionsSchema = z.object({
  recognized: z.boolean(),
  questions: z.array(z.string()),
});

export interface ReadingQuestionsResult {
  recognized: boolean;
  questions: string[];
}

const MODEL = process.env.CLAUDE_GRADING_MODEL ?? 'claude-sonnet-4-5';

export async function generateReadingQuestions(title: string, author: string): Promise<ReadingQuestionsResult> {
  const prompt = [
    `책 제목: "${title}"`,
    `지은이: "${author}"`,
    '',
    '먼저, 이 책의 구체적인 줄거리·등장인물·사건을 정확히 알고 있는지 스스로 판단하세요.',
    '확신이 없거나 이 책을 잘 모른다면, recognized를 false로, questions를 빈 배열로 반환하세요. 추측으로 질문을 지어내지 마세요.',
    '',
    '이 책을 구체적으로 안다면, recognized를 true로 하고, 이 책의 실제 등장인물·사건·상황을 구체적으로 언급하는 성찰형 질문을 정확히 3개 만드세요.',
    '단순 사실 확인(예: "주인공 이름이 뭐야?")이 아니라, 아이가 책을 읽으며 느낀 감정, 공감, 또는 더 깊은 생각을 이끌어내는 질문이어야 합니다.',
    '예시 톤: "주인공이 ~한 상황에서 너라면 어떤 기분이었을 것 같아?", "이 책에서 가장 기억에 남는 장면과 그 이유는?", "주인공의 선택에 공감했어, 아니면 다르게 행동했을 것 같아?"',
  ].join('\n');

  const { object } = await generateObject({
    model: anthropic(MODEL),
    schema: questionsSchema,
    prompt,
  });

  return object;
}

const feedbackSchema = z.object({
  results: z.array(
    z.object({
      index: z.number(),
      feedback: z.string(),
    })
  ),
});

export interface ReadingAnswerItem {
  question: string;
  answer: string;
}

export async function gradeReadingLogAnswers(
  title: string,
  author: string,
  items: ReadingAnswerItem[]
): Promise<string[]> {
  const prompt = [
    `책 "${title}" (지은이: ${author})에 대한 독서록 질문과 아이의 답변입니다. 각 답변에 대해 피드백을 주세요.`,
    '',
    '평가 기준은 내용(질문과의 관련성, 성찰의 깊이)만 봅니다. 문법이나 맞춤법은 언급하지 마세요.',
    '질문 취지에서 벗어나거나 성의 없이 답했다면 그렇다고 솔직하게 말해주세요. 다정한 선생님 톤을 유지하되 정확하게 평가하세요.',
    '',
    ...items.map((item, i) => `${i}. 질문: "${item.question}"\n   답변: "${item.answer}"`),
    '',
    'results 배열에 각 항목마다 index(위 번호와 정확히 동일한 값)와 feedback(피드백 문장, 한국어 2~3문장)을 포함해서 반환하세요.',
  ].join('\n');

  const { object } = await generateObject({
    model: anthropic(MODEL),
    schema: feedbackSchema,
    prompt,
  });

  if (object.results.length !== items.length) {
    throw new Error(`Feedback result count mismatch: expected ${items.length}, got ${object.results.length}`);
  }

  const byIndex = new Map(object.results.map((r) => [r.index, r]));

  return items.map((_, i) => {
    const r = byIndex.get(i);
    if (!r) {
      throw new Error(`Missing feedback result for index ${i}`);
    }
    return r.feedback;
  });
}
