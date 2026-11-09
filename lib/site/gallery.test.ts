import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { GALLERY_DIRS, HERO_PHOTOS, RESEARCH_PHOTO, gallerySrc, type GalleryPhoto } from "./gallery.ts";

/**
 * The site's photographs checked against the directories they claim to describe.
 *
 * The same both-directions rule `people.test.ts` holds for headshots: a declared photo that is
 * missing renders as a broken image, and an undeclared file in `public/` is served at a guessable
 * URL with nothing on the site pointing at it. Neither is visible from the page source.
 */

const PUBLIC = path.join(process.cwd(), "public");

function declared(): GalleryPhoto[] {
  return [...HERO_PHOTOS, RESEARCH_PHOTO];
}

function filesOnDisk(dir: string): string[] {
  return fs
    .readdirSync(path.join(PUBLIC, dir), { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => `${dir}/${entry.name}`)
    .sort();
}

test("every declared photo exists on disk", () => {
  const missing = declared()
    .map((photo) => photo.file)
    .filter((file) => !fs.existsSync(path.join(PUBLIC, file)));
  assert.deepEqual(missing, []);
});

test("every file in the gallery directories is declared", () => {
  const claimed = new Set(declared().map((photo) => photo.file));
  const orphans = GALLERY_DIRS.flatMap(filesOnDisk).filter((file) => !claimed.has(file));
  assert.deepEqual(orphans, [], "undeclared file(s) in public/home or public/research");
});

test("the guard is not vacuous", () => {
  assert.ok(HERO_PHOTOS.length >= 4, `the hero grid needs four photos, has ${HERO_PHOTOS.length}`);
  assert.equal(GALLERY_DIRS.flatMap(filesOnDisk).length, declared().length);
});

test("no gallery file ships at camera size", () => {
  const LIMIT = 500 * 1024;
  const heavy = GALLERY_DIRS.flatMap(filesOnDisk)
    .map((file) => ({ file, bytes: fs.statSync(path.join(PUBLIC, file)).size }))
    .filter((entry) => entry.bytes > LIMIT)
    .map((entry) => `${entry.file} (${Math.round(entry.bytes / 1024)}KB)`);
  assert.deepEqual(heavy, []);
});

test("every photo has alt text and real intrinsic dimensions", () => {
  for (const photo of declared()) {
    assert.ok(photo.alt.trim().length > 0, `${photo.file} has no alt text`);
    assert.ok(!/photo|image|picture/i.test(photo.alt), `${photo.file}: alt restates the medium`);
    assert.ok(photo.width > 0 && photo.height > 0, `${photo.file} has no dimensions`);
  }
});

test("gallerySrc serves a declared file from the site root", () => {
  assert.equal(gallerySrc({ ...RESEARCH_PHOTO, file: "home/x.webp" }), "/home/x.webp");
});
