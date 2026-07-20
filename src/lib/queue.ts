export function requeueWrongAnswer<T>(
  queue: T[],
  currentIndex: number,
  item: T,
  rng: () => number = Math.random
): T[] {
  const remaining = queue.length - currentIndex - 1;

  // When remaining < 5, append to end. When remaining === 0 (last question),
  // this necessarily reinserts immediately next—no room to delay into.
  if (remaining < 5) {
    return [...queue, item];
  }

  const minOffset = 5;
  const maxOffset = Math.min(10, remaining);
  const offset = minOffset + Math.floor(rng() * (maxOffset - minOffset + 1));
  const insertAt = currentIndex + 1 + offset;

  const next = [...queue];
  next.splice(insertAt, 0, item);
  return next;
}
