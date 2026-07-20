'use server';

import { asc, eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { wordbooks, words } from '@/db/schema';

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
    .orderBy(asc(wordbooks.name));

  return rows.map((r) => ({ id: r.id, name: r.name, maxDay: Number(r.maxDay) }));
}
