'use server';

import { eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { attempts, words, wordbooks } from '@/db/schema';

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
