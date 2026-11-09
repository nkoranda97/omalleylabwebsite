import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DETAIL_GROUPS,
  defaultVisibleColumns,
  groupColumns,
  TABLE_HIDDEN_BY_DEFAULT,
  type ColumnGroup,
} from "./column-groups.ts";
import { QC_COLUMN_NAMES } from "../data/types.ts";

test("the grouping covers every column in the row type exactly once", () => {
  // The point of the guard: adding a column to the spec must not silently omit it
  // from the detail page.
  assert.doesNotThrow(() => groupColumns(QC_COLUMN_NAMES));

  const grouped = DETAIL_GROUPS.flatMap((g) => g.columns);
  assert.equal(grouped.length, QC_COLUMN_NAMES.length);
  assert.deepEqual([...grouped].sort(), [...QC_COLUMN_NAMES].sort());
});

test("a column with no group fails loudly and names itself", () => {
  assert.throws(
    () => groupColumns([...QC_COLUMN_NAMES, "newly_added_by_pipeline"]),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /newly_added_by_pipeline/);
      assert.match(err.message, /would not be shown/);
      return true;
    },
  );
});

test("a column in two groups fails loudly", () => {
  const groups: ColumnGroup[] = [
    { title: "A", columns: ["sample", "frip"] },
    { title: "B", columns: ["frip"] },
  ];
  assert.throws(() => groupColumns(["sample", "frip"], groups), /more than one group/);
});

test("a grouped column that is not in the row type fails loudly", () => {
  const groups: ColumnGroup[] = [{ title: "A", columns: ["sample", "num_peaks_rmsk"] }];
  assert.throws(
    () => groupColumns(["sample"], groups),
    /not in the row type: num_peaks_rmsk/,
  );
});

test("sample leads the first group, so the page opens with what it is about", () => {
  assert.equal(DETAIL_GROUPS[0].columns[0], "sample");
});

test("the 16 file paths are one group, last", () => {
  const files = DETAIL_GROUPS[DETAIL_GROUPS.length - 1];
  assert.equal(files.title, "Files");
  assert.equal(files.columns.length, 16);
});

test("the empty-for-this-run columns are called out rather than mixed in", () => {
  // Otherwise a blank reads as a failed sample instead of a feature that was off.
  const group = DETAIL_GROUPS.find((g) => g.columns.includes("alignment_rate"));
  assert.ok(group);
  assert.ok(group.note, "the group needs a note explaining why it is empty");
  assert.deepEqual([...group.columns].sort(), ["alignment_rate", "subsampled_frags"]);
});

test("the hidden-by-default set is real columns, and leaves 18 visible", () => {
  for (const column of TABLE_HIDDEN_BY_DEFAULT) {
    assert.ok(
      QC_COLUMN_NAMES.includes(column as (typeof QC_COLUMN_NAMES)[number]),
      `${column} is hidden by default but is not in the row type`,
    );
  }
  assert.equal(TABLE_HIDDEN_BY_DEFAULT.length, 19);
  assert.equal(defaultVisibleColumns(QC_COLUMN_NAMES).length, 18);
});

test("nothing is hidden that the detail page does not also show", () => {
  // Hiding a column from the table is only acceptable because it is readable
  // elsewhere; otherwise the default would be deleting data from the UI.
  const onDetail = new Set(DETAIL_GROUPS.flatMap((g) => g.columns));
  for (const column of TABLE_HIDDEN_BY_DEFAULT) {
    assert.ok(onDetail.has(column), `${column} is hidden but absent from the detail page`);
  }
});

test("sample is never hidden — it is the row's identity and its link", () => {
  assert.ok(!TABLE_HIDDEN_BY_DEFAULT.includes("sample"));
  assert.equal(defaultVisibleColumns(QC_COLUMN_NAMES)[0], "sample");
});

test("visible and hidden together account for every column", () => {
  const visible = defaultVisibleColumns(QC_COLUMN_NAMES);
  assert.deepEqual(
    [...visible, ...TABLE_HIDDEN_BY_DEFAULT].sort(),
    [...QC_COLUMN_NAMES].sort(),
  );
});
