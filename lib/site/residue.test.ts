import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * Nothing from the Zhang lab reaches a served page.
 *
 * This site began as a copy of the Zhang lab's, and that template keeps evolving in its own
 * repository. Changes ported from it can bring a name along in an alt text, a comment or an image
 * path, and nothing else here would notice. So this scans what the site serves for tokens that
 * only the Zhang lab carries.
 *
 * **The surname alone is not residue.** Real O'Malley co-authors are called Zhang (34824476,
 * 36479703, 26976444), and the generator writes their names into `publications-records.ts`. File
 * contents are therefore matched on `zhuzhu` and `zhang lab`, never on `zhang`. Filenames under
 * `public/` are matched on either, since no O'Malley asset has reason to carry the name.
 *
 * It proves the name check only. The other kinds of residue (research-area text, funder marks,
 * documents) were audited by hand when the site was converted.
 *
 * Out of scope: `lib/data`, `lib/table` and `db/`, whose test literals are neutral sample strings,
 * and `docs/`, which is the history of how this code came to be.
 */

const ROOT = process.cwd();
const CONTENT_DIRS = ["app", "components", path.join("lib", "site")];
const CONTENT_PATTERN = /zhuzhu|zhang\s*lab/i;
const FILENAME_PATTERN = /zhang|zhuzhu/i;

/** This file has to spell the patterns out, so it is the one file excluded from its own scan. */
const SELF = path.join("lib", "site", "residue.test.ts");

const TEXT = /\.(tsx?|mjs|css|svg|json|md)$/;

function walk(dir: string): string[] {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(rel) : [rel];
  });
}

test("no served source file carries a Zhang-lab token", () => {
  const hits = CONTENT_DIRS.flatMap(walk)
    .filter((file) => file !== SELF && TEXT.test(file))
    .filter((file) => CONTENT_PATTERN.test(fs.readFileSync(path.join(ROOT, file), "utf8")));
  assert.deepEqual(hits, [], "Zhang-lab text found in served source");
});

test("no file under public/ is named for the Zhang lab", () => {
  const hits = walk("public").filter((file) => FILENAME_PATTERN.test(path.basename(file)));
  assert.deepEqual(hits, [], "public/ holds a file named for the Zhang lab");
});

test("the scan is not vacuous", () => {
  const scanned = CONTENT_DIRS.flatMap(walk).filter((file) => TEXT.test(file));
  assert.ok(scanned.length > 20, `only ${scanned.length} files scanned`);
  assert.ok(scanned.includes(path.join("lib", "site", "publications-records.ts")));
});
