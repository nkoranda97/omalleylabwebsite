"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { INSIDERS_LABEL, INSIDERS_NAV } from "@/lib/site/nav";
import { cn } from "@/lib/utils";

/**
 * The insiders section nav, with the current section marked.
 *
 * A client component, and the only reason is `usePathname` — the public nav needs no such
 * thing because a visitor reading a page knows what they opened, whereas someone working in
 * a tool area arrives by link and stays. `usePathname` is safe on a prerendered route in a
 * way `useSearchParams` is not: it needs no Suspense boundary, because the path is known at
 * build time while the query string is not.
 *
 * A section counts as current for its own descendants too, so a sample's detail page still
 * shows Data as where you are. Matching on the prefix with a trailing slash rather than
 * `startsWith(href)` alone, so a future `/insiders/database` could not light up `Data`.
 */
export function InsidersNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label={INSIDERS_LABEL}
      className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm"
    >
      {INSIDERS_NAV.map((link) => {
        const current =
          pathname === link.href || pathname.startsWith(`${link.href}/`);

        return (
          <Link
            key={link.href}
            href={link.href}
            /*
              `aria-current` rather than colour alone. The underline and the weight are both
              visual, and a screen reader gets neither.
            */
            aria-current={current ? "page" : undefined}
            className={cn(
              /*
                The public nav's underline, deliberately: it grows from the left on a scaled
                pseudo-element so it animates on the compositor rather than on layout. Sharing
                the gesture is most of what makes the two areas read as one site.
              */
              "focus-visible:ring-site-link relative rounded-sm py-1 transition-colors",
              "after:absolute after:inset-x-0 after:-bottom-0.5 after:h-0.5 after:origin-left after:transition-transform after:duration-200 after:content-['']",
              "focus-visible:ring-2 focus-visible:outline-none",
              current
                ? // Held open in the link colour, not animated. Where you are is a state, not a gesture.
                  "text-site-ink after:bg-site-link font-medium after:scale-x-100"
                : "text-site-ink/70 hover:text-site-ink after:scale-x-0 after:bg-current hover:after:scale-x-100",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
