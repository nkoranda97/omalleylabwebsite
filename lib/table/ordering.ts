/**
 * Ordering and filtering for the browse table.
 *
 * Pure functions, deliberately separated from the React component so the claims
 * this milestone actually makes — numeric columns sort numerically, dates
 * chronologically, missing values hold one position in every ordering — are
 * testable without a DOM. The component wiring is verified by looking at it.
 */

import { nullsLast, type SortDirection } from "../data/coerce.ts";

/** A cell as it reaches the table: dates already converted to ISO strings. */
export type CellValue = string | number | null;

/**
 * Compare two cells of one column, missing values last in either direction.
 *
 * Reuses the seam's comparator rather than re-deciding where absent values land —
 * the ordering rule belongs to the data layer, and having a second one here is how
 * the two drift apart.
 *
 * Values within a column are all numbers or all strings, because each column has one
 * declared kind, so dispatching on the runtime type is safe. Numbers must not be
 * compared as strings: that is the lexicographic bug this milestone exists to avoid,
 * where 101 sorts before 5 because "1" precedes "5".
 */
export function compareCells(
  a: CellValue,
  b: CellValue,
  direction: SortDirection = "asc",
): number {
  return nullsLast<string | number>(direction)(a, b);
}

/**
 * Does any cell in this row contain the query?
 *
 * Case-insensitive substring across every column, matched against the value **as
 * displayed** — a reader searching "14.25" is looking at the screen, not at the raw
 * 14.245639639683342 behind it. Comparing raw values instead is a quiet way to make
 * search miss things the reader can plainly see.
 *
 * Missing values match nothing rather than matching the empty string, which would
 * make every blank cell a hit on every query.
 *
 * Only visible columns are searched: hiding a column should stop it contributing
 * matches, or a query narrows to rows whose reason for matching is off screen.
 */
export function rowMatches(
  row: Record<string, CellValue>,
  query: string,
  format: (column: string, value: CellValue) => string,
  columns?: readonly string[],
): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === "") return true;

  const searchable = columns ?? Object.keys(row);
  return searchable.some((column) => {
    const value = row[column];
    if (value === null || value === undefined) return false;
    return format(column, value).toLowerCase().includes(needle);
  });
}

/**
 * Sort a copy of the rows by one column.
 *
 * Returns a new array; the seam hands out frozen rows and a frozen collection, and
 * sorting in place would throw on the array and corrupt shared state if it did not.
 */
export function sortRows<T extends Record<string, CellValue>>(
  rows: readonly T[],
  column: string,
  direction: SortDirection,
): T[] {
  return [...rows].sort((a, b) => compareCells(a[column], b[column], direction));
}
