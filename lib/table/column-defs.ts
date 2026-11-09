/**
 * Column definitions for the browse table.
 *
 * Pure and JSX-free so it lives in a `.ts` file the test runner can import —
 * Node's type-stripping handles `.ts` but not the JSX in a `.tsx` component. That
 * matters here specifically: the properties below are the ones that keep absent
 * values terminal, and they are worth a regression guard.
 */

import type { ColumnDef } from "@tanstack/react-table";

import { compareCells, type CellValue } from "./ordering.ts";
import { formatValue } from "../display/format.ts";
import { isMotifColumn } from "../display/motif.ts";
import { filterFnFor, isFilterable } from "./filters.ts";
import { columnLabel } from "../display/labels.ts";

/**
 * The column whose cells link to a sample's detail page.
 *
 * `sample` doubles as the URL slug. Every value is distinct and matches
 * `[A-Za-z0-9_.-]+`, so it needs no encoding — a property the reader asserts on every
 * read rather than assumes.
 */
export const LINK_COLUMN = "sample";

/** A row as it reaches the table: dates already converted to ISO strings. */
export type QcTableRow = Record<string, CellValue>;

/**
 * Blank for absent, so a missing value never reads as 0, NaN, or a marker.
 *
 * Delegates to the display formatter so the table, the detail page, and search all
 * render a value the same way — they diverged once, and searching what was on screen
 * stopped working.
 */
export function formatCell(column: string, value: CellValue | undefined): string {
  return formatValue(column, value);
}

/**
 * One sortable, filterable column per name.
 *
 * The accessor maps `null` to `undefined` on purpose. TanStack negates a column's
 * comparator for a descending sort, so a comparator that puts absent values last
 * ascending puts them *first* descending — the scattering this milestone forbids,
 * and a bug that passed every comparator unit test because those never go through
 * the table. `sortUndefined: "last"` is applied before direction, so `undefined`
 * stays terminal either way and the comparator only ever sees real values, where
 * negation is exactly right.
 */
export function buildColumnDefs(columns: readonly string[]): ColumnDef<QcTableRow>[] {
  return columns.map((name) => ({
    id: name,
    accessorFn: (row: QcTableRow) => row[name] ?? undefined,
    header: columnLabel(name),
    // A motif column's cell is an image, rendered by the component — this module
    // stays JSX-free so `node --test` can import it. What it keeps is the ordering
    // and classification, which is what the regression guards are for.
    cell: (info) =>
      isMotifColumn(name)
        ? ""
        : formatCell(name, info.getValue() as CellValue | undefined),
    sortingFn: (a, b, columnId) =>
      compareCells(
        a.getValue(columnId) as CellValue,
        b.getValue(columnId) as CellValue,
        "asc",
      ),
    sortUndefined: "last",
    // Only declared columns get a filter, so TanStack cannot be asked to narrow by one
    // that has no values or a distinct value per row. See lib/table/filters.ts.
    enableColumnFilter: isFilterable(name),
    filterFn: filterFnFor(name),
  }));
}

/**
 * Which columns a query is matched against.
 *
 * Motif columns are excluded because their cell is a picture: there is no text the
 * reader could be looking at, and matching against the URL instead would make
 * "summits" hit all 100 rows with a motif. That is the same reasoning that keeps the
 * hidden file-path columns out — a query matching everything is worse than one
 * matching nothing.
 */
export function searchableColumns(
  columns: readonly string[],
  isVisible: (column: string) => boolean,
): readonly string[] {
  return columns.filter((column) => isVisible(column) && !isMotifColumn(column));
}
