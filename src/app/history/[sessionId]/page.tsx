import { getSessionDetail } from '../../actions/history';

export default async function SessionDetailPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const items = await getSessionDetail(sessionId);

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="mb-4 text-xl font-bold">세션 상세</h1>
      <ul className="flex flex-col gap-2">
        {items.map((item, i) => (
          <li key={i} className="rounded border p-3">
            <div className="font-semibold">
              {item.word} {item.round ? `(${item.round}회독)` : ''} — {item.isCorrect ? 'O' : 'X'}
            </div>
            <div>내 답변: {item.userAnswer}</div>
            <div>피드백: {item.feedback}</div>
          </li>
        ))}
      </ul>
    </main>
  );
}
