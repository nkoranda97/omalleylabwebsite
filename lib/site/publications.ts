import { groupByYear } from "./group.ts";
import { RECORDS } from "./publications-records.ts";

/**
 * The lab's publications.
 *
 * Two files, deliberately. `publications-records.ts` is **generated** from Europe PMC by
 * `scripts/publications.mjs` and must not be hand-edited. This file holds everything a human decides:
 * which papers appear and in what order, and the overrides the API cannot know. Keeping them apart
 * means regenerating never clobbers a decision — the failure a single generate-then-edit file always
 * eventually hits.
 *
 * **Generated rather than transcribed.** The PMID list comes from the lab's previous site, which
 * listed 52 entries. Three were collapsed to keep one entry per paper: an author correction and an
 * erratum, each of which would render as a duplicate of the paper it corrects, and a bioRxiv preprint
 * that has since been published, replaced by the published version. Titles, authors and citations
 * all come from Europe PMC.
 */

export type PublicationRecord = {
  pmid: string;
  title: string;
  /** Medline abbreviation — "Nat Methods", not "Nature Methods". */
  journal: string;
  year: number;
  /** 1–12, or 0 where the record gives no month. Used only for ordering within a year. */
  month: number;
  volume: string;
  issue: string;
  pages: string;
  doi: string;
  authors: readonly string[];
  /**
   * Index of the single author matching the lab's name pattern, or `null` when none or more than one
   * matched. More than one is not hypothetical — see `OVERRIDES`.
   */
  labAuthor: number | null;
  /** True when the record names a collective rather than individual authors. */
  collective: boolean;
};

/**
 * Every paper, newest first, by year and then month. This is the list the generator reads, so adding
 * a paper is adding a PMID here and re-running `node scripts/publications.mjs`.
 *
 * Within a year, a record with no month (month 0) sorts last, which is what the ordering test holds.
 *
 * One entry per paper. Corrections and errata are not papers of their own and are left out:
 * 36690743 (author correction to 28650476) and 27610578 (erratum for 27203113). Preprints are not
 * shown once published — 40460244 replaces its bioRxiv preprint 38352548.
 */
export const PMID_ORDER = [
  // The four below postdate the previous site's list; the lab confirmed them as Ronan's.
  "42680730", // Nat Commun 2026
  "41271683", // Nat Commun 2025
  "41272269", // Commun Biol 2025
  "40460244", // Plant Physiol 2025 — published version of bioRxiv preprint 38352548
  "40664840", // Nat Plants 2025
  "38589485", // Nat Plants 2024
  "38774130", // Quant Plant Biol 2024
  "38028649", // Plant Direct 2023
  "37018475", // Plant Physiol 2023
  "36479703", // Plant Cell Environ 2023
  "37753177", // PeerJ 2023
  "36513676", // Nat Commun 2022
  "35986497", // Plant J 2022
  "35579457", // Microbiol Spectr 2022
  "35382117", // Plant Direct 2022
  "35027454", // PNAS 2022
  "34824476", // Nat Methods 2021 — last author
  "34795375", // Commun Biol 2021
  "34523983", // mSphere 2021
  "34385583", // Commun Biol 2021
  "34006627", // mSystems 2021 — DOE JGI Metagenome Workflow
  "33753477", // PNAS 2021
  "34017316", // Front Microbiol 2021
  "32273354", // Microbiol Resour Announc 2020
  "32111691", // PNAS 2020
  "31806758", // PNAS 2019
  "31772173", // Sci Data 2019
  "31201323", // Nat Commun 2019
  "31091459", // Cell Rep 2019
  "31048387", // Microbiol Resour Announc 2019
  "30866803", // BMC Evol Biol 2019
  "30054951", // Plant J 2018
  "30533634", // Microbiol Resour Announc 2018
  "29678830", // Genetics 2018
  "29876807", // Methods Mol Biol 2018
  "28726847", // Nat Protoc 2017 — DAP-seq protocol
  "28650476", // Nat Methods 2017 — CrY2H-seq
  "28432803", // Plant J 2017 — see OVERRIDES
  "27749838", // Nat Methods 2016
  "27419873", // Cell 2016
  "27203113", // Cell 2016 — DAP-seq cistrome; first author
  "26976444", // G3 (Bethesda) 2016
  "25757780", // Methods Mol Biol 2015
  "22136931", // Cell Stem Cell 2011
  "21921155", // Science 2011
  "21289626", // Nature 2011
  "20409268", // Plant J 2010
  "18486559", // Dev Cell 2008
  "18423832", // Cell 2008
  "18007627", // Nat Protoc 2007
  "17071649", // Plant Physiol 2006
  "15703053", // Plant J 2005
  "15466220", // Plant Physiol 2004
  "12509505", // PNAS 2003
] as const;

export type PublicationOverride = {
  /**
   * Which author is the lab's, 0-based. Set only where the generator could not decide.
   *
   * `null` means *deliberately unemphasised* — the generator found more than one candidate and
   * guessing would assert someone else's authorship as the lab's, which no reader could detect.
   */
  labAuthor?: number | null;
  /** A publisher link worth keeping alongside PubMed. */
  publisherUrl?: string;
  /** Replaces the record's pages, where Europe PMC's disagree with the publisher's DOI. */
  pages?: string;
};

/**
 * What Europe PMC cannot know. Each entry carries a one-line reason.
 */
export const OVERRIDES: Record<string, PublicationOverride> = {
  // "O'Malley R" at positions 2 and 3 of 16: the record lists the same Ronan O'Malley twice, under
  // two ORCIDs. Position 3 carries 0000-0002-4907-0339, the ORCID every other record here uses.
  "28432803": { labAuthor: 2 },
};

export type Publication = PublicationRecord &
  Omit<PublicationOverride, "labAuthor" | "pages"> & {
    labAuthor: number | null;
  };

/** How many authors show before the lab's author and the ellipsis. */
const HEAD_COUNT = 3;

/**
 * Every publication, in display order, with overrides applied.
 *
 * Throws on a PMID with no record rather than skipping it. A missing record means the generator was
 * not re-run after a paper was added, and a page quietly one entry short is worse than a build that
 * says so.
 */
export function publications(): Publication[] {
  return PMID_ORDER.map((pmid) => {
    const record = RECORDS[pmid];
    if (record === undefined) {
      throw new Error(
        `No generated record for PMID ${pmid}. Run: node scripts/publications.mjs`,
      );
    }
    const override = OVERRIDES[pmid] ?? {};
    return {
      ...record,
      pages: override.pages ?? record.pages,
      labAuthor:
        "labAuthor" in override
          ? (override.labAuthor ?? null)
          : record.labAuthor,
      publisherUrl: override.publisherUrl,
    };
  });
}

/** The newest `count` papers, in list order. The landing page shows three. */
export function latest(count: number): Publication[] {
  return publications().slice(0, count);
}

/** Grouped by year, newest first, order preserved within each year. */
export function byYear(): { year: number; items: Publication[] }[] {
  return groupByYear(publications());
}

export type AuthorLine = {
  /** The authors to print first, each flagged if it is the lab's. */
  head: { name: string; isLab: boolean }[];
  /** The lab's author, when it falls outside `head`. Rendered after an ellipsis. */
  labAfterGap: string | null;
  /** Whether "et al." belongs at the end. */
  truncated: boolean;
};

/**
 * Which authors to show, and where the lab's sits.
 *
 * A fixed-length truncation is not enough here, and the data is why: the lab's author is last on most
 * of these papers, often past position ten. Cutting at three would hide the lab's name in nearly
 * every entry — and showing which papers are the lab's is the whole reason the list exists.
 *
 * So the head is the first few authors, and if the lab's author is not among them, that name is
 * appended after an ellipsis. "et al." appears only when someone after the last name shown is
 * left out. The lab's author is usually last, and "… O'Malley RC et al." would claim names after
 * them that do not exist.
 */
export function authorLine(pub: Publication): AuthorLine {
  const { authors, labAuthor } = pub;

  // A collective author is one name and is never truncated or emphasised.
  if (pub.collective) {
    return {
      head: [{ name: authors[0] ?? "", isLab: false }],
      labAfterGap: null,
      truncated: false,
    };
  }

  // A lab author immediately after the head joins it: an ellipsis there would mark a gap with
  // nobody in it.
  const headLength = labAuthor === HEAD_COUNT ? HEAD_COUNT + 1 : HEAD_COUNT;
  const head = authors
    .slice(0, headLength)
    .map((name, i) => ({ name, isLab: i === labAuthor }));
  const labOutsideHead = labAuthor !== null && labAuthor >= headLength;

  // The last author shown: the lab's when it sits after the gap, otherwise the end of the head.
  // "et al." stands for the names after that one. The ellipsis already marks the names left out
  // between the head and the lab's author, so a lab author who is last needs no "et al.".
  const lastShown = labOutsideHead ? labAuthor : headLength - 1;

  return {
    head,
    labAfterGap: labOutsideHead ? (authors[labAuthor] ?? null) : null,
    truncated: authors.length - 1 > lastShown,
  };
}

/** The formatted citation, without the title. "Cell · 165(5) · 1280-1292"; the page adds the year. */
export function citation(pub: Publication): string {
  const vol = pub.issue === "" ? pub.volume : `${pub.volume}(${pub.issue})`;
  return [pub.journal, vol, pub.pages]
    .filter((part) => part !== "")
    .join(" · ");
}

/** Whether the lab's author is first on the paper. */
export function isFirstAuthor(pub: Publication): boolean {
  return pub.labAuthor === 0;
}

export function pubmedUrl(pmid: string): string {
  return `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;
}

export function doiUrl(doi: string): string {
  return `https://doi.org/${doi}`;
}
