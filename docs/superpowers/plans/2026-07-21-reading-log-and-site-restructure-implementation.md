# 사이트 3-파트 재편 + 독서록 기능 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 홈 화면을 "단어 테스트 / 독서록 / 영어독해(준비중)" 3-파트로 재편하고, 독서록 기능(Claude 질문 생성 → 답변 → 내용 중심 피드백 → DB 저장 → 기록 조회)을 새로 만든다. 레이아웃은 아이패드 화면에 맞게 조정한다.

**Architecture:** 신규 테이블 `reading_logs`/`reading_log_qa`. Claude 호출 로직은 `src/lib/readingQuestions.ts`(질문 생성 + 배치 피드백, DB 없음)에 두고, `src/app/actions/readingLog.ts`(Server Actions, DB 접근)가 이를 감싼다. UI는 `/reading`(작성) + `/reading/history`, `/reading/history/[id]`(기록)로 구성. 기존 단어 테스트(`/review`, `/history`)는 로직 변경 없이 홈 화면 진입 동선만 바뀐다.

**Tech Stack:** Next.js Server Actions, Vercel AI SDK(`generateObject` + zod), `@ai-sdk/anthropic`, Drizzle ORM(`neon-http`), React 클라이언트 컴포넌트, Tailwind v4.

## Global Constraints

- 신규 테이블은 기존 `wordbooks`/`words`/`word_progress`/`attempts`와 관계없이 완전히 분리한다 (원본 스펙 §4).
- 질문 생성 시 Claude가 그 책을 구체적으로 모른다고 판단하면 `recognized: false`, `questions: []`를 반환해야 한다 — 추측으로 질문을 지어내지 않는다. 이것이 이번 기능의 핵심 요구사항이다 (스펙 §5.1).
- 피드백은 3개 답변을 **한 번의 API 호출**로 배치 처리한다 (단어 테스트 배치 채점과 동일 원칙, 스펙 §5.2).
- 피드백은 내용(질문과의 관련성·깊이)만 평가한다 — 문법/맞춤법은 언급하지 않는다 (스펙 §5.2).
- `neon-http` Drizzle 드라이버는 `db.transaction()`을 지원하지 않는다 — 여러 statement의 원자성이 필요하면 `db.batch([...])`를 쓰거나(Task 12 패턴), 순차 insert 후 실패 시 경고만 표시하는 기존 원칙을 따른다 (스펙 §4, §9).
- 채점(피드백 생성) 실패 시 아무것도 DB에 쓰지 않는다. DB 저장 실패 시에는 이미 계산된 결과를 그대로 보여주고 작은 경고만 표시한다 (스펙 §9).
- 모든 신규 UI는 `DESIGN.md`에 정의된 기존 토큰/클래스(`bg-surface`, `text-primary`, `text-error`, `shadow-card`, `rounded-[20px]`, pill 배지 등)를 그대로 사용한다. 원시 Tailwind 색상 클래스를 새로 도입하지 않는다.
- 아이패드 대응: 기존 좁은 모바일 폭(`max-w-sm`/`max-w-md`)에 `md:` 브레이크포인트로 한 단계 넓은 폭을 추가한다. 답변 텍스트박스는 `min-h-32` 이상으로 세로 여유를 준다 (스펙 §8).
- 신규 서버 액션은 기존 프로젝트 관례대로 자동 유닛 테스트 없이 라이브 API/DB로 검증한다 (스펙 §10).

---

## Task 1: DB 스키마 (`reading_logs` / `reading_log_qa`) + 마이그레이션

**Files:**
- Modify: `src/db/schema.ts`
- Create: `drizzle/0001_*.sql` (자동 생성됨)

**Interfaces:**
- Produces: `readingLogs`, `readingLogQa` 테이블 객체 — Task 3(서버 액션)에서 사용.

- [ ] **Step 1: 스키마에 테이블 추가**

`src/db/schema.ts` 파일 끝에 추가:

```ts
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
```

(파일 상단의 `import { pgTable, serial, integer, text, boolean, timestamp, uuid, unique } from 'drizzle-orm/pg-core';`는 이미 필요한 것을 다 포함하고 있으므로 변경 불필요.)

- [ ] **Step 2: 마이그레이션 생성 + 적용**

```bash
npm run db:generate
npm run db:migrate
```

Expected: `drizzle/` 폴더에 새 SQL 마이그레이션 파일이 생기고, `db:migrate`가 실 Neon DB에 성공적으로 적용됐다고 보고한다.

- [ ] **Step 3: 테이블 생성 확인**

```bash
npx tsx -e "import('./src/db/client').then(async ({ db }) => { const r = await db.execute(\"select table_name from information_schema.tables where table_schema=current_schema()\"); console.log(r.rows); })"
```

Expected: 출력에 `reading_logs`, `reading_log_qa`가 포함됨.

- [ ] **Step 4: 커밋**

```bash
git add src/db/schema.ts drizzle
git commit -m "feat: add reading_logs and reading_log_qa tables"
```

---

## Task 2: 독서록 Claude 연동 (질문 생성 + 배치 피드백)

**Files:**
- Create: `src/lib/readingQuestions.ts`

**Interfaces:**
- Consumes: `generateObject`(`ai`), `anthropic`(`@ai-sdk/anthropic`), `z`(`zod`).
- Produces: `ReadingQuestionsResult`(`{ recognized: boolean; questions: string[] }`), `generateReadingQuestions(title: string, author: string): Promise<ReadingQuestionsResult>`, `ReadingAnswerItem`(`{ question: string; answer: string }`), `gradeReadingLogAnswers(title: string, author: string, items: ReadingAnswerItem[]): Promise<string[]>` — Task 3(서버 액션)에서 사용.

- [ ] **Step 1: 파일 작성**

`src/lib/readingQuestions.ts`:

```ts
import { generateObject } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';

const questionsSchema = z.object({
  recognized: z.boolean(),
  questions: z.array(z.string()),
});

export interface ReadingQuestionsResult {
  recognized: boolean;
  questions: string[];
}

const MODEL = process.env.CLAUDE_GRADING_MODEL ?? 'claude-sonnet-4-5';

export async function generateReadingQuestions(title: string, author: string): Promise<ReadingQuestionsResult> {
  const prompt = [
    `책 제목: "${title}"`,
    `지은이: "${author}"`,
    '',
    '먼저, 이 책의 구체적인 줄거리·등장인물·사건을 정확히 알고 있는지 스스로 판단하세요.',
    '확신이 없거나 이 책을 잘 모른다면, recognized를 false로, questions를 빈 배열로 반환하세요. 추측으로 질문을 지어내지 마세요.',
    '',
    '이 책을 구체적으로 안다면, recognized를 true로 하고, 이 책의 실제 등장인물·사건·상황을 구체적으로 언급하는 성찰형 질문을 정확히 3개 만드세요.',
    '단순 사실 확인(예: "주인공 이름이 뭐야?")이 아니라, 아이가 책을 읽으며 느낀 감정, 공감, 또는 더 깊은 생각을 이끌어내는 질문이어야 합니다.',
    '예시 톤: "주인공이 ~한 상황에서 너라면 어떤 기분이었을 것 같아?", "이 책에서 가장 기억에 남는 장면과 그 이유는?", "주인공의 선택에 공감했어, 아니면 다르게 행동했을 것 같아?"',
  ].join('\n');

  const { object } = await generateObject({
    model: anthropic(MODEL),
    schema: questionsSchema,
    prompt,
  });

  return object;
}

const feedbackSchema = z.object({
  results: z.array(
    z.object({
      index: z.number(),
      feedback: z.string(),
    })
  ),
});

export interface ReadingAnswerItem {
  question: string;
  answer: string;
}

export async function gradeReadingLogAnswers(
  title: string,
  author: string,
  items: ReadingAnswerItem[]
): Promise<string[]> {
  const prompt = [
    `책 "${title}" (지은이: ${author})에 대한 독서록 질문과 아이의 답변입니다. 각 답변에 대해 피드백을 주세요.`,
    '',
    '평가 기준은 내용(질문과의 관련성, 성찰의 깊이)만 봅니다. 문법이나 맞춤법은 언급하지 마세요.',
    '질문 취지에서 벗어나거나 성의 없이 답했다면 그렇다고 솔직하게 말해주세요. 다정한 선생님 톤을 유지하되 정확하게 평가하세요.',
    '',
    ...items.map((item, i) => `${i}. 질문: "${item.question}"\n   답변: "${item.answer}"`),
    '',
    'results 배열에 각 항목마다 index(위 번호와 정확히 동일한 값)와 feedback(피드백 문장, 한국어 2~3문장)을 포함해서 반환하세요.',
  ].join('\n');

  const { object } = await generateObject({
    model: anthropic(MODEL),
    schema: feedbackSchema,
    prompt,
  });

  if (object.results.length !== items.length) {
    throw new Error(`Feedback result count mismatch: expected ${items.length}, got ${object.results.length}`);
  }

  const byIndex = new Map(object.results.map((r) => [r.index, r]));

  return items.map((_, i) => {
    const r = byIndex.get(i);
    if (!r) {
      throw new Error(`Missing feedback result for index ${i}`);
    }
    return r.feedback;
  });
}
```

- [ ] **Step 2: 타입 체크**

```bash
npx tsc --noEmit
```

Expected: 에러 없음.

- [ ] **Step 3: 라이브로 "인식되는 책" 경로 확인**

`scripts/_tmp_reading_questions_check.ts` 생성:

```ts
import { config } from 'dotenv';
config({ path: '.env.local' });
import { generateReadingQuestions } from '../src/lib/readingQuestions';

async function main() {
  const result = await generateReadingQuestions('어린 왕자', '앙투안 드 생텍쥐페리');
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error('ERR', e);
  process.exit(1);
});
```

```bash
npx tsx scripts/_tmp_reading_questions_check.ts
```

Expected: `recognized: true`, `questions` 배열에 3개, 각 질문이 "어린 왕자"의 실제 내용(장미, 여우, 소행성 등)을 구체적으로 언급함.

- [ ] **Step 4: 라이브로 "모르는 책" 경로 확인**

같은 스크립트에서 책 제목을 존재하지 않는 것으로 바꿔서 재실행 (예: `generateReadingQuestions('완전히 지어낸 가짜 책 제목 12345', '없는 저자')`).

Expected: `recognized: false`, `questions: []`.

확인 후 스크립트 삭제:

```bash
rm scripts/_tmp_reading_questions_check.ts
```

- [ ] **Step 5: 라이브로 배치 피드백 확인**

`scripts/_tmp_reading_feedback_check.ts` 생성:

```ts
import { config } from 'dotenv';
config({ path: '.env.local' });
import { gradeReadingLogAnswers } from '../src/lib/readingQuestions';

async function main() {
  const result = await gradeReadingLogAnswers('어린 왕자', '앙투안 드 생텍쥐페리', [
    { question: '장미와의 관계에서 어린 왕자가 느꼈을 감정은 어땠을까?', answer: '장미를 사랑하면서도 답답해했을 것 같아요. 장미가 까다롭게 굴어서 힘들었지만, 그래도 소중하게 생각했을 것 같아요.' },
    { question: '여우와의 만남에서 배운 것은 무엇일까?', answer: '몰라요' },
  ]);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error('ERR', e);
  process.exit(1);
});
```

```bash
npx tsx scripts/_tmp_reading_feedback_check.ts
```

Expected: 배열 2개 항목. 첫 번째는 성찰이 담긴 답변에 대한 긍정적/구체적 피드백, 두 번째("몰라요")는 질문에 제대로 답하지 않았다는 점을 솔직하게 지적하는 피드백.

확인 후 스크립트 삭제:

```bash
rm scripts/_tmp_reading_feedback_check.ts
```

- [ ] **Step 6: 커밋**

```bash
git add src/lib/readingQuestions.ts
git commit -m "feat: add Claude-backed reading question generation and batch feedback"
```

---

## Task 3: 독서록 서버 액션

**Files:**
- Create: `src/app/actions/readingLog.ts`

**Interfaces:**
- Consumes: `generateReadingQuestions`, `gradeReadingLogAnswers`, `ReadingQuestionsResult`, `ReadingAnswerItem`(Task 2); `db`, `readingLogs`, `readingLogQa`(Task 1).
- Produces: `generateReadingQuestions`(재노출), `SubmitReadingLogResult`, `submitReadingLog(title, author, items: ReadingAnswerItem[]): Promise<SubmitReadingLogResult>`, `ReadingLogSummary`, `listReadingLogs(): Promise<ReadingLogSummary[]>`, `ReadingLogDetailItem`, `ReadingLogDetail`, `getReadingLogDetail(id): Promise<ReadingLogDetail>` — Task 4·5(UI)에서 사용.

- [ ] **Step 1: 파일 작성**

`src/app/actions/readingLog.ts`:

```ts
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
```

- [ ] **Step 2: 타입 체크**

```bash
npx tsc --noEmit
```

Expected: 에러 없음.

- [ ] **Step 3: 라이브로 전체 흐름 확인 (질문 생성 → 제출 → 목록 → 상세)**

`scripts/_tmp_reading_action_check.ts` 생성:

```ts
import { config } from 'dotenv';
config({ path: '.env.local' });
import { db } from '../src/db/client';
import { readingLogs, readingLogQa } from '../src/db/schema';
import { eq } from 'drizzle-orm';
import {
  generateReadingQuestions,
  submitReadingLog,
  listReadingLogs,
  getReadingLogDetail,
} from '../src/app/actions/readingLog';

async function main() {
  const questions = await generateReadingQuestions('어린 왕자', '앙투안 드 생텍쥐페리');
  console.log('questions:', questions);

  const submitted = await submitReadingLog(
    '어린 왕자',
    '앙투안 드 생텍쥐페리',
    questions.questions.map((q) => ({ question: q, answer: '테스트 답변입니다. 이 부분에 대해 조금 더 생각해봤어요.' }))
  );
  console.log('submitted:', submitted);

  const list = await listReadingLogs();
  console.log('list (first 3):', list.slice(0, 3));

  const detail = await getReadingLogDetail(submitted.readingLogId);
  console.log('detail:', JSON.stringify(detail, null, 2));

  // cleanup
  await db.delete(readingLogQa).where(eq(readingLogQa.readingLogId, submitted.readingLogId));
  await db.delete(readingLogs).where(eq(readingLogs.id, submitted.readingLogId));
  console.log('cleaned up test reading log', submitted.readingLogId);
}

main().catch((e) => {
  console.error('ERR', e);
  process.exit(1);
});
```

```bash
npx tsx scripts/_tmp_reading_action_check.ts
```

Expected: `questions.recognized === true`, `submitted.feedback`에 3개 피드백, `submitted.saveWarning === null`, `list`에 방금 만든 항목이 최상단(가장 최근), `detail.items`에 질문/답변/피드백 3개가 순서대로. 확인 후:

```bash
rm scripts/_tmp_reading_action_check.ts
```

- [ ] **Step 4: 커밋**

```bash
git add src/app/actions/readingLog.ts
git commit -m "feat: add reading-log server actions (generate/submit/list/detail)"
```

---

## Task 4: 독서록 작성 UI

**Files:**
- Create: `src/app/reading/page.tsx`
- Create: `src/app/reading/ReadingLogFlow.tsx`

**Interfaces:**
- Consumes: `generateReadingQuestions`, `submitReadingLog`(Task 3) — answer items are passed as plain `{ question, answer }` object literals, matched structurally against `ReadingAnswerItem`.

- [ ] **Step 1: 페이지**

`src/app/reading/page.tsx`:

```tsx
import { ReadingLogFlow } from './ReadingLogFlow';

export default function ReadingLogPage() {
  return (
    <main className="mx-auto min-h-screen max-w-xl p-8 md:max-w-2xl">
      <h1 className="mb-5 text-2xl font-extrabold tracking-tight text-text">독서록</h1>
      <ReadingLogFlow />
    </main>
  );
}
```

- [ ] **Step 2: 작성 플로우 컴포넌트**

`src/app/reading/ReadingLogFlow.tsx`:

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { generateReadingQuestions, submitReadingLog } from '../actions/readingLog';

type Stage = 'form' | 'generating' | 'unrecognized' | 'questions' | 'grading' | 'error' | 'result';

export function ReadingLogFlow() {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [stage, setStage] = useState<Stage>('form');
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<string[]>(['', '', '']);
  const [feedback, setFeedback] = useState<string[]>([]);
  const [saveWarning, setSaveWarning] = useState<string | null>(null);

  async function handleGenerate() {
    setStage('generating');
    try {
      const res = await generateReadingQuestions(title, author);
      if (!res.recognized || res.questions.length === 0) {
        setStage('unrecognized');
        return;
      }
      setQuestions(res.questions);
      setAnswers(['', '', '']);
      setStage('questions');
    } catch {
      setStage('error');
    }
  }

  async function handleSubmit() {
    setStage('grading');
    try {
      const res = await submitReadingLog(
        title,
        author,
        questions.map((q, i) => ({ question: q, answer: answers[i] }))
      );
      setFeedback(res.feedback);
      setSaveWarning(res.saveWarning);
      setStage('result');
    } catch {
      setStage('error');
    }
  }

  if (stage === 'form' || stage === 'generating' || stage === 'unrecognized') {
    return (
      <div className="flex flex-col gap-4 rounded-[20px] bg-surface p-5 shadow-card">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold text-text-muted">책 제목</label>
          <input
            className="rounded-xl border-[1.5px] border-border bg-surface p-3 text-text focus:border-primary focus:outline-none"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={stage === 'generating'}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold text-text-muted">지은이</label>
          <input
            className="rounded-xl border-[1.5px] border-border bg-surface p-3 text-text focus:border-primary focus:outline-none"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            disabled={stage === 'generating'}
          />
        </div>
        {stage === 'unrecognized' && (
          <div className="rounded-2xl bg-warning-bg p-3 text-sm text-warning">
            이 책은 제가 자세히 모르는 책이에요. 다른 책 제목/지은이로 다시 시도해주세요.
          </div>
        )}
        <button
          className="rounded-full bg-primary p-3.5 font-bold text-white transition hover:bg-primary-dark disabled:bg-border disabled:text-text-faint"
          onClick={handleGenerate}
          disabled={stage === 'generating' || title.trim().length === 0 || author.trim().length === 0}
        >
          {stage === 'generating' ? '질문 만드는 중...' : '질문 만들기'}
        </button>
        <Link href="/reading/history" className="text-center text-xs font-semibold text-text-muted underline">
          지난 독서록 보기
        </Link>
      </div>
    );
  }

  if (stage === 'error') {
    return (
      <div className="flex flex-col gap-3 rounded-[20px] bg-surface p-5 shadow-card">
        <div className="text-error">처리 중 오류가 발생했습니다.</div>
        <button
          className="rounded-full bg-primary p-3.5 font-bold text-white transition hover:bg-primary-dark"
          onClick={() => setStage(questions.length > 0 ? 'questions' : 'form')}
        >
          돌아가기
        </button>
      </div>
    );
  }

  if (stage === 'result') {
    return (
      <div className="flex flex-col gap-3 rounded-[20px] bg-surface p-5 shadow-card">
        <div className="text-lg font-extrabold text-primary">
          {title} — 독서록 완료
        </div>
        {saveWarning && <div className="text-sm text-warning">{saveWarning}</div>}
        <ul className="flex flex-col gap-3">
          {questions.map((q, i) => (
            <li key={i} className="rounded-2xl bg-bg p-4">
              <div className="text-sm font-bold text-text">{q}</div>
              <div className="mt-1.5 text-sm text-text-muted">내 답변: {answers[i]}</div>
              <div className="mt-1.5 text-sm text-primary">{feedback[i]}</div>
            </li>
          ))}
        </ul>
        <Link
          href="/reading/history"
          className="rounded-full bg-primary p-3.5 text-center font-bold text-white transition hover:bg-primary-dark"
        >
          지난 독서록 보기
        </Link>
      </div>
    );
  }

  // stage === 'questions' | 'grading'
  const grading = stage === 'grading';
  return (
    <div className="flex flex-col gap-4 rounded-[20px] bg-surface p-5 shadow-card">
      {questions.map((q, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <label className="text-sm font-bold text-text">{q}</label>
          <textarea
            className="min-h-32 rounded-xl border-[1.5px] border-border bg-surface p-3 text-text focus:border-primary focus:outline-none"
            value={answers[i]}
            onChange={(e) => {
              const next = [...answers];
              next[i] = e.target.value;
              setAnswers(next);
            }}
            disabled={grading}
            placeholder="1~2단락 정도로 자유롭게 써 보세요"
          />
        </div>
      ))}
      <button
        className="rounded-full bg-primary p-3.5 font-bold text-white transition hover:bg-primary-dark disabled:bg-border disabled:text-text-faint"
        onClick={handleSubmit}
        disabled={grading || answers.some((a) => a.trim().length === 0)}
      >
        {grading ? '채점 중...' : '제출'}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: 타입 체크**

```bash
npx tsc --noEmit
```

Expected: 에러 없음.

- [ ] **Step 4: 브라우저로 수동 확인**

```bash
npm run dev
```

`/reading`에서 "어린 왕자" / "앙투안 드 생텍쥐페리"로 질문 생성 → 3개 질문에 텍스트박스로 답변(각각 1~2문장 이상) → 제출 → 결과 화면에 질문/답변/피드백이 순서대로 나오는지 확인. 그 다음 "지어낸 가짜책 12345" / "없는저자"로 다시 시도해서 "모르는 책" 안내가 뜨는지 확인. 서버 종료.

- [ ] **Step 5: 커밋**

```bash
git add src/app/reading/page.tsx src/app/reading/ReadingLogFlow.tsx
git commit -m "feat: add reading-log authoring flow UI"
```

---

## Task 5: 독서록 기록(목록/상세) UI

**Files:**
- Create: `src/app/reading/history/page.tsx`
- Create: `src/app/reading/history/[id]/page.tsx`

**Interfaces:**
- Consumes: `listReadingLogs`, `getReadingLogDetail`(Task 3).

- [ ] **Step 1: 목록 페이지**

`src/app/reading/history/page.tsx`:

```tsx
import Link from 'next/link';
import { listReadingLogs } from '../../actions/readingLog';

export default async function ReadingLogHistoryPage() {
  const logs = await listReadingLogs();

  return (
    <main className="mx-auto min-h-screen max-w-2xl p-8">
      <h1 className="mb-5 text-2xl font-extrabold tracking-tight text-text">독서록 기록</h1>
      <ul className="flex flex-col gap-2">
        {logs.map((log) => (
          <li key={log.id} className="rounded-2xl bg-surface p-4 shadow-card transition hover:bg-primary-tint/40">
            <Link href={`/reading/history/${log.id}`} className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-text">
                {log.title}
                <span className="mt-0.5 block text-xs font-medium text-text-muted">{log.author}</span>
              </div>
              <span className="shrink-0 text-xs text-text-faint">{new Date(log.createdAt).toLocaleDateString()}</span>
            </Link>
          </li>
        ))}
      </ul>
      {logs.length === 0 && (
        <div className="rounded-2xl bg-surface p-4 text-sm text-text-muted shadow-card">아직 작성한 독서록이 없습니다.</div>
      )}
    </main>
  );
}
```

- [ ] **Step 2: 상세 페이지**

`src/app/reading/history/[id]/page.tsx`:

```tsx
import { getReadingLogDetail } from '../../../actions/readingLog';

export default async function ReadingLogDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const log = await getReadingLogDetail(Number(id));

  return (
    <main className="mx-auto min-h-screen max-w-2xl p-8">
      <h1 className="mb-1 text-2xl font-extrabold tracking-tight text-text">{log.title}</h1>
      <div className="mb-5 text-sm text-text-muted">
        {log.author} · {new Date(log.createdAt).toLocaleDateString()}
      </div>
      <ul className="flex flex-col gap-3">
        {log.items.map((item, i) => (
          <li key={i} className="rounded-2xl bg-surface p-4 shadow-card">
            <div className="text-sm font-bold text-text">{item.question}</div>
            <div className="mt-1.5 text-sm text-text-muted">내 답변: {item.answer}</div>
            <div className="mt-1.5 text-sm text-primary">{item.feedback}</div>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 3: 타입 체크 + 브라우저 확인**

```bash
npx tsc --noEmit
npm run dev
```

Task 4에서 만든 독서록이 `/reading/history`에 나오는지, 클릭하면 `/reading/history/[id]`에서 질문/답변/피드백이 전부 보이는지 확인. 서버 종료.

- [ ] **Step 4: 커밋**

```bash
git add src/app/reading/history
git commit -m "feat: add reading-log history list and detail pages"
```

---

## Task 6: 영어독해 "준비중" 페이지

**Files:**
- Create: `src/app/comprehension/page.tsx`

- [ ] **Step 1: 페이지 작성**

`src/app/comprehension/page.tsx`:

```tsx
export default function ComprehensionPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-2 p-8 text-center">
      <h1 className="text-2xl font-extrabold tracking-tight text-text">영어독해</h1>
      <p className="text-sm text-text-muted">아직 준비 중이에요. 곧 만나요!</p>
    </main>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/app/comprehension/page.tsx
git commit -m "feat: add comprehension placeholder page"
```

---

## Task 7: 홈 화면 3-파트 재편 + 기록 링크 이동 + 아이패드 반응형 폭

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/review/page.tsx`

**Interfaces:**
- Consumes: `listWordbooks`(기존), `ResetWordbookButton`(기존) — 변경 없음.

- [ ] **Step 1: 홈 화면 재편**

`src/app/page.tsx`의 카드 3개 부분(단어집 초기화 `<details>`는 그대로 유지)을 아래로 교체:

```tsx
import Link from 'next/link';
import { listWordbooks } from './actions/wordbooks';
import { ResetWordbookButton } from '@/components/ResetWordbookButton';

export default async function HomePage() {
  const wordbooks = await listWordbooks();

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col gap-3 p-8 md:max-w-md">
      <h1 className="mb-2 text-2xl font-extrabold tracking-tight text-text">영단어 퀴즈</h1>
      <Link
        href="/review"
        className="flex items-center justify-between rounded-[20px] bg-primary px-5 py-4 font-semibold text-white shadow-card transition hover:bg-primary-dark"
      >
        <span>
          단어 테스트
          <span className="mt-0.5 block text-xs font-medium text-white/75">틀린 단어만 반복 학습</span>
        </span>
        <span className="text-white/70">→</span>
      </Link>
      <Link
        href="/reading"
        className="flex items-center justify-between rounded-[20px] bg-surface px-5 py-4 font-semibold text-text shadow-card transition hover:bg-primary-tint"
      >
        <span>
          독서록
          <span className="mt-0.5 block text-xs font-medium text-text-muted">책 읽고 생각 정리하기</span>
        </span>
        <span className="text-text-faint">→</span>
      </Link>
      <Link
        href="/comprehension"
        className="flex items-center justify-between rounded-[20px] bg-bg px-5 py-4 font-semibold text-text-muted shadow-card transition hover:bg-primary-tint/40"
      >
        <span>
          영어독해
          <span className="mt-0.5 block text-xs font-medium text-text-faint">준비중</span>
        </span>
        <span className="text-text-faint">→</span>
      </Link>
      {wordbooks.length > 0 && (
        <details className="group mt-4 border-t border-border pt-4">
          <summary className="cursor-pointer list-none text-xs font-bold text-text-muted [&::-webkit-details-marker]:hidden">
            단어집 초기화 <span className="inline-block transition group-open:rotate-180">▾</span>
          </summary>
          <div className="mt-3 flex flex-wrap gap-3">
            {wordbooks.map((wb) => (
              <ResetWordbookButton key={wb.id} wordbookId={wb.id} wordbookName={wb.name} />
            ))}
          </div>
        </details>
      )}
    </main>
  );
}
```

(카드 문구를 "영단어 테스트"에서 "단어 테스트"로 살짝 줄였습니다 — 홈 화면에서 세 카드 이름의 길이를 맞추기 위함이며 의미는 동일합니다. `/review` 페이지 자체의 제목은 Step 2에서 그대로 유지됩니다.)

- [ ] **Step 2: `/review`에 "기록 보기" 링크 추가**

`src/app/review/page.tsx`를 아래로 전체 교체:

```tsx
import Link from 'next/link';
import { listWordbooks } from '../actions/wordbooks';
import { ReviewQuizFlow } from './ReviewQuizFlow';

export default async function ReviewPage() {
  const wordbooks = await listWordbooks();
  return (
    <main className="mx-auto min-h-screen max-w-md p-8 md:max-w-lg">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold tracking-tight text-text">영단어 테스트</h1>
        <Link href="/history" className="text-xs font-semibold text-text-muted underline">
          기록 보기
        </Link>
      </div>
      <ReviewQuizFlow wordbooks={wordbooks} />
    </main>
  );
}
```

- [ ] **Step 3: 타입 체크 + 브라우저 확인**

```bash
npx tsc --noEmit
npm run dev
```

홈 화면에 카드 3개(단어 테스트/독서록/영어독해)만 있는지, "기록" 카드가 사라졌는지 확인. `/review`에 들어가서 우측 상단 "기록 보기"를 눌러 기존 `/history`로 잘 이동하는지 확인. `/comprehension` 카드를 눌러 준비중 페이지가 뜨는지 확인. 서버 종료.

- [ ] **Step 4: 커밋**

```bash
git add src/app/page.tsx src/app/review/page.tsx
git commit -m "feat: restructure home into 3 parts, move history link into review page"
```

---

## Task 8: 전체 플로우 E2E 스모크 확인

**Files:** 없음 (검증 전용).

- [ ] **Step 1: dev 서버 실행**

```bash
npm run dev
```

- [ ] **Step 2: 홈 → 독서록 전체 플로우**

홈에서 "독서록" 클릭 → 유명한 책 제목/지은이 입력 → 질문 3개 생성 확인 → 답변 작성(각 1~2문장 이상) → 제출 → 결과 화면에 질문/답변/피드백 확인 → "지난 독서록 보기" → 목록에 방금 항목이 보이는지 → 클릭해서 상세 확인.

- [ ] **Step 3: "모르는 책" 경로 확인**

`/reading`에서 존재하지 않는 책 제목으로 시도 → "모르는 책" 안내가 뜨는지 확인.

- [ ] **Step 4: 홈 → 단어 테스트 → 기록 동선 확인**

홈에서 "단어 테스트" → 문제 하나 이상 풀고 배치 채점까지 → 우측 상단 "기록 보기"로 기존 `/history` 진입 확인.

- [ ] **Step 5: 영어독해 placeholder 확인**

홈에서 "영어독해" 클릭 → "준비중" 페이지 확인.

- [ ] **Step 6: 서버 종료 + 전체 테스트 재확인**

```bash
npm run test
```

Expected: 기존 5개 파일 19개 테스트 그대로 PASS (이번 스펙은 신규 서버 액션에 자동 테스트를 추가하지 않으므로 개수 변화 없음).

- [ ] **Step 7: 발견된 버그가 있었다면 커밋 (없으면 생략)**

```bash
git add -A
git commit -m "test: verify reading-log flow and site restructure end to end"
```
