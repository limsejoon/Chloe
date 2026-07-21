import { pgTable, serial, integer, text, boolean, timestamp, uuid, unique } from 'drizzle-orm/pg-core';

export const wordbooks = pgTable('wordbooks', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
});

export const words = pgTable(
  'words',
  {
    id: serial('id').primaryKey(),
    wordbookId: integer('wordbook_id')
      .notNull()
      .references(() => wordbooks.id),
    day: integer('day').notNull(),
    word: text('word').notNull(),
  },
  (table) => ({
    uniqueDayWord: unique().on(table.wordbookId, table.day, table.word),
  })
);

export const wordProgress = pgTable('word_progress', {
  wordId: integer('word_id')
    .primaryKey()
    .references(() => words.id),
  round: integer('round').notNull().default(1),
  status: text('status', { enum: ['pending', 'correct'] }).notNull().default('pending'),
  missedThisRound: boolean('missed_this_round').notNull().default(false),
  wrongRounds: integer('wrong_rounds').array().notNull().default([]),
  retired: boolean('retired').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const attempts = pgTable('attempts', {
  id: serial('id').primaryKey(),
  sessionId: uuid('session_id').notNull(),
  wordId: integer('word_id')
    .notNull()
    .references(() => words.id),
  mode: text('mode', { enum: ['free', 'review'] }).notNull(),
  round: integer('round'),
  userAnswer: text('user_answer').notNull(),
  isCorrect: boolean('is_correct').notNull(),
  feedback: text('feedback').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const readingLogs = pgTable('reading_logs', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  author: text('author').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const readingLogQa = pgTable('reading_log_qa', {
  id: serial('id').primaryKey(),
  readingLogId: integer('reading_log_id')
    .notNull()
    .references(() => readingLogs.id),
  questionIndex: integer('question_index').notNull(),
  question: text('question').notNull(),
  answer: text('answer').notNull(),
  feedback: text('feedback').notNull(),
});
