import { readFileSync } from 'fs';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/client';
import { wordbooks, words } from '../src/db/schema';

export function parseWordFile(content: string): { day: number; word: string }[] {
  const lines = content.split(/\r?\n/);
  const result: { day: number; word: string }[] = [];
  let currentDay = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.length === 0) continue;

    const dayMatch = line.match(/^\[day(\d+)\]$/i);
    if (dayMatch) {
      currentDay = Number(dayMatch[1]);
      continue;
    }

    const wordMatch = line.match(/^\d+\.\s+(.+)$/);
    if (wordMatch && currentDay > 0) {
      result.push({ day: currentDay, word: wordMatch[1].trim() });
    }
  }

  return result;
}

async function main() {
  const [, , filePath, wordbookName] = process.argv;
  if (!filePath || !wordbookName) {
    console.error('Usage: npm run seed -- <file-path> <wordbook-name>');
    process.exit(1);
  }

  const content = readFileSync(filePath, 'utf-8');
  const entries = parseWordFile(content);
  if (entries.length === 0) {
    console.error('No words parsed from file.');
    process.exit(1);
  }

  const [existing] = await db.select().from(wordbooks).where(eq(wordbooks.name, wordbookName));
  const wordbookId = existing
    ? existing.id
    : (await db.insert(wordbooks).values({ name: wordbookName }).returning({ id: wordbooks.id }))[0].id;

  await db
    .insert(words)
    .values(entries.map((e) => ({ wordbookId, day: e.day, word: e.word })))
    .onConflictDoNothing();

  console.log(`Seeded ${entries.length} words into wordbook "${wordbookName}" (id=${wordbookId}).`);
}

if (require.main === module) {
  main().then(() => process.exit(0));
}
