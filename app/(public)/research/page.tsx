import Image from "next/image";
import Link from "next/link";

import { buttonClass } from "@/components/site/button";
import { PageHeader } from "@/components/site/page-header";
import { RESEARCH_PHOTO, gallerySrc } from "@/lib/site/gallery";
import { RESEARCH } from "@/lib/site/research";

export const metadata = { title: "Research" };

/**
 * The research page.
 *
 * The heading and paragraph are the lab's previous research page, verbatim, from
 * `lib/site/research.ts`. That page is one statement, one photograph and one invitation to get in
 * touch, and so is this one. Nothing is added to make it longer; when the lab has more to say about
 * its research, the place to say it is that module.
 *
 * Text first in the DOM and the photograph second, so a screen reader and a narrow viewport meet
 * the statement before the picture. From `lg` up they sit side by side.
 */
export default function Page() {
  return (
    <>
      <PageHeader title="Research" />

      <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-20">
        <section className="grid items-start gap-10 lg:grid-cols-[1fr_380px] lg:gap-14">
          <div>
            <h2 className="font-display text-2xl leading-tight font-bold tracking-tight sm:text-3xl">
              {RESEARCH.heading}
            </h2>
            {/* Held to a readable measure: the statement is one long paragraph. */}
            <p className="text-site-ink/80 mt-6 max-w-2xl text-lg leading-relaxed">{RESEARCH.body}</p>

            <div className="border-site-ink/15 mt-10 max-w-2xl border-t pt-8">
              <p className="text-site-ink/70 text-sm leading-relaxed">
                Would you like to know more?
              </p>
              <Link
                href="/contact"
                className={`${buttonClass()} mt-5`}
              >
                Contact us
              </Link>
            </div>
          </div>

          <Image
            src={gallerySrc(RESEARCH_PHOTO)}
            alt={RESEARCH_PHOTO.alt}
            width={RESEARCH_PHOTO.width}
            height={RESEARCH_PHOTO.height}
            sizes="(min-width: 1024px) 380px, 100vw"
            className="ring-site-ink/10 h-auto w-full rounded-lg ring-1"
          />
        </section>
      </div>
    </>
  );
}
