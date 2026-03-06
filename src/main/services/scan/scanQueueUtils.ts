import path from "node:path";

export function enqueueUniquePath(
  queue: string[],
  queued: Set<string>,
  target: string,
): void {
  if (queued.has(target)) {
    return;
  }

  queued.add(target);
  queue.push(target);
}

export function popPriorityDirectory(
  queue: string[],
  sampleSize: number,
  score: (candidate: string) => number,
): string | undefined {
  if (queue.length === 0) {
    return undefined;
  }

  const maxInspect = Math.min(sampleSize, queue.length);
  let bestIndex = 0;
  let bestScore = score(queue[0]);

  for (let index = 1; index < maxInspect; index += 1) {
    const currentScore = score(queue[index]);
    if (currentScore > bestScore) {
      bestScore = currentScore;
      bestIndex = index;
    }
  }

  const [selected] = queue.splice(bestIndex, 1);
  return selected;
}

export function normalizeIncrementalTarget(changedPath: string): string | null {
  if (!changedPath || typeof changedPath !== "string") {
    return null;
  }

  const resolved = path.resolve(changedPath);
  return path.extname(resolved) ? path.dirname(resolved) : resolved;
}
