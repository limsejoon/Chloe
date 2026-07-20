'use server';

import { randomUUID } from 'crypto';
import { and, eq, gte, lte } from 'drizzle-orm';
import { db } from '@/db/client';
import { words, wordProgress, attempts } from '@/db/schema';
import { sampleRandom } from '@/lib/sampleRandom';
import { selectReviewPool, type ReviewPoolEntry } from '@/lib/reviewPool';
import { applyAnswer, initialProgress, isWeakWord, type WordProgressState } from '@/lib/reviewTransition';
import { gradeAnswer, type GradingResult } from '@/lib/grading';

interface ReviewCandidate extends ReviewPoolEntry {
  day: number;
  word: string;
  hasProgress: boolean;
}

async function loadReviewCandidates(wordbookId: number, dayFrom: number, dayTo: number): Promise<ReviewCandidate[]> {
  const rows = await db
    .select({
      wordId: words.id,
      day: words.day,
      word: words.word,
      round: wordProgress.round,
      retired: wordProgress.retired,
    })
    .from(words)
    .leftJoin(wordProgress, eq(wordProgress.wordId, words.id))
    .where(and(eq(words.wordbookId, wordbookId), gte(words.day, dayFrom), lte(words.day, dayTo)));

  return rows.map((r) => ({
    wordId: r.wordId,
    day: r.day,
    word: r.word,
    round: r.round ?? 1,
    retired: r.retired ?? false,
    hasProgress: r.round !== null,
  }));
}

export interface ReviewStatus {
  total: number;
  correctCount: number;
  wrongCount: number;
  pendingCount: number;
}

export async function getReviewStatus(wordbookId: number, dayFrom: number, dayTo: number): Promise<ReviewStatus> {
  const candidates = await loadReviewCandidates(wordbookId, dayFrom, dayTo);
  return {
    total: candidates.length,
    correctCount: candidates.filter((c) => c.retired).length,
    wrongCount: candidates.filter((c) => c.hasProgress && !c.retired).length,
    pendingCount: candidates.filter((c) => !c.hasProgress).length,
  };
}

export interface ReviewWord {
  id: number;
  day: number;
  word: string;
  round: number;
}

export interface StartReviewSessionResult {
  sessionId: string;
  words: ReviewWord[];
  requestedCount: number;
  availableCount: number;
}

export async function startReviewSession(
  wordbookId: number,
  dayFrom: number,
  dayTo: number,
  count: number
): Promise<StartReviewSessionResult> {
  const candidates = await loadReviewCandidates(wordbookId, dayFrom, dayTo);
  const pool = selectReviewPool(candidates);
  const selected = sampleRandom(pool, count);

  if (selected.length > 0) {
    await db
      .insert(wordProgress)
      .values(selected.map((c) => ({ wordId: c.wordId })))
      .onConflictDoNothing({ target: wordProgress.wordId });
  }

  return {
    sessionId: randomUUID(),
    words: selected.map((c) => ({ id: c.wordId, day: c.day, word: c.word, round: c.round })),
    requestedCount: count,
    availableCount: pool.length,
  };
}

export interface ReviewAnswerResult extends GradingResult {
  retired: boolean;
  nextRound: number;
  isWeak: boolean;
  justBecameWeak: boolean;
  saveWarning: string | null;
}

export async function submitReviewAnswer(
  sessionId: string,
  wordId: number,
  word: string,
  userAnswer: string
): Promise<ReviewAnswerResult> {
  const result = await gradeAnswer(word, userAnswer);

  const [progressRow] = await db.select().from(wordProgress).where(eq(wordProgress.wordId, wordId));
  const currentState: WordProgressState = progressRow
    ? {
        round: progressRow.round,
        status: progressRow.status,
        missedThisRound: progressRow.missedThisRound,
        wrongRounds: progressRow.wrongRounds,
        retired: progressRow.retired,
      }
    : initialProgress();

  const nextState = applyAnswer(currentState, result.correct);

  let saveWarning: string | null = null;
  try {
    await db
      .insert(wordProgress)
      .values({ wordId, ...nextState, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: wordProgress.wordId,
        set: {
          round: nextState.round,
          status: nextState.status,
          missedThisRound: nextState.missedThisRound,
          wrongRounds: nextState.wrongRounds,
          retired: nextState.retired,
          updatedAt: new Date(),
        },
      });

    await db.insert(attempts).values({
      sessionId,
      wordId,
      mode: 'review',
      round: currentState.round,
      userAnswer,
      isCorrect: result.correct,
      feedback: result.feedback,
    });
  } catch {
    saveWarning = '결과 저장에 실패했습니다. 진행에는 문제없습니다.';
  }

  return {
    ...result,
    retired: nextState.retired,
    nextRound: nextState.round,
    isWeak: isWeakWord(nextState),
    justBecameWeak: nextState.wrongRounds.length === 3,
    saveWarning,
  };
}
