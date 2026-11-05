export type InfiniteScrollMetrics = {
  previousScrollTop: number;
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  threshold: number;
  loading: boolean;
  hasMore: boolean;
};

export function shouldLoadNextPage(metrics: InfiniteScrollMetrics): boolean {
  if (metrics.loading || !metrics.hasMore) return false;
  if (metrics.scrollTop <= metrics.previousScrollTop) return false;
  const remaining = metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight;
  return remaining <= Math.max(0, metrics.threshold);
}

export function mergeUniquePage<T>(
  current: readonly T[],
  incoming: readonly T[],
  keyOf: (item: T) => string,
): T[] {
  const keys = new Set(current.map(keyOf));
  const merged = [...current];
  incoming.forEach((item) => {
    const key = keyOf(item);
    if (keys.has(key)) return;
    keys.add(key);
    merged.push(item);
  });
  return merged;
}
