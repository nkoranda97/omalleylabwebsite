#!/usr/bin/env node
/**
 * Regenerate `lib/site/publications-records.ts` from Europe PMC.
 *
 *     node scripts/publications.mjs
 *
 * Run by hand, occasionally — the same posture as `paper-pages.mjs` and the planned Midway sync.
 * Nothing fetches at build or request time; the records it writes are committed, so the site builds
 * offline and a changed citation shows up as a reviewable diff.
 *
 * The PMID list lives in `lib/site/publications.ts`, so adding a paper is adding a PMID there and
 * running this. Everything a human decides — display order, which author is the lab's where more
 * than one matches, publisher links — stays in that file and is never touched here.
 *
 * **Why generate at all.** A hand-transcribed list drifts: citation formats diverge, corrections and
 * errata appear as papers of their own, and a preprint stays listed after it is published. The PMID
 * list started from the lab's previous site, which had 52 entries; one author correction and one
 * erratum duplicate were dropped and one preprint was replaced by its published version. Everything
 * else on the page comes from Europe PMC.
 */

import fs from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "lib", "site", "publications-records.ts");
const LIST = path.join(process.cwd(), "lib", "site", "publications.ts");
const API = "https://www.ebi.ac.uk/europepmc/webservices/rest/search";

/**
 * Who counts as the lab's author.
 *
 * A heuristic, and knowingly so. Europe PMC writes the name as "O'Malley RC" or "O'Malley R", and
 * once as "O'malley RC"; the apostrophe may be straight or curly. Any other R. O'Malley would match
 * too, and one record lists the same person twice. That is what the override map in
 * `publications.ts` is for — this only reports how many candidates it found, and refuses to choose
 * when the answer is more than one.
 */
const LAB_AUTHOR = /^O['’][Mm]alley RC?$/;

function fail(message) {
  console.error(`\npublications: ${message}\n`);
  process.exit(1);
}

/** Read the PMID list out of the hand-maintained module without importing TypeScript. */
function readPmids() {
  if (!fs.existsSync(LIST)) fail(`${LIST} is missing; it holds the PMID list this script reads.`);
  const source = fs.readFileSync(LIST, "utf8");
  const block = /export const PMID_ORDER = \[([\s\S]*?)\] as const;/.exec(source);
  if (block === null) fail("could not find PMID_ORDER in lib/site/publications.ts");
  const pmids = [...block[1].matchAll(/"(\d{5,10})"/g)].map((m) => m[1]);
  if (pmids.length === 0) fail("PMID_ORDER is empty");
  return pmids;
}

const pmids = readPmids();
console.log(`publications: ${pmids.length} PMIDs from lib/site/publications.ts`);

// Joined properly. Building this query with shell `paste -sd' OR '` returns an empty result set
// *silently*, because -d takes a list of single characters and cycles through them — which is why the
// count assertion below exists rather than trusting the response.
const query = pmids.map((p) => `EXT_ID:${p}`).join(" OR ");
const url = `${API}?${new URLSearchParams({
  query,
  resultType: "core",
  pageSize: String(Math.max(25, pmids.length)),
  format: "json",
})}`;

let results;
try {
  const response = await fetch(url);
  if (!response.ok) fail(`Europe PMC returned HTTP ${response.status}`);
  results = (await response.json())?.resultList?.result ?? [];
} catch (error) {
  fail(`could not reach Europe PMC: ${error.message}\n  This script needs network access.`);
}

// The failure that matters: a PMID that resolves to nothing must stop the script naming it, rather
// than writing a file with a hole in it that the page then renders one entry short.
const found = new Map(results.map((r) => [String(r.pmid), r]));
const missing = pmids.filter((p) => !found.has(p));
if (missing.length > 0) {
  fail(
    `Europe PMC returned no record for: ${missing.join(", ")}\n` +
      `  Check the PMID. ${results.length} of ${pmids.length} resolved.`,
  );
}

const records = pmids.map((pmid) => {
  const r = found.get(pmid);
  const info = r.journalInfo ?? {};
  const journal = info.journal ?? {};
  const authorList = r.authorList?.author ?? [];

  const names = authorList.map((a) => a.fullName ?? a.collectiveName ?? "");
  const collective = authorList.length === 1 && authorList[0].collectiveName !== undefined;

  const candidates = names.flatMap((name, i) => (LAB_AUTHOR.test(name) ? [i] : []));
  if (candidates.length > 1) {
    console.log(
      `  ${pmid}: ${candidates.length} authors match ${LAB_AUTHOR} at ` +
        `${candidates.map((i) => i + 1).join(" and ")} — left for an override`,
    );
  }

  return {
    pmid,
    // Europe PMC marks up species and gene names (<i>Arabidopsis</i>). The page renders titles as
    // text, so tags are stripped here rather than printed literally. That costs those names their
    // italics, which is the smaller loss.
    title: (r.title ?? "").replace(/<\/?[a-z][^>]*>/gi, "").replace(/\.$/, ""),
    journal: journal.medlineAbbreviation ?? journal.title ?? "",
    year: Number(r.pubYear ?? 0),
    month: Number(info.monthOfPublication ?? 0),
    volume: info.volume ?? "",
    issue: info.issue ?? "",
    pages: r.pageInfo ?? "",
    doi: r.doi ?? "",
    authors: names,
    // Only a single unambiguous match is recorded. Two candidates is a question for a human, not a
    // coin flip — emphasising the wrong author asserts someone else's authorship as the lab's.
    labAuthor: candidates.length === 1 ? candidates[0] : null,
    collective,
  };
});

const body = records
  .map(
    (rec) => `  "${rec.pmid}": {
    pmid: "${rec.pmid}",
    title: ${JSON.stringify(rec.title)},
    journal: ${JSON.stringify(rec.journal)},
    year: ${rec.year},
    month: ${rec.month},
    volume: ${JSON.stringify(rec.volume)},
    issue: ${JSON.stringify(rec.issue)},
    pages: ${JSON.stringify(rec.pages)},
    doi: ${JSON.stringify(rec.doi)},
    labAuthor: ${rec.labAuthor === null ? "null" : rec.labAuthor},
    collective: ${rec.collective},
    authors: [
${rec.authors.map((n) => `      ${JSON.stringify(n)},`).join("\n")}
    ],
  },`,
  )
  .join("\n");

fs.writeFileSync(
  OUT,
  `// GENERATED by scripts/publications.mjs — do not edit.
//
// Canonical metadata from Europe PMC. Everything a human decides lives in publications.ts: the PMID
// list and display order, which author is the lab's where more than one matches, publisher links.
// Re-running this rewrites the whole file, so an edit made here is lost.
//
// Regenerate with: node scripts/publications.mjs
//
// ${records.length} records, fetched from Europe PMC.

import type { PublicationRecord } from "./publications.ts";

export const RECORDS: Record<string, PublicationRecord> = {
${body}
};
`,
);

const ambiguous = records.filter((r) => r.labAuthor === null && !r.collective);
console.log(
  `publications: wrote ${records.length} records to lib/site/publications-records.ts` +
    (ambiguous.length > 0
      ? `\n  ${ambiguous.length} need a labAuthor override in publications.ts: ` +
        ambiguous.map((r) => r.pmid).join(", ")
      : ""),
);
