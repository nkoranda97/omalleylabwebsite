import { PageHeader } from "@/components/site/page-header";
import { ProseLink } from "@/components/site/prose-link";
import { YearGroup } from "@/components/site/year-group";
import {
  type Publication,
  authorLine,
  byYear,
  citation,
  doiUrl,
  pubmedUrl,
} from "@/lib/site/publications";

export const metadata = { title: "Publications" };

/**
 * The publications page.
 *
 * Fifty papers, 2003 to 2025, grouped by year with the year pinned beside its group — the same
 * labelled-row shape the people page uses.
 *
 * **Built from Europe PMC's records, not from the previous site's list.** That list had 52 entries.
 * An author correction and an erratum were dropped, since each would render as a duplicate of the
 * paper it corrects, and a bioRxiv preprint was replaced by the version it became. Everything shown
 * comes from the generated records.
 *
 * **The author line is the point of the page.** The lab's author is last on most of these papers,
 * often past position ten, so the lab's name is emphasised and kept visible however far down the list
 * it sits.
 */

/** One paper. */
function Entry({ pub }: { pub: Publication }) {
  const line = authorLine(pub);

  return (
    <li className="border-site-ink/15 border-t py-6">
      <h3 className="font-display max-w-3xl leading-snug font-semibold">{pub.title}</h3>

      {/*
        The authors, with the lab's emphasised. An ellipsis stands between the head and the lab's
        author when that name sits outside it — the alternative, a fixed-length cut, hides the lab's
        name in exactly the papers where a reader is checking whether the lab was involved.
      */}
      <p className="text-site-ink/70 mt-2 max-w-3xl text-sm leading-relaxed">
        {line.head.map((author, index) => (
          <span key={index}>
            {index > 0 ? ", " : ""}
            {author.isLab ? (
              <strong className="text-site-ink font-semibold">{author.name}</strong>
            ) : (
              author.name
            )}
          </span>
        ))}
        {line.labAfterGap === null ? null : (
          <>
            {" … "}
            <strong className="text-site-ink font-semibold">{line.labAfterGap}</strong>
          </>
        )}
        {line.truncated ? " et al." : ""}
      </p>

      <p className="text-site-ink/70 mt-2 text-sm">
        {citation(pub)} · {pub.year}
      </p>

      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <ProseLink href={pubmedUrl(pub.pmid)}>PubMed</ProseLink>
        <ProseLink href={doiUrl(pub.doi)}>doi</ProseLink>
        {pub.publisherUrl === undefined ? null : (
          <ProseLink href={pub.publisherUrl}>Publisher</ProseLink>
        )}
      </p>
    </li>
  );
}

export default function Page() {
  return (
    <>
      <PageHeader title="Publications" />

      <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-20">
        <div className="flex flex-col gap-12 sm:gap-16">
          {byYear().map((group) => (
            <YearGroup key={group.year} year={group.year}>
              <ul>
                {group.items.map((pub) => (
                  <Entry key={pub.pmid} pub={pub} />
                ))}
              </ul>
            </YearGroup>
          ))}
        </div>
      </div>
    </>
  );
}
