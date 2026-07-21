import { listWordbooks } from '../../actions/wordbooks';
import { getDayBreakdown } from '../../actions/history';

export default async function DayBreakdownPage({
  searchParams,
}: {
  searchParams: Promise<{ wordbookId?: string }>;
}) {
  const wordbooks = await listWordbooks();
  const { wordbookId: wordbookIdParam } = await searchParams;
  const wordbookId = Number(wordbookIdParam ?? wordbooks[0]?.id ?? 0);
  const breakdown = wordbookId ? await getDayBreakdown(wordbookId) : [];

  return (
    <main className="mx-auto min-h-screen max-w-2xl p-8">
      <h1 className="mb-5 text-2xl font-extrabold tracking-tight text-text">Day별 현황</h1>
      <div className="mb-5 flex gap-2">
        {wordbooks.map((wb) => (
          <a
            key={wb.id}
            href={`/history/day-breakdown?wordbookId=${wb.id}`}
            className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
              wb.id === wordbookId ? 'bg-primary text-white' : 'bg-surface text-text-muted shadow-card hover:bg-primary-tint'
            }`}
          >
            {wb.name}
          </a>
        ))}
      </div>
      <div className="overflow-hidden rounded-2xl bg-surface shadow-card">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs font-bold uppercase tracking-wide text-text-faint">
              <th className="p-3">Day</th>
              <th className="p-3">맞은수</th>
              <th className="p-3">틀린수</th>
              <th className="p-3">대기</th>
            </tr>
          </thead>
          <tbody>
            {breakdown.map((d) => (
              <tr key={d.day} className="border-t border-border">
                <td className="p-3 font-semibold text-text">{d.day}</td>
                <td className="p-3 tabular-nums text-success">{d.correctCount}</td>
                <td className="p-3 tabular-nums text-error">{d.wrongCount}</td>
                <td className="p-3 tabular-nums text-text-muted">{d.pendingCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
