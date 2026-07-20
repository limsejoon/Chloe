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
      <div className="flex flex-col gap-3">
        <select
          className="rounded border p-2"
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
            className="w-24 rounded border p-2"
            value={dayFrom}
            onChange={(e) => setDayFrom(Number(e.target.value))}
          />
          <span>~</span>
          <input
            type="number"
            className="w-24 rounded border p-2"
            value={dayTo}
            onChange={(e) => setDayTo(Number(e.target.value))}
          />
        </div>
        <input
          type="number"
          className="rounded border p-2"
          min={1}
          max={30}
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
        />
        <button className="rounded bg-blue-600 p-2 text-white" onClick={handleStart}>
          퀴즈 시작
        </button>
      </div>
    );
  }

  if (index >= session.words.length) {
    const correctCount = results.filter((r) => r.correct).length;
    return (
      <div className="flex flex-col gap-2">
        <div className="text-lg font-bold">
          {session.words.length}문제 중 {correctCount}개 정답
        </div>
        <ul className="flex flex-col gap-1">
          {results.map((r, i) => (
            <li key={i}>
              {r.word}: {r.correct ? 'O' : 'X'}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const current = session.words[index];
  return (
    <div className="flex flex-col gap-3">
      {notice && <div className="text-sm text-amber-600">{notice}</div>}
      <div className="text-sm text-gray-500">
        {index + 1} / {session.words.length}
      </div>
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
