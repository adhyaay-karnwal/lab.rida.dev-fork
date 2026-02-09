export function groupBy<T, K>(
  items: T[],
  keyFn: (item: T, index: number) => K
): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const [i, item] of items.entries()) {
    const key = keyFn(item, i);
    const existing = map.get(key) ?? [];
    existing.push(item);
    map.set(key, existing);
  }
  return map;
}
