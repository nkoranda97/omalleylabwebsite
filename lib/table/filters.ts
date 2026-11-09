/**
 * Which columns can be filtered, and with what control.
 *
 * Declared rather than derived from the column list, because deriving it produces
 * controls that cannot narrow anything. Measured against the real 109-row database:
 *
 * - Three columns have **no values at all** — `alignment_rate`, `subsampled_frags`
 *   and `num_peaks_bl` are null on every row, so any control over them is dead.
 * - Eighteen columns have a distinct value for **every** row — `sample` and the
 *   sixteen file paths. A pick-from-a-list control with 109 options is not a control;
 *   the free-text search is the right tool for those.
 * - Five columns have short value lists: sample type (2), gDNA batch (3), experiment
 *   date (8), control sample (9), and whether a motif was found (2).
 * - Eleven QC metrics are effectively continuous — FRiP has 109 distinct values across
 *   109 rows — so they want a bound, not a list.
 *
 * That measurement is a property of *this* run, not of the schema. `gdna_batch` has
 * three values because 109 samples came from three batches; a run with forty turns
 * that facet into a scroll. See the register entry for what would force a revisit.
 */

import { QC_COLUMNS, type QcColumnName } from "../data/types.ts";
import { MOTIF_IMAGES } from "../data/motif-images.ts";
import { formatValue } from "../display/format.ts";
import { columnLabel } from "../display/labels.ts";

/** How a column is narrowed. */
export type FilterKind = "facet" | "threshold";

/**
 * The value standing in for `null` in a facet.
 *
 * A checkbox needs a value and `null` is not one, so absence travels as this sentinel
 * through the option list, the predicate, and the URL alike. Five columns carry nulls
 * — fourteen samples have no gDNA batch — and "which samples are missing a batch" is a
 * real provenance question a facet that drops nulls cannot answer.
 *
 * Deliberately unlike anything the pipeline writes, and deliberately plain: it also
 * travels in the shareable URL, so a control character would arrive as `%00` and be
 * rejected by some servers. A test asserts it collides with no real value and survives
 * URL encoding unchanged.
 */
export const NOT_RECORDED = "__none__";

/**
 * The filterable columns.
 *
 * `motif_found` is the one entry that is not a database column. It filters the
 * `summits_logo1` table column, whose accessor already yields a marker when a logo
 * exists and `null` when it does not — added so absences sort terminally. Reusing it
 * means there is no second source of truth about which samples have motifs, and the
 * filesystem stays the only authority.
 */
export const FILTERS = {
  is_treatment: { kind: "facet" },
  control: { kind: "facet" },
  experiment_date: { kind: "facet" },
  gdna_batch: { kind: "facet" },
  [MOTIF_IMAGES[0]]: { kind: "facet" },

  total_reads: { kind: "threshold" },
  trimmed_reads: { kind: "threshold" },
  mapped_reads: { kind: "threshold" },
  mapping_pct: { kind: "threshold" },
  median_frag_size: { kind: "threshold" },
  num_peaks: { kind: "threshold" },
  num_peaks_filt: { kind: "threshold" },
  reads_in_peaks: { kind: "threshold" },
  reads_in_peaks_filt: { kind: "threshold" },
  frip: { kind: "threshold" },
  frip_filt: { kind: "threshold" },
  max_peak_score: { kind: "threshold" },
  motif_peaks: { kind: "threshold" },
} as const satisfies Record<string, { kind: FilterKind }>;

export type FilterableColumn = keyof typeof FILTERS;

export const FILTERABLE_COLUMNS = Object.keys(FILTERS) as FilterableColumn[];

/** The columns offering a pick-from-a-list control, in the order they should appear. */
export const FACET_COLUMNS = FILTERABLE_COLUMNS.filter(
  (column) => FILTERS[column].kind === "facet",
);

/** The columns offering a bound. */
export const THRESHOLD_COLUMNS = FILTERABLE_COLUMNS.filter(
  (column) => FILTERS[column].kind === "threshold",
);

export function isFilterable(column: string): column is FilterableColumn {
  return Object.prototype.hasOwnProperty.call(FILTERS, column);
}

export function filterKind(column: FilterableColumn): FilterKind {
  return FILTERS[column].kind;
}

/**
 * Columns that are filterable without being database columns.
 *
 * One entry, and an exemption rather than a loosened check: the validation below
 * should keep rejecting any *other* id that is not in the row type.
 */
const NON_SPEC_FILTERS: readonly string[] = [MOTIF_IMAGES[0]];

/**
 * Check the declaration against the column spec.
 *
 * Same contract as `groupColumns` and `assertLabelled`: drift throws rather than
 * surfacing as a control that quietly does nothing. Two things are checked, and the
 * second is the one the spec makes possible — a threshold on a `text` column is a bug
 * the column spec already knows enough to catch.
 */
export function assertFiltersValid(): void {
  const unknown = FILTERABLE_COLUMNS.filter(
    (column) =>
      !NON_SPEC_FILTERS.includes(column) &&
      !Object.prototype.hasOwnProperty.call(QC_COLUMNS, column),
  );
  if (unknown.length > 0) {
    throw new Error(
      `Filterable column(s) are not in the row type: ${unknown.join(", ")}`,
    );
  }

  const mismatched: string[] = [];
  for (const column of FILTERABLE_COLUMNS) {
    if (NON_SPEC_FILTERS.includes(column)) continue;
    const spec = QC_COLUMNS[column as QcColumnName];
    const numeric = spec.kind === "int" || spec.kind === "float";
    if (FILTERS[column].kind === "threshold" && !numeric) {
      mismatched.push(`${column} is ${spec.kind} but declares a threshold`);
    }
  }
  if (mismatched.length > 0) {
    throw new Error(`Filter kind does not match the column kind: ${mismatched.join("; ")}`);
  }
}

// --- predicates ---------------------------------------------------------------

/** A facet selection: chosen value keys, with `NOT_RECORDED` standing for null. */
export type FacetSelection = readonly string[];

/**
 * A threshold: inclusive lower and upper bounds, plus whether to include rows with no
 * value.
 *
 * The third slot exists because R7 — absence is selectable for every column that has
 * nulls — is otherwise unsatisfiable for the two numeric columns that have them.
 * `max_peak_score` has four and `motif_peaks` twelve, and without this there is no way
 * to ask which samples they are: a bound excludes nulls by design, and these columns
 * have no facet to fall back on. One extra slot and one checkbox is cheaper than
 * leaving the question unanswerable.
 */
export type ThresholdBounds = readonly [
  number | undefined,
  number | undefined,
  boolean | undefined,
];

/**
 * The canonical string for a value in a facet.
 *
 * One function so the option list, the predicate, and the URL cannot disagree about
 * what a value is called. Dates already arrive as ISO strings — the browse page
 * converts them on the server, because a `Date` crossing to the client is an instant a
 * browser may read as the previous day.
 */
export function facetValueKey(value: unknown): string {
  return value === null || value === undefined ? NOT_RECORDED : String(value);
}

/**
 * Does this row's value fall in the facet selection?
 *
 * Not `arrIncludesSome`, for one reason: absence has to be selectable (R7), and a
 * built-in comparing the cell against a list cannot express "match the rows that have
 * no value". Fourteen samples have no gDNA batch and "which ones" is a real question.
 */
export function facetFilter(
  row: { getValue: (id: string) => unknown },
  columnId: string,
  selected: FacetSelection,
): boolean {
  if (selected.length === 0) return true;
  return selected.includes(facetValueKey(row.getValue(columnId)));
}

/**
 * An empty selection removes the filter rather than matching nothing.
 *
 * TanStack drops a filter whose value `autoRemove` reports empty, which keeps the state
 * clean for the chips and the URL — an unchecked facet should leave no trace of itself
 * in either.
 */
facetFilter.autoRemove = (value: unknown) => !Array.isArray(value) || value.length === 0;

/**
 * Is this row's value within the bounds?
 *
 * **A bound never admits a null.** "Peaks ≥ 1000" must not return samples whose peak
 * count is unknown — that would be the app answering a question it has no data for.
 * The third slot is how those rows stay reachable, and the three states compose as a
 * union:
 *
 * | bounds | include-nulls | matches |
 * |---|---|---|
 * | set | off | non-null rows in range |
 * | set | on | non-null rows in range, plus every row with no value |
 * | unset | on | only rows with no value |
 * | unset | off | nothing to filter — `autoRemove` drops it |
 *
 * An inverted range (lower above upper) yields nothing rather than throwing. It is a
 * transient state while someone is typing, not an error worth a crash.
 */
export function thresholdFilter(
  row: { getValue: (id: string) => unknown },
  columnId: string,
  bounds: ThresholdBounds,
): boolean {
  const [min, max, includeNulls] = bounds;
  const value = row.getValue(columnId);

  if (value === null || value === undefined) return includeNulls === true;
  if (typeof value !== "number" || !Number.isFinite(value)) return false;

  // Include-nulls on its own means *only* the rows with no value, so a non-null row
  // needs at least one bound to match against.
  if (min === undefined && max === undefined) return includeNulls !== true;

  if (min !== undefined && value < min) return false;
  if (max !== undefined && value > max) return false;
  return true;
}

thresholdFilter.autoRemove = (value: unknown) =>
  !Array.isArray(value) ||
  (value[0] === undefined && value[1] === undefined && value[2] !== true);

/** The filter function a column should use, or undefined when it is not filterable. */
export function filterFnFor(column: string) {
  if (!isFilterable(column)) return undefined;
  return filterKind(column) === "facet" ? facetFilter : thresholdFilter;
}

// --- facet option lists -------------------------------------------------------

/**
 * How a filter control is labelled, which is not always the column's label.
 *
 * `summits_logo1` is headed *Motif Logo* because the column shows a logo. As a filter
 * it asks whether MEME found a motif at all, and its options are Found and None — so
 * *Motif* is what the control is actually about. Everything else reuses the column
 * label, so renaming a header renames its filter.
 */
export function filterLabel(column: string): string {
  return column === MOTIF_IMAGES[0] ? "Motif" : columnLabel(column);
}

/** One selectable value in a facet, with how many rows it would yield. */
export type FacetOption = { key: string; label: string; count: number };

/**
 * How a facet value reads on screen.
 *
 * Delegates to the one display formatter, so a facet option and the cell it filters
 * cannot disagree — Sample Type offers *Control* and *Treatment*, never `0` and `1`.
 * Two cases it handles itself: the null sentinel, and the motif column, whose stored
 * marker exists to make absences sort terminally and was never meant to be read.
 */
export function facetOptionLabel(column: string, key: string): string {
  // The motif column is checked first, and the reason is not cosmetic: its absence is
  // *"None"*, not *"Not recorded"*. MEME searched those nine samples and found nothing
  // — a recorded outcome. Labelling it "Not recorded" would collapse a result into a
  // gap, which is the one conflation this codebase refuses everywhere else.
  if (column === MOTIF_IMAGES[0]) return key === NOT_RECORDED ? "None" : "Found";
  if (key === NOT_RECORDED) return "Not recorded";
  return formatValue(column, key);
}

/**
 * Build a facet's option list from TanStack's faceted unique values.
 *
 * The input is computed against the rows passing every *other* active filter, which is
 * what makes the counts honest — an option can never promise rows that a click would
 * not produce.
 *
 * Ordered by count descending so the useful options surface first, with **absence
 * always last**. That matches how missing values are placed everywhere else in this
 * table: terminal, in both sort directions, so they never scatter.
 */
export function facetOptions(
  column: string,
  facetedValues: Map<unknown, number> | undefined,
): FacetOption[] {
  if (facetedValues === undefined) return [];

  const merged = new Map<string, number>();
  for (const [value, count] of facetedValues) {
    const key = facetValueKey(value);
    merged.set(key, (merged.get(key) ?? 0) + count);
  }

  return [...merged].map(([key, count]) => ({
      key,
      label: facetOptionLabel(column, key),
      count,
    }))
    .sort((a, b) => {
      if (a.key === NOT_RECORDED) return 1;
      if (b.key === NOT_RECORDED) return -1;
      return b.count - a.count || a.label.localeCompare(b.label);
    });
}

// --- threshold bound parsing --------------------------------------------------

/**
 * Read a typed bound out of an input's text.
 *
 * `undefined` means *no bound*, which is not the same as zero — a lower bound of 0 is a
 * real constraint that excludes nothing but still marks the filter active, while an
 * empty field should not constrain at all.
 *
 * Partial input is the case worth handling. Someone typing `-12` passes through `-`,
 * and `1e5` passes through `1e`; neither is a number yet, and committing `NaN` would
 * silently empty the table mid-keystroke. Both return `undefined` here, so the previous
 * state stands until the value is real.
 *
 * Negative bounds are accepted. No metric is negative today, and rejecting them would
 * be this module guessing about data it does not own.
 */
export function parseBound(text: string): number | undefined {
  const trimmed = text.trim();
  if (trimmed === "") return undefined;

  const value = Number(trimmed);
  return Number.isFinite(value) ? value : undefined;
}

/** The bounds a control should start from, given the column's current filter value. */
export function currentBounds(value: unknown): ThresholdBounds {
  if (!Array.isArray(value)) return [undefined, undefined, false];
  // A stored value may be a shorter tuple — an older URL, or a two-element bound
  // written before include-nulls existed — so read the slots rather than asserting the
  // shape.
  const [min, max, nulls] = value as unknown[];
  return [
    typeof min === "number" ? min : undefined,
    typeof max === "number" ? max : undefined,
    nulls === true,
  ];
}

/** Whether a threshold value would narrow anything. */
export function boundsActive(bounds: ThresholdBounds): boolean {
  return !thresholdFilter.autoRemove(bounds);
}

// --- summarising what is active -----------------------------------------------

/** One active filter, described for a removable chip. */
export type FilterChip = { column: string; label: string; value: string };

/** A number as the column renders it, so a FRiP bound reads with its unit. */
function boundText(column: string, value: number): string {
  return formatValue(column, value);
}

/**
 * Describe a threshold in the terms the reader set it in.
 *
 * A one-sided bound reads as a bound, not as a range with a blank end — "at least
 * 1,000" rather than "1,000–". The include-nulls flag is additive, so it reads as an
 * `or`, matching how the predicate composes.
 */
export function thresholdText(column: string, bounds: ThresholdBounds): string {
  const [min, max, nulls] = bounds;
  const parts: string[] = [];

  if (min !== undefined && max !== undefined) {
    parts.push(`${boundText(column, min)}–${boundText(column, max)}`);
  } else if (min !== undefined) {
    parts.push(`at least ${boundText(column, min)}`);
  } else if (max !== undefined) {
    parts.push(`at most ${boundText(column, max)}`);
  }

  if (nulls === true) parts.push("no value");
  return parts.join(" or ");
}

/**
 * Turn the table's filter state into removable chips.
 *
 * These are not decoration. Filters deliberately survive hiding their column, so for a
 * hidden column a chip is the *only* thing on screen explaining why the result set is
 * short — which is what makes keeping the filter defensible rather than a trap. A chip
 * must therefore look the same whether its column is visible or not, and nothing here
 * consults visibility.
 *
 * Labels come from `filterLabel`, so a renamed column renames its chip too.
 */
export function filterChips(
  columnFilters: readonly { id: string; value: unknown }[],
): FilterChip[] {
  const chips: FilterChip[] = [];

  for (const { id, value } of columnFilters) {
    if (!isFilterable(id)) continue;

    if (filterKind(id) === "facet") {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      if (selected.length === 0) continue;
      chips.push({
        column: id,
        label: filterLabel(id),
        value: selected.map((key) => facetOptionLabel(id, key)).join(", "),
      });
      continue;
    }

    const bounds = currentBounds(value);
    if (!boundsActive(bounds)) continue;
    chips.push({ column: id, label: filterLabel(id), value: thresholdText(id, bounds) });
  }

  return chips;
}

/**
 * Why the table is empty.
 *
 * Three causes that the previous single message collapsed into one: filters alone,
 * search alone, or both. With filters active and the search box empty, `No rows match
 * ""` blamed the wrong thing. Each phrasing points at what to relax.
 */
export function emptyStateMessage(query: string, activeFilters: number): string {
  const searching = query.trim() !== "";

  if (searching && activeFilters > 0) {
    return `No rows match “${query}” together with the active filters.`;
  }
  if (searching) return `No rows match “${query}”.`;
  if (activeFilters > 0) {
    return activeFilters === 1
      ? "No rows match the active filter."
      : `No rows match these ${activeFilters} filters together.`;
  }
  return "No rows to show.";
}
