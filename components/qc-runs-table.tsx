"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFacetedMinMaxValues,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronsUpDown, Columns3 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { rowMatches } from "@/lib/table/ordering";
import {
  buildColumnDefs,
  LINK_COLUMN,
  searchableColumns,
  type QcTableRow,
} from "@/lib/table/column-defs";
import { formatValue } from "@/lib/display/format";
import { TABLE_HIDDEN_BY_DEFAULT } from "@/lib/display/column-groups";
import { columnLabel } from "@/lib/display/labels";
import { sampleHref } from "@/lib/site/nav";
import { FilterFacet } from "@/components/filter-facet";
import { FilterThreshold } from "@/components/filter-threshold";
import { FilterSummary } from "@/components/filter-summary";
import { decodeFilters, encodeFilters } from "@/lib/table/filter-url";
import {
  FACET_COLUMNS,
  currentBounds,
  emptyStateMessage,
  facetOptions,
  filterChips,
  type FacetSelection,
} from "@/lib/table/filters";
import {
  TABLE_LOGO_HEIGHT,
  isMotifColumn,
  motifAltText,
  type LogoBox,
  type MotifImage,
} from "@/lib/display/motif";

export type { QcTableRow };

/** One logo, already scaled and cropped on the server. */
export type MotifCell = { src: string } & LogoBox;

const PAGE_SIZES = [25, 50, 100] as const;

/**
 * Anchor the identity column while the rest scrolls.
 *
 * At full width the worst legibility problem was not the column count but losing
 * `sample` on horizontal scroll, which left every value on screen unattributable.
 * `bg-inherit` makes the pinned cell take the row's own background so content cannot
 * show through it, and the divider appears only once something is actually hidden to
 * the left — the anchor stays silent until it is doing work.
 */
function stickyColumn(isSticky: boolean, scrolled: boolean): string {
  if (!isSticky) return "";
  return [
    "sticky left-0 z-20 bg-inherit",
    // A shadow rather than a hairline, and this is not decoration. Numbers scroll
    // *under* the pinned column, so a clipped 99531670 reads as a perfectly plausible
    // 9531670. A hairline says "next column"; a soft edge says "this value continues
    // beneath", which is the difference between a misread figure and an obscured one.
    "after:pointer-events-none after:absolute after:inset-y-0 after:-right-2 after:w-2 after:content-['']",
    scrolled
      ? "after:bg-gradient-to-r after:from-foreground/12 after:to-transparent"
      : "after:bg-none",
  ].join(" ");
}

/**
 * One motif cell: the logo, or a statement that MEME found none.
 *
 * A plain `<img>` rather than `next/image`. The optimizer's value is resizing and
 * format conversion, and against a route handler that needs either request-time
 * optimization — making the one image-bearing surface dynamic while every other
 * route is static — or `unoptimized`, which reduces it to this. What actually matters
 * across 100 images on a page is the explicit box, which is already known: the seam
 * reports each logo's intrinsic size and the server scales it.
 *
 * A sample with no motif renders blank. It still reserves the full height, which is
 * not cosmetic: letting the cell collapse made the nine motif-less samples render as
 * squeezed rows, reading as a rendering fault rather than a fact about those samples.
 *
 * **Nothing on this page says why a blank cell is blank.** It was the page header,
 * which stated the count and the reason; that subtitle has been removed. So a reader
 * here cannot currently tell "MEME searched and found no motif" from "this value was
 * never recorded" — the detail page draws the distinction, and only once you open a
 * sample. Worth restoring somewhere on this page.
 */
function MotifImageCell({
  sample,
  image,
  cell,
}: {
  sample: string;
  image: MotifImage;
  cell: MotifCell | undefined;
}) {
  if (cell === undefined) {
    return <span className="block" style={{ height: TABLE_LOGO_HEIGHT }} />;
  }

  return (
    <span
      className="block overflow-hidden"
      style={{ width: cell.width, height: cell.height }}
      title={motifAltText(sample, image)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={cell.src}
        alt={motifAltText(sample, image)}
        width={cell.imageWidth}
        height={cell.height}
        loading="lazy"
        decoding="async"
        className="block max-w-none"
        style={{ marginLeft: -cell.offset }}
      />
    </span>
  );
}

export function QcRunsTable({
  columns,
  rows,
  motifCells,
}: {
  columns: readonly string[];
  rows: readonly QcTableRow[];
  motifCells: Record<string, MotifCell>;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [query, setQuery] = useState("");
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() =>
    Object.fromEntries(TABLE_HIDDEN_BY_DEFAULT.map((c) => [c, false])),
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const node = scrollRef.current;
    if (node === null) return;
    const onScroll = () => setScrolled(node.scrollLeft > 0);
    onScroll();
    node.addEventListener("scroll", onScroll, { passive: true });
    return () => node.removeEventListener("scroll", onScroll);
  }, []);

  /**
   * Adopt any filters the URL arrived with, once, after mount.
   *
   * Deliberately `window.location.search` in an effect rather than `useSearchParams`.
   * That hook forces the client tree up to the nearest `Suspense` boundary to be
   * client-rendered, and this component *is* the table — so it took all 109 rows out of
   * the prerendered HTML, measured at zero `<table>` tags in the build output. This app
   * bakes 313 entries at build time by design; losing the table's markup for every
   * visitor, including the ones who arrive with no filters at all, is too much to pay for
   * a shareable link.
   *
   * The cost of doing it this way is narrow and lands on the right people: someone opening
   * a filtered link sees the full table for the frame before the effect runs. The unfiltered
   * view is a valid page rather than a broken one, and only visitors who opted into a
   * filtered URL see it at all.
   */
  useEffect(() => {
    const initial = decodeFilters(window.location.search);
    if (initial.length > 0) setColumnFilters(initial as ColumnFiltersState);
  }, []);

  /**
   * Mirror the filter state into the URL so a view can be shared.
   *
   * `replaceState` rather than `router.push`: pushing would add a history entry per
   * keystroke in a bound field and make the back button walk through every intermediate
   * state. Next integrates both with its router, so `useSearchParams` stays in sync.
   *
   * The equality check is what makes the encoder's stability guarantee pay off — without
   * it, every re-render would rewrite an identical URL.
   */
  useEffect(() => {
    const query = encodeFilters(columnFilters);
    const next = query === "" ? window.location.pathname : `${window.location.pathname}?${query}`;
    if (next !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, "", next);
    }
  }, [columnFilters]);

  const columnDefs = useMemo(() => buildColumnDefs(columns), [columns]);

  const table = useReactTable({
    data: rows as QcTableRow[],
    columns: columnDefs,
    state: { sorting, globalFilter: query, columnVisibility, columnFilters },
    onSortingChange: setSorting,
    onGlobalFilterChange: setQuery,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnFiltersChange: setColumnFilters,
    globalFilterFn: (row, _columnId, filterValue) =>
      rowMatches(
        row.original,
        String(filterValue),
        formatValue,
        // Searching a hidden column would narrow the table to rows whose reason for
        // matching is off screen. Motif columns are excluded for a different reason:
        // their cell is a picture, so there is no text a reader could be looking at.
        searchableColumns(columns, (c) => columnVisibility[c] !== false),
      ),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    // Faceting is what keeps option counts honest: they are computed against the rows
    // passing every *other* filter, so a count never promises rows that aren't there.
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getFacetedMinMaxValues: getFacetedMinMaxValues(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 50 } },
  });

  const chips = filterChips(table.getState().columnFilters);
  const visibleCount = table.getVisibleLeafColumns().length;
  const filtered = table.getFilteredRowModel().rows.length;
  const { pageIndex, pageSize } = table.getState().pagination;
  const firstOnPage = filtered === 0 ? 0 : pageIndex * pageSize + 1;
  const lastOnPage = Math.min((pageIndex + 1) * pageSize, filtered);

  /** Read and write one column's facet selection through the table. */
  const selectionFor = (column: string): FacetSelection =>
    (table.getColumn(column)?.getFilterValue() as FacetSelection | undefined) ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {FACET_COLUMNS.map((column) => (
          <FilterFacet
            key={column}
            column={column}
            options={facetOptions(
              column,
              table.getColumn(column)?.getFacetedUniqueValues(),
            )}
            selected={selectionFor(column)}
            onChange={(next) => table.getColumn(column)?.setFilterValue(next)}
          />
        ))}

        <FilterThreshold
          bounds={(column) => currentBounds(table.getColumn(column)?.getFilterValue())}
          onChange={(column, next) => table.getColumn(column)?.setFilterValue(next)}
          rangeFor={(column) => {
            const range = table.getColumn(column)?.getFacetedMinMaxValues();
            // Faceted min/max can hold nulls when a column has them, and a NaN
            // placeholder is worse than none.
            if (range === undefined) return undefined;
            const [low, high] = range;
            return typeof low === "number" && typeof high === "number"
              ? [low, high]
              : undefined;
          }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search text columns…"
          aria-label="Search text columns"
          className="border-input bg-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-64 rounded-md border px-3 text-sm focus-visible:ring-[3px] focus-visible:outline-none"
        />
        <p className="text-muted-foreground text-sm tabular-nums" aria-live="polite">
          {filtered === rows.length
            ? `${firstOnPage}–${lastOnPage} of ${rows.length}`
            : `${filtered} matching of ${rows.length}`}
        </p>

        <div className="ml-auto flex items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Columns3 className="size-3.5" aria-hidden />
                Columns
                <span className="text-muted-foreground tabular-nums">
                  {visibleCount}/{columns.length}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-96 w-56 overflow-y-auto">
              <DropdownMenuLabel>Show columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {table.getAllLeafColumns().map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  checked={column.getIsVisible()}
                  disabled={column.id === LINK_COLUMN}
                  onCheckedChange={(value) => column.toggleVisibility(Boolean(value))}
                  onSelect={(event) => event.preventDefault()}
                  className="text-xs"
                >
                  {columnLabel(column.id)}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <label className="text-muted-foreground flex items-center gap-2 text-sm">
            Rows
            <select
              value={pageSize}
              onChange={(event) => table.setPageSize(Number(event.target.value))}
              aria-label="Rows per page"
              className="border-input bg-background h-9 rounded-md border px-2 text-sm"
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <FilterSummary
        chips={chips}
        onClear={(column) => table.getColumn(column)?.setFilterValue(undefined)}
        onClearAll={() => setColumnFilters([])}
      />

      <Table
        containerRef={scrollRef}
        containerClassName="max-h-[calc(100vh-15rem)] rounded border"
        className="whitespace-nowrap text-xs"
      >
        <TableHeader className="bg-background sticky top-0 z-30">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="bg-background hover:bg-background">
              {headerGroup.headers.map((header) => {
                const sorted = header.column.getIsSorted();
                const Icon =
                  sorted === "asc" ? ArrowUp : sorted === "desc" ? ArrowDown : ChevronsUpDown;
                const isSticky = header.column.id === LINK_COLUMN;
                return (
                  <TableHead
                    key={header.id}
                    className={`px-0 align-bottom font-medium ${stickyColumn(isSticky, scrolled)}`}
                  >
                    <button
                      type="button"
                      onClick={header.column.getToggleSortingHandler()}
                      aria-label={`Sort by ${columnLabel(header.column.id)}`}
                      className="hover:text-foreground focus-visible:ring-ring/50 flex w-full min-w-24 max-w-40 items-end gap-1.5 px-2 py-1.5 text-left whitespace-normal focus-visible:ring-[3px] focus-visible:outline-none"
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      <Icon
                        className={sorted ? "size-3 shrink-0" : "size-3 shrink-0 opacity-25"}
                        aria-hidden
                      />
                    </button>
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={visibleCount}
                className="text-muted-foreground h-24 text-center"
              >
                {/*
                  Three causes the previous single message collapsed into one. With
                  filters active and the search box empty, `No rows match ""` blamed the
                  wrong thing entirely.
                */}
                {emptyStateMessage(query, chips.length)}
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} className="bg-background">
                {row.getVisibleCells().map((cell) => {
                  const isSticky = cell.column.id === LINK_COLUMN;
                  const sample = String(row.original[LINK_COLUMN]);
                  return (
                    <TableCell
                      key={cell.id}
                      className={`px-2 py-1 font-mono tabular-nums ${stickyColumn(isSticky, scrolled)}`}
                    >
                      {isSticky ? (
                        <Link
                          href={sampleHref(String(cell.getValue()))}
                          className="hover:text-foreground focus-visible:ring-ring/50 font-medium underline-offset-2 hover:underline focus-visible:ring-[3px] focus-visible:outline-none"
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </Link>
                      ) : isMotifColumn(cell.column.id) ? (
                        <MotifImageCell
                          sample={sample}
                          image={cell.column.id}
                          cell={motifCells[`${sample}/${cell.column.id}`]}
                        />
                      ) : (
                        flexRender(cell.column.columnDef.cell, cell.getContext())
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          Next
        </Button>
        <p className="text-muted-foreground text-sm tabular-nums">
          Page {pageIndex + 1} of {Math.max(table.getPageCount(), 1)}
        </p>
      </div>
    </div>
  );
}
