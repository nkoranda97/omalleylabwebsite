import Link from "next/link";

import { buttonClass } from "@/components/site/button";
import { Logo } from "@/components/site/logo";
import { LAB } from "@/lib/site/lab";
import { INSIDERS_LABEL, INSIDERS_PREFIX, PUBLIC_NAV } from "@/lib/site/nav";

/**
 * The public shell.
 *
 * A nested layout, not a root layout. Route groups can define multiple roots, and
 * navigating between two of them forces a full page reload — keeping `app/layout.tsx` as
 * the single root means crossing to the insiders area stays a client-side navigation.
 *
 * The group's parentheses keep it out of the URL, so the landing page it wraps is `/`.
 *
 * A white bar with a hairline rule, a serif wordmark, and lime fills on near-square buttons. It
 * uses the additive `--site-*` tokens rather than the shadcn ones, so nothing here can reach the
 * data browser.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-site-paper text-site-ink flex min-h-full flex-1 flex-col">
      <header className="border-site-ink/10 sticky top-0 z-40 border-b bg-white">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-8 gap-y-3 px-6 py-4">
          {/*
            The mark and the wordmark are one link, not two. Two links to the same place sitting
            next to each other give a keyboard user two identical stops and a screen reader two
            identical announcements, so the mark is `aria-hidden` inside the component and the
            words name the destination.

            `w-auto` with a fixed height: the mark is slightly taller than wide (395 by 415),
            and constraining the height is what keeps it aligned with the text beside it.
          */}
          <Link
            href="/"
            className="font-display text-site-ink focus-visible:ring-site-link flex items-center gap-2.5 rounded-sm text-lg font-bold tracking-tight focus-visible:ring-2 focus-visible:outline-none"
          >
            <Logo className="h-10 w-auto" />
            {LAB.name}
          </Link>

          <nav aria-label="Main" className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            {/*
              Home is filtered out of the rendered links because the wordmark to the left is
              the home link — two of them in one bar is noise. It stays in PUBLIC_NAV because
              that list is the checked declaration of which public pages exist.
            */}
            {PUBLIC_NAV.filter((link) => link.href !== "/").map((link) => (
              <Link
                key={link.href}
                href={link.href}
                /*
                 * The underline grows from the left rather than appearing all at once —
                 * one of the three motions, and the only one in the chrome. A scaled
                 * pseudo-element so it animates on the compositor rather than on layout.
                 */
                className="text-site-ink/75 hover:text-site-ink focus-visible:ring-site-link relative rounded-sm py-1 transition-colors after:absolute after:inset-x-0 after:-bottom-0.5 after:h-0.5 after:origin-left after:scale-x-0 after:bg-current after:transition-transform after:duration-200 after:content-[''] hover:after:scale-x-100 focus-visible:ring-2 focus-visible:outline-none"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/*
            The one route from the public site into the protected area. A pill rather than a
            nav link, and last rather than among them: members need to find it, but it is not
            an ordinary section of the public site.
          */}
          <Link
            href={INSIDERS_PREFIX}
            className={`${buttonClass("compact")} ml-auto`}
          >
            {INSIDERS_LABEL}
          </Link>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="bg-site-ink text-white/70">
        {/*
          `items-center`, not `items-baseline` as before: a baseline is a property of text, and an
          SVG has none, so an icon in a baseline-aligned row sits wherever its box happens to fall.
        */}
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-4 px-6 py-10 text-xs">
          {/*
            The same component as the header, drawing in the opposite direction — this is the
            `currentColor` decision paying for itself. One file, and the footer's text colour is
            what makes the mark light here and dark up there.
          */}
          <div className="flex items-center gap-3">
            {/*
              Brighter than the text it sits beside, not equal to it. Inheriting the footer's
              white/70 made the mark read as a grey smudge: thin line work carries far less ink
              per pixel than a letterform, so the same opacity lands visibly fainter. /90 puts it
              at about the weight the wordmark has in the header.
            */}
            <Logo className="h-8 w-auto text-white/90" />
            <p>© {new Date().getFullYear()} {LAB.legalName} · {LAB.institution}</p>
          </div>
          <Link
            href={INSIDERS_PREFIX}
            className="focus-visible:ring-site-accent rounded-sm hover:text-white focus-visible:ring-2 focus-visible:outline-none"
          >
            {INSIDERS_LABEL}
          </Link>
        </div>
      </footer>
    </div>
  );
}
