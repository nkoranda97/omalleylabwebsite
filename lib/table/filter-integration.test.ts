import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createTable,
  getCoreRowModel,
  getFacetedMinMaxValues,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type ColumnFiltersState,
} from "@tanstack/table-core";

import { missingRealDatabase, missingRealMeme } from "../../db/fixture.ts";
import { listMotifs, listRuns } from "../data/index.ts";
import { formatValue } from "../display/format.ts";
import { buildColumnDefs, searchableColumns, type QcTableRow } from "./column-defs.ts";
import { NOT_RECORDED } from "./filters.ts";
import { rowMatches } from "./ordering.ts";

/**
 * Filtering asserted through the real TanStack engine, headlessly.
 *
 * The claims this unit makes — filters intersect, absence is selectable, and facet
 * counts reflect the *other* active filters — are properties of the engine plus the
 * predicates, not of any control. Asserting them here means the controls in later units
 * are wiring rather than behaviour, and it follows `sorting.test.ts`: every comparator
 * test passed at M3 while the live table sorted wrongly, because nothing went through
 * TanStack.
 */

const COLUMNS = [
  "sample",
  "is_treatment",
  "control",
  "gdna_batch",
  "num_peaks",
  "max_peak_score",
  "summits_logo1",
] as const;

/** Drive the table the way the browse page does, with filters applied. */
function filtered(
  rows: QcTableRow[],
  columnFilters: ColumnFiltersState,
  options: { query?: string; hidden?: string[]; pageSize?: number; pageIndex?: number } = {},
) {
  const hidden = options.hidden ?? [];
  const table = createTable<QcTableRow>({
    data: rows,
    columns: buildColumnDefs([...COLUMNS]),
    state: {
      columnFilters,
      globalFilter: options.query ?? "",
      columnVisibility: Object.fromEntries(hidden.map((c) => [c, false])),
      pagination: { pageSize: options.pageSize ?? 50, pageIndex: options.pageIndex ?? 0 },
    },
    onStateChange: () => {},
    renderFallbackValue: null,
    globalFilterFn: (row, _id, value) =>
      rowMatches(
        row.original,
        String(value),
        formatValue,
        searchableColumns([...COLUMNS], (c) => !hidden.includes(c)),
      ),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getFacetedMinMaxValues: getFacetedMinMaxValues(),
    getPaginationRowModel: getPaginationRowModel(),
  });
  return table;
}

const samplesOf = (table: ReturnType<typeof filtered>) =>
  table.getFilteredRowModel().rows.map((r) => r.original.sample);

/** Rows shaped like the browse table's, covering the awkward cases on purpose. */
function rows(): QcTableRow[] {
  return [
    { sample: "a", is_treatment: "1", control: "H1", gdna_batch: "2025-12-03", num_peaks: 5000, max_peak_score: 10, summits_logo1: "motif" },
    { sample: "b", is_treatment: "1", control: "H1", gdna_batch: "2025-12-03", num_peaks: 100, max_peak_score: 20, summits_logo1: "motif" },
    { sample: "c", is_treatment: "1", control: "H2", gdna_batch: null, num_peaks: 0, max_peak_score: null, summits_logo1: "motif" },
    { sample: "d", is_treatment: "0", control: null, gdna_batch: "2025-08-04", num_peaks: 50, max_peak_score: 5, summits_logo1: null },
    { sample: "e", is_treatment: "0", control: null, gdna_batch: null, num_peaks: null, max_peak_score: null, summits_logo1: null },
  ];
}

// --- facets ------------------------------------------------------------------

test("a facet selecting one value returns exactly the rows holding it", () => {
  const t = filtered(rows(), [{ id: "is_treatment", value: ["0"] }]);
  assert.deepEqual(samplesOf(t), ["d", "e"]);
});

test("selecting two values in one column returns the union", () => {
  const t = filtered(rows(), [{ id: "control", value: ["H1", "H2"] }]);
  assert.deepEqual(samplesOf(t), ["a", "b", "c"]);
});

test("filters on two different columns intersect, not union", () => {
  const t = filtered(rows(), [
    { id: "is_treatment", value: ["1"] },
    { id: "control", value: ["H1"] },
  ]);
  assert.deepEqual(samplesOf(t), ["a", "b"], "treatment AND control H1");
});

test("the not-recorded sentinel matches nulls and nothing else", () => {
  const t = filtered(rows(), [{ id: "gdna_batch", value: [NOT_RECORDED] }]);
  assert.deepEqual(samplesOf(t), ["c", "e"]);
});

test("a real value and not-recorded together return both populated and null rows", () => {
  const t = filtered(rows(), [{ id: "gdna_batch", value: ["2025-08-04", NOT_RECORDED] }]);
  assert.deepEqual(samplesOf(t), ["c", "d", "e"]);
});

test("an empty selection narrows nothing", () => {
  // A facet with every box unchecked must not mean "match none".
  assert.equal(filtered(rows(), [{ id: "control", value: [] }]).getFilteredRowModel().rows.length, 5);
});

test("the motif facet partitions on found versus none", () => {
  assert.deepEqual(samplesOf(filtered(rows(), [{ id: "summits_logo1", value: ["motif"] }])), ["a", "b", "c"]);
  assert.deepEqual(samplesOf(filtered(rows(), [{ id: "summits_logo1", value: [NOT_RECORDED] }])), ["d", "e"]);
});

// --- thresholds ---------------------------------------------------------------

test("a lower bound alone, an upper bound alone, and both", () => {
  assert.deepEqual(samplesOf(filtered(rows(), [{ id: "num_peaks", value: [100, undefined] }])), ["a", "b"]);
  assert.deepEqual(samplesOf(filtered(rows(), [{ id: "num_peaks", value: [undefined, 100] }])), ["b", "c", "d"]);
  assert.deepEqual(samplesOf(filtered(rows(), [{ id: "num_peaks", value: [50, 5000] }])), ["a", "b", "d"]);
});

test("a genuine zero is a value, and a zero bound is a real bound", () => {
  // num_peaks 0 for row c must be included by >= 0 and excluded by >= 1.
  assert.ok(samplesOf(filtered(rows(), [{ id: "num_peaks", value: [0, undefined] }])).includes("c"));
  assert.ok(!samplesOf(filtered(rows(), [{ id: "num_peaks", value: [1, undefined] }])).includes("c"));
});

test("a row whose value is null is excluded by any threshold", () => {
  // "peaks >= 1000" must not return samples whose peak count is unknown. Row e has a
  // null num_peaks and must be absent even from a bound that admits everything else.
  for (const value of [
    [0, undefined, false],
    [undefined, 999999, false],
    [0, 999999, false],
  ] as const) {
    assert.ok(
      !samplesOf(filtered(rows(), [{ id: "num_peaks", value: [...value] }])).includes("e"),
      `null excluded by ${JSON.stringify(value)}`,
    );
  }
});

test("nulls a threshold excludes stay reachable via include-nulls", () => {
  // R7 for a numeric column. max_peak_score has nulls and no facet, so without the
  // third slot "which samples have no score" is unanswerable. Bounds unset plus the
  // flag means *only* those rows.
  const t = filtered(rows(), [{ id: "max_peak_score", value: [undefined, undefined, true] }]);
  assert.deepEqual(samplesOf(t), ["c", "e"]);
});

test("include-nulls unions with the bounds rather than replacing them", () => {
  const withFlag = filtered(rows(), [{ id: "max_peak_score", value: [10, undefined, true] }]);
  const without = filtered(rows(), [{ id: "max_peak_score", value: [10, undefined, false] }]);

  assert.deepEqual(samplesOf(without), ["a", "b"], "in range only");
  assert.deepEqual(samplesOf(withFlag), ["a", "b", "c", "e"], "in range plus the nulls");
});

test("an inverted range yields zero rows rather than throwing", () => {
  // A transient state while someone types, not an error worth a crash.
  const t = filtered(rows(), [{ id: "num_peaks", value: [5000, 100, false] }]);
  assert.equal(t.getFilteredRowModel().rows.length, 0);
});

test("a bound compares the raw value, not the rounded display text", () => {
  // AE5. The real data holds no sample where these differ, so the browser cannot
  // demonstrate it — synthetic values can. frip displays to two decimals, so 0.996
  // reads as "1.00%" while being below 1, and a bound of 1 must exclude it.
  const synthetic: QcTableRow[] = [
    { sample: "rounds-up", frip: 0.996 },
    { sample: "genuinely-over", frip: 1.004 },
  ];
  const t = createTable<QcTableRow>({
    data: synthetic,
    columns: buildColumnDefs(["sample", "frip"]),
    state: { columnFilters: [{ id: "frip", value: [1, undefined, false] }] },
    onStateChange: () => {},
    renderFallbackValue: null,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  assert.equal(formatValue("frip", 0.996), "1.00%", "it really does display as 1.00%");
  assert.deepEqual(
    t.getFilteredRowModel().rows.map((r) => r.original.sample),
    ["genuinely-over"],
    "the row that only rounds up to the bound is excluded",
  );
});

// --- faceted counts reflect other filters (R5) --------------------------------

test("facet counts for one column change when another column is filtered", () => {
  // The assertion that fails if option counts are computed from the raw rows. Without
  // it a facet offers options that yield zero rows once clicked.
  const unfiltered = filtered(rows(), []);
  const treatmentOnly = filtered(rows(), [{ id: "is_treatment", value: ["1"] }]);

  const controlsAll = unfiltered.getColumn("control")!.getFacetedUniqueValues();
  const controlsTreatment = treatmentOnly.getColumn("control")!.getFacetedUniqueValues();

  assert.equal(controlsAll.get("H1"), 2);
  assert.equal(controlsAll.get(undefined), 2, "two rows have no control");
  assert.equal(controlsTreatment.get("H1"), 2);
  assert.equal(
    controlsTreatment.get(undefined),
    undefined,
    "no treatment row lacks a control, so the option disappears",
  );
});

test("faceted min/max reflects the filtered subset, not the whole table", () => {
  const all = filtered(rows(), []).getColumn("num_peaks")!.getFacetedMinMaxValues();
  const controls = filtered(rows(), [{ id: "is_treatment", value: ["0"] }])
    .getColumn("num_peaks")!
    .getFacetedMinMaxValues();

  assert.deepEqual(all, [0, 5000]);
  assert.deepEqual(controls, [50, 50], "only row d has a peak count among controls");
});

test("a facet with no surviving values yields an empty option list rather than throwing", () => {
  const t = filtered(rows(), [{ id: "control", value: ["H2"] }]);
  const batches = t.getColumn("gdna_batch")!.getFacetedUniqueValues();
  assert.deepEqual([...batches.keys()], [undefined], "row c has no batch");
});

// --- interaction with search, visibility, pagination --------------------------

test("a column filter and the text search combine", () => {
  const both = filtered(rows(), [{ id: "is_treatment", value: ["1"] }], { query: "H1" });
  const filterOnly = filtered(rows(), [{ id: "is_treatment", value: ["1"] }]);
  const searchOnly = filtered(rows(), [], { query: "H1" });

  assert.deepEqual(samplesOf(both), ["a", "b"]);
  assert.ok(samplesOf(filterOnly).length > samplesOf(both).length);
  assert.ok(samplesOf(searchOnly).length >= samplesOf(both).length);
});

test("a filter on a hidden column still narrows the rows", () => {
  // KTD8. Filters deliberately survive hiding their column — unlike search, which
  // excludes hidden columns because a match with no visible cause is unattributable.
  // This is the assertion that fails if filters are made to follow visibility.
  const t = filtered(rows(), [{ id: "gdna_batch", value: ["2025-12-03"] }], {
    hidden: ["gdna_batch"],
  });
  assert.deepEqual(samplesOf(t), ["a", "b"]);
});

test("search still ignores hidden columns, keeping the asymmetry deliberate", () => {
  const visible = filtered(rows(), [], { query: "H1" });
  const hidden = filtered(rows(), [], { query: "H1", hidden: ["control"] });
  assert.deepEqual(samplesOf(visible), ["a", "b"]);
  assert.deepEqual(samplesOf(hidden), [], "the only match was in a hidden column");
});

test("narrowing while on a later page does not leave an empty table", () => {
  // autoResetPageIndex defaults to !manualPagination, so this is inherited rather than
  // written — which is exactly why it deserves a test.
  const t = filtered(rows(), [{ id: "is_treatment", value: ["1"] }], {
    pageSize: 2,
    pageIndex: 2,
  });
  assert.equal(t.getFilteredRowModel().rows.length, 3);
  assert.ok(t.getPageCount() <= 2, "three rows at two per page is two pages");
});

test("clearing all filters restores every row", () => {
  assert.equal(filtered(rows(), []).getFilteredRowModel().rows.length, 5);
});

// --- against the real data ----------------------------------------------------

test(
  "Motif found and Peaks with Motif are different questions",
  { skip: missingRealDatabase() || missingRealMeme() },
  async () => {
    // KTD9. motif_peaks counts FIMO hits; the logo records whether MEME found a motif.
    // Three real samples have no FIMO count and a motif anyway, so the combination is
    // legitimate rather than contradictory. Pins the case against a future
    // "simplification" that collapses the two controls.
    const [runs, motifs] = await Promise.all([listRuns(), listMotifs()]);
    const hasLogo = new Map(motifs.map((m) => [m.sample, m.logos.summits_logo1.present]));

    const both = runs
      .filter((r) => r.motif_peaks === null && hasLogo.get(r.sample) === true)
      .map((r) => r.sample)
      .sort();

    assert.deepEqual(both, ["TGIF2_amp", "TP53_LH", "TP53_amp"]);
  },
);
