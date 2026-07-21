'use client';

import { useEffect, useState } from 'react';
import { getReviewStatus, startReviewSession, submitReviewAnswer, type ReviewWord, type ReviewStatus } from '../actions/reviewQuiz';
import type { WordbookOption } from '../actions/wordbooks';
import { requeueWrongAnswer } from '@/lib/queue';
import { AnswerForm } from '@/components/AnswerForm';

export function ReviewQuizFlow({ wordbooks }: { wordbooks: WordbookOption[] }) {
  const [wordbookId, setWordbookId] = useState(wordbooks[0]?.id ?? 0);
  const [dayFrom, setDayFrom] = useState(1);
  const [dayTo, setDayTo] = useState(1);
  const [count, setCount] = useState(5);
  const [status, setStatus] = useState<ReviewStatus | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [queue, setQueue] = useState<ReviewWord[] | null>(null);
  const [index, setIndex] = useState(0);
  const [graduated, setGraduated] = useState(0);
  const [carried, setCarried] = useState(0);
  const [answerCount, setAnswerCount] = useState(0);
  const [correctAnswerCount, setCorrectAnswerCount] = useState(0);
  const [weakWords, setWeakWords] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [finalStatus, setFinalStatus] = useState<ReviewStatus | null>(null);

  useEffect(() => {
    if (wordbookId) {
      getReviewStatus(wordbookId, dayFrom, dayTo).then(setStatus);
    }
  }, [wordbookId, dayFrom, dayTo]);

  useEffect(() => {
    if (queue && index >= queue.length) {
      getReviewStatus(wordbookId, dayFrom, dayTo).then(setFinalStatus);
    }
  }, [queue, index, wordbookId, dayFrom, dayTo]);

  async function handleStart() {
    const res = await startReviewSession(wordbookId, dayFrom, dayTo, count);
    if (res.words.length === 0) {
      setNotice('이 범위는 모두 완료했습니다.');
      return;
    }
    setSessionId(res.sessionId);
    setQueue(res.words);
    setIndex(0);
    setGraduated(0);
    setCarried(0);
    setAnswerCount(0);
    setCorrectAnswerCount(0);
    setWeakWords([]);
    setFinalStatus(null);
    setNotice(
      res.words.length < count
        ? `대기 중인 단어가 ${res.words.length}개뿐이라 ${res.words.length}문제로 진행합니다.`
        : null
    );
  }

  if (!sessionId || !queue) {
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
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
        />
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

  if (index >= queue.length) {
    return (
      <div className="flex flex-col gap-3 rounded-[20px] bg-surface p-5 shadow-card">
        <div className="text-lg font-extrabold text-primary">
          이번 세션 {answerCount}번 답변 중 {correctAnswerCount}번 정답
        </div>
        <div className="flex gap-2">
          <span className="rounded-full bg-success-bg px-3 py-1 text-xs font-bold text-success">
            졸업한 단어 {graduated}개
          </span>
          <span className="rounded-full bg-primary-tint px-3 py-1 text-xs font-bold text-primary">
            다음 회독 이월 {carried}개
          </span>
        </div>
        {weakWords.length > 0 && (
          <div className="rounded-2xl bg-warning-bg p-3">
            <div className="text-xs font-bold text-warning">⚠ 취약 단어</div>
            <div className="mt-0.5 text-sm text-text">{weakWords.join(', ')}</div>
          </div>
        )}
        {finalStatus && (
          <div className="rounded-2xl bg-bg px-4 py-3 text-sm font-medium text-text-muted">
            전체 단어수 {finalStatus.total}, 맞은수 {finalStatus.correctCount}, 틀린수 {finalStatus.wrongCount}, 대기{' '}
            {finalStatus.pendingCount}
          </div>
        )}
      </div>
    );
  }

  const current = queue[index];
  return (
    <div className="flex flex-col gap-3">
      {notice && <div className="text-sm font-medium text-warning">{notice}</div>}
      <span className="w-fit rounded-full bg-primary-tint px-3 py-1 text-xs font-bold text-primary">
        {current.round}회독 · 이번 세션 {index + 1} / {queue.length}
      </span>
      <AnswerForm
        key={`${current.id}-${index}`}
        word={current.word}
        onSubmit={async (answer) => {
          const result = await submitReviewAnswer(sessionId, current.id, current.word, answer);
          setAnswerCount((n) => n + 1);
          if (result.correct) {
            setCorrectAnswerCount((n) => n + 1);
            if (result.retired) {
              setGraduated((g) => g + 1);
            } else {
              setCarried((c) => c + 1);
            }
            if (result.justBecameWeak) {
              setWeakWords((w) => [...w, current.word]);
            }
            return result;
          }

          setQueue((q) => (q ? requeueWrongAnswer(q, index, current) : q));
          return { ...result, note: `${current.round + 1}회독으로 이월 예정입니다.` };
        }}
        onNext={() => setIndex((i) => i + 1)}
      />
    </div>
  );
}
