# 배치 채점 전환 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 자유 퀴즈/회독 모드를 "단어마다 즉시 API 채점"에서 "세션의 모든 단어를 다 푼 뒤 한 번의 API 호출로 배치 채점"하는 방식으로 전환한다.

**Architecture:** `src/lib/grading.ts`의 단건 `gradeAnswer`를 배치 함수 `gradeAnswers`로 교체하고, 이를 사용하는 새 Server Action(`submitFreeQuizBatch`, `submitReviewSessionBatch`)을 추가한다. UI는 채점 없이 답만 누적하는 새 공유 컴포넌트 `FlashcardInput`으로 교체하고, 각 Flow 컴포넌트가 마지막 문제에서 배치 채점을 1회 호출한 뒤 결과 화면을 보여준다. 회독 모드의 세션 내 재출제(requeue)는 배치 채점과 구조적으로 양립할 수 없어 완전히 제거한다.

**Tech Stack:** Next.js Server Actions, Vercel AI SDK(`generateObject` + zod 배열 스키마), `@ai-sdk/anthropic`, Drizzle ORM(`neon-http`, `db.batch`), React 클라이언트 컴포넌트.

## Global Constraints

- Round state is tracked independently per word in `word_progress`, never globally synchronized (원본 스펙 §8).
- A word is "취약 단어" once `array_length(wrong_rounds, 1) >= 3` (원본 스펙 §5/§8).
- Grading failures (배치 API 호출 자체의 실패, 또는 결과 개수/인덱스 불일치) must never write to `attempts` or `word_progress`; DB 저장 실패는 이미 계산된 채점 결과를 그대로 보여주되 작은 경고만 표시한다 (배치 채점 스펙 §7).
- 배치 채점은 세션당 한 번의 API 호출로 처리한다 (청크 분할 없음) — 배치 채점 스펙 §2.
- 회독 모드의 세션 내 즉시 재출제(requeue)는 완전히 제거한다. 틀린 단어는 다음 세션(다음 회독)에서만 다시 만난다 — 배치 채점 스펙 §2, §5.
- `neon-http` Drizzle 드라이버는 `db.transaction()`을 지원하지 않는다 (`"No transactions support in neon-http driver"`) — 여러 statement의 원자적 실행에는 `db.batch([...])`를 사용한다 (Task 12에서 확립된 패턴).
- 모든 새 UI는 `DESIGN.md`에 정의된 기존 디자인 토큰/클래스(`bg-surface`, `text-primary`, `text-error`, `text-success`, `shadow-card`, `rounded-[20px]`, pill 배지 등)를 그대로 사용한다. 원시 Tailwind 색상 클래스(`bg-blue-600`, `text-gray-500` 등)를 새로 도입하지 않는다.
- 빈 답변으로는 "다음"/"채점하기" 버튼이 활성화되지 않는다 (기존 `AnswerForm`과 동일한 UX 유지).

---

## Task 1: 배치 채점 함수 (`gradeAnswers`)

**Files:**
- Modify: `src/lib/grading.ts`
- Modify: `src/lib/grading.test.ts`

**Interfaces:**
- Consumes: `generateObject`(`ai`), `anthropic`(`@ai-sdk/anthropic`), `z`(`zod`).
- Produces: `GradingResult`(`{ correct: boolean; feedback: string }`), `GradingItem`(`{ word: string; userAnswer: string }`), `gradeAnswers(items: GradingItem[]): Promise<GradingResult[]>` — Task 2·3에서 사용.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/grading.test.ts`를 아래 내용으로 전체 교체:

```ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('ai', () => ({
  generateObject: vi.fn(),
}));

import { generateObject } from 'ai';
import { gradeAnswers } from './grading';

describe('gradeAnswers', () => {
  it('maps results back to items by index, regardless of response order', async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        results: [
          { index: 1, correct: false, feedback: '오답입니다' },
          { index: 0, correct: true, feedback: '정답입니다' },
        ],
      },
    } as never);

    const result = await gradeAnswers([
      { word: 'car', userAnswer: '자동차' },
      { word: 'dog', userAnswer: '고양이' },
    ]);

    expect(result).toEqual([
      { correct: true, feedback: '정답입니다' },
      { correct: false, feedback: '오답입니다' },
    ]);
  });

  it('includes every word and answer in the prompt', async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: { results: [{ index: 0, correct: true, feedback: 'ok' }] },
    } as never);

    await gradeAnswers([{ word: 'car', userAnswer: '자동차' }]);

    const call = vi.mocked(generateObject).mock.calls[0][0];
    expect(call.prompt).toContain('car');
    expect(call.prompt).toContain('자동차');
  });

  it('throws when the result count does not match the input count', async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: { results: [{ index: 0, correct: true, feedback: 'ok' }] },
    } as never);

    await expect(
      gradeAnswers([
        { word: 'car', userAnswer: '자동차' },
        { word: 'dog', userAnswer: '개' },
      ])
    ).rejects.toThrow('count mismatch');
  });

  it('throws when a result is missing for a given index', async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        results: [
          { index: 0, correct: true, feedback: 'ok' },
          { index: 0, correct: true, feedback: 'dup' },
        ],
      },
    } as never);

    await expect(
      gradeAnswers([
        { word: 'car', userAnswer: '자동차' },
        { word: 'dog', userAnswer: '개' },
      ])
    ).rejects.toThrow('Missing grading result for index 1');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npx vitest run src/lib/grading.test.ts
```

Expected: FAIL — `gradeAnswers`가 아직 없음 (기존 `gradeAnswer` 단건 함수만 존재).

- [ ] **Step 3: `gradeAnswers` 구현**

`src/lib/grading.ts`를 아래 내용으로 전체 교체:

```ts
import { generateObject } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';

const batchGradingSchema = z.object({
  results: z.array(
    z.object({
      index: z.number(),
      correct: z.boolean(),
      feedback: z.string(),
    })
  ),
});

export interface GradingResult {
  correct: boolean;
  feedback: string;
}

export interface GradingItem {
  word: string;
  userAnswer: string;
}

const MODEL = process.env.CLAUDE_GRADING_MODEL ?? 'claude-sonnet-4-5';

export async function gradeAnswers(items: GradingItem[]): Promise<GradingResult[]> {
  const prompt = [
    '다음은 영단어 퀴즈의 문제와 사용자 답변 목록입니다. 각 항목에 대해 정답 여부와 이유를 판정하세요.',
    '',
    '다음 중 하나라도 충족하면 정답으로 판정하세요:',
    '1. 사용자 답변이 이 단어의 한글 뜻을 정확히 또는 유사하게 맞췄다.',
    '2. 사용자 답변이 이 단어를 문법적으로 올바르고 의미에 맞게 사용한 영어 예문이다.',
    '',
    ...items.map((item, i) => `${i}. 영단어: "${item.word}", 사용자 답변: "${item.userAnswer}"`),
    '',
    'results 배열에 각 항목마다 index(위 번호와 정확히 동일한 값), correct(boolean), feedback(판정 이유를 한국어 한 줄로)을 모두 포함해서 반환하세요. 항목 순서는 입력 순서와 달라도 되지만, index는 반드시 정확해야 합니다.',
  ].join('\n');

  const { object } = await generateObject({
    model: anthropic(MODEL),
    schema: batchGradingSchema,
    prompt,
  });

  if (object.results.length !== items.length) {
    throw new Error(`Grading result count mismatch: expected ${items.length}, got ${object.results.length}`);
  }

  const byIndex = new Map(object.results.map((r) => [r.index, r]));

  return items.map((_, i) => {
    const r = byIndex.get(i);
    if (!r) {
      throw new Error(`Missing grading result for index ${i}`);
    }
    return { correct: r.correct, feedback: r.feedback };
  });
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx vitest run src/lib/grading.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: 실제 API로 배치 채점 동작 확인 (라이브)**

`.env.local`에 이미 설정된 `ANTHROPIC_API_KEY`를 사용해, 임시 스크립트로 실제 배치 호출을 확인한다. `scripts/_tmp_grade_check.ts`를 만든다:

```ts
import { config } from 'dotenv';
config({ path: '.env.local' });
import { gradeAnswers } from '../src/lib/grading';

async function main() {
  const result = await gradeAnswers([
    { word: 'car', userAnswer: '자동차' },
    { word: 'dog', userAnswer: '바나나' },
  ]);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error('ERR', e);
  process.exit(1);
});
```

```bash
npx tsx scripts/_tmp_grade_check.ts
```

Expected: 배열 2개 항목, 첫 번째는 `correct: true`(자동차는 car의 정답), 두 번째는 `correct: false`(바나나는 dog와 무관). 확인 후 스크립트 삭제:

```bash
rm scripts/_tmp_grade_check.ts
```

- [ ] **Step 6: 커밋**

```bash
git add src/lib/grading.ts src/lib/grading.test.ts
git commit -m "feat: replace per-word grading with batch gradeAnswers"
```

---

## Task 2: 자유 퀴즈 배치 채점 서버 액션

**Files:**
- Modify: `src/app/actions/freeQuiz.ts`

**Interfaces:**
- Consumes: `gradeAnswers`, `GradingResult`(Task 1); `db`, `attempts`(기존); `sampleRandom`(기존).
- Produces: `FreeQuizAnswer`(`{ wordId: number; word: string; userAnswer: string }`), `FreeQuizBatchResultItem`(`GradingResult & { wordId: number; word: string }`), `SubmitFreeQuizBatchResult`(`{ results: FreeQuizBatchResultItem[]; saveWarning: string | null }`), `submitFreeQuizBatch(sessionId, items: FreeQuizAnswer[]): Promise<SubmitFreeQuizBatchResult>` — Task 5(`FreeQuizFlow`)에서 사용. `startFreeQuiz`/`FreeQuizWord`/`StartFreeQuizResult`는 변경 없음.

- [ ] **Step 1: `submitFreeAnswer`를 `submitFreeQuizBatch`로 교체**

`src/app/actions/freeQuiz.ts`를 아래 내용으로 전체 교체:

```ts
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
```

이로써 `submitFreeAnswer`/`SubmitAnswerResult`는 완전히 제거된다. 채점(`gradeAnswers`)이 먼저 실행되고 실패하면 예외가 그대로 던져지므로(§10 원칙: 채점 실패 시 아무것도 쓰지 않음), `attempts` insert는 채점 성공 후에만 도달한다.

- [ ] **Step 2: 실제 DB로 라이브 검증**

`scripts/_tmp_free_batch_check.ts` 생성:

```ts
import { config } from 'dotenv';
config({ path: '.env.local' });
import { db } from '../src/db/client';
import { words } from '../src/db/schema';
import { and, eq } from 'drizzle-orm';
import { startFreeQuiz, submitFreeQuizBatch } from '../src/app/actions/freeQuiz';
import { attempts } from '../src/db/schema';

async function main() {
  const started = await startFreeQuiz(1, 1, 1, 3);
  console.log('started:', started.words.map((w) => w.word));

  const items = started.words.map((w) => ({ wordId: w.id, word: w.word, userAnswer: '테스트답변' }));
  const res = await submitFreeQuizBatch(started.sessionId, items);
  console.log('batch result:', JSON.stringify(res, null, 2));

  // cleanup: this session's test attempts
  await db.delete(attempts).where(eq(attempts.sessionId, started.sessionId));
  console.log('cleaned up test attempts for session', started.sessionId);
}

main().catch((e) => {
  console.error('ERR', e);
  process.exit(1);
});
```

```bash
npx tsx scripts/_tmp_free_batch_check.ts
```

Expected: `started`에 3개 단어, `batch result`에 `results` 배열 3개 항목(각각 `wordId`/`word`/`correct`/`feedback` 포함)과 `saveWarning: null`. 확인 후:

```bash
rm scripts/_tmp_free_batch_check.ts
```

- [ ] **Step 3: 커밋**

```bash
git add src/app/actions/freeQuiz.ts
git commit -m "feat: add submitFreeQuizBatch, remove per-word submitFreeAnswer"
```

---

## Task 3: 회독 모드 배치 채점 서버 액션

**Files:**
- Modify: `src/app/actions/reviewQuiz.ts`

**Interfaces:**
- Consumes: `gradeAnswers`, `GradingResult`(Task 1); `db`, `wordProgress`, `attempts`(기존); `applyAnswer`, `initialProgress`, `WordProgressState`(기존, 변경 없음); `selectReviewPool`, `sampleRandom`(기존).
- Produces: `ReviewAnswer`(`{ wordId: number; word: string; userAnswer: string }`), `ReviewBatchResultItem`(`GradingResult & { wordId: number; word: string; retired: boolean; nextRound: number }`), `SubmitReviewSessionBatchResult`(`{ results: ReviewBatchResultItem[]; graduated: number; carried: number; weakWords: string[]; saveWarning: string | null }`), `submitReviewSessionBatch(sessionId, items: ReviewAnswer[]): Promise<SubmitReviewSessionBatchResult>` — Task 6(`ReviewQuizFlow`)에서 사용. `getReviewStatus`/`startReviewSession`/`ReviewStatus`/`ReviewWord`는 변경 없음.

- [ ] **Step 1: `submitReviewAnswer`를 `submitReviewSessionBatch`로 교체**

`src/app/actions/reviewQuiz.ts`의 최상단 import를 아래로 교체 (`sql` 추가):

```ts
'use server';

import { randomUUID } from 'crypto';
import { and, eq, gte, lte, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { words, wordProgress, attempts } from '@/db/schema';
import { sampleRandom } from '@/lib/sampleRandom';
import { selectReviewPool, type ReviewPoolEntry } from '@/lib/reviewPool';
import { applyAnswer, initialProgress, type WordProgressState } from '@/lib/reviewTransition';
import { gradeAnswers, type GradingResult } from '@/lib/grading';
```

(`isWeakWord`는 더 이상 개별 결과에 쓰지 않고 배치 내에서 `wrongRounds.length === 3` 조건으로 직접 판정하므로 import에서 제거한다.)

파일 끝의 `submitReviewAnswer`/`ReviewAnswerResult` 전체를 아래로 교체:

```ts
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
  const progressRows = wordIds.length > 0 ? await db.select().from(wordProgress).where(inArray(wordProgress.wordId, wordIds)) : [];
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
```

**핵심 설계 노트 (구현자가 반드시 이해해야 함):**
- `progressUpdates`를 하나의 다중행(bulk) `.values([...])` insert로 묶고, `onConflictDoUpdate`의 `set`에서 `sql`excluded.column_name`` (실제 스니크케이스 DB 컬럼명, 예: `missed_this_round`)으로 "이번에 들어온 각 행 자신의 값"을 참조한다. 이것이 PostgreSQL의 표준 다중행 upsert 패턴이며, N개의 개별 upsert 문을 만들지 않고 **정확히 2개의 statement**(`word_progress` bulk upsert + `attempts` bulk insert)만 `db.batch([...])`에 담기 때문에 Drizzle의 `batch()` 타입(`[U, ...U[]]`, 즉 리터럴 2-튜플)과도 자연스럽게 맞는다. N개의 동적 배열을 그대로 `db.batch()`에 넣으려 하지 말 것 — 타입도 맞지 않고 Task 12에서 이미 검증된 패턴과도 다르다.
- 이미 retired된 단어가 재제출되면 `applyAnswer`가 던지는 예외를 개별적으로 catch해서 해당 항목만 "저장 없이 채점 결과만" 반환한다(Task 12의 retired-resubmission 가드와 동일한 원칙). 이 항목은 `progressUpdates`/`attemptRows`에 들어가지 않는다.

- [ ] **Step 2: 타입 체크로 1차 확인**

```bash
npx tsc --noEmit
```

Expected: 에러 없음.

- [ ] **Step 3: 실제 DB로 라이브 검증 (bulk upsert 동작 포함)**

`scripts/_tmp_review_batch_check.ts` 생성 — Day 10(아직 아무 테스트도 손대지 않은 범위)의 단어로 검증하고 끝나면 원상복구한다:

```ts
import { config } from 'dotenv';
config({ path: '.env.local' });
import { db } from '../src/db/client';
import { words, wordProgress, attempts } from '../src/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { startReviewSession, submitReviewSessionBatch, getReviewStatus } from '../src/app/actions/reviewQuiz';

async function main() {
  console.log('before:', await getReviewStatus(1, 10, 10));

  const started = await startReviewSession(1, 10, 10, 4);
  console.log('started words:', started.words.map((w) => w.word));

  const items = started.words.map((w, i) => ({
    wordId: w.id,
    word: w.word,
    userAnswer: i % 2 === 0 ? '정답이길바라는답변' : 'xyznonsense',
  }));

  const res = await submitReviewSessionBatch(started.sessionId, items);
  console.log('batch result:', JSON.stringify(res, null, 2));

  console.log('after:', await getReviewStatus(1, 10, 10));

  // cleanup: reset this range back to untouched
  const wordIds = started.words.map((w) => w.id);
  await db.delete(attempts).where(eq(attempts.sessionId, started.sessionId));
  await db.delete(wordProgress).where(inArray(wordProgress.wordId, wordIds));
  console.log('cleaned up test rows for Day 10');
}

main().catch((e) => {
  console.error('ERR', e);
  process.exit(1);
});
```

```bash
npx tsx scripts/_tmp_review_batch_check.ts
```

Expected:
- `before`에서 `대기` 값이 해당 범위 전체 단어 수와 같음(아직 아무도 안 건드림).
- `batch result`의 `results` 배열 길이가 요청한 단어 수와 같고, 각 항목에 `retired`/`nextRound`가 채워짐. 정답으로 보낸 항목은 `retired: true`(첫 시도 정답은 졸업), 오답으로 보낸 항목은 `retired: false`이고 `nextRound`가 시작 회독과 동일.
- `graduated`가 정답 개수와 일치, `carried`는 0(전부 처음 보는 단어라 이월될 일이 없음), `saveWarning: null`.
- `after`에서 `맞은수`가 `graduated`만큼, `틀린수`가 오답 개수만큼 증가.
- 정리 후 재실행해도 `before` 값이 다시 원래대로 돌아오는지 확인(즉, cleanup이 제대로 됐는지 재검증).

확인 후:

```bash
rm scripts/_tmp_review_batch_check.ts
```

- [ ] **Step 4: 커밋**

```bash
git add src/app/actions/reviewQuiz.ts
git commit -m "feat: add submitReviewSessionBatch, remove in-session requeue and per-word submitReviewAnswer"
```

---

## Task 4: 공유 플래시카드 입력 컴포넌트

**Files:**
- Create: `src/components/FlashcardInput.tsx`

**Interfaces:**
- Produces: `FlashcardInputProps`(`{ word: string; isLast: boolean; submitting: boolean; onNext: (answer: string) => void }`), `FlashcardInput` — Task 5·6에서 사용. 채점 API를 직접 호출하지 않는다.

- [ ] **Step 1: 컴포넌트 작성**

`src/components/FlashcardInput.tsx`:

```tsx
'use client';

import { useState } from 'react';

export interface FlashcardInputProps {
  word: string;
  isLast: boolean;
  submitting: boolean;
  onNext: (answer: string) => void;
}

export function FlashcardInput({ word, isLast, submitting, onNext }: FlashcardInputProps) {
  const [answer, setAnswer] = useState('');

  function handleNext() {
    onNext(answer);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-[20px] bg-surface p-10 text-center text-3xl font-extrabold tracking-tight text-text shadow-card">
        {word}
      </div>
      <input
        className="rounded-xl border-[1.5px] border-border bg-surface p-3.5 text-text placeholder:text-text-faint focus:border-primary focus:outline-none"
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        placeholder="한글 뜻 또는 영어 예문"
        disabled={submitting}
      />
      <button
        className="rounded-full bg-primary p-3.5 font-bold text-white transition hover:bg-primary-dark disabled:bg-border disabled:text-text-faint"
        onClick={handleNext}
        disabled={submitting || answer.trim().length === 0}
      >
        {submitting ? '채점 중...' : isLast ? '채점하기' : '다음'}
      </button>
    </div>
  );
}
```

부모 컴포넌트가 매 단어마다 `key={wordId}`로 이 컴포넌트를 다시 마운트하므로(Task 5·6에서 그렇게 사용) 내부 `answer` 상태는 단어가 바뀔 때 자동으로 초기화된다 — 별도의 리셋 로직 불필요.

- [ ] **Step 2: 타입 체크**

```bash
npx tsc --noEmit
```

Expected: 에러 없음 (아직 아무도 이 컴포넌트를 사용하지 않으므로 미사용 경고만 있을 수 있음 — 무시).

- [ ] **Step 3: 커밋**

```bash
git add src/components/FlashcardInput.tsx
git commit -m "feat: add FlashcardInput component for batch-grading flows"
```

---

## Task 5: 자유 퀴즈 플로우를 배치 채점으로 재작성

**Files:**
- Modify: `src/app/free/FreeQuizFlow.tsx`

**Interfaces:**
- Consumes: `startFreeQuiz`, `submitFreeQuizBatch`, `FreeQuizWord`, `FreeQuizBatchResultItem`(Task 2); `FlashcardInput`(Task 4); `WordbookOption`(기존).

- [ ] **Step 1: 전체 재작성**

`src/app/free/FreeQuizFlow.tsx`를 아래로 전체 교체:

```tsx
'use client';

import { useState } from 'react';
import {
  startFreeQuiz,
  submitFreeQuizBatch,
  type FreeQuizWord,
  type FreeQuizAnswer,
  type FreeQuizBatchResultItem,
} from '../actions/freeQuiz';
import type { WordbookOption } from '../actions/wordbooks';
import { FlashcardInput } from '@/components/FlashcardInput';

export function FreeQuizFlow({ wordbooks }: { wordbooks: WordbookOption[] }) {
  const [wordbookId, setWordbookId] = useState(wordbooks[0]?.id ?? 0);
  const [dayFrom, setDayFrom] = useState(1);
  const [dayTo, setDayTo] = useState(1);
  const [count, setCount] = useState(5);
  const [session, setSession] = useState<{ sessionId: string; words: FreeQuizWord[] } | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<FreeQuizAnswer[]>([]);
  const [grading, setGrading] = useState(false);
  const [gradingError, setGradingError] = useState(false);
  const [results, setResults] = useState<FreeQuizBatchResultItem[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleStart() {
    const res = await startFreeQuiz(wordbookId, dayFrom, dayTo, count);
    setSession({ sessionId: res.sessionId, words: res.words });
    setIndex(0);
    setAnswers([]);
    setResults(null);
    setGradingError(false);
    setNotice(
      res.words.length < count
        ? `해당 범위에 ${res.words.length}개 단어만 있어 ${res.words.length}문제로 진행합니다.`
        : null
    );
  }

  async function gradeBatch(finalAnswers: FreeQuizAnswer[]) {
    if (!session) return;
    setGrading(true);
    setGradingError(false);
    try {
      const res = await submitFreeQuizBatch(session.sessionId, finalAnswers);
      setResults(res.results);
    } catch {
      setGradingError(true);
    } finally {
      setGrading(false);
    }
  }

  function handleCardNext(answer: string) {
    if (!session) return;
    const current = session.words[index];
    const updated = [...answers, { wordId: current.id, word: current.word, userAnswer: answer }];
    setAnswers(updated);

    if (index + 1 >= session.words.length) {
      gradeBatch(updated);
    } else {
      setIndex((i) => i + 1);
    }
  }

  if (!session) {
    return (
      <div className="flex flex-col gap-4 rounded-[20px] bg-surface p-5 shadow-card">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold text-text-muted">단어장</label>
          <select
            className="rounded-xl border-[1.5px] border-border bg-surface p-3 text-text focus:border-primary focus:outline-none"
            value={wordbookId}
            onChange={(e) => setWordbookId(Number(e.target.value))}
          >
            {wordbooks.map((wb) => (
              <option key={wb.id} value={wb.id}>
                {wb.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold text-text-muted">DAY</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              className="w-24 rounded-xl border-[1.5px] border-border bg-surface p-3 text-text focus:border-primary focus:outline-none"
              value={dayFrom}
              onChange={(e) => setDayFrom(Number(e.target.value))}
            />
            <span className="text-text-faint">~</span>
            <input
              type="number"
              className="w-24 rounded-xl border-[1.5px] border-border bg-surface p-3 text-text focus:border-primary focus:outline-none"
              value={dayTo}
              onChange={(e) => setDayTo(Number(e.target.value))}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold text-text-muted">테스트할 문제 수</label>
          <input
            type="number"
            className="rounded-xl border-[1.5px] border-border bg-surface p-3 text-text focus:border-primary focus:outline-none"
            min={1}
            max={30}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          />
        </div>
        <button
          className="rounded-full bg-primary p-3.5 font-bold text-white transition hover:bg-primary-dark"
          onClick={handleStart}
        >
          퀴즈 시작
        </button>
      </div>
    );
  }

  if (gradingError) {
    return (
      <div className="flex flex-col gap-3 rounded-[20px] bg-surface p-5 shadow-card">
        <div className="text-error">채점 중 오류가 발생했습니다.</div>
        <button
          className="rounded-full bg-primary p-3.5 font-bold text-white transition hover:bg-primary-dark"
          onClick={() => gradeBatch(answers)}
        >
          다시 채점하기
        </button>
      </div>
    );
  }

  if (results) {
    const correctCount = results.filter((r) => r.correct).length;
    return (
      <div className="flex flex-col gap-3 rounded-[20px] bg-surface p-5 shadow-card">
        <div className="text-lg font-extrabold text-primary">
          {results.length}문제 중 {correctCount}개 정답
        </div>
        <ul className="flex flex-col gap-2">
          {results.map((r) => (
            <li key={r.wordId} className="rounded-2xl bg-bg px-4 py-3 text-sm text-text">
              <div className="flex items-center justify-between font-semibold">
                {r.word}
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white ${
                    r.correct ? 'bg-success' : 'bg-error'
                  }`}
                >
                  {r.correct ? 'O' : 'X'}
                </span>
              </div>
              <div className="mt-1 text-text-muted">{r.feedback}</div>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (grading) {
    return <div className="rounded-[20px] bg-surface p-10 text-center text-text-muted shadow-card">채점 중...</div>;
  }

  const current = session.words[index];
  return (
    <div className="flex flex-col gap-3">
      {notice && <div className="text-sm font-medium text-warning">{notice}</div>}
      <span className="w-fit rounded-full bg-primary-tint px-3 py-1 text-xs font-bold text-primary">
        {index + 1} / {session.words.length}
      </span>
      <FlashcardInput
        key={current.id}
        word={current.word}
        isLast={index + 1 >= session.words.length}
        submitting={false}
        onNext={handleCardNext}
      />
    </div>
  );
}
```

- [ ] **Step 2: 타입 체크**

```bash
npx tsc --noEmit
```

Expected: 에러 없음.

- [ ] **Step 3: 브라우저로 수동 확인**

```bash
npm run dev
```

`/free`에서 Day 1~2, 문제 수 3으로 시작. 문제마다 채점 없이 바로 "다음"으로 넘어가는지(마지막 문제만 "채점하기") 확인. 마지막 문제에서 "채점하기"를 누르면 "채점 중..." 화면이 잠깐 보였다가, 3개 단어 전부의 O/X + 피드백이 담긴 결과 화면이 한 번에 나오는지 확인. 서버 종료.

- [ ] **Step 4: 커밋**

```bash
git add src/app/free/FreeQuizFlow.tsx
git commit -m "feat: rewrite FreeQuizFlow for batch grading"
```

---

## Task 6: 회독 모드 플로우를 배치 채점으로 재작성 + 재출제 로직 제거

**Files:**
- Modify: `src/app/review/ReviewQuizFlow.tsx`
- Delete: `src/components/AnswerForm.tsx`
- Delete: `src/lib/queue.ts`
- Delete: `src/lib/queue.test.ts`

**Interfaces:**
- Consumes: `getReviewStatus`, `startReviewSession`, `submitReviewSessionBatch`, `ReviewWord`, `ReviewStatus`, `ReviewBatchResultItem`(Task 3); `FlashcardInput`(Task 4); `WordbookOption`(기존).

- [ ] **Step 1: 전체 재작성**

`src/app/review/ReviewQuizFlow.tsx`를 아래로 전체 교체:

```tsx
'use client';

import { useEffect, useState } from 'react';
import {
  getReviewStatus,
  startReviewSession,
  submitReviewSessionBatch,
  type ReviewWord,
  type ReviewStatus,
  type ReviewAnswer,
  type ReviewBatchResultItem,
} from '../actions/reviewQuiz';
import type { WordbookOption } from '../actions/wordbooks';
import { FlashcardInput } from '@/components/FlashcardInput';

interface BatchSummary {
  results: ReviewBatchResultItem[];
  graduated: number;
  carried: number;
  weakWords: string[];
}

export function ReviewQuizFlow({ wordbooks }: { wordbooks: WordbookOption[] }) {
  const [wordbookId, setWordbookId] = useState(wordbooks[0]?.id ?? 0);
  const [dayFrom, setDayFrom] = useState(1);
  const [dayTo, setDayTo] = useState(1);
  const [count, setCount] = useState(5);
  const [status, setStatus] = useState<ReviewStatus | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [queue, setQueue] = useState<ReviewWord[] | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<ReviewAnswer[]>([]);
  const [grading, setGrading] = useState(false);
  const [gradingError, setGradingError] = useState(false);
  const [summary, setSummary] = useState<BatchSummary | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [finalStatus, setFinalStatus] = useState<ReviewStatus | null>(null);

  useEffect(() => {
    if (wordbookId) {
      getReviewStatus(wordbookId, dayFrom, dayTo).then(setStatus);
    }
  }, [wordbookId, dayFrom, dayTo]);

  useEffect(() => {
    if (summary) {
      getReviewStatus(wordbookId, dayFrom, dayTo).then(setFinalStatus);
    }
  }, [summary, wordbookId, dayFrom, dayTo]);

  async function handleStart() {
    const res = await startReviewSession(wordbookId, dayFrom, dayTo, count);
    if (res.words.length === 0) {
      setNotice('이 범위는 모두 완료했습니다.');
      return;
    }
    setSessionId(res.sessionId);
    setQueue(res.words);
    setIndex(0);
    setAnswers([]);
    setSummary(null);
    setFinalStatus(null);
    setGradingError(false);
    setNotice(
      res.words.length < count
        ? `대기 중인 단어가 ${res.words.length}개뿐이라 ${res.words.length}문제로 진행합니다.`
        : null
    );
  }

  async function gradeBatch(finalAnswers: ReviewAnswer[]) {
    if (!sessionId) return;
    setGrading(true);
    setGradingError(false);
    try {
      const res = await submitReviewSessionBatch(sessionId, finalAnswers);
      setSummary({ results: res.results, graduated: res.graduated, carried: res.carried, weakWords: res.weakWords });
    } catch {
      setGradingError(true);
    } finally {
      setGrading(false);
    }
  }

  function handleCardNext(answer: string) {
    if (!queue) return;
    const current = queue[index];
    const updated = [...answers, { wordId: current.id, word: current.word, userAnswer: answer }];
    setAnswers(updated);

    if (index + 1 >= queue.length) {
      gradeBatch(updated);
    } else {
      setIndex((i) => i + 1);
    }
  }

  if (!sessionId || !queue) {
    return (
      <div className="flex flex-col gap-4 rounded-[20px] bg-surface p-5 shadow-card">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold text-text-muted">단어장</label>
          <select
            className="rounded-xl border-[1.5px] border-border bg-surface p-3 text-text focus:border-primary focus:outline-none"
            value={wordbookId}
            onChange={(e) => setWordbookId(Number(e.target.value))}
          >
            {wordbooks.map((wb) => (
              <option key={wb.id} value={wb.id}>
                {wb.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold text-text-muted">DAY</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              className="w-24 rounded-xl border-[1.5px] border-border bg-surface p-3 text-text focus:border-primary focus:outline-none"
              value={dayFrom}
              onChange={(e) => setDayFrom(Number(e.target.value))}
            />
            <span className="text-text-faint">~</span>
            <input
              type="number"
              className="w-24 rounded-xl border-[1.5px] border-border bg-surface p-3 text-text focus:border-primary focus:outline-none"
              value={dayTo}
              onChange={(e) => setDayTo(Number(e.target.value))}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold text-text-muted">테스트할 문제 수</label>
          <input
            type="number"
            className="rounded-xl border-[1.5px] border-border bg-surface p-3 text-text focus:border-primary focus:outline-none"
            min={1}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          />
        </div>
        {status && (
          <div className="rounded-2xl bg-bg px-4 py-3 text-sm font-medium text-text-muted">
            전체 단어수 {status.total}, 맞은수 {status.correctCount}, 틀린수 {status.wrongCount}, 대기{' '}
            {status.pendingCount}
          </div>
        )}
        {notice && <div className="text-sm font-medium text-warning">{notice}</div>}
        <button
          className="rounded-full bg-primary p-3.5 font-bold text-white transition hover:bg-primary-dark"
          onClick={handleStart}
        >
          회독 시작
        </button>
      </div>
    );
  }

  if (gradingError) {
    return (
      <div className="flex flex-col gap-3 rounded-[20px] bg-surface p-5 shadow-card">
        <div className="text-error">채점 중 오류가 발생했습니다.</div>
        <button
          className="rounded-full bg-primary p-3.5 font-bold text-white transition hover:bg-primary-dark"
          onClick={() => gradeBatch(answers)}
        >
          다시 채점하기
        </button>
      </div>
    );
  }

  if (summary) {
    const correctCount = summary.results.filter((r) => r.correct).length;
    return (
      <div className="flex flex-col gap-3 rounded-[20px] bg-surface p-5 shadow-card">
        <div className="text-lg font-extrabold text-primary">
          이번 세션 {summary.results.length}번 답변 중 {correctCount}번 정답
        </div>
        <div className="flex gap-2">
          <span className="rounded-full bg-success-bg px-3 py-1 text-xs font-bold text-success">
            졸업한 단어 {summary.graduated}개
          </span>
          <span className="rounded-full bg-primary-tint px-3 py-1 text-xs font-bold text-primary">
            다음 회독 이월 {summary.carried}개
          </span>
        </div>
        {summary.weakWords.length > 0 && (
          <div className="rounded-2xl bg-warning-bg p-3">
            <div className="text-xs font-bold text-warning">⚠ 취약 단어</div>
            <div className="mt-0.5 text-sm text-text">{summary.weakWords.join(', ')}</div>
          </div>
        )}
        <ul className="flex flex-col gap-2">
          {summary.results.map((r) => (
            <li key={r.wordId} className="rounded-2xl bg-bg px-4 py-3 text-sm text-text">
              <div className="flex items-center justify-between font-semibold">
                {r.word}
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white ${
                    r.correct ? 'bg-success' : 'bg-error'
                  }`}
                >
                  {r.correct ? 'O' : 'X'}
                </span>
              </div>
              <div className="mt-1 text-text-muted">{r.feedback}</div>
            </li>
          ))}
        </ul>
        {finalStatus && (
          <div className="rounded-2xl bg-bg px-4 py-3 text-sm font-medium text-text-muted">
            전체 단어수 {finalStatus.total}, 맞은수 {finalStatus.correctCount}, 틀린수 {finalStatus.wrongCount}, 대기{' '}
            {finalStatus.pendingCount}
          </div>
        )}
      </div>
    );
  }

  if (grading) {
    return <div className="rounded-[20px] bg-surface p-10 text-center text-text-muted shadow-card">채점 중...</div>;
  }

  const current = queue[index];
  return (
    <div className="flex flex-col gap-3">
      {notice && <div className="text-sm font-medium text-warning">{notice}</div>}
      <span className="w-fit rounded-full bg-primary-tint px-3 py-1 text-xs font-bold text-primary">
        {current.round}회독 · 이번 세션 {index + 1} / {queue.length}
      </span>
      <FlashcardInput
        key={current.id}
        word={current.word}
        isLast={index + 1 >= queue.length}
        submitting={false}
        onNext={handleCardNext}
      />
    </div>
  );
}
```

- [ ] **Step 2: 이제 쓰이지 않는 파일 삭제**

`AnswerForm`과 `requeueWrongAnswer`를 더 이상 아무도 import하지 않는지 확인:

```bash
grep -rn "AnswerForm\|requeueWrongAnswer" src --include=*.tsx --include=*.ts
```

Expected: `src/lib/queue.ts`(구현 자신), `src/lib/queue.test.ts`, `src/components/AnswerForm.tsx`(구현 자신) 외에는 결과 없음. 확인되면 삭제:

```bash
rm src/components/AnswerForm.tsx src/lib/queue.ts src/lib/queue.test.ts
```

- [ ] **Step 3: 타입 체크 + 전체 테스트**

```bash
npx tsc --noEmit
npm run test
```

Expected: 타입 에러 없음. 테스트는 5개 파일, 19개 테스트 전부 PASS (`scripts/seed.test.ts` 2, `src/lib/sampleRandom.test.ts` 3, `src/lib/reviewTransition.test.ts` 6, `src/lib/reviewPool.test.ts` 4, `src/lib/grading.test.ts` 4 — `queue.test.ts`는 삭제되어 더 이상 목록에 없음).

- [ ] **Step 4: 브라우저로 수동 확인**

```bash
npm run dev
```

아직 손대지 않은 Day 범위로 `/review`에서 5문제 세션 시작. 문제마다 채점 없이 바로 "다음"으로 넘어가는지, 틀린 답을 입력해도 세션 중간에 다시 나오지 않는지(재출제 제거 확인) 확인. 마지막 문제에서 "채점하기" → 배치 채점 후 졸업/이월/취약 단어 요약과 단어별 O/X + 피드백이 한 번에 나오는지 확인. `/review`로 돌아가 상태 요약(맞은수/틀린수)이 갱신됐는지 확인. 서버 종료.

- [ ] **Step 5: 커밋**

```bash
git add src/app/review/ReviewQuizFlow.tsx
git rm src/components/AnswerForm.tsx src/lib/queue.ts src/lib/queue.test.ts
git commit -m "feat: rewrite ReviewQuizFlow for batch grading, remove in-session requeue"
```

---

## Task 7: 전체 플로우 E2E 스모크 확인

**Files:** 없음 (검증 전용).

**Interfaces:** Task 1~6에서 완성된 전체 배치 채점 플로우를 소비.

- [ ] **Step 1: dev 서버 실행**

```bash
npm run dev
```

- [ ] **Step 2: 자유 퀴즈 전체 플로우 (실제 채점)**

`/free`에서 Day 1~2, 문제 수 3으로 시작 → 3문제 모두 답변(정답/오답 섞어서) → 마지막에 "채점하기" → 결과 화면에 3개 O/X + 피드백 확인 → `/history`에서 이 세션이 3/N 형태로 기록됐는지 확인.

- [ ] **Step 3: 회독 모드 전체 플로우 (실제 채점)**

아직 손대지 않은 Day 범위(예: Day 20)로 `/review`에서 5문제 세션 시작 → 시작 전 상태(대기=30, 맞은수=0, 틀린수=0) 확인 → 5문제 모두 답변(1개 이상 오답 포함) → "채점하기" → 결과 화면에 졸업/이월/O-X 리스트 확인 → `/review`로 돌아가 틀린수가 오답 개수만큼 늘었는지 확인 → `/history/day-breakdown`에서 해당 Day 행이 갱신됐는지 확인.

- [ ] **Step 4: 서버 종료 + 전체 테스트 재확인**

```bash
npm run test
```

Expected: 5개 파일, 19개 테스트 전부 PASS.

- [ ] **Step 5: 발견된 버그가 있었다면 커밋 (없으면 생략)**

```bash
git add -A
git commit -m "test: verify batch-grading flows end to end"
```
