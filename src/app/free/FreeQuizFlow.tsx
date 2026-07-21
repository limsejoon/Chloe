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
