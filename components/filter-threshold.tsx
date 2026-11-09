"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatValue } from "@/lib/display/format";
import {
  THRESHOLD_COLUMNS,
  boundsActive,
  filterLabel,
  parseBound,
  type ThresholdBounds,
} from "@/lib/table/filters";

/**
 * Bounds on the QC metrics.
 *
 * One control with a metric picker rather than eleven always-visible pairs of inputs —
 * eleven metrics × two fields would be twenty-two boxes competing with five facets, the
 * search, Columns and the page size. The plan left this as a layout call and this is it.
 *
 * Inputs are hand-rolled `<input>` with Tailwind classes, matching the search box beside
 * them. There is no shadcn Input in this project and introducing one for two fields
 * would be the odd choice.
 */
export function FilterThreshold({
  bounds,
  onChange,
  rangeFor,
}: {
  /** Current bounds per column, for showing which metrics are active. */
  bounds: (column: string) => ThresholdBounds;
  onChange: (column: string, next: ThresholdBounds) => void;
  /** The min and max among the rows passing every other filter, for placeholders. */
  rangeFor: (column: string) => [number, number] | undefined;
}) {
  const [selected, setSelected] = useState<string>(THRESHOLD_COLUMNS[0]);

  const activeCount = THRESHOLD_COLUMNS.filter((c) => boundsActive(bounds(c))).length;
  const [min, max, includeNulls] = bounds(selected);
  const range = rangeFor(selected);

  /** Placeholders show the available range, so a bound is a choice rather than a guess. */
  const hint = (index: 0 | 1) =>
    range === undefined ? "" : formatValue(selected, range[index]);

  function set(next: ThresholdBounds) {
    onChange(selected, next);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" aria-label="Filter by a QC metric">
          <SlidersHorizontal className="size-3.5" aria-hidden />
          Metrics
          {activeCount > 0 ? <span className="tabular-nums">{activeCount}</span> : null}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel>Bound a metric</DropdownMenuLabel>
        <DropdownMenuSeparator />

        <div className="flex flex-col gap-2 p-2">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">Metric</span>
            <select
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
              className="border-input bg-background h-8 rounded-md border px-2 text-xs"
            >
              {THRESHOLD_COLUMNS.map((column) => (
                <option key={column} value={column}>
                  {filterLabel(column)}
                  {boundsActive(bounds(column)) ? " ·" : ""}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-end gap-2">
            <label className="flex flex-1 flex-col gap-1 text-xs">
              <span className="text-muted-foreground">At least</span>
              <input
                type="text"
                inputMode="decimal"
                value={min ?? ""}
                placeholder={hint(0)}
                onChange={(event) =>
                  set([parseBound(event.target.value), max, includeNulls])
                }
                className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-md border px-2 text-xs tabular-nums focus-visible:ring-[3px] focus-visible:outline-none"
              />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-xs">
              <span className="text-muted-foreground">At most</span>
              <input
                type="text"
                inputMode="decimal"
                value={max ?? ""}
                placeholder={hint(1)}
                onChange={(event) =>
                  set([min, parseBound(event.target.value), includeNulls])
                }
                className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-md border px-2 text-xs tabular-nums focus-visible:ring-[3px] focus-visible:outline-none"
              />
            </label>
          </div>

          {/*
            A bound never admits a row with no value, so this is the only way to reach
            them. Two metrics have nulls — four samples have no peak score and twelve no
            motif-peak count — and without this "which ones" is unanswerable.
          */}
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={includeNulls === true}
              onChange={(event) => set([min, max, event.target.checked])}
              className="border-input size-3.5 rounded border"
            />
            <span className="text-muted-foreground">Include rows with no value</span>
          </label>

          {boundsActive(bounds(selected)) ? (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => set([undefined, undefined, false])}
            >
              Clear {filterLabel(selected)}
            </Button>
          ) : null}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
