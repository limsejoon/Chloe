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
            className="field-input"
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
          <div className="flex items-center gap-1 rounded-xl border border-border bg-bg p-1 transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary-tint">
            <input
              type="number"
              className="min-w-0 flex-1 rounded-lg bg-transparent p-2 text-center text-text outline-none [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              value={dayFrom}
              onChange={(e) => setDayFrom(Number(e.target.value))}
            />
            <span className="text-sm font-semibold text-text-faint">~</span>
            <input
              type="number"
              className="min-w-0 flex-1 rounded-lg bg-transparent p-2 text-center text-text outline-none [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              value={dayTo}
              onChange={(e) => setDayTo(Number(e.target.value))}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold text-text-muted">테스트할 문제 수</label>
          <input
            type="number"
            className="field-input"
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
          테스트 시작
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
