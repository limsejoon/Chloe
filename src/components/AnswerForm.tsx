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
      <div className="rounded-[20px] bg-surface p-10 text-center text-3xl font-extrabold tracking-tight text-text shadow-card">
        {word}
      </div>

      {status !== 'done' && (
        <>
          <input
            className="rounded-xl border-[1.5px] border-border bg-surface p-3.5 text-text placeholder:text-text-faint focus:border-primary focus:outline-none"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="한글 뜻 또는 영어 예문"
            disabled={status === 'loading'}
          />
          <button
            className="rounded-full bg-primary p-3.5 font-bold text-white transition hover:bg-primary-dark disabled:bg-border disabled:text-text-faint"
            onClick={handleSubmit}
            disabled={status === 'loading' || answer.trim().length === 0}
          >
            {status === 'loading' ? '채점 중...' : '제출'}
          </button>
          {status === 'error' && (
            <div className="text-error">
              채점 중 오류가 발생했습니다.{' '}
              <button className="underline" onClick={handleSubmit}>
                다시 채점하기
              </button>
            </div>
          )}
        </>
      )}

      {status === 'done' && result && (
        <div className={`rounded-2xl p-4 ${result.correct ? 'bg-success-bg' : 'bg-error-bg'}`}>
          <div className={`flex items-center gap-2 font-extrabold ${result.correct ? 'text-success' : 'text-error'}`}>
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-sm text-white ${
                result.correct ? 'bg-success' : 'bg-error'
              }`}
            >
              {result.correct ? 'O' : 'X'}
            </span>
            {result.correct ? '정답' : '오답'}
          </div>
          <div className="mt-1.5 text-sm leading-relaxed text-text-muted">{result.feedback}</div>
          {result.note && <div className="mt-1 text-sm text-text-muted">{result.note}</div>}
          {result.saveWarning && <div className="mt-1 text-sm text-warning">{result.saveWarning}</div>}
          <button
            className="mt-3 rounded-full bg-primary px-4 py-2.5 font-bold text-white transition hover:bg-primary-dark"
            onClick={handleNext}
          >
            다음 문제
          </button>
        </div>
      )}
    </div>
  );
}
