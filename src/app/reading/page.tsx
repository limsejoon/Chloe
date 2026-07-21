import { ReadingLogFlow } from './ReadingLogFlow';

export default function ReadingLogPage() {
  return (
    <main className="mx-auto min-h-screen max-w-xl p-8 md:max-w-2xl">
      <h1 className="mb-5 text-2xl font-extrabold tracking-tight text-text">독서록</h1>
      <ReadingLogFlow />
    </main>
  );
}
