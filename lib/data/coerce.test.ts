import { test } from "node:test";
import assert from "node:assert/strict";

import { QC_COLUMNS, QC_COLUMN_NAMES, type ColumnSpec } from "./types.ts";
import { coerceValue, nullsLast } from "./coerce.ts";

/** Synthetic specs, so kinds and markers can be exercised without a real column. */
const INT_NA: ColumnSpec = { kind: "int", missing: ["NA"] };
const FLOAT_NA: ColumnSpec = { kind: "float", missing: ["NA"] };
const INT_EMPTY: ColumnSpec = { kind: "int", missing: [""] };
const DATE_MDY: ColumnSpec = { kind: "date", missing: ["NA"], format: "M/D/YY" };
const DATE_ISO: ColumnSpec = { kind: "date", missing: [""], format: "iso-datetime" };
const TEXT: ColumnSpec = { kind: "text", missing: [] };

test("the column map and the row type agree on 37 columns", () => {
  // Asserted as a specific number so an accidental addition or omission shows up
  // here rather than as a silently wider table.
  assert.equal(QC_COLUMN_NAMES.length, 37);
  assert.equal(Object.keys(QC_COLUMNS).length, 37);
});

test("integers sort numerically, not lexicographically (AE2)", () => {
  const coerced = ["5", "101", "10132"].map(
    (v) => coerceValue(v, INT_NA, "num_peaks") as number,
  );
  coerced.sort(nullsLast<number>("asc"));
  assert.deepEqual(coerced, [5, 101, 10132]);
});

test('a declared marker becomes null and "0" stays 0 — never conflated', () => {
  assert.equal(coerceValue("NA", INT_NA, "num_peaks_filt"), null);
  assert.equal(coerceValue("0", INT_NA, "num_peaks_filt"), 0);
  assert.equal(coerceValue("0", FLOAT_NA, "frip_filt"), 0);
  assert.equal(coerceValue("NA", FLOAT_NA, "max_peak_score"), null);
});

test("markers are per column: each spec accepts only what it declares", () => {
  // Declaring ["NA"] means an empty cell is still format drift, not absence.
  assert.equal(coerceValue("NA", INT_NA, "num_peaks"), null);
  assert.throws(() => coerceValue("", INT_NA, "num_peaks"), /num_peaks/);

  // And the inverse.
  assert.equal(coerceValue("", INT_EMPTY, "max_frags"), null);
  assert.throws(() => coerceValue("NA", INT_EMPTY, "max_frags"), /max_frags/);
});

test("a column may declare both markers, and accepts either", () => {
  // experiment_date and gdna_batch declare both: the retired mock export wrote
  // "NA" where the database writes "" for the same rows, and one spec served both
  // readers across the swap.
  const both: ColumnSpec = { kind: "date", missing: ["NA", ""], format: "M/D/YY" };
  assert.equal(coerceValue("NA", both, "experiment_date"), null);
  assert.equal(coerceValue("", both, "experiment_date"), null);
  assert.ok(coerceValue("5/7/25", both, "experiment_date") instanceof Date);

  assert.deepEqual([...QC_COLUMNS.experiment_date.missing], ["NA", ""]);
  assert.deepEqual([...QC_COLUMNS.gdna_batch.missing], ["NA", ""]);
});

test("M/D/YY parses to the right month and day", () => {
  const may7 = coerceValue("5/7/25", DATE_MDY, "experiment_date") as Date;
  assert.equal(may7.getFullYear(), 2025);
  assert.equal(may7.getMonth(), 4); // May, zero-indexed — not transposed to July
  assert.equal(may7.getDate(), 7);

  const dec18 = coerceValue("12/18/25", DATE_MDY, "experiment_date") as Date;
  assert.equal(dec18.getFullYear(), 2025);
  assert.equal(dec18.getMonth(), 11);
  assert.equal(dec18.getDate(), 18);
});

test("each date column accepts exactly one format and rejects the other", () => {
  // The guard narrows per column rather than loosening: experiment_date still
  // rejects ISO, and an ISO column rejects M/D/YY.
  assert.throws(() => coerceValue("2026-07-29T12:53:34", DATE_MDY, "experiment_date"), /experiment_date/);
  assert.throws(() => coerceValue("2025-05-07", DATE_MDY, "experiment_date"), /experiment_date/);

  const logged = coerceValue("2026-07-29T12:53:34", DATE_ISO, "run_date") as Date;
  assert.equal(logged.getFullYear(), 2026);
  assert.equal(logged.getMonth(), 6); // July
  assert.equal(logged.getDate(), 29);
  assert.throws(() => coerceValue("5/7/25", DATE_ISO, "run_date"), /run_date/);
});

test("nulls hold one terminal position in both sort directions (AE3)", () => {
  const raw = ["5/7/25", "NA", "12/18/25", "NA", "2/17/25"];
  const dates = raw.map((v) => coerceValue(v, DATE_MDY, "experiment_date") as Date | null);

  const asc = [...dates].sort(nullsLast<Date>("asc"));
  assert.deepEqual(
    asc.map((d) => (d === null ? "NULL" : d.getMonth() + 1)),
    [2, 5, 12, "NULL", "NULL"],
  );

  const desc = [...dates].sort(nullsLast<Date>("desc"));
  assert.deepEqual(
    desc.map((d) => (d === null ? "NULL" : d.getMonth() + 1)),
    [12, 5, 2, "NULL", "NULL"],
  );
});

test("gdna_batch is a date column despite its name", () => {
  assert.equal(QC_COLUMNS.gdna_batch.kind, "date");
  assert.equal(QC_COLUMNS.gdna_batch.format, "M/D/YY");
  const batch = coerceValue("12/3/25", QC_COLUMNS.gdna_batch, "gdna_batch") as Date;
  assert.ok(batch instanceof Date);
  assert.equal(batch.getMonth(), 11);
  assert.equal(batch.getDate(), 3);
});

test("floats are not clamped or truncated", () => {
  // frip is a percentage of mapped_reads, not a 0-1 fraction.
  assert.equal(coerceValue("14.25", FLOAT_NA, "frip"), 14.25);
  assert.equal(coerceValue("88.1", FLOAT_NA, "mapping_pct"), 88.1);
  assert.equal(coerceValue("0.29", FLOAT_NA, "frip"), 0.29);
});

test("an unparseable numeric value fails loudly, naming column and value", () => {
  assert.throws(
    () => coerceValue("not-a-number", INT_NA, "num_peaks"),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /num_peaks/);
      assert.match(err.message, /not-a-number/);
      return true;
    },
  );
  assert.throws(() => coerceValue("13/40/25", DATE_MDY, "experiment_date"), /experiment_date/);
  assert.throws(() => coerceValue("2/31/25", DATE_MDY, "experiment_date"), /experiment_date/);
});

test("an empty cell is an error where it is not a declared marker", () => {
  assert.throws(() => coerceValue("", INT_NA, "num_peaks"), /num_peaks/);
  assert.throws(() => coerceValue("", FLOAT_NA, "frip"), /frip/);
  assert.throws(() => coerceValue("", TEXT, "sample"), /sample/);
});

test("a non-string cell throws rather than passing through as null", () => {
  // SQLite can return a real NULL where the TSV could not represent one.
  for (const bad of [null, undefined, 42, {}]) {
    assert.throws(
      () => coerceValue(bad as unknown as string, TEXT, "sample"),
      /sample/,
      `expected a throw for ${String(bad)}`,
    );
  }
  assert.throws(() => coerceValue(null as unknown as string, INT_NA, "num_peaks"), /num_peaks/);
});

test("the error message names the markers the column actually accepts", () => {
  assert.throws(
    () => coerceValue("oops", INT_EMPTY, "max_frags"),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      // Must not claim "NA" is acceptable for a column that only accepts "".
      assert.doesNotMatch(err.message, /"NA"/);
      return true;
    },
  );
});

