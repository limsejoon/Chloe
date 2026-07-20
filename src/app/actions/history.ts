'use server';

import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { attempts, words, wordbooks, wordProgress } from '@/db/schema';

export interface SessionSummary {
  sessionId: string;
  mode: 'free' | 'review';
  wordbookName: string;
  dayFrom: number;
  dayTo: number;
  total: number;
  correctCount: number;
  startedAt: string;
}

export async function listSessions(): Promise<SessionSummary[]> {
  const rows = await db
    .select({
      sessionId: attempts.sessionId,
      mode: attempts.mode,
      wordbookName: wordbooks.name,
      dayFrom: sql<number>`min(${words.day})`,
      dayTo: sql<number>`max(${words.day})`,
      total: sql<number>`count(*)`,
      correctCount: sql<number>`count(*) filter (where ${attempts.isCorrect})`,
      startedAt: sql<string>`min(${attempts.createdAt})`,
    })
    .from(attempts)
    .innerJoin(words, eq(words.id, attempts.wordId))
    .innerJoin(wordbooks, eq(wordbooks.id, words.wordbookId))
    .groupBy(attempts.sessionId, attempts.mode, wordbooks.name)
    .orderBy(sql`min(${attempts.createdAt}) desc`);

  return rows.map((r) => ({
    sessionId: r.sessionId,
    mode: r.mode,
    wordbookName: r.wordbookName,
    dayFrom: Number(r.dayFrom),
    dayTo: Number(r.dayTo),
    total: Number(r.total),
    correctCount: Number(r.correctCount),
    startedAt: r.startedAt,
  }));
}

export interface SessionDetailItem {
  word: string;
  userAnswer: string;
  isCorrect: boolean;
  feedback: string;
  round: number | null;
}

export async function getSessionDetail(sessionId: string): Promise<SessionDetailItem[]> {
  return db
    .select({
      word: words.word,
      userAnswer: attempts.userAnswer,
      isCorrect: attempts.isCorrect,
      feedback: attempts.feedback,
      round: attempts.round,
    })
    .from(attempts)
    .innerJoin(words, eq(words.id, attempts.wordId))
    .where(eq(attempts.sessionId, sessionId))
    .orderBy(attempts.createdAt);
}

export interface WeakWord {
  word: string;
  day: number;
  wrongRounds: number[];
  retired: boolean;
}

export async function listWeakWords(wordbookId: number): Promise<WeakWord[]> {
  return db
    .select({
      word: words.word,
      day: words.day,
      wrongRounds: wordProgress.wrongRounds,
      retired: wordProgress.retired,
    })
    .from(wordProgress)
    .innerJoin(words, eq(words.id, wordProgress.wordId))
    .where(and(eq(words.wordbookId, wordbookId), sql`array_length(${wordProgress.wrongRounds}, 1) >= 3`));
}

export interface DayBreakdown {
  day: number;
  total: number;
  correctCount: number;
  wrongCount: number;
  pendingCount: number;
}

export async function getDayBreakdown(wordbookId: number): Promise<DayBreakdown[]> {
  const rows = await db
    .select({
      day: words.day,
      retired: wordProgress.retired,
      hasProgress: sql<boolean>`${wordProgress.wordId} is not null`,
    })
    .from(words)
    .leftJoin(wordProgress, eq(wordProgress.wordId, words.id))
    .where(eq(words.wordbookId, wordbookId));

  const byDay = new Map<number, DayBreakdown>();
  for (const row of rows) {
    const entry = byDay.get(row.day) ?? { day: row.day, total: 0, correctCount: 0, wrongCount: 0, pendingCount: 0 };
    entry.total += 1;
    if (row.retired) entry.correctCount += 1;
    else if (row.hasProgress) entry.wrongCount += 1;
    else entry.pendingCount += 1;
    byDay.set(row.day, entry);
  }

  return [...byDay.values()].sort((a, b) => a.day - b.day);
}
