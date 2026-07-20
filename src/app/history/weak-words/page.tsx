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
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="mb-4 text-xl font-bold">취약 단어</h1>
      <div className="mb-4 flex gap-2">
        {wordbooks.map((wb) => (
          <a
            key={wb.id}
            href={`/history/weak-words?wordbookId=${wb.id}`}
            className={wb.id === wordbookId ? 'font-bold underline' : 'underline'}
          >
            {wb.name}
          </a>
        ))}
      </div>
      <ul className="flex flex-col gap-2">
        {weakWords.map((w, i) => (
          <li key={i} className="rounded border p-3">
            <span className="font-semibold">{w.word}</span> (Day {w.day}) — 틀린 회독: {w.wrongRounds.join(', ')}{' '}
            {w.retired ? '(현재 졸업)' : ''}
          </li>
        ))}
      </ul>
      {weakWords.length === 0 && <div className="text-gray-500">아직 취약 단어가 없습니다.</div>}
    </main>
  );
}
