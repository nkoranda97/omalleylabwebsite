import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { missingRealDatabase } from "../../db/fixture.ts";
import { listRuns } from "../data/index.ts";
import { MOTIF_IMAGES } from "../data/motif-images.ts";
import { QC_COLUMNS, QC_COLUMN_NAMES } from "../data/types.ts";
import { columnLabel } from "../display/labels.ts";
import { TABLE_HIDDEN_BY_DEFAULT } from "../display/column-groups.ts";
import {
  FACET_COLUMNS,
  FILTERABLE_COLUMNS,
  NOT_RECORDED,
  THRESHOLD_COLUMNS,
  assertFiltersValid,
  facetFilter,
  facetOptionLabel,
  boundsActive,
  currentBounds,
  emptyStateMessage,
  facetOptions,
  filterChips,
  filterLabel,
  parseBound,
  thresholdText,
  filterKind,
  isFilterable,
  thresholdFilter,
} from "./filters.ts";

/**
 * The filterable declaration.
 *
 * The claims worth guarding are not "these columns are listed" but the measurements
 * that justify the list: a column with no values must not get a control, and a column
 * with a distinct value per row must not either. Both are asserted against the real
 * database, so a future run that changes the shape of the data is what forces the
 * decision — rather than a stale list quietly staying wrong.
 */

// --- the declaration is internally consistent --------------------------------

test("the declaration matches the column spec", () => {
  assert.doesNotThrow(() => assertFiltersValid());
});

test("every filterable column resolves to a label", () => {
  // The controls are labelled from the same place as the headers, so a renamed column
  // renames its filter too.
  for (const column of FILTERABLE_COLUMNS) {
    assert.ok(columnLabel(column).length > 0, column);
  }
});

test("facet and threshold sets partition the filterable columns", () => {
  assert.equal(FACET_COLUMNS.length + THRESHOLD_COLUMNS.length, FILTERABLE_COLUMNS.length);
  assert.equal(new Set(FILTERABLE_COLUMNS).size, FILTERABLE_COLUMNS.length);
  for (const c of FACET_COLUMNS) assert.equal(filterKind(c), "facet");
  for (const c of THRESHOLD_COLUMNS) assert.equal(filterKind(c), "threshold");
});

test("isFilterable is true for declared columns and false for everything else", () => {
  for (const column of FILTERABLE_COLUMNS) assert.ok(isFilterable(column));
  assert.ok(!isFilterable("sample"));
  assert.ok(!isFilterable("bam"));
  assert.ok(!isFilterable("not_a_column"));
  // Guards against a `{}`-inherited property answering true.
  assert.ok(!isFilterable("toString"));
  assert.ok(!isFilterable("constructor"));
});

test("the motif column is the only non-spec filterable id", () => {
  const nonSpec = FILTERABLE_COLUMNS.filter((c) => !QC_COLUMN_NAMES.includes(c as never));
  assert.deepEqual(nonSpec, [MOTIF_IMAGES[0]]);
});

test("every threshold column is numeric in the spec", () => {
  for (const column of THRESHOLD_COLUMNS) {
    const kind = QC_COLUMNS[column as keyof typeof QC_COLUMNS].kind;
    assert.ok(kind === "int" || kind === "float", `${column} is ${kind}`);
  }
});

test("no filterable column is hidden from the table by default", () => {
  // A control for a column the reader cannot see would narrow with no visible cause.
  // Filters deliberately survive *hiding* a column, but none should start hidden.
  for (const column of FILTERABLE_COLUMNS) {
    assert.ok(!TABLE_HIDDEN_BY_DEFAULT.includes(column), `${column} starts hidden`);
  }
});

// --- autoRemove: an untouched control leaves no trace -------------------------

/**
 * These are unit assertions on purpose.
 *
 * `autoRemove` is consulted by TanStack when *it* sets a filter value, so a test that
 * injects `columnFilters` as controlled state can never observe it — the value goes
 * straight into state unexamined. The property belongs to the function; applying it
 * belongs to the table.
 *
 * It matters because the chips and the shareable URL both read `columnFilters`. A
 * control the reader opened and closed without choosing anything must leave nothing
 * behind, or an empty facet shows up as a chip that narrows nothing and a query
 * parameter that means nothing.
 */

test("an empty facet selection is removed rather than kept", () => {
  assert.equal(facetFilter.autoRemove([]), true);
  assert.equal(facetFilter.autoRemove(undefined), true);
  assert.equal(facetFilter.autoRemove(["0"]), false);
  assert.equal(facetFilter.autoRemove([NOT_RECORDED]), false);
});

test("a threshold with no bounds and no include-nulls is removed", () => {
  assert.equal(thresholdFilter.autoRemove([undefined, undefined, undefined]), true);
  assert.equal(thresholdFilter.autoRemove([undefined, undefined, false]), true);
  assert.equal(thresholdFilter.autoRemove(undefined), true);
});

test("a threshold keeps any single meaningful part", () => {
  // Including a zero bound, which is a real bound and must not read as empty.
  assert.equal(thresholdFilter.autoRemove([0, undefined, false]), false);
  assert.equal(thresholdFilter.autoRemove([undefined, 100, false]), false);
  assert.equal(thresholdFilter.autoRemove([undefined, undefined, true]), false);
});

// --- the sentinel -------------------------------------------------------------

test("the not-recorded sentinel is not a value a pipeline would write", () => {
  // It has to be distinguishable from a legitimate value that reads the same way.
  assert.notEqual(NOT_RECORDED, "");
  assert.notEqual(NOT_RECORDED, "NA");
  assert.notEqual(NOT_RECORDED, "not recorded");
});

test("the sentinel survives URL encoding unchanged", () => {
  // It travels in the shareable filter URL. The first attempt at this sentinel used a
  // control character, which encodes to %00 and is rejected by some servers — and put
  // a literal NUL byte in the source, which made grep treat the file as binary.
  assert.equal(encodeURIComponent(NOT_RECORDED), NOT_RECORDED);
  assert.match(NOT_RECORDED, /^[A-Za-z0-9_.~-]+$/, "URL-safe characters only");
});

/**
 * Compare values by what they mean, not by object identity.
 *
 * `experiment_date` and `gdna_batch` arrive as `Date` objects, and a `Set` of Dates
 * dedupes by reference — so eight distinct dates across 109 rows counted as 101 and
 * made the facet look unusable. Every measurement below has to normalise first.
 */
function distinctValues(values: readonly unknown[]): Set<string> {
  return new Set(
    values
      .filter((v) => v !== null)
      .map((v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v))),
  );
}

// --- the measurements the declaration rests on --------------------------------

test(
  "no column that is empty on every row has a control",
  { skip: missingRealDatabase() },
  async () => {
    // Three columns are null on all 109 rows today. If a future run populates one, this
    // test still passes — but the register entry it belongs to is what should then be
    // revisited, rather than the omission staying invisible.
    const runs = await listRuns();
    const empty = QC_COLUMN_NAMES.filter((c) => runs.every((r) => r[c] === null));

    assert.ok(empty.length > 0, "expected some all-empty columns in this run");
    for (const column of empty) {
      assert.ok(!isFilterable(column), `${column} has no values but offers a filter`);
    }
  },
);

test(
  "no column with a distinct value per row has a facet",
  { skip: missingRealDatabase() },
  async () => {
    // `sample` and the sixteen paths. A list of 109 options is not a control.
    const runs = await listRuns();
    for (const column of QC_COLUMN_NAMES) {
      const distinct = distinctValues(runs.map((r) => r[column])).size;
      if (distinct === runs.length) {
        assert.ok(
          !FACET_COLUMNS.includes(column as never),
          `${column} is unique per row but offers a facet`,
        );
      }
    }
  },
);

test(
  "every facet column has a value list short enough to scan",
  { skip: missingRealDatabase() },
  async () => {
    // The measurement that justifies a checkbox list rather than a threshold. The
    // ceiling is generous; the point is that crossing it should fail here rather than
    // ship a facet nobody can use.
    const runs = await listRuns();
    for (const column of FACET_COLUMNS) {
      if (!QC_COLUMN_NAMES.includes(column as never)) continue;
      const distinct = distinctValues(
        runs.map((r) => r[column as (typeof QC_COLUMN_NAMES)[number]]),
      ).size;
      assert.ok(distinct <= 15, `${column} has ${distinct} distinct values — too many to list`);
    }
  },
);

test(
  "the sentinel collides with no real value in the data",
  { skip: missingRealDatabase() },
  async () => {
    const runs = await listRuns();
    for (const run of runs) {
      for (const column of QC_COLUMN_NAMES) {
        const value = run[column];
        if (typeof value === "string") {
          assert.notEqual(value, NOT_RECORDED, `${run.sample}.${column}`);
        }
      }
    }
  },
);

// --- facet option lists -------------------------------------------------------

test("options carry their counts and read through the display formatter", () => {
  const options = facetOptions("is_treatment", new Map([["1", 100], ["0", 9]]));
  assert.deepEqual(options, [
    { key: "1", label: "Treatment", count: 100 },
    { key: "0", label: "Control", count: 9 },
  ]);
});

test("options are ordered by count, with absence always last", () => {
  // Absence terminal matches how missing values are placed everywhere else in this
  // table, so it never scatters as the counts change.
  const options = facetOptions(
    "control",
    new Map<unknown, number>([[undefined, 50], ["H1", 2], ["H2", 9]]),
  );
  assert.deepEqual(
    options.map((o) => o.key),
    ["H2", "H1", NOT_RECORDED],
    "absence last despite having the highest count",
  );
});

test("equal counts fall back to a stable alphabetical order", () => {
  const options = facetOptions("control", new Map([["HB", 3], ["HA", 3]]));
  assert.deepEqual(options.map((o) => o.key), ["HA", "HB"]);
});

test("a column with no nulls produces no absence option", () => {
  const options = facetOptions("is_treatment", new Map([["1", 100], ["0", 9]]));
  assert.ok(!options.some((o) => o.key === NOT_RECORDED));
});

test("null and undefined collapse into one absence option", () => {
  // The accessor maps null to undefined, but a raw null could still arrive. Two
  // separate "Not recorded" rows in one list would be a visible bug.
  const options = facetOptions("control", new Map<unknown, number>([[null, 3], [undefined, 7]]));
  assert.equal(options.length, 1);
  assert.deepEqual(options[0], { key: NOT_RECORDED, label: "Not recorded", count: 10 });
});

test("an absent faceted map yields no options rather than throwing", () => {
  // getFacetedUniqueValues returns undefined before the row model is built.
  assert.deepEqual(facetOptions("control", undefined), []);
});

test("the motif facet reads as Found and None, never as the stored marker", () => {
  const options = facetOptions(MOTIF_IMAGES[0], new Map<unknown, number>([["motif", 100], [undefined, 9]]));
  assert.deepEqual(options, [
    { key: "motif", label: "Found", count: 100 },
    { key: NOT_RECORDED, label: "None", count: 9 },
  ]);
});

test("counts sum to the row total when a facet has every row", () => {
  const options = facetOptions("is_treatment", new Map([["1", 100], ["0", 9]]));
  assert.equal(options.reduce((n, o) => n + o.count, 0), 109);
});

test("motif absence reads as None, not Not recorded", () => {
  // The distinction the project turns on: MEME searched those samples and found
  // nothing, which is a result. "Not recorded" would report it as a gap.
  assert.equal(facetOptionLabel(MOTIF_IMAGES[0], NOT_RECORDED), "None");
  assert.equal(facetOptionLabel("gdna_batch", NOT_RECORDED), "Not recorded");
  assert.notEqual(
    facetOptionLabel(MOTIF_IMAGES[0], NOT_RECORDED),
    facetOptionLabel("gdna_batch", NOT_RECORDED),
  );
});

test("the motif filter is labelled for what it asks, not for what the column shows", () => {
  // The column header says "Motif Logo" because it shows a logo. The filter asks
  // whether MEME found one, with options Found and None.
  assert.equal(filterLabel(MOTIF_IMAGES[0]), "Motif");
  assert.equal(columnLabel(MOTIF_IMAGES[0]), "Motif Logo");
});

test("every other filter reuses its column label", () => {
  for (const column of FILTERABLE_COLUMNS) {
    if (column === MOTIF_IMAGES[0]) continue;
    assert.equal(filterLabel(column), columnLabel(column), column);
  }
});

// --- threshold bound parsing --------------------------------------------------

test("an empty field is no bound, and zero is a real one", () => {
  // The distinction the whole control rests on: "" must not become 0, or clearing a
  // lower bound would silently start excluding negative values — and 0 must not read as
  // empty, or a genuine "at least zero" filter would vanish.
  assert.equal(parseBound(""), undefined);
  assert.equal(parseBound("   "), undefined);
  assert.equal(parseBound("0"), 0);
  assert.notEqual(parseBound("0"), parseBound(""));
});

test("partial input leaves the previous bound standing", () => {
  // Mid-keystroke states. Committing NaN would empty the table while someone types.
  for (const partial of ["-", ".", "1e", "e5", "--2", "1.2.3", "abc", "1,000"]) {
    assert.equal(parseBound(partial), undefined, `"${partial}"`);
  }
});

test("real numbers parse, including negatives and decimals", () => {
  assert.equal(parseBound("1000"), 1000);
  assert.equal(parseBound("14.25"), 14.25);
  assert.equal(parseBound("-5"), -5, "no metric is negative, but rejecting one would be a guess");
  assert.equal(parseBound("1e3"), 1000);
  assert.equal(parseBound(" 42 "), 42, "surrounding space is not input");
});

test("Infinity is not a bound", () => {
  // Number("Infinity") is finite-looking to a careless check.
  assert.equal(parseBound("Infinity"), undefined);
  assert.equal(parseBound("-Infinity"), undefined);
  assert.equal(parseBound("NaN"), undefined);
});

test("currentBounds normalises whatever the table holds", () => {
  assert.deepEqual(currentBounds(undefined), [undefined, undefined, false]);
  assert.deepEqual(currentBounds([10, 20, true]), [10, 20, true]);
  assert.deepEqual(currentBounds([10, undefined, undefined]), [10, undefined, false]);
});

test("boundsActive agrees with what the table would keep", () => {
  assert.equal(boundsActive([undefined, undefined, false]), false);
  assert.equal(boundsActive([0, undefined, false]), true, "a zero bound is active");
  assert.equal(boundsActive([undefined, undefined, true]), true);
  assert.equal(boundsActive([undefined, 5, false]), true);
});

test("currentBounds survives a shorter or malformed stored value", () => {
  // A two-element bound could arrive from a URL written before include-nulls existed,
  // and a URL is user-editable input besides.
  assert.deepEqual(currentBounds([10, 20]), [10, 20, false]);
  assert.deepEqual(currentBounds([]), [undefined, undefined, false]);
  assert.deepEqual(currentBounds(["10", "20", "yes"]), [undefined, undefined, false]);
  assert.deepEqual(currentBounds("nonsense"), [undefined, undefined, false]);
});

// --- summarising what is active -----------------------------------------------

test("no active filters means nothing to render", () => {
  assert.deepEqual(filterChips([]), []);
});

test("an empty facet selection produces no chip", () => {
  // autoRemove should prevent this reaching state at all; a chip that narrows nothing
  // would be worse than the belt-and-braces check.
  assert.deepEqual(filterChips([{ id: "control", value: [] }]), []);
  assert.deepEqual(filterChips([{ id: "num_peaks", value: [undefined, undefined, false] }]), []);
});

test("a facet chip lists every selected value, formatted", () => {
  const chips = filterChips([{ id: "is_treatment", value: ["0", "1"] }]);
  assert.deepEqual(chips, [
    { column: "is_treatment", label: "Sample Type", value: "Control, Treatment" },
  ]);
});

test("a facet chip renders absence in the column's own terms", () => {
  assert.equal(filterChips([{ id: "gdna_batch", value: [NOT_RECORDED] }])[0].value, "Not recorded");
  assert.equal(filterChips([{ id: MOTIF_IMAGES[0], value: [NOT_RECORDED] }])[0].value, "None");
});

test("a one-sided bound reads as a bound, not a range with a blank end", () => {
  assert.equal(thresholdText("num_peaks", [1000, undefined, false]), "at least 1000");
  assert.equal(thresholdText("num_peaks", [undefined, 100, false]), "at most 100");
  assert.doesNotMatch(thresholdText("num_peaks", [1000, undefined, false]), /–/);
});

test("a two-sided bound reads as a range", () => {
  assert.equal(thresholdText("num_peaks", [100, 1000, false]), "100–1000");
});

test("a bound on a percentage column carries its unit", () => {
  // The chip should read the way the column reads.
  assert.equal(thresholdText("frip", [1, undefined, false]), "at least 1.00%");
});

test("include-nulls reads as an addition, matching how the predicate composes", () => {
  assert.equal(thresholdText("max_peak_score", [undefined, undefined, true]), "no value");
  assert.equal(thresholdText("max_peak_score", [10, undefined, true]), "at least 10 or no value");
});

test("a zero bound produces a chip rather than being mistaken for empty", () => {
  const chips = filterChips([{ id: "num_peaks", value: [0, undefined, false] }]);
  assert.equal(chips.length, 1);
  assert.equal(chips[0].value, "at least 0");
});

test("chips cover every active filter, in state order", () => {
  const chips = filterChips([
    { id: "is_treatment", value: ["1"] },
    { id: "num_peaks", value: [500, undefined, false] },
    { id: MOTIF_IMAGES[0], value: ["motif"] },
  ]);
  assert.deepEqual(chips.map((c) => c.column), ["is_treatment", "num_peaks", MOTIF_IMAGES[0]]);
});

test("a filter for a column that is no longer filterable is skipped", () => {
  // A stale shared URL could name one. Dropping it beats rendering a chip nobody can
  // interpret or clear.
  assert.deepEqual(filterChips([{ id: "bam", value: ["x"] }]), []);
  assert.deepEqual(filterChips([{ id: "not_a_column", value: ["x"] }]), []);
});

test("chips ignore column visibility entirely", () => {
  // KTD8: filters survive hiding their column, so a hidden column's chip is the only
  // on-screen cause for a short result set. Nothing here may consult visibility.
  const source = readFileSync(new URL("./filters.ts", import.meta.url), "utf8");
  const chipSection = source.slice(source.indexOf("export function filterChips"));
  assert.doesNotMatch(chipSection, /visib/i, "filterChips must not consider visibility");
});

// --- why the table is empty ---------------------------------------------------

test("the empty state names the cause, and the three causes differ", () => {
  const filtersOnly = emptyStateMessage("", 2);
  const searchOnly = emptyStateMessage("TP53", 0);
  const both = emptyStateMessage("TP53", 2);

  assert.equal(new Set([filtersOnly, searchOnly, both]).size, 3);
  assert.match(filtersOnly, /filters/);
  assert.doesNotMatch(filtersOnly, /“”/, "must not blame an empty search box");
  assert.match(searchOnly, /TP53/);
  assert.doesNotMatch(searchOnly, /filter/);
  assert.match(both, /TP53/);
  assert.match(both, /filters/);
});

test("one filter reads as one filter", () => {
  assert.match(emptyStateMessage("", 1), /the active filter\./);
  assert.match(emptyStateMessage("", 3), /these 3 filters/);
});

test("neither a query nor a filter means the dataset itself is empty", () => {
  // Distinct from a filtered-to-nothing message: this one is about the data.
  assert.equal(emptyStateMessage("", 0), "No rows to show.");
  assert.equal(emptyStateMessage("   ", 0), "No rows to show.", "whitespace is not a query");
});
