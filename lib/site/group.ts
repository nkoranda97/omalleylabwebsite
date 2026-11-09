/**
 * Collecting a dated list into its years.
 *
 * Partitions rather than sorts: consecutive items sharing a year are collected under it, and
 * nothing is reordered. Its caller, the publications list, is maintained newest-first with a test
 * holding that order. An unsorted list would produce a year twice, which is that ordering guard's
 * job to catch rather than this function's to paper over.
 */
export function groupByYear<T extends { year: number }>(
  items: readonly T[],
): { year: number; items: T[] }[] {
  const groups: { year: number; items: T[] }[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last !== undefined && last.year === item.year) last.items.push(item);
    else groups.push({ year: item.year, items: [item] });
  }
  return groups;
}
