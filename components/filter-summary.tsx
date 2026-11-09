"use client";

import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { FilterChip } from "@/lib/table/filters";

/**
 * What is currently narrowing the table, and how to undo it.
 *
 * Load-bearing rather than decorative. Filters deliberately survive hiding their
 * column, so for a hidden column this row is the **only** thing on screen explaining
 * why the result set is short — that is what makes keeping the filter defensible instead
 * of a trap, and it is the same failure that ruled out putting filters in the column
 * headers, where active state would scatter across twenty columns and off screen.
 *
 * A chip therefore looks identical whether its column is visible or not. Nothing here
 * knows about visibility.
 *
 * Renders nothing at all when nothing is active, so an unfiltered table keeps its
 * vertical space.
 */
export function FilterSummary({
  chips,
  onClear,
  onClearAll,
}: {
  chips: readonly FilterChip[];
  onClear: (column: string) => void;
  onClearAll: () => void;
}) {
  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Active filters">
      {chips.map((chip) => (
        <button
          key={chip.column}
          type="button"
          onClick={() => onClear(chip.column)}
          aria-label={`Clear the ${chip.label} filter`}
          title={`Clear the ${chip.label} filter`}
          className="border-input bg-background hover:bg-muted focus-visible:ring-ring/50 flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs focus-visible:ring-[3px] focus-visible:outline-none"
        >
          <span className="text-muted-foreground">{chip.label}</span>
          <span>{chip.value}</span>
          <X className="size-3 opacity-60" aria-hidden />
        </button>
      ))}

      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onClearAll}>
        Clear all
      </Button>
    </div>
  );
}
