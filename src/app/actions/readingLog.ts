'use server';

import { asc, desc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { readingLogs, readingLogQa } from '@/db/schema';
import {
  generateReadingQuestions as generateReadingQuestionsLib,
  gradeReadingLogAnswers,
  type ReadingQuestionsResult,
  type ReadingAnswerItem,
} from '@/lib/readingQuestions';

export async function generateReadingQuestions(title: string, author: string): Promise<ReadingQuestionsResult> {
  return generateReadingQuestionsLib(title, author);
}

export interface SubmitReadingLogResult {
  readingLogId: number;
  feedback: string[];
  saveWarning: string | null;
}

export async function submitReadingLog(
  title: string,
  author: string,
  items: ReadingAnswerItem[]
): Promise<SubmitReadingLogResult> {
  const feedback = await gradeReadingLogAnswers(title, author, items);

  let readingLogId = 0;
  let saveWarning: string | null = null;
  try {
    const [inserted] = await db.insert(readingLogs).values({ title, author }).returning({ id: readingLogs.id });
    readingLogId = inserted.id;

    await db.insert(readingLogQa).values(
      items.map((item, i) => ({
        readingLogId,
        questionIndex: i,
        question: item.question,
        answer: item.answer,
        feedback: feedback[i],
      }))
    );
  } catch {
    saveWarning = '결과 저장에 실패했습니다. 진행에는 문제없습니다.';
  }

  return { readingLogId, feedback, saveWarning };
}

export interface ReadingLogSummary {
  id: number;
  title: string;
  author: string;
  createdAt: string;
}

export async function listReadingLogs(): Promise<ReadingLogSummary[]> {
  const rows = await db
    .select({
      id: readingLogs.id,
      title: readingLogs.title,
      author: readingLogs.author,
      createdAt: readingLogs.createdAt,
    })
    .from(readingLogs)
    .orderBy(desc(readingLogs.createdAt));

  return rows.map((r) => ({ id: r.id, title: r.title, author: r.author, createdAt: r.createdAt.toISOString() }));
}

export interface ReadingLogDetailItem {
  question: string;
  answer: string;
  feedback: string;
}

export interface ReadingLogDetail {
  title: string;
  author: string;
  createdAt: string;
  items: ReadingLogDetailItem[];
}

export async function getReadingLogDetail(id: number): Promise<ReadingLogDetail> {
  const [log] = await db.select().from(readingLogs).where(eq(readingLogs.id, id));

  const items = await db
    .select({ question: readingLogQa.question, answer: readingLogQa.answer, feedback: readingLogQa.feedback })
    .from(readingLogQa)
    .where(eq(readingLogQa.readingLogId, id))
    .orderBy(asc(readingLogQa.questionIndex));

  return { title: log.title, author: log.author, createdAt: log.createdAt.toISOString(), items };
}
