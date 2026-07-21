import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col gap-3 p-8">
      <h1 className="mb-2 text-2xl font-extrabold tracking-tight text-text">영단어 퀴즈</h1>
      <Link
        href="/free"
        className="flex items-center justify-between rounded-[20px] bg-primary px-5 py-4 font-semibold text-white shadow-card transition hover:bg-primary-dark"
      >
        <span>
          자유 퀴즈
          <span className="mt-0.5 block text-xs font-medium text-white/75">무작위로 바로 시작</span>
        </span>
        <span className="text-white/70">→</span>
      </Link>
      <Link
        href="/review"
        className="flex items-center justify-between rounded-[20px] bg-surface px-5 py-4 font-semibold text-text shadow-card transition hover:bg-primary-tint"
      >
        <span>
          회독 모드
          <span className="mt-0.5 block text-xs font-medium text-text-muted">틀린 단어만 반복 학습</span>
        </span>
        <span className="text-text-faint">→</span>
      </Link>
      <Link
        href="/history"
        className="flex items-center justify-between rounded-[20px] bg-surface px-5 py-4 font-semibold text-text shadow-card transition hover:bg-primary-tint"
      >
        <span>
          기록
          <span className="mt-0.5 block text-xs font-medium text-text-muted">지난 세션 · 취약 단어</span>
        </span>
        <span className="text-text-faint">→</span>
      </Link>
    </main>
  );
}
