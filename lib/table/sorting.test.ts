import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createTable,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
} from "@tanstack/table-core";

import { buildColumnDefs, type QcTableRow } from "./column-defs.ts";

/**
 * Sorting asserted *through* TanStack, not through the comparator alone.
 *
 * This file exists because of a specific escape. At M3 every comparator test in
 * ordering.test.ts passed while the live table put blank cells at the *top* of a
 * descending sort: TanStack negates a column's comparator for descending, and no test
 * went through TanStack to notice. The browser caught it; the suite could not.
 *
 * `@tanstack/table-core` is the framework-agnostic engine underneath
 * `useReactTable`, and it runs in plain Node with no DOM. So the negation, the
 * accessor's null-to-undefined mapping, and `sortUndefined` are all exercised here by
 * the same code the browser runs — which is what the definition-level assertions in
 * column-defs.test.ts could never do on their own.
 */

/** Sort rows the way the browse table does, by driving table-core directly. */
function sortedBy(
  rows: QcTableRow[],
  columns: readonly string[],
  sorting: SortingState,
): QcTableRow[] {
  const table = createTable<QcTableRow>({
    data: rows,
    columns: buildColumnDefs(columns),
    state: { sorting },
    onStateChange: () => {},
    renderFallbackValue: null,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });
  return table.getSortedRowModel().rows.map((row) => row.original);
}

/** Rows shaped like the browse table's, mixing samples with and without a motif. */
function motifRows(): QcTableRow[] {
  return [
    { sample: "with_a", summits_logo1: "motif" },
    { sample: "without_a", summits_logo1: null },
    { sample: "with_b", summits_logo1: "motif" },
    { sample: "without_b", summits_logo1: null },
    { sample: "with_c", summits_logo1: "motif" },
  ];
}

const samples = (rows: QcTableRow[]) => rows.map((row) => row.sample);

// --- the motif partition (AE1) ----------------------------------------------

test("samples without a motif stay terminal ascending AND descending (AE1)", () => {
  const columns = ["sample", "summits_logo1"];

  const asc = sortedBy(motifRows(), columns, [{ id: "summits_logo1", desc: false }]);
  const desc = sortedBy(motifRows(), columns, [{ id: "summits_logo1", desc: true }]);

  // The property, stated directly: absences occupy the same terminal slots in both
  // directions. This is the assertion that would have failed at M3.
  assert.deepEqual(samples(asc).slice(-2), ["without_a", "without_b"]);
  assert.deepEqual(samples(desc).slice(-2), ["without_a", "without_b"]);

  for (const rows of [asc, desc]) {
    const firstAbsent = rows.findIndex((row) => row.summits_logo1 === null);
    const lastPresent = rows.map((r) => r.summits_logo1).lastIndexOf("motif");
    assert.ok(lastPresent < firstAbsent, "a motif must never sort below an absence");
  }
});

test("the partition is stable: samples with a motif keep their relative order", () => {
  // The comparator compares availability only, so equal values must not be shuffled.
  // Otherwise toggling the column would scramble rows for no visible reason.
  const columns = ["sample", "summits_logo1"];
  const asc = sortedBy(motifRows(), columns, [{ id: "summits_logo1", desc: false }]);
  const desc = sortedBy(motifRows(), columns, [{ id: "summits_logo1", desc: true }]);

  assert.deepEqual(samples(asc).slice(0, 3), ["with_a", "with_b", "with_c"]);
  assert.deepEqual(samples(desc).slice(0, 3), ["with_a", "with_b", "with_c"]);
});

test("an all-motif-less column does not throw or drop rows", () => {
  const rows: QcTableRow[] = [
    { sample: "a", summits_logo1: null },
    { sample: "b", summits_logo1: null },
  ];
  const sorted = sortedBy(rows, ["sample", "summits_logo1"], [
    { id: "summits_logo1", desc: true },
  ]);
  assert.deepEqual(samples(sorted), ["a", "b"]);
});

// --- the same guard for the QC columns it was first needed for ----------------

test("numeric columns sort numerically through TanStack, blanks last both ways", () => {
  const rows: QcTableRow[] = [
    { sample: "a", num_peaks: 101 },
    { sample: "b", num_peaks: null },
    { sample: "c", num_peaks: 5 },
    { sample: "d", num_peaks: 10132 },
  ];
  const columns = ["sample", "num_peaks"];

  const asc = sortedBy(rows, columns, [{ id: "num_peaks", desc: false }]);
  const desc = sortedBy(rows, columns, [{ id: "num_peaks", desc: true }]);

  assert.deepEqual(
    asc.map((r) => r.num_peaks),
    [5, 101, 10132, null],
  );
  assert.deepEqual(
    desc.map((r) => r.num_peaks),
    [10132, 101, 5, null],
    "a lexicographic sort would lead with 101, and a negated comparator with null",
  );
});

test("date columns sort chronologically through TanStack", () => {
  const rows: QcTableRow[] = [
    { sample: "a", experiment_date: "2025-12-05" },
    { sample: "b", experiment_date: null },
    { sample: "c", experiment_date: "2025-02-17" },
  ];
  const asc = sortedBy(rows, ["sample", "experiment_date"], [
    { id: "experiment_date", desc: false },
  ]);
  assert.deepEqual(
    asc.map((r) => r.experiment_date),
    ["2025-02-17", "2025-12-05", null],
  );
});
