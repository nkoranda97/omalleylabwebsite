/**
 * How a cell reads on screen.
 *
 * One formatter, used by both the cell renderer and the search predicate. That
 * pairing is the point: search previously compared raw values while the reader saw
 * formatted ones, so typing what was on screen could match nothing. Sorting still
 * uses the raw value, so ordering stays numeric while display and search agree.
 */

export type CellValue = string | number | null;

/**
 * Columns that are percentages on a 0–100 scale, shown to two decimals with a unit.
 *
 * The unit is not decoration. `frip` reads like a 0–1 fraction and is not one, which
 * is exactly the confusion this project already hit once — a max of 14.25 looked
 * anomalous until the scale was established. Two decimals matches what the
 * pipeline's own export served, so the precision follows upstream rather than being
 * a preference; the raw derived value carries 17 significant digits, which is
 * arithmetic noise rather than information.
 */
const PERCENT_COLUMNS: readonly string[] = ["frip", "frip_filt"];

/**
 * Columns whose stored value is a code standing for a word.
 *
 * `is_treatment` is text `"0"` / `"1"` in the database, and showing that to a reader
 * asks them to remember which digit means which — for the one column on the page whose
 * value decides how every other number should be interpreted. The digits stay
 * authoritative underneath: the detail page still branches on the raw value, and
 * sorting still uses it, so Control and Treatment group cleanly.
 *
 * A side benefit worth having: because search runs through this same formatter,
 * typing "control" now finds control samples. Against the raw value it found nothing.
 */
const VALUE_WORDS: Record<string, Record<string, string>> = {
  is_treatment: { "0": "Control", "1": "Treatment" },
};

/** Absent renders as empty, so it can never be mistaken for 0, NaN, or a marker. */
export function formatValue(column: string, value: CellValue | undefined): string {
  if (value === null || value === undefined) return "";

  if (PERCENT_COLUMNS.includes(column) && typeof value === "number") {
    return `${value.toFixed(2)}%`;
  }

  // An unmapped code falls through to itself rather than becoming blank: a pipeline
  // that starts writing "2" should show "2" and be noticed, not vanish.
  const words = VALUE_WORDS[column];
  if (words !== undefined) {
    return words[String(value)] ?? String(value);
  }

  return String(value);
}

/** Whether a column is rendered as a percentage — exported so tests can assert it. */
export function isPercentColumn(column: string): boolean {
  return PERCENT_COLUMNS.includes(column);
}
