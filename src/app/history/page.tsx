import Link from 'next/link';
import { listSessions } from '../actions/history';

export default async function HistoryPage() {
  const sessions = await listSessions();
  return (
    <main className="mx-auto min-h-screen max-w-2xl p-8">
      <h1 className="mb-5 text-2xl font-extrabold tracking-tight text-text">기록</h1>
      <div className="mb-5 flex gap-2">
        <Link
          href="/history/weak-words"
          className="rounded-full bg-warning-bg px-3 py-1.5 text-xs font-bold text-warning transition hover:opacity-80"
        >
          취약 단어
        </Link>
        <Link
          href="/history/day-breakdown"
          className="rounded-full bg-primary-tint px-3 py-1.5 text-xs font-bold text-primary transition hover:opacity-80"
        >
          Day별 현황
        </Link>
      </div>
      <ul className="flex flex-col gap-2">
        {sessions.map((s) => (
          <li key={s.sessionId} className="rounded-2xl bg-surface p-4 shadow-card transition hover:bg-primary-tint/40">
            <Link href={`/history/${s.sessionId}`} className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-text">
                {s.wordbookName} Day{s.dayFrom}~{s.dayTo}
                <span className="mt-0.5 block text-xs font-medium text-text-muted">
                  {new Date(s.startedAt).toLocaleString()}
                </span>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                    s.mode === 'free' ? 'bg-primary-tint text-primary' : 'bg-accent-tint text-accent'
                  }`}
                >
                  {s.mode === 'free' ? '자유 퀴즈' : '영단어 테스트'}
                </span>
                <span className="font-extrabold tabular-nums text-primary">
                  {s.correctCount}/{s.total}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
