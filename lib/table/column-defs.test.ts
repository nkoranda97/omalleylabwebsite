import { test } from "node:test";
import assert from "node:assert/strict";

import type { AccessorFn } from "@tanstack/table-core";

import { buildColumnDefs, searchableColumns, type QcTableRow } from "./column-defs.ts";
import { MOTIF_IMAGES } from "../data/motif-images.ts";
import { QC_COLUMN_NAMES } from "../data/types.ts";
import {
  TABLE_HIDDEN_BY_DEFAULT,
  defaultVisibleColumns,
  tableColumnOrder,
} from "../display/column-groups.ts";

/**
 * These pin the two properties that keep absent values terminal *through* TanStack.
 *
 * The comparator tests in ordering.test.ts all passed while the table put blanks
 * first on a descending sort, because TanStack negates a column's comparator and
 * those tests never went through it. Asserting the column definitions is the
 * cheapest guard available without a DOM.
 */

test("every column defers missing-value placement to TanStack, not the comparator", () => {
  for (const def of buildColumnDefs(["num_peaks", "experiment_date", "control"])) {
    assert.equal(
      def.sortUndefined,
      "last",
      `${def.id} must place absent values last before direction is applied`,
    );
  }
});

test("the accessor converts null to undefined so sortUndefined can see it", () => {
  // sortUndefined only recognises `undefined`. A null would fall through to the
  // comparator and get negated on a descending sort.
  const [def] = buildColumnDefs(["experiment_date"]);
  // ColumnDef is a union; only the accessor-fn arm carries accessorFn, and TanStack
  // passes (row, index).
  const accessor = (def as { accessorFn: (row: QcTableRow, index: number) => unknown })
    .accessorFn;

  assert.equal(accessor({ experiment_date: null }, 0), undefined);
  assert.equal(accessor({ experiment_date: "2025-05-07" }, 0), "2025-05-07");
  assert.equal(accessor({ experiment_date: 0 }, 0), 0, "a genuine 0 must survive");
});

test("a column is generated for every name, in order", () => {
  const names = ["sample", "num_peaks", "frip"];
  assert.deepEqual(
    buildColumnDefs(names).map((d) => d.id),
    names,
  );
});

// --- motif columns ----------------------------------------------------------

test("a motif column defers absence placement exactly like a QC column", () => {
  // The partition the reader gets — all samples with a motif above all without —
  // comes from the same mechanism that keeps missing QC values terminal, not from a
  // second rule that could disagree with the first.
  for (const def of buildColumnDefs([...MOTIF_IMAGES])) {
    assert.equal(def.sortUndefined, "last", `${def.id}`);
  }
});

test("a motif accessor maps a present marker through and an absence to undefined", () => {
  const [logo] = buildColumnDefs(["summits_logo1"]);
  const accessor = (logo as { accessorFn: AccessorFn<QcTableRow> }).accessorFn;

  assert.equal(accessor({ summits_logo1: "motif" }, 0), "motif");
  assert.equal(accessor({ summits_logo1: null }, 0), undefined);
});

test("a motif cell renders no text, because the component draws the image", () => {
  // column-defs.ts stays JSX-free so node --test can import it. If a motif cell ever
  // starts returning a string, that string would appear beside the logo.
  const [logo] = buildColumnDefs(["summits_logo1"]);
  const cell = logo.cell as (info: { getValue: () => unknown }) => unknown;
  assert.equal(cell({ getValue: () => "motif" }), "");
});

test("motif columns are excluded from search, hidden ones too", () => {
  const columns = ["sample", "num_peaks", "bam", ...MOTIF_IMAGES];
  const visible = (c: string) => c !== "bam";

  assert.deepEqual(searchableColumns(columns, visible), ["sample", "num_peaks"]);
  assert.deepEqual(
    searchableColumns(columns, () => true),
    ["sample", "num_peaks", "bam"],
    "a visible path column is searchable; a visible logo is not",
  );
});

test("the motif columns sit immediately after motif_peaks", () => {
  const spec = ["sample", "num_peaks", "motif_peaks", "bam"];
  assert.deepEqual(tableColumnOrder(spec, MOTIF_IMAGES), [
    "sample",
    "num_peaks",
    "motif_peaks",
    "summits_logo1",
    "summits_logo_rc1",
    "bam",
  ]);
});

test("the table order holds every column exactly once", () => {
  const order = tableColumnOrder(QC_COLUMN_NAMES, MOTIF_IMAGES);
  assert.equal(order.length, QC_COLUMN_NAMES.length + MOTIF_IMAGES.length);
  assert.equal(new Set(order).size, order.length, "no duplicates");
  for (const column of [...QC_COLUMN_NAMES, ...MOTIF_IMAGES]) {
    assert.ok(order.includes(column), `${column} would not be shown`);
  }
});

test("an ordering that would drop or duplicate a column throws", () => {
  assert.throws(
    () => tableColumnOrder(["sample", "num_peaks"], MOTIF_IMAGES),
    /no "motif_peaks" column/,
  );
  assert.throws(
    () => tableColumnOrder(["sample", "motif_peaks", "summits_logo1"], MOTIF_IMAGES),
    /collide/,
  );
});

test("both motif columns are visible by default", () => {
  // The reader asked for these on the table, so they are not among the 19 the
  // Columns control has to reveal.
  const order = tableColumnOrder(QC_COLUMN_NAMES, MOTIF_IMAGES);
  const visible = defaultVisibleColumns(order);

  for (const image of MOTIF_IMAGES) {
    assert.ok(visible.includes(image), `${image} should show without being asked for`);
    assert.ok(!TABLE_HIDDEN_BY_DEFAULT.includes(image));
  }
  assert.equal(visible.length, 20, "18 QC columns plus the two logos");
});
