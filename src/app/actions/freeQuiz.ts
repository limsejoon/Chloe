'use server';

import { randomUUID } from 'crypto';
import { and, eq, gte, lte } from 'drizzle-orm';
import { db } from '@/db/client';
import { words, attempts } from '@/db/schema';
import { sampleRandom } from '@/lib/sampleRandom';
import { gradeAnswers, type GradingResult } from '@/lib/grading';

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

export interface FreeQuizAnswer {
  wordId: number;
  word: string;
  userAnswer: string;
}

export interface FreeQuizBatchResultItem extends GradingResult {
  wordId: number;
  word: string;
}

export interface SubmitFreeQuizBatchResult {
  results: FreeQuizBatchResultItem[];
  saveWarning: string | null;
}

export async function submitFreeQuizBatch(
  sessionId: string,
  items: FreeQuizAnswer[]
): Promise<SubmitFreeQuizBatchResult> {
  const graded = await gradeAnswers(items.map((item) => ({ word: item.word, userAnswer: item.userAnswer })));

  const results: FreeQuizBatchResultItem[] = items.map((item, i) => ({
    wordId: item.wordId,
    word: item.word,
    correct: graded[i].correct,
    feedback: graded[i].feedback,
  }));

  let saveWarning: string | null = null;
  try {
    await db.insert(attempts).values(
      items.map((item, i) => ({
        sessionId,
        wordId: item.wordId,
        mode: 'free' as const,
        round: null,
        userAnswer: item.userAnswer,
        isCorrect: graded[i].correct,
        feedback: graded[i].feedback,
      }))
    );
  } catch {
    saveWarning = '결과 저장에 실패했습니다. 진행에는 문제없습니다.';
  }

  return { results, saveWarning };
}
