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
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="mb-4 text-xl font-bold">Day별 현황</h1>
      <div className="mb-4 flex gap-2">
        {wordbooks.map((wb) => (
          <a
            key={wb.id}
            href={`/history/day-breakdown?wordbookId=${wb.id}`}
            className={wb.id === wordbookId ? 'font-bold underline' : 'underline'}
          >
            {wb.name}
          </a>
        ))}
      </div>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="p-2">Day</th>
            <th className="p-2">맞은수</th>
            <th className="p-2">틀린수</th>
            <th className="p-2">대기</th>
          </tr>
        </thead>
        <tbody>
          {breakdown.map((d) => (
            <tr key={d.day} className="border-b">
              <td className="p-2">{d.day}</td>
              <td className="p-2">{d.correctCount}</td>
              <td className="p-2">{d.wrongCount}</td>
              <td className="p-2">{d.pendingCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
