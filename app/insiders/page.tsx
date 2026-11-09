import Link from "next/link";

import { INSIDERS_LABEL, INSIDERS_NAV } from "@/lib/site/nav";

export const metadata = { title: INSIDERS_LABEL };

/**
 * The hub.
 *
 * Lists its sections rather than redirecting to one of them. A redirect would make the
 * `/insiders` URL a lie about what lives there, and would need revisiting the moment a
 * fourth section exists.
 *
 * **Tiles rather than a list of links, and this is the one place on the site where a card is
 * the right answer.** The public pages avoid them on purpose — a card that only draws a box
 * around prose is chrome standing in for hierarchy. Here each tile *is* the interaction: the
 * whole rectangle is the click target and the page has no other job. That is the test the rest
 * of the site fails and this passes.
 *
 * The second line of each tile comes from `INSIDERS_NAV`, not from here, so a section added to
 * the nav arrives with its description or fails a test. This page cannot say how many runs the
 * data section holds, and that is structural rather than an oversight: reading the seam from
 * outside `insiders/data/` would couple the whole area's build to the research database, which
 * `boundary.test.ts` forbids by walking imports.
 */
export default function InsidersPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-12 sm:py-16">
      <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
        {INSIDERS_LABEL}
      </h1>
      <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
        Lab-only tools and records.
      </p>

      <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {INSIDERS_NAV.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              /*
                `h-full` so tiles in a row match height regardless of how long a description
                runs — a grid of boxes with ragged bottoms reads as a rendering fault.

                The lift is a single pixel, the same as the public site's Insiders pill. Enough
                to answer "is this clickable" and not enough to be a flourish in a tool.
              */
              className="group hover:border-site-link focus-visible:ring-site-link block h-full rounded-lg border p-5 transition-all hover:-translate-y-px hover:shadow-sm focus-visible:ring-2 focus-visible:outline-none"
            >
              <span className="font-display flex items-center justify-between gap-3 font-semibold">
                {link.label}
                {/*
                  Decorative: the link's text already names the destination, and an arrow
                  announced after it would read as a second thing to go to.
                */}
                <span
                  aria-hidden
                  className="text-site-link transition-transform group-hover:translate-x-0.5"
                >
                  →
                </span>
              </span>
              <span className="text-muted-foreground mt-2 block text-sm leading-relaxed">
                {link.description}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
