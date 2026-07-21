'use server';

import { asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { wordbooks, words, wordProgress, attempts } from '@/db/schema';

export interface WordbookOption {
  id: number;
  name: string;
  maxDay: number;
}

export async function listWordbooks(): Promise<WordbookOption[]> {
  const rows = await db
    .select({ id: wordbooks.id, name: wordbooks.name, maxDay: sql<number>`max(${words.day})` })
    .from(wordbooks)
    .innerJoin(words, eq(words.wordbookId, wordbooks.id))
    .groupBy(wordbooks.id, wordbooks.name)
    .orderBy(desc(sql`${wordbooks.name} = 'HS_complete'`), asc(wordbooks.name));

  return rows.map((r) => ({ id: r.id, name: r.name, maxDay: Number(r.maxDay) }));
}

export async function resetWordbook(wordbookId: number): Promise<void> {
  const wordRows = await db.select({ id: words.id }).from(words).where(eq(words.wordbookId, wordbookId));
  const wordIds = wordRows.map((w) => w.id);
  if (wordIds.length === 0) return;

  await db.delete(wordProgress).where(inArray(wordProgress.wordId, wordIds));
  await db.delete(attempts).where(inArray(attempts.wordId, wordIds));
}
