'use client';

import { useState } from 'react';
import { startFreeQuiz, submitFreeAnswer, type FreeQuizWord } from '../actions/freeQuiz';
import type { WordbookOption } from '../actions/wordbooks';
import { AnswerForm } from '@/components/AnswerForm';

export function FreeQuizFlow({ wordbooks }: { wordbooks: WordbookOption[] }) {
  const [wordbookId, setWordbookId] = useState(wordbooks[0]?.id ?? 0);
  const [dayFrom, setDayFrom] = useState(1);
  const [dayTo, setDayTo] = useState(1);
  const [count, setCount] = useState(5);
  const [session, setSession] = useState<{ sessionId: string; words: FreeQuizWord[] } | null>(null);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<{ word: string; correct: boolean }[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleStart() {
    const res = await startFreeQuiz(wordbookId, dayFrom, dayTo, count);
    setSession({ sessionId: res.sessionId, words: res.words });
    setIndex(0);
    setResults([]);
    setNotice(
      res.words.length < count
        ? `해당 범위에 ${res.words.length}개 단어만 있어 ${res.words.length}문제로 진행합니다.`
        : null
    );
  }

  if (!session) {
    return (
      <div className="flex flex-col gap-3 rounded-[20px] bg-surface p-5 shadow-card">
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
        <input
          type="number"
          className="rounded-xl border-[1.5px] border-border bg-surface p-3 text-text focus:border-primary focus:outline-none"
          min={1}
          max={30}
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
        />
        <button
          className="rounded-full bg-primary p-3.5 font-bold text-white transition hover:bg-primary-dark"
          onClick={handleStart}
        >
          퀴즈 시작
        </button>
      </div>
    );
  }

  if (index >= session.words.length) {
    const correctCount = results.filter((r) => r.correct).length;
    return (
      <div className="flex flex-col gap-3 rounded-[20px] bg-surface p-5 shadow-card">
        <div className="text-lg font-extrabold text-primary">
          {session.words.length}문제 중 {correctCount}개 정답
        </div>
        <ul className="flex flex-col gap-2">
          {results.map((r, i) => (
            <li
              key={i}
              className="flex items-center justify-between rounded-2xl bg-bg px-4 py-2.5 text-sm font-medium text-text"
            >
              {r.word}
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white ${
                  r.correct ? 'bg-success' : 'bg-error'
                }`}
              >
                {r.correct ? 'O' : 'X'}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const current = session.words[index];
  return (
    <div className="flex flex-col gap-3">
      {notice && <div className="text-sm font-medium text-warning">{notice}</div>}
      <span className="w-fit rounded-full bg-primary-tint px-3 py-1 text-xs font-bold text-primary">
        {index + 1} / {session.words.length}
      </span>
      <AnswerForm
        key={current.id}
        word={current.word}
        onSubmit={async (answer) => {
          const result = await submitFreeAnswer(session.sessionId, current.id, current.word, answer);
          setResults((prev) => [...prev, { word: current.word, correct: result.correct }]);
          return result;
        }}
        onNext={() => setIndex((i) => i + 1)}
      />
    </div>
  );
}
