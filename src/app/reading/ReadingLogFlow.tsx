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
        <div className="text-lg font-extrabold text-primary">{title} — 독서록 완료</div>
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
