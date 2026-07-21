import Link from 'next/link';
import { listWordbooks } from '../actions/wordbooks';
import { ReviewQuizFlow } from './ReviewQuizFlow';

export default async function ReviewPage() {
  const wordbooks = await listWordbooks();
  return (
    <main className="mx-auto min-h-screen max-w-md p-8 md:max-w-lg">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold tracking-tight text-text">영단어 테스트</h1>
        <Link href="/history" className="text-xs font-semibold text-text-muted underline">
          기록 보기
        </Link>
      </div>
      <ReviewQuizFlow wordbooks={wordbooks} />
    </main>
  );
}
