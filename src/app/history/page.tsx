import Link from 'next/link';
import { listSessions } from '../actions/history';

export default async function HistoryPage() {
  const sessions = await listSessions();
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="mb-4 text-xl font-bold">기록</h1>
      <div className="mb-4 flex gap-4">
        <Link href="/history/weak-words" className="underline">
          취약 단어
        </Link>
        <Link href="/history/day-breakdown" className="underline">
          Day별 현황
        </Link>
      </div>
      <ul className="flex flex-col gap-2">
        {sessions.map((s) => (
          <li key={s.sessionId} className="rounded border p-3">
            <Link href={`/history/${s.sessionId}`}>
              {new Date(s.startedAt).toLocaleString()} · {s.mode === 'free' ? '자유 퀴즈' : '회독 모드'} ·{' '}
              {s.wordbookName} Day{s.dayFrom}~{s.dayTo} · {s.correctCount}/{s.total}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
