'use server';

import { randomUUID } from 'crypto';
import { and, eq, gte, lte, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { words, wordProgress, attempts } from '@/db/schema';
import { sampleRandom } from '@/lib/sampleRandom';
import { selectReviewPool, type ReviewPoolEntry } from '@/lib/reviewPool';
import { applyAnswer, initialProgress, type WordProgressState } from '@/lib/reviewTransition';
import { gradeAnswers, type GradingResult } from '@/lib/grading';

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

  return {
    sessionId: randomUUID(),
    words: selected.map((c) => ({ id: c.wordId, day: c.day, word: c.word, round: c.round })),
    requestedCount: count,
    availableCount: pool.length,
  };
}

export interface ReviewAnswer {
  wordId: number;
  word: string;
  userAnswer: string;
}

export interface ReviewBatchResultItem extends GradingResult {
  wordId: number;
  word: string;
  retired: boolean;
  nextRound: number;
}

export interface SubmitReviewSessionBatchResult {
  results: ReviewBatchResultItem[];
  graduated: number;
  carried: number;
  weakWords: string[];
  saveWarning: string | null;
}

export async function submitReviewSessionBatch(
  sessionId: string,
  items: ReviewAnswer[]
): Promise<SubmitReviewSessionBatchResult> {
  const graded = await gradeAnswers(items.map((item) => ({ word: item.word, userAnswer: item.userAnswer })));

  const wordIds = items.map((item) => item.wordId);
  const progressRows =
    wordIds.length > 0 ? await db.select().from(wordProgress).where(inArray(wordProgress.wordId, wordIds)) : [];
  const progressByWordId = new Map(progressRows.map((row) => [row.wordId, row]));

  const results: ReviewBatchResultItem[] = [];
  const progressUpdates: {
    wordId: number;
    round: number;
    status: 'pending' | 'correct';
    missedThisRound: boolean;
    wrongRounds: number[];
    retired: boolean;
    updatedAt: Date;
  }[] = [];
  const attemptRows: {
    sessionId: string;
    wordId: number;
    mode: 'review';
    round: number;
    userAnswer: string;
    isCorrect: boolean;
    feedback: string;
  }[] = [];
  let graduated = 0;
  let carried = 0;
  const weakWords: string[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const gradeResult = graded[i];
    const progressRow = progressByWordId.get(item.wordId);
    const currentState: WordProgressState = progressRow
      ? {
          round: progressRow.round,
          status: progressRow.status,
          missedThisRound: progressRow.missedThisRound,
          wrongRounds: progressRow.wrongRounds,
          retired: progressRow.retired,
        }
      : initialProgress();

    let nextState: WordProgressState;
    try {
      nextState = applyAnswer(currentState, gradeResult.correct);
    } catch {
      results.push({
        wordId: item.wordId,
        word: item.word,
        correct: gradeResult.correct,
        feedback: gradeResult.feedback,
        retired: currentState.retired,
        nextRound: currentState.round,
      });
      continue;
    }

    if (gradeResult.correct) {
      if (nextState.retired) {
        graduated += 1;
      } else {
        carried += 1;
      }
      if (nextState.wrongRounds.length === 3) {
        weakWords.push(item.word);
      }
    }

    progressUpdates.push({ wordId: item.wordId, ...nextState, updatedAt: new Date() });
    attemptRows.push({
      sessionId,
      wordId: item.wordId,
      mode: 'review',
      round: currentState.round,
      userAnswer: item.userAnswer,
      isCorrect: gradeResult.correct,
      feedback: gradeResult.feedback,
    });

    results.push({
      wordId: item.wordId,
      word: item.word,
      correct: gradeResult.correct,
      feedback: gradeResult.feedback,
      retired: nextState.retired,
      nextRound: nextState.round,
    });
  }

  let saveWarning: string | null = null;
  if (progressUpdates.length > 0) {
    try {
      await db.batch([
        db
          .insert(wordProgress)
          .values(progressUpdates)
          .onConflictDoUpdate({
            target: wordProgress.wordId,
            set: {
              round: sql`excluded.round`,
              status: sql`excluded.status`,
              missedThisRound: sql`excluded.missed_this_round`,
              wrongRounds: sql`excluded.wrong_rounds`,
              retired: sql`excluded.retired`,
              updatedAt: sql`excluded.updated_at`,
            },
          }),
        db.insert(attempts).values(attemptRows),
      ]);
    } catch {
      saveWarning = '결과 저장에 실패했습니다. 진행에는 문제없습니다.';
    }
  }

  return { results, graduated, carried, weakWords, saveWarning };
}
