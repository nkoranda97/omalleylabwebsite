import Image from "next/image";
import Link from "next/link";

import { buttonClass } from "@/components/site/button";
import { HERO_PHOTOS, gallerySrc } from "@/lib/site/gallery";
import { LAB } from "@/lib/site/lab";
import { latest } from "@/lib/site/publications";
import { RESEARCH } from "@/lib/site/research";

export const metadata = { title: LAB.name };

/**
 * The landing page.
 *
 * Built only from things the lab already says: the tagline from its previous home page, its own
 * photographs, the heading of its research statement, its newest papers and its address. Nothing
 * here is written for this page, so nothing here can drift from the page it summarises.
 *
 * **The hero puts the text beside the photographs, never over them.** Text over a photograph needs
 * a scrim measured against the brightest part of the frame at every viewport, and still loses
 * some of the picture. A plum panel beside a grid sidesteps both: the text clears 13:1 on the panel
 * at every width, and the photographs are shown whole.
 *
 * From `lg` up the panel takes 5 of 12 columns and a 2×2 grid the other 7. Below `lg` the grid
 * stacks under the panel, two across. Every tile is cropped to 4:3 with `object-cover`, because
 * the sources mix portrait and landscape and a grid of mixed shapes reads as a contact sheet; each
 * photo's crop focus lives with it in `lib/site/gallery.ts`.
 */

/** Shared by the two section headings below the hero. */
const EYEBROW = "text-site-ink/70 text-xs font-semibold tracking-[0.18em] uppercase";

/** The "read more" link under each of those sections. The caller adds its top margin. */
const SECTION_LINK =
  "text-site-link decoration-site-link/40 hover:decoration-site-link focus-visible:ring-site-link inline-block rounded-sm text-sm font-medium underline underline-offset-4 focus-visible:ring-2 focus-visible:outline-none";

export default function HomePage() {
  return (
    <>
      {/* ---- hero ------------------------------------------------------------ */}
      <section className="bg-site-deep">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-6 py-16 sm:py-20 lg:grid-cols-12 lg:items-center lg:gap-12">
          <div className="flex flex-col items-start gap-6 lg:col-span-5">
            <p className="animate-in fade-in slide-in-from-bottom-2 text-site-accent text-sm font-medium tracking-[0.2em] uppercase duration-700">
              {LAB.institution}
            </p>
            <h1 className="animate-in fade-in slide-in-from-bottom-3 font-display text-5xl leading-[0.95] font-bold tracking-tight text-white duration-700 sm:text-6xl">
              {LAB.name}
            </h1>
            <p className="animate-in fade-in slide-in-from-bottom-4 max-w-md text-lg leading-relaxed text-white delay-150 duration-700 [animation-fill-mode:backwards]">
              Our lab develops advanced functional genomics tools to map the cell-type-specific
              regulatory networks that guide plant development and help them adapt to stresses such
              as drought, cold, and salinity.
            </p>
            <div className="animate-in fade-in flex flex-wrap gap-3 pt-2 delay-300 duration-700 [animation-fill-mode:backwards]">
              <Link
                href="/research"
                className="bg-site-accent text-site-ink hover:bg-site-surface focus-visible:ring-site-accent rounded-xs px-6 py-3 text-sm font-medium transition-all hover:-translate-y-px focus-visible:ring-2 focus-visible:outline-none"
              >
                Research
              </Link>
              <Link
                href="/publications"
                className="focus-visible:ring-site-accent rounded-xs border border-white/40 px-6 py-3 text-sm font-medium text-white transition-all hover:-translate-y-px hover:border-white/70 focus-visible:ring-2 focus-visible:outline-none"
              >
                Publications
              </Link>
            </div>
          </div>

          <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:col-span-7">
            {HERO_PHOTOS.map((photo, index) => (
              <li
                key={photo.file}
                className="ring-site-ink/20 relative aspect-[4/3] overflow-hidden rounded-lg ring-1"
              >
                {/*
                  The first tile is the largest contentful paint on most viewports, so it loads
                  eagerly at high priority; the other three follow normally.
                */}
                <Image
                  src={gallerySrc(photo)}
                  alt={photo.alt}
                  fill
                  sizes="(min-width: 1024px) 330px, 50vw"
                  loading={index === 0 ? "eager" : "lazy"}
                  fetchPriority={index === 0 ? "high" : "auto"}
                  className={`object-cover ${photo.position ?? ""}`}
                />
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-6 py-16 sm:gap-20 sm:py-20">
        {/* ---- research ------------------------------------------------------ */}
        <section className="border-site-ink/15 grid gap-x-10 gap-y-4 border-t pt-6 md:grid-cols-[168px_1fr]">
          <h2 className={EYEBROW}>Research</h2>
          <div>
            <p className="font-display max-w-3xl text-2xl leading-snug font-semibold sm:text-3xl">
              {RESEARCH.heading}
            </p>
            <Link
              href="/research"
              className={`${SECTION_LINK} mt-5`}
            >
              Read about our research
            </Link>
          </div>
        </section>

        {/* ---- recent publications ------------------------------------------- */}
        <section className="border-site-ink/15 grid gap-x-10 gap-y-4 border-t pt-6 md:grid-cols-[168px_1fr]">
          <h2 className={EYEBROW}>Recent papers</h2>
          <div>
            <ul className="flex flex-col gap-6">
              {latest(3).map((pub) => (
                <li key={pub.pmid}>
                  <p className="font-display max-w-3xl text-lg leading-snug font-semibold">
                    {pub.title}
                  </p>
                  <p className="text-site-ink/70 mt-1 text-sm">
                    {pub.journal} · {pub.year}
                  </p>
                </li>
              ))}
            </ul>
            <Link
              href="/publications"
              className={`${SECTION_LINK} mt-6`}
            >
              All publications
            </Link>
          </div>
        </section>
      </div>

      {/* ---- address strip -------------------------------------------------- */}
      <section className="bg-site-surface">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-6 px-6 py-10">
          <address className="text-site-ink/80 text-sm leading-relaxed not-italic">
            <span className="font-display text-site-ink text-base font-semibold">
              {LAB.legalName}
            </span>
            <br />
            {LAB.address.join(" · ")}
          </address>
          <Link
            href="/contact"
            className={buttonClass()}
          >
            Contact
          </Link>
        </div>
      </section>
    </>
  );
}
