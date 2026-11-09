import Link from "next/link";

import { InsidersNav } from "@/components/site/insiders-nav";
import { Logo } from "@/components/site/logo";
import { LAB } from "@/lib/site/lab";
import { INSIDERS_LABEL, INSIDERS_PREFIX } from "@/lib/site/nav";

/**
 * The insiders shell.
 *
 * **This layout is chrome, not a guard.** It is worth saying plainly, because the nesting
 * looks like protection and is not: route handlers do not participate in layouts, so the
 * motif image route beneath this directory never renders through here. A layout-based check
 * would cover the pages and leave 200 image responses open.
 *
 * What makes the boundary enforceable is the shared `/insiders` path prefix, which a single
 * middleware rule can match. Nothing here authenticates anything, and no mechanism has been
 * chosen yet — see the register.
 *
 * **The chrome is the lab site's, the content area is deliberately not.** The header takes the
 * mark and the serif wordmark from the public shell on a pale plum band, so crossing the Insiders
 * button lands somewhere continuous rather than in what looks like a different product, while the
 * band (the public nav is white) says which side you are on. But no
 * `--site-*` background is set on the wrapper, and that omission is load-bearing: the DAP-seq
 * browser renders inside this layout on the shadcn `--background`, and tinting the wrapper
 * would restyle a working tool as a side effect of styling its frame — the exact coupling the
 * palette was kept additive to prevent. Chrome here, tokens there.
 *
 * Tighter than the public header — `py-3` and a 32px mark against `py-4` and 40px — because
 * every pixel it takes is a pixel the browse table does not get. Not sticky, for the same
 * reason and because the table manages its own scrolling beneath it.
 */
export default function InsidersLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="bg-site-surface border-site-link/30 text-site-ink border-b">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-6 py-3">
          {/*
            Mark, wordmark and section tag in one link, pointing at the hub rather than the
            public home — inside the area, the nearest thing to "home" is the hub, and the way
            out is named as such on the right. One link and not three for the reason the public
            header gives: adjacent links to one destination are duplicate stops for a keyboard
            and duplicate announcements for a screen reader.
          */}
          <Link
            href={INSIDERS_PREFIX}
            className="font-display text-site-ink focus-visible:ring-site-link flex items-center gap-2.5 rounded-sm text-base font-bold tracking-tight focus-visible:ring-2 focus-visible:outline-none"
          >
            <Logo className="h-8 w-auto" />
            {LAB.name}
            {/*
              The tag is what says which side of the boundary you are on. White on deep plum
              rather than the public site's lime button, so the two are not mistaken for each other
              at a glance — this one marks a place, that one is a door.
            */}
            <span className="bg-site-deep rounded-xs px-2.5 py-0.5 text-xs font-medium tracking-normal text-white">
              {INSIDERS_LABEL}
            </span>
          </Link>

          <InsidersNav />

          {/*
            ink/70, not /60. At 12px this is normal-size text needing 4.5:1: /60 measures 4.0 on
            the pale plum band and /70 measures 5.4.
          */}
          <Link
            href="/"
            className="text-site-ink/70 hover:text-site-ink focus-visible:ring-site-link ml-auto rounded-sm text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none"
          >
            ← Public site
          </Link>
        </div>
      </header>

      {/*
        The one `<main>` for everything under this prefix. The two data pages used to render
        their own inside this one, which is a duplicate landmark and invalid nesting; they are
        plain wrappers now and this is the landmark.
      */}
      <main className="flex min-h-0 w-full flex-1 flex-col">{children}</main>
    </div>
  );
}
