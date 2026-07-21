import { getSessionDetail } from '../../actions/history';

export default async function SessionDetailPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const items = await getSessionDetail(sessionId);

  return (
    <main className="mx-auto min-h-screen max-w-2xl p-8">
      <h1 className="mb-5 text-2xl font-extrabold tracking-tight text-text">세션 상세</h1>
      <ul className="flex flex-col gap-2">
        {items.map((item, i) => (
          <li
            key={i}
            className={`rounded-2xl p-4 ${item.isCorrect ? 'bg-success-bg' : 'bg-error-bg'}`}
          >
            <div className={`flex items-center gap-2 font-extrabold ${item.isCorrect ? 'text-success' : 'text-error'}`}>
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] text-white ${
                  item.isCorrect ? 'bg-success' : 'bg-error'
                }`}
              >
                {item.isCorrect ? 'O' : 'X'}
              </span>
              {item.word}
              {item.round && <span className="text-xs font-semibold text-text-muted">{item.round}회독</span>}
            </div>
            <div className="mt-1.5 text-sm text-text-muted">내 답변: {item.userAnswer}</div>
            <div className="text-sm text-text-muted">피드백: {item.feedback}</div>
          </li>
        ))}
      </ul>
    </main>
  );
}
