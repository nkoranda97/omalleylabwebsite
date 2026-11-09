/**
 * Filter state as a shareable URL.
 *
 * A pure function pair, so the encoding is testable without a browser and the component
 * only has to decide *when* to read and write.
 *
 * **Malformed input is ignored, not rejected.** That is the opposite of this codebase's
 * habit — the data layer throws on anything it cannot explain, and the display layer
 * throws on an unlabelled column. A URL is different: it is user-editable text, and a
 * link shared before a column was renamed should degrade to a wider view rather than a
 * crashed page. Nobody's data is at risk from a dropped filter; a 500 on a pasted link
 * costs someone their afternoon.
 */

import {
  FILTERABLE_COLUMNS,
  currentBounds,
  filterKind,
  isFilterable,
  parseBound,
  type ThresholdBounds,
} from "./filters.ts";

/** The shape TanStack holds, narrowed to what this module round-trips. */
export type FilterState = readonly { id: string; value: unknown }[];

/** Separates the selected values inside one facet parameter. */
const VALUE_SEPARATOR = ",";

/** Marks a threshold parameter apart from a facet's value list. */
const BOUND_SEPARATOR = "..";

/** Suffix on a threshold that also wants the rows with no value. */
const NULLS_FLAG = "+none";

/**
 * Encode filter state into a query string, without the leading `?`.
 *
 * Ordered by the declaration rather than by when the reader clicked, so the same set of
 * filters always produces byte-identical output. That matters: the component writes with
 * `replaceState` on every state change, and an unstable encoding would rewrite the URL
 * on re-renders that changed nothing.
 *
 * Empty state encodes to `""`, so an unfiltered table keeps a clean URL.
 */
export function encodeFilters(state: FilterState): string {
  const byColumn = new Map(state.map((entry) => [entry.id, entry.value]));
  const params = new URLSearchParams();

  for (const column of FILTERABLE_COLUMNS) {
    if (!byColumn.has(column)) continue;
    const value = byColumn.get(column);

    if (filterKind(column) === "facet") {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      if (selected.length === 0) continue;
      params.set(column, selected.join(VALUE_SEPARATOR));
      continue;
    }

    const [min, max, nulls] = currentBounds(value);
    if (min === undefined && max === undefined && nulls !== true) continue;
    const bounds = `${min ?? ""}${BOUND_SEPARATOR}${max ?? ""}`;
    params.set(column, nulls === true ? `${bounds}${NULLS_FLAG}` : bounds);
  }

  return params.toString();
}

/**
 * Read filter state back out of a query string.
 *
 * Every failure mode drops the offending parameter and keeps the rest: a column that is
 * not filterable, a bound that is not a number, a facet value list that is empty. A
 * partially-understood URL yields a partially-applied filter set, which is the graceful
 * direction to fail in.
 */
export function decodeFilters(query: string): { id: string; value: unknown }[] {
  const params = new URLSearchParams(query);
  const state: { id: string; value: unknown }[] = [];

  for (const column of FILTERABLE_COLUMNS) {
    const raw = params.get(column);
    if (raw === null || raw === "") continue;

    if (filterKind(column) === "facet") {
      const selected = raw.split(VALUE_SEPARATOR).filter((value) => value !== "");
      if (selected.length > 0) state.push({ id: column, value: selected });
      continue;
    }

    const wantsNulls = raw.endsWith(NULLS_FLAG);
    const body = wantsNulls ? raw.slice(0, -NULLS_FLAG.length) : raw;
    if (!body.includes(BOUND_SEPARATOR)) continue;

    const [low, high] = body.split(BOUND_SEPARATOR);
    const bounds: ThresholdBounds = [parseBound(low), parseBound(high), wantsNulls];
    if (bounds[0] === undefined && bounds[1] === undefined && !wantsNulls) continue;
    state.push({ id: column, value: bounds });
  }

  // Anything naming a column this app cannot filter is silently absent, because the
  // loop only ever asks about columns it knows.
  return state.filter((entry) => isFilterable(entry.id));
}
