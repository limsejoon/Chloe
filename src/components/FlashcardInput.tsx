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
        placeholder="뜻, 비슷한말, 설명, 영어 예문 등 자유롭게"
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
