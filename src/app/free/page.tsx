import { listWordbooks } from '../actions/wordbooks';
import { FreeQuizFlow } from './FreeQuizFlow';

export default async function FreeQuizPage() {
  const wordbooks = await listWordbooks();
  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="mb-4 text-xl font-bold">자유 퀴즈</h1>
      <FreeQuizFlow wordbooks={wordbooks} />
    </main>
  );
}
