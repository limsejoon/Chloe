import Link from 'next/link';
import { listWordbooks } from './actions/wordbooks';
import { ResetWordbookButton } from '@/components/ResetWordbookButton';

export default async function HomePage() {
  const wordbooks = await listWordbooks();

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col gap-3 p-8 md:max-w-md">
      <h1 className="mb-2 text-2xl font-extrabold tracking-tight text-text">영단어 퀴즈</h1>
      <Link
        href="/review"
        className="flex items-center justify-between rounded-[20px] bg-primary px-5 py-4 font-semibold text-white shadow-card transition hover:bg-primary-dark"
      >
        <span>
          단어 테스트
          <span className="mt-0.5 block text-xs font-medium text-white/75">틀린 단어만 반복 학습</span>
        </span>
        <span className="text-white/70">→</span>
      </Link>
      <Link
        href="/reading"
        className="flex items-center justify-between rounded-[20px] bg-surface px-5 py-4 font-semibold text-text shadow-card transition hover:bg-primary-tint"
      >
        <span>
          독서록
          <span className="mt-0.5 block text-xs font-medium text-text-muted">책 읽고 생각 정리하기</span>
        </span>
        <span className="text-text-faint">→</span>
      </Link>
      <Link
        href="/comprehension"
        className="flex items-center justify-between rounded-[20px] bg-bg px-5 py-4 font-semibold text-text-muted shadow-card transition hover:bg-primary-tint/40"
      >
        <span>
          영어독해
          <span className="mt-0.5 block text-xs font-medium text-text-faint">준비중</span>
        </span>
        <span className="text-text-faint">→</span>
      </Link>
      {wordbooks.length > 0 && (
        <details className="group mt-4 border-t border-border pt-4">
          <summary className="cursor-pointer list-none text-xs font-bold text-text-muted [&::-webkit-details-marker]:hidden">
            단어집 초기화 <span className="inline-block transition group-open:rotate-180">▾</span>
          </summary>
          <div className="mt-3 flex flex-wrap gap-3">
            {wordbooks.map((wb) => (
              <ResetWordbookButton key={wb.id} wordbookId={wb.id} wordbookName={wb.name} />
            ))}
          </div>
        </details>
      )}
    </main>
  );
}
