import { listWordbooks } from '../../actions/wordbooks';
import { listWeakWords } from '../../actions/history';

export default async function WeakWordsPage({
  searchParams,
}: {
  searchParams: Promise<{ wordbookId?: string }>;
}) {
  const wordbooks = await listWordbooks();
  const { wordbookId: wordbookIdParam } = await searchParams;
  const wordbookId = Number(wordbookIdParam ?? wordbooks[0]?.id ?? 0);
  const weakWords = wordbookId ? await listWeakWords(wordbookId) : [];

  return (
    <main className="mx-auto min-h-screen max-w-2xl p-8">
      <h1 className="mb-5 text-2xl font-extrabold tracking-tight text-text">취약 단어</h1>
      <div className="mb-5 flex gap-2">
        {wordbooks.map((wb) => (
          <a
            key={wb.id}
            href={`/history/weak-words?wordbookId=${wb.id}`}
            className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
              wb.id === wordbookId ? 'bg-primary text-white' : 'bg-surface text-text-muted shadow-card hover:bg-primary-tint'
            }`}
          >
            {wb.name}
          </a>
        ))}
      </div>
      <ul className="flex flex-col gap-2">
        {weakWords.map((w, i) => (
          <li key={i} className="flex items-center justify-between gap-3 rounded-2xl bg-surface p-4 shadow-card">
            <div className="text-sm">
              <span className="font-bold text-text">{w.word}</span>
              <span className="ml-1.5 text-xs text-text-faint">Day {w.day}</span>
              <span className="mt-0.5 block text-xs text-text-muted">틀린 회독: {w.wrongRounds.join(', ')}</span>
            </div>
            {w.retired ? (
              <span className="shrink-0 rounded-full bg-success-bg px-2.5 py-1 text-[11px] font-bold text-success">
                현재 졸업
              </span>
            ) : (
              <span className="shrink-0 rounded-full bg-warning-bg px-2.5 py-1 text-[11px] font-bold text-warning">
                ⚠ 취약
              </span>
            )}
          </li>
        ))}
      </ul>
      {weakWords.length === 0 && (
        <div className="rounded-2xl bg-surface p-4 text-sm text-text-muted shadow-card">아직 취약 단어가 없습니다.</div>
      )}
    </main>
  );
}
