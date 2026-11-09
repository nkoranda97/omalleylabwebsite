import { type ColumnSpec } from "./types.ts";

/** `M/D/YY` with a two-digit year — what the experiment and batch dates use. */
const MDY_PATTERN = /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/;

/** ISO 8601 local datetime — what the pipeline stamps its run rows with. */
const ISO_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/;

/** Two-digit years belong to this century. Revisit if data ever predates 2000. */
const CENTURY = 2000;

export type SortDirection = "asc" | "desc";

/**
 * Fail loudly, naming the column, what was expected, and the markers this column
 * actually accepts — listing markers it does not accept would send the reader
 * looking for the wrong value.
 */
function reject(
  column: string,
  raw: unknown,
  expected: string,
  missing: readonly string[],
): never {
  const accepted =
    missing.length > 0
      ? ` or ${missing.map((m) => JSON.stringify(m)).join(" / ")}`
      : "";
  throw new Error(
    `Cannot coerce column "${column}": expected ${expected}${accepted}, got ${JSON.stringify(raw)}`,
  );
}

function coerceInt(raw: string, column: string, spec: ColumnSpec): number {
  if (!/^-?\d+$/.test(raw)) reject(column, raw, "an integer", spec.missing);
  return Number.parseInt(raw, 10);
}

function coerceFloat(raw: string, column: string, spec: ColumnSpec): number {
  if (!/^-?\d+(\.\d+)?$/.test(raw)) reject(column, raw, "a number", spec.missing);
  return Number.parseFloat(raw);
}

/**
 * Build a local-time date and confirm the components survived.
 *
 * `Date` silently rolls impossible dates forward — Feb 31 becomes Mar 3 — so a
 * round-trip check is the only way to reject a date that parsed but is not real.
 * Local rather than UTC because these are calendar dates with no zone; the render
 * layer reads them back with the matching local getters.
 */
function buildDate(
  year: number,
  month: number,
  day: number,
  raw: string,
  column: string,
  spec: ColumnSpec,
): Date {
  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    reject(column, raw, "a real calendar date", spec.missing);
  }
  return parsed;
}

function coerceDate(raw: string, column: string, spec: ColumnSpec): Date {
  if (spec.format === "iso-datetime") {
    const match = ISO_PATTERN.exec(raw);
    if (!match) reject(column, raw, "an ISO 8601 datetime", spec.missing);
    const date = buildDate(
      Number(match[1]),
      Number(match[2]),
      Number(match[3]),
      raw,
      column,
      spec,
    );
    date.setHours(Number(match[4]), Number(match[5]), Number(match[6]), 0);
    return date;
  }

  const match = MDY_PATTERN.exec(raw);
  if (!match) reject(column, raw, "a M/D/YY date", spec.missing);
  return buildDate(
    CENTURY + Number(match[3]),
    Number(match[1]),
    Number(match[2]),
    raw,
    column,
    spec,
  );
}

/**
 * Turn one raw cell into its typed value.
 *
 * A marker this column declares becomes `null`. Anything else that does not parse
 * throws rather than becoming `null` — a silent `null` is indistinguishable from
 * legitimately missing data, which is exactly the wrong thing to hide when the
 * data source changes.
 *
 * Non-string input throws too. The tab-separated export could not represent a
 * real NULL; SQLite can, and no column in either table is declared `NOT NULL`. A
 * `null` slipping through the text branch would return `null` while the row type
 * claims `string`, which is the precise lie this layer exists to prevent.
 */
export function coerceValue(
  raw: string,
  spec: ColumnSpec,
  column: string,
): string | number | Date | null {
  if (typeof raw !== "string") {
    reject(column, raw, "a string cell", spec.missing);
  }
  if (spec.missing.includes(raw)) return null;

  switch (spec.kind) {
    case "text":
      if (raw === "") reject(column, raw, "a non-empty string", spec.missing);
      return raw;
    case "int":
      return coerceInt(raw, column, spec);
    case "float":
      return coerceFloat(raw, column, spec);
    case "date":
      return coerceDate(raw, column, spec);
  }
}

/**
 * Comparator that keeps missing values in one place.
 *
 * Nulls sort last in *both* directions — flipping the direction reverses the
 * real values only. A plain negated comparator would move nulls to the top on
 * descending sorts and scatter missing rows depending on which way the user
 * clicked, which is the thing to avoid.
 */
export function nullsLast<T extends number | Date | string>(
  direction: SortDirection = "asc",
): (a: T | null, b: T | null) => number {
  return (a, b) => {
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;

    const order = compareDefined(a, b);
    // Return 0 rather than -0 for equal values: sorting treats them alike, but -0
    // is a surprising thing for a comparator to hand back and it trips Object.is.
    if (order === 0) return 0;
    return direction === "asc" ? order : -order;
  };
}

/**
 * Order two present values of the same column.
 *
 * Numbers and dates compare numerically. Strings compare by code point, which is
 * what makes an ISO date string sort chronologically — the property that lets dates
 * cross the server/client boundary as strings without losing orderability.
 *
 * Deliberately not `localeCompare`: locale collation would make the order depend on
 * the reader's environment, and these values are identifiers and paths rather than
 * prose.
 */
function compareDefined(a: number | Date | string, b: number | Date | string): number {
  if (typeof a === "string" || typeof b === "string") {
    const left = String(a);
    const right = String(b);
    return left < right ? -1 : left > right ? 1 : 0;
  }
  return Number(a) - Number(b);
}
