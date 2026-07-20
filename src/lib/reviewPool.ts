export interface ReviewPoolEntry {
  wordId: number;
  round: number;
  retired: boolean;
}

export function selectReviewPool<T extends ReviewPoolEntry>(entries: T[]): T[] {
  const eligible = entries.filter((e) => !e.retired);
  if (eligible.length === 0) return [];

  const minRound = Math.min(...eligible.map((e) => e.round));
  return eligible.filter((e) => e.round === minRound);
}
