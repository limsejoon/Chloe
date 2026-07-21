import Link from 'next/link';
import { listReadingLogs } from '../../actions/readingLog';

export default async function ReadingLogHistoryPage() {
  const logs = await listReadingLogs();

  return (
    <main className="mx-auto min-h-screen max-w-2xl p-8">
      <h1 className="mb-5 text-2xl font-extrabold tracking-tight text-text">독서록 기록</h1>
      <ul className="flex flex-col gap-2">
        {logs.map((log) => (
          <li key={log.id} className="rounded-2xl bg-surface p-4 shadow-card transition hover:bg-primary-tint/40">
            <Link href={`/reading/history/${log.id}`} className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-text">
                {log.title}
                <span className="mt-0.5 block text-xs font-medium text-text-muted">{log.author}</span>
              </div>
              <span className="shrink-0 text-xs text-text-faint">{new Date(log.createdAt).toLocaleDateString()}</span>
            </Link>
          </li>
        ))}
      </ul>
      {logs.length === 0 && (
        <div className="rounded-2xl bg-surface p-4 text-sm text-text-muted shadow-card">아직 작성한 독서록이 없습니다.</div>
      )}
    </main>
  );
}
