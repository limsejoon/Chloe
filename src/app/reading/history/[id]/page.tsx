import { getReadingLogDetail } from '../../../actions/readingLog';

export default async function ReadingLogDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const log = await getReadingLogDetail(Number(id));

  return (
    <main className="mx-auto min-h-screen max-w-2xl p-8">
      <h1 className="mb-1 text-2xl font-extrabold tracking-tight text-text">{log.title}</h1>
      <div className="mb-5 text-sm text-text-muted">
        {log.author} · {new Date(log.createdAt).toLocaleDateString()}
      </div>
      <ul className="flex flex-col gap-3">
        {log.items.map((item, i) => (
          <li key={i} className="rounded-2xl bg-surface p-4 shadow-card">
            <div className="text-sm font-bold text-text">{item.question}</div>
            <div className="mt-1.5 text-sm text-text-muted">내 답변: {item.answer}</div>
            <div className="mt-1.5 text-sm text-primary">{item.feedback}</div>
          </li>
        ))}
      </ul>
    </main>
  );
}
