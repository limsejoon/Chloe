'use server';

import { randomUUID } from 'crypto';
import { and, eq, gte, lte } from 'drizzle-orm';
import { db } from '@/db/client';
import { words, attempts } from '@/db/schema';
import { sampleRandom } from '@/lib/sampleRandom';
import { gradeAnswer, type GradingResult } from '@/lib/grading';

export interface FreeQuizWord {
  id: number;
  day: number;
  word: string;
}

export interface StartFreeQuizResult {
  sessionId: string;
  words: FreeQuizWord[];
  requestedCount: number;
  availableCount: number;
}

export async function startFreeQuiz(
  wordbookId: number,
  dayFrom: number,
  dayTo: number,
  count: number
): Promise<StartFreeQuizResult> {
  const candidates = await db
    .select({ id: words.id, day: words.day, word: words.word })
    .from(words)
    .where(and(eq(words.wordbookId, wordbookId), gte(words.day, dayFrom), lte(words.day, dayTo)));

  const selected = sampleRandom(candidates, count);

  return {
    sessionId: randomUUID(),
    words: selected,
    requestedCount: count,
    availableCount: candidates.length,
  };
}

export interface SubmitAnswerResult extends GradingResult {
  saveWarning: string | null;
}

export async function submitFreeAnswer(
  sessionId: string,
  wordId: number,
  word: string,
  userAnswer: string
): Promise<SubmitAnswerResult> {
  const result = await gradeAnswer(word, userAnswer);

  let saveWarning: string | null = null;
  try {
    await db.insert(attempts).values({
      sessionId,
      wordId,
      mode: 'free',
      round: null,
      userAnswer,
      isCorrect: result.correct,
      feedback: result.feedback,
    });
  } catch {
    saveWarning = '결과 저장에 실패했습니다. 진행에는 문제없습니다.';
  }

  return { ...result, saveWarning };
}
