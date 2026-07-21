import { listWordbooks } from '../actions/wordbooks';
import { ReviewQuizFlow } from './ReviewQuizFlow';

export default async function ReviewPage() {
  const wordbooks = await listWordbooks();
  return (
    <main className="mx-auto min-h-screen max-w-md p-8">
      <h1 className="mb-5 text-2xl font-extrabold tracking-tight text-text">회독 모드</h1>
      <ReviewQuizFlow wordbooks={wordbooks} />
    </main>
  );
}
