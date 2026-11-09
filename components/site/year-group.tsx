import type { ReactNode } from "react";

/**
 * A year, pinned beside the items belonging to it.
 *
 * The labelled-row shape the people page established, for a list whose label is a year: the
 * publications. Kept as its own component because the sticky column has a load-bearing detail that
 * is invisible at the call site — see the comment below. The people page keeps its own copy on
 * purpose: its label is a small uppercase eyebrow over a bordered section, which is a different
 * treatment of the same idea rather than the same markup.
 *
 * The caller supplies the list itself, so the row spacing stays the caller's choice.
 */
export function YearGroup({
  year,
  children,
}: {
  year: number;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-x-10 gap-y-4 md:grid-cols-[168px_1fr]">
      {/*
        `self-start` is the load-bearing part: a grid item stretches to its row by default, and a
        full-height item has nowhere to stick to, so without it the year does not pin. `top-24`
        clears the 68px site header.
      */}
      <h2 className="font-display text-site-ink/70 self-start text-2xl font-bold tracking-tight md:sticky md:top-24">
        {year}
      </h2>
      {children}
    </section>
  );
}
