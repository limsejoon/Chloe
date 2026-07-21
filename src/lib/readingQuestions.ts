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

// 제목/지은이에 한글이 하나라도 섞여 있으면 한국어(번역서)로, 로마자만 있으면 영어 원서로 판단한다.
// 대소문자/철자가 정확하지 않아도(예: 소문자, 오타) 흔들리지 않도록 Claude의 추론이 아니라
// 코드에서 직접 판별해서 프롬프트에 명령형으로 못박는다.
function detectLanguage(title: string, author: string): 'ko' | 'en' {
  const hasHangul = /[가-힣ㄱ-ㆎ]/.test(`${title} ${author}`);
  return hasHangul ? 'ko' : 'en';
}

export async function generateReadingQuestions(title: string, author: string): Promise<ReadingQuestionsResult> {
  const language = detectLanguage(title, author);
  const languageDirective =
    language === 'en'
      ? '중요: 이 책은 영어 원서입니다 (제목/지은이가 로마자로 되어 있음 — 대소문자나 철자가 정확하지 않아도 마찬가지입니다). questions 배열의 질문 3개를 반드시 100% 영어로만 작성하세요. 한국어를 절대 섞지 마세요.'
      : '중요: 이 책은 한국어로 읽는 책입니다. questions 배열의 질문 3개를 반드시 100% 한국어로만 작성하세요.';

  const prompt = [
    `책 제목: "${title}"`,
    `지은이: "${author}"`,
    '',
    '먼저, 이 책의 구체적인 줄거리·등장인물·사건을 정확히 알고 있는지 스스로 판단하세요.',
    '확신이 없거나 이 책을 잘 모른다면, recognized를 false로, questions를 빈 배열로 반환하세요. 추측으로 질문을 지어내지 마세요.',
    '',
    '이 책을 구체적으로 안다면, recognized를 true로 하고, 이 책의 실제 등장인물·사건·상황을 구체적으로 언급하는 질문을 정확히 3개 만드세요. 세 질문은 아래 구조를 정확히 따라야 합니다:',
    '',
    '- 1번, 3번 질문: 두 부분으로 구성된 복합 질문. 먼저 책의 특정 장면/사건에서 실제로 무슨 일이 있었는지 간단히 요약하게 하고, 그 다음에 그 상황에 대한 아이 자신의 생각이나 감정을 묻습니다. 단순 사실 확인이 아니라 감정·공감·더 깊은 생각까지 이끌어내되, 먼저 실제 사건 요약이 있어야만 답할 수 있는 형태여야 합니다.',
    '- 2번 질문: 감상이나 의견을 묻지 않는, 순수한 사실 확인 질문. 책의 다른 특정 장면/사건에서 실제로 무슨 일이 있었는지만 요약하게 하세요.',
    '',
    '세 질문 모두 이 책의 실제 등장인물·사건·상황을 구체적으로 지목해야 하며, 책을 제대로 읽지 않으면 답할 수 없는 수준이어야 합니다.',
    '',
    languageDirective,
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
  const language = detectLanguage(title, author);
  const languageDirective =
    language === 'en'
      ? '중요: 이 책은 영어 원서입니다. results의 feedback을 반드시 100% 영어로만 작성하세요. 한국어를 절대 섞지 마세요.'
      : '중요: 이 책은 한국어로 읽는 책입니다. results의 feedback을 반드시 100% 한국어로만 작성하세요.';

  const prompt = [
    `책 "${title}" (지은이: ${author})에 대한 독서록 질문과 아이의 답변입니다. 각 답변에 대해 피드백을 주세요.`,
    '',
    '평가 기준:',
    '1. 먼저 답변에 담긴 사실 요약(책에서 실제로 무슨 일이 있었는지)이 책 내용과 맞는지 확인하세요. 틀리게 요약했다면 정확히 어느 부분이 실제 내용과 다른지 짚어주세요.',
    '2. 질문이 감상·생각을 함께 묻는 경우(1번, 3번), 사실 요약의 정확성에 더해 질문과의 관련성과 성찰의 깊이도 평가하세요.',
    '문법이나 맞춤법은 언급하지 마세요.',
    '질문 취지에서 벗어나거나 성의 없이 답했다면, 또는 책 내용을 잘못 이해한 채 답했다면 그렇다고 솔직하게 말해주세요. 다정한 선생님 톤을 유지하되 정확하게 평가하세요.',
    '',
    ...items.map((item, i) => `${i}. 질문: "${item.question}"\n   답변: "${item.answer}"`),
    '',
    'results 배열에 각 항목마다 index(위 번호와 정확히 동일한 값)와 feedback(피드백 문장, 2~3문장)을 포함해서 반환하세요.',
    '',
    languageDirective,
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
