'use client';

import { useState } from 'react';

export interface AnswerFormResult {
  correct: boolean;
  feedback: string;
  saveWarning?: string | null;
  note?: string;
}

export interface AnswerFormProps {
  word: string;
  onSubmit: (answer: string) => Promise<AnswerFormResult>;
  onNext: () => void;
}

export function AnswerForm({ word, onSubmit, onNext }: AnswerFormProps) {
  const [answer, setAnswer] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'done'>('idle');
  const [result, setResult] = useState<AnswerFormResult | null>(null);

  async function handleSubmit() {
    setStatus('loading');
    try {
      const graded = await onSubmit(answer);
      setResult(graded);
      setStatus('done');
    } catch {
      setStatus('error');
    }
  }

  function handleNext() {
    setAnswer('');
    setResult(null);
    setStatus('idle');
    onNext();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded border p-6 text-center text-2xl font-semibold">{word}</div>

      {status !== 'done' && (
        <>
          <input
            className="rounded border p-2"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="한글 뜻 또는 영어 예문"
            disabled={status === 'loading'}
          />
          <button
            className="rounded bg-blue-600 p-2 text-white disabled:opacity-50"
            onClick={handleSubmit}
            disabled={status === 'loading' || answer.trim().length === 0}
          >
            {status === 'loading' ? '채점 중...' : '제출'}
          </button>
          {status === 'error' && (
            <div className="text-red-600">
              채점 중 오류가 발생했습니다.{' '}
              <button className="underline" onClick={handleSubmit}>
                다시 채점하기
              </button>
            </div>
          )}
        </>
      )}

      {status === 'done' && result && (
        <div className={result.correct ? 'rounded bg-green-50 p-3' : 'rounded bg-red-50 p-3'}>
          <div className="font-bold">{result.correct ? '정답' : '오답'}</div>
          <div>{result.feedback}</div>
          {result.note && <div className="mt-1 text-sm text-gray-600">{result.note}</div>}
          {result.saveWarning && <div className="mt-1 text-sm text-amber-600">{result.saveWarning}</div>}
          <button className="mt-2 rounded bg-blue-600 p-2 text-white" onClick={handleNext}>
            다음 문제
          </button>
        </div>
      )}
    </div>
  );
}
