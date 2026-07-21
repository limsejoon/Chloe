import { listWordbooks } from '../actions/wordbooks';
import { FreeQuizFlow } from './FreeQuizFlow';

export default async function FreeQuizPage() {
  const wordbooks = await listWordbooks();
  return (
    <main className="mx-auto min-h-screen max-w-md p-8">
      <h1 className="mb-5 text-2xl font-extrabold tracking-tight text-text">자유 퀴즈</h1>
      <FreeQuizFlow wordbooks={wordbooks} />
    </main>
  );
}
