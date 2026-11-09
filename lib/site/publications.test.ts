import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { RECORDS } from "./publications-records.ts";
import {
  OVERRIDES,
  PMID_ORDER,
  authorLine,
  byYear,
  citation,
  doiUrl,
  isFirstAuthor,
  latest,
  pubmedUrl,
  publications,
} from "./publications.ts";

/**
 * The publications list, checked for the ways a generated-plus-overridden dataset goes wrong.
 *
 * The overrides are the risk. They are hand-written indices into arrays that a regenerate can change
 * length, so an index that was right can silently become wrong — pointing at a different author, or
 * past the end. That is what the range check is for.
 */

/**
 * The generator's lab-author pattern, read out of the script's source.
 *
 * The script runs on import — it fetches and rewrites the records file — so it cannot be imported
 * here, and exporting the pattern from somewhere else only for this test would add a second copy to
 * keep in step. Reading the literal checks the pattern the generator actually uses.
 */
const LAB_AUTHOR = (() => {
  const source = fs.readFileSync(new URL("../../scripts/publications.mjs", import.meta.url), "utf8");
  const literal = /^const LAB_AUTHOR = \/(.+)\/([a-z]*);$/m.exec(source);
  assert.ok(literal !== null, "could not find LAB_AUTHOR in scripts/publications.mjs");
  return new RegExp(literal[1], literal[2]);
})();

const find = (pmid: string) => {
  const pub = publications().find((p) => p.pmid === pmid);
  assert.ok(pub !== undefined, `${pmid} is not in publications()`);
  return pub;
};

// --- the list and the generated records agree, both directions -------------------

test("every listed PMID has a generated record", () => {
  const missing = PMID_ORDER.filter((pmid) => RECORDS[pmid] === undefined);
  assert.deepEqual(missing, [], "run: node scripts/publications.mjs");
});

test("every generated record is listed", () => {
  // The reverse direction. A record left behind after a paper was removed from PMID_ORDER would sit
  // in the file unused, and the next person to read it would think the page shows it.
  const listed = new Set<string>(PMID_ORDER);
  const orphans = Object.keys(RECORDS).filter((pmid) => !listed.has(pmid));
  assert.deepEqual(orphans, [], "generated record(s) are not in PMID_ORDER");
});

test("the guard is not vacuous", () => {
  // The previous site lists 52 entries. One author correction and one erratum are dropped, and one
  // preprint is replaced by its published version, which leaves 50. The lab confirmed four later
  // papers the previous site predates (2025–2026), for 54.
  assert.equal(PMID_ORDER.length, 54, `expected 54 papers, got ${PMID_ORDER.length}`);
  assert.equal(Object.keys(RECORDS).length, PMID_ORDER.length);
});

test("PMIDs are unique — no paper listed twice", () => {
  assert.equal(new Set(PMID_ORDER).size, PMID_ORDER.length, "a PMID appears twice in PMID_ORDER");
});

test("a correction or erratum is not listed as a paper of its own", () => {
  // 36690743 is an author correction to 28650476, and 27610578 an erratum for 27203113 under the
  // same title. Each would render as a duplicate of the paper it corrects.
  for (const pmid of ["36690743", "27610578"]) {
    assert.ok(!(PMID_ORDER as readonly string[]).includes(pmid), `${pmid} is in PMID_ORDER`);
    assert.ok(!(pmid in RECORDS), `${pmid} has a generated record`);
  }
  assert.ok((PMID_ORDER as readonly string[]).includes("27203113"), "the corrected paper itself stays");
});

test("the bioRxiv preprint is replaced by its published version", () => {
  assert.ok(!(PMID_ORDER as readonly string[]).includes("38352548"), "the preprint is listed");
  assert.ok((PMID_ORDER as readonly string[]).includes("40460244"), "the published version is missing");
  assert.match(find("40460244").title, /^Shoring up the base/);
});

// --- ordering and field completeness --------------------------------------------

test("publications run newest first", () => {
  const pubs = publications();
  for (let i = 1; i < pubs.length; i += 1) {
    const a = pubs[i - 1];
    const b = pubs[i];
    const key = (p: typeof a) => `${p.year}-${String(p.month).padStart(2, "0")}`;
    assert.ok(key(b) <= key(a), `${b.pmid} (${key(b)}) is newer than ${a.pmid} (${key(a)})`);
  }
});

test("every publication has what the page renders", () => {
  for (const pub of publications()) {
    assert.ok(pub.title.trim() !== "", `${pub.pmid} has no title`);
    assert.ok(pub.journal.trim() !== "", `${pub.pmid} has no journal`);
    assert.ok(pub.year > 1900, `${pub.pmid} has year ${pub.year}`);
    assert.match(pub.doi, /^10\./, `${pub.pmid} has DOI "${pub.doi}"`);
    assert.ok(pub.authors.length > 0, `${pub.pmid} has no authors`);
  }
});

test("titles do not end in a full stop", () => {
  // The generator strips the trailing stop so the page can punctuate; this holds that.
  for (const pub of publications()) {
    assert.ok(!pub.title.endsWith("."), `${pub.pmid}: "${pub.title}" ends in a full stop`);
  }
});

test("titles carry no markup", () => {
  // Europe PMC wraps species and gene names in <i> tags. The page renders titles as text, so a
  // tag that survives generation is printed literally — "<i>Salix purpurea</i>".
  for (const pub of publications()) {
    assert.ok(!/<\/?[a-z][^>]*>/i.test(pub.title), `${pub.pmid}: "${pub.title}" contains markup`);
  }
});

// --- the lab author pattern, and the overrides, which are the fragile part -------

test("LAB_AUTHOR matches the lab's name in every form the records use, and nothing nearby", () => {
  for (const name of ["O'Malley RC", "O’Malley RC", "O'malley RC", "O'Malley R"]) {
    assert.match(name, LAB_AUTHOR, `${name} should match`);
  }
  for (const name of ["O'Malley M", "Malley RC"]) {
    assert.doesNotMatch(name, LAB_AUTHOR, `${name} should not match`);
  }
});

test("every lab-author index is within its author list", () => {
  // The failure this catches: an override index past the end of a list a regenerate shortened.
  // Out of range renders as a blank name rather than an error.
  for (const pub of publications()) {
    if (pub.labAuthor === null) continue;
    assert.ok(
      Number.isInteger(pub.labAuthor) && pub.labAuthor >= 0 && pub.labAuthor < pub.authors.length,
      `${pub.pmid}: labAuthor ${pub.labAuthor} is outside 0..${pub.authors.length - 1}`,
    );
  }
});

test("every paper emphasises an author who looks like the lab's", () => {
  // Every paper on the list is one of the lab's, so a paper with no emphasis is an unresolved match,
  // and an override pointing at the wrong index entirely shows up as a name that is not the lab's.
  for (const pub of publications()) {
    assert.notEqual(pub.labAuthor, null, `${pub.pmid} emphasises no author`);
    assert.match(
      pub.authors[pub.labAuthor!],
      LAB_AUTHOR,
      `${pub.pmid}: labAuthor ${pub.labAuthor} is "${pub.authors[pub.labAuthor!]}"`,
    );
  }
});

test("an override only names a PMID that is listed", () => {
  const listed = new Set<string>(PMID_ORDER);
  const stray = Object.keys(OVERRIDES).filter((pmid) => !listed.has(pmid));
  assert.deepEqual(stray, [], "override(s) name a PMID not in PMID_ORDER");
});

// --- the author line, which is the page's whole point ---------------------------

test("a short author list is shown whole, with no et al.", () => {
  const line = authorLine(find("20409268"));
  assert.equal(line.head.length, 2);
  assert.equal(line.head[0].isLab, true);
  assert.equal(line.labAfterGap, null);
  assert.equal(line.truncated, false);
});

test("a first author leads the line, emphasised", () => {
  // Cell 2016, the DAP-seq cistrome paper.
  const pub = find("27203113");
  assert.equal(pub.labAuthor, 0);
  assert.equal(isFirstAuthor(pub), true);
  const line = authorLine(pub);
  assert.match(line.head[0].name, /^O'Malley/);
  assert.equal(line.head[0].isLab, true);
  assert.ok(line.head.slice(1).every((a) => !a.isLab));
  assert.equal(line.labAfterGap, null);
  assert.equal(line.truncated, true, "nine authors should truncate");
});

test("a lab author inside the head is emphasised there", () => {
  // Second of seven on the DAP-seq protocol.
  const line = authorLine(find("28726847"));
  assert.equal(line.head[1].isLab, true);
  assert.equal(line.labAfterGap, null);
  assert.equal(line.truncated, true);
});

test("a last author is kept visible after the gap", () => {
  // The usual case here: the lab's author is last, and a fixed cut at three would hide them on
  // nearly every paper. Nat Methods 2021, eleven authors.
  const pub = find("34824476");
  assert.equal(pub.labAuthor, pub.authors.length - 1, "the lab's author should be last");
  const line = authorLine(pub);
  assert.deepEqual(
    line.head.map((a) => a.name),
    pub.authors.slice(0, 3),
  );
  assert.ok(line.head.every((a) => !a.isLab));
  assert.match(line.labAfterGap ?? "", /^O'Malley/);
  // Nobody follows the last author, so there is nothing for "et al." to stand for: the ellipsis
  // already marks the names left out between the head and the lab's author.
  assert.equal(line.truncated, false);
});

test("a lab author in the middle keeps et al. for the names after them", () => {
  // Nat Plants 2024, nine authors, the lab’s fifth.
  const pub = find("38589485");
  assert.ok(pub.labAuthor !== null && pub.labAuthor < pub.authors.length - 1);
  const line = authorLine(pub);
  assert.match(line.labAfterGap ?? "", /^O'Malley/);
  assert.equal(line.truncated, true);
});

test("a lab author right after the head joins it, with no ellipsis over an empty gap", () => {
  // Fourth of four: shown whole.
  const whole = authorLine(find("29876807"));
  assert.equal(whole.labAfterGap, null);
  assert.deepEqual(
    whole.head.map((a) => a.isLab),
    [false, false, false, true],
  );
  assert.equal(whole.truncated, false);

  // Fourth of sixteen: joins the head, and et al. covers the twelve after.
  const long = authorLine(find("22136931"));
  assert.equal(long.labAfterGap, null);
  assert.equal(long.head.length, 4);
  assert.equal(long.head[3]?.isLab, true);
  assert.equal(long.truncated, true);
});

// --- the small helpers ----------------------------------------------------------

test("citation joins the parts that exist and skips the ones that do not", () => {
  assert.equal(citation(find("27203113")), "Cell · 165(5) · 1280-1292");
  // PeerJ has a volume and no issue, so no empty parentheses should appear.
  assert.equal(citation(find("37753177")), "PeerJ · 11 · e16129");
});

test("byYear groups without losing or reordering anything", () => {
  const groups = byYear();
  assert.deepEqual(
    groups.flatMap((g) => g.items).map((p) => p.pmid),
    publications().map((p) => p.pmid),
  );
  const years = groups.map((g) => g.year);
  assert.deepEqual(years, [...years].sort((a, b) => b - a));
  assert.equal(new Set(years).size, years.length, "a year appears in two groups");
});

test("the link helpers build resolvable URLs", () => {
  assert.equal(pubmedUrl("27203113"), "https://pubmed.ncbi.nlm.nih.gov/27203113/");
  assert.equal(doiUrl("10.1016/j.cell.2016.04.038"), "https://doi.org/10.1016/j.cell.2016.04.038");
});

test("latest returns the newest papers in list order", () => {
  const recent = latest(3);
  assert.deepEqual(
    recent.map((pub) => pub.pmid),
    PMID_ORDER.slice(0, 3),
  );
});
