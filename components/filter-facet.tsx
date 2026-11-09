"use client";

import { Check, ListFilter } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { filterLabel, type FacetOption } from "@/lib/table/filters";

/**
 * One pick-from-a-list filter.
 *
 * Built on the same `DropdownMenu` the Columns control uses rather than a new popover
 * and checkbox pair. It is the established shape in this toolbar, the keyboard
 * navigation and checked state come for free, and `onSelect` preventDefault to keep the
 * menu open while multi-selecting is already proven there. Five facets sitting beside
 * Columns should look like Columns.
 *
 * The counts are the part worth caring about. They come from TanStack's faceted unique
 * values, computed against the rows passing every *other* active filter — so selecting
 * Treatment makes the Control Sample counts drop to what those rows actually contain.
 * An option here can never promise rows that clicking it would not produce.
 */
export function FilterFacet({
  column,
  options,
  selected,
  onChange,
}: {
  column: string;
  options: readonly FacetOption[];
  selected: readonly string[];
  onChange: (next: string[]) => void;
}) {
  const label = filterLabel(column);
  const active = selected.length > 0;

  function toggle(key: string, checked: boolean) {
    onChange(checked ? [...selected, key] : selected.filter((k) => k !== key));
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" aria-label={`Filter by ${label}`}>
          <ListFilter className="size-3.5" aria-hidden />
          {label}
          {active ? (
            <span className="tabular-nums">{selected.length}</span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-96 w-64 overflow-y-auto">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {options.length === 0 ? (
          // Reachable: once other filters narrow far enough, a facet can have nothing
          // left to offer. Saying so beats an empty menu that looks broken.
          <p className="text-muted-foreground px-2 py-1.5 text-xs italic">
            No values in the current selection
          </p>
        ) : (
          options.map((option) => (
            <DropdownMenuCheckboxItem
              key={option.key}
              checked={selected.includes(option.key)}
              onCheckedChange={(value) => toggle(option.key, Boolean(value))}
              // Without this the menu closes on every click, which makes selecting
              // three values three separate trips.
              onSelect={(event) => event.preventDefault()}
              className="text-xs"
            >
              <span className="flex-1">{option.label}</span>
              <span className="text-muted-foreground tabular-nums">{option.count}</span>
            </DropdownMenuCheckboxItem>
          ))
        )}

        {active ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                onChange([]);
              }}
              className="text-xs"
            >
              <Check className="size-3.5 opacity-0" aria-hidden />
              Clear {label}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
