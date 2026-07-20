import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-sm flex-col gap-4 p-8">
      <h1 className="text-xl font-bold">영단어 퀴즈</h1>
      <Link href="/free" className="rounded border p-4 text-center hover:bg-gray-50">
        자유 퀴즈
      </Link>
      <Link href="/review" className="rounded border p-4 text-center hover:bg-gray-50">
        회독 모드
      </Link>
      <Link href="/history" className="rounded border p-4 text-center hover:bg-gray-50">
        기록
      </Link>
    </main>
  );
}
