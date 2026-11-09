"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

function Table({
  className,
  containerClassName,
  containerRef,
  ...props
}: React.ComponentProps<"table"> & {
  /**
   * Applied to the scroll container.
   *
   * Needed because a sticky header only works against a container that actually
   * scrolls vertically, which requires a height constraint the default does not set.
   */
  containerClassName?: string
  containerRef?: React.Ref<HTMLDivElement>
}) {
  return (
    <div
      ref={containerRef}
      data-slot="table-container"
      className={cn("relative w-full overflow-auto", containerClassName)}
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

/**
 * Deviates from stock shadcn: **row state colours must be opaque.**
 *
 * Stock uses `bg-muted/50` for hover and aria-expanded. That is fine for an ordinary
 * table and wrong for this one, because the browse table pins its `sample` column with
 * `bg-inherit` — and `background-color: inherit` takes the parent's *computed* value,
 * alpha included. A half-transparent row therefore makes the pinned cell
 * half-transparent, and the columns scrolling underneath composite straight through
 * the sample name. It looks correct at rest and breaks only while hovering, which is
 * how it shipped.
 *
 * `color-mix` flattens the same colour against the background rather than picking a
 * different one, so the hover is visually unchanged — it just no longer has an alpha
 * channel for a sticky cell to inherit. The vars are theme-scoped and resolve on this
 * element, so light and dark both stay correct.
 *
 * `data-[state=selected]:bg-muted` is already opaque and needs nothing.
 *
 * The colour is spelled out twice rather than hoisted into a constant: Tailwind scans
 * source text statically, so a class assembled from a variable generates no CSS.
 */
function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors data-[state=selected]:bg-muted",
        "hover:bg-[color-mix(in_srgb,var(--muted)_50%,var(--background))]",
        "has-aria-expanded:bg-[color-mix(in_srgb,var(--muted)_50%,var(--background))]",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
