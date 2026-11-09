import { test } from "node:test";
import assert from "node:assert/strict";

import { compareCells, rowMatches, sortRows, type CellValue } from "./ordering.ts";
import { formatValue } from "../display/format.ts";

/** Search as the table does: against formatted text. */
const matches = (row: Record<string, CellValue>, q: string, cols?: readonly string[]) =>
  rowMatches(row, q, formatValue, cols);

/** Rows shaped like the table's, with only the columns each test cares about. */
function rows(...cells: Record<string, CellValue>[]): Record<string, CellValue>[] {
  return cells;
}

// --- numeric ordering: the lexicographic trap this rung exists to avoid ------

test("numeric columns sort numerically, not lexicographically (AE2)", () => {
  // The acceptance example: 5, 101, 10132 must not come back 101, 10132, 5.
  const sorted = sortRows(
    rows({ num_peaks: 101 }, { num_peaks: 5 }, { num_peaks: 10132 }),
    "num_peaks",
    "asc",
  );
  assert.deepEqual(
    sorted.map((r) => r.num_peaks),
    [5, 101, 10132],
  );
});

test("descending reverses the values but not the missing ones", () => {
  const sorted = sortRows(
    rows({ n: 101 }, { n: null }, { n: 5 }, { n: 10132 }),
    "n",
    "desc",
  );
  assert.deepEqual(
    sorted.map((r) => r.n),
    [10132, 101, 5, null],
  );
});

test("a float column orders by value, not by digit string", () => {
  const sorted = sortRows(
    rows({ frip: 14.25 }, { frip: 0.34 }, { frip: 2.77 }, { frip: 0.3 }),
    "frip",
    "asc",
  );
  assert.deepEqual(
    sorted.map((r) => r.frip),
    [0.3, 0.34, 2.77, 14.25],
  );
});

test("a genuine zero sorts as a value, not as absence", () => {
  const sorted = sortRows(rows({ n: null }, { n: 0 }, { n: 5 }), "n", "asc");
  assert.deepEqual(
    sorted.map((r) => r.n),
    [0, 5, null],
  );
});

// --- dates: ISO strings, which is why they sort chronologically -------------

test("date columns sort chronologically as ISO strings", () => {
  const sorted = sortRows(
    rows(
      { experiment_date: "2025-12-05" },
      { experiment_date: "2025-02-17" },
      { experiment_date: "2025-08-12" },
    ),
    "experiment_date",
    "asc",
  );
  assert.deepEqual(
    sorted.map((r) => r.experiment_date),
    ["2025-02-17", "2025-08-12", "2025-12-05"],
  );
});

test("ISO ordering is not the M/D/YY ordering it replaced", () => {
  // As M/D/YY strings these would sort 12/5/25 before 2/17/25, because "1" < "2".
  // Converting to ISO before the values leave the server is what fixes it.
  const sorted = sortRows(
    rows({ d: "2025-12-05" }, { d: "2025-02-17" }),
    "d",
    "asc",
  );
  assert.deepEqual(
    sorted.map((r) => r.d),
    ["2025-02-17", "2025-12-05"],
  );
});

// --- missing values hold one position in every ordering (AE3) --------------

test("missing values land last ascending and last descending (AE3)", () => {
  const input = rows(
    { experiment_date: "2025-05-07" },
    { experiment_date: null },
    { experiment_date: "2025-12-18" },
    { experiment_date: null },
    { experiment_date: "2025-02-17" },
  );

  const asc = sortRows(input, "experiment_date", "asc").map((r) => r.experiment_date);
  const desc = sortRows(input, "experiment_date", "desc").map((r) => r.experiment_date);

  assert.deepEqual(asc, ["2025-02-17", "2025-05-07", "2025-12-18", null, null]);
  assert.deepEqual(desc, ["2025-12-18", "2025-05-07", "2025-02-17", null, null]);

  // The property stated directly: absent values occupy the same terminal slots
  // regardless of direction, so they never scatter as the reader toggles.
  assert.deepEqual(asc.slice(-2), [null, null]);
  assert.deepEqual(desc.slice(-2), [null, null]);
});

test("text columns keep missing values last too", () => {
  // control is blank for the HALO rows, and the 16 path columns are nullable.
  const asc = sortRows(
    rows({ control: "HALO_amp" }, { control: null }, { control: "HALO_2606" }),
    "control",
    "asc",
  ).map((r) => r.control);
  const desc = sortRows(
    rows({ control: "HALO_amp" }, { control: null }, { control: "HALO_2606" }),
    "control",
    "desc",
  ).map((r) => r.control);

  assert.deepEqual(asc, ["HALO_2606", "HALO_amp", null]);
  assert.deepEqual(desc, ["HALO_amp", "HALO_2606", null]);
});

test("an all-missing column is stable rather than throwing", () => {
  const sorted = sortRows(
    rows({ alignment_rate: null }, { alignment_rate: null }, { alignment_rate: null }),
    "alignment_rate",
    "asc",
  );
  assert.equal(sorted.length, 3);
  assert.ok(sorted.every((r) => r.alignment_rate === null));
});

test("compareCells reports equality as 0 in both directions", () => {
  assert.equal(compareCells(5, 5, "asc"), 0);
  assert.equal(compareCells(5, 5, "desc"), 0);
  assert.equal(compareCells(null, null, "asc"), 0);
  assert.equal(compareCells("a", "a", "desc"), 0);
});

test("sorting does not mutate the input, which the seam freezes", () => {
  const frozen = Object.freeze([
    Object.freeze({ n: 3 }),
    Object.freeze({ n: 1 }),
  ]) as readonly { n: number }[];

  const sorted = sortRows(frozen, "n", "asc");
  assert.deepEqual(
    sorted.map((r) => r.n),
    [1, 3],
  );
  assert.deepEqual(
    frozen.map((r) => r.n),
    [3, 1],
    "the original order must survive",
  );
});

// --- search ----------------------------------------------------------------

test("search matches any column, case-insensitively", () => {
  const row = { sample: "HALO_2606", control: null, num_peaks: 15 };
  assert.ok(matches(row, "halo"));
  assert.ok(matches(row, "HALO"));
  assert.ok(matches(row, "2606"));
  assert.ok(matches(row, "15"), "numbers are searched as displayed");
  assert.ok(!matches(row, "TP53"));
});

test("an empty query matches everything, and whitespace counts as empty", () => {
  const row = { sample: "HALO_2606" };
  assert.ok(matches(row, ""));
  assert.ok(matches(row, "   "));
});

test("a missing cell matches nothing, not the empty string", () => {
  // Otherwise every blank cell would be a hit on every query.
  const row = { sample: "HALO_2606", control: null };
  assert.ok(!matches({ control: null }, "anything"));
  assert.ok(matches(row, "halo"), "other columns still match");
});

test("search matches a substring mid-value, not just a prefix", () => {
  assert.ok(matches({ bam: "/project/zhuzhuzhang/nick/x.bam" }, "zhuzhu"));
});

test("search matches the formatted value, not the raw one", () => {
  // The reader sees 14.25%; searching 14.25 must work even though the underlying
  // number is 14.245639639683342.
  const row = { frip: 14.245639639683342 };
  assert.ok(matches(row, "14.25"), "the displayed text must be searchable");
  assert.ok(matches(row, "14.25%"), "including the unit");
  assert.ok(!matches(row, "14.2456"), "the raw noise is not what is on screen");
});

test("search only looks at the columns being shown", () => {
  // Otherwise a query narrows the table to rows whose match is off screen.
  const row = { sample: "TP53_b2", bam: "/project/secret/path.bam" };
  assert.ok(matches(row, "secret"), "searchable when the column is visible");
  assert.ok(!matches(row, "secret", ["sample"]), "not when it is hidden");
  assert.ok(matches(row, "TP53", ["sample"]));
});
