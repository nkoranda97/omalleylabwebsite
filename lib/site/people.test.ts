import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  ALUMNI,
  PEOPLE,
  PHOTO_DIR,
  UNKNOWN,
  allMembers,
  alumnusRole,
  photoAlt,
  photoSrc,
  type Member,
} from "./people.ts";

/**
 * The roster checked against the directory it claims to describe.
 *
 * The page component cannot hold these claims: a missing file renders as a broken image
 * icon in one cell of a grid, which is easy to miss and impossible to see from the source.
 * Same shape as `nav.test.ts` — declare the structure, then assert it against the tree.
 */

const PHOTOS = path.join(process.cwd(), "public", PHOTO_DIR);

/**
 * Who has no headshot yet, by name.
 *
 * Pinned so that a missing photo is a decision someone made, not an accident: setting a member's
 * photo to `null` without listing them here fails, and so does adding their photo without taking
 * them off. Both of these people have no usable photograph on the lab's previous site — one shows
 * the lab logo, the other a stock image.
 */
const NO_PHOTO_YET = ["Ronan O\u2019Malley, Ph.D.", "Ernesto Gagarin"];

/** Members who have a headshot, with the type narrowed to say so. */
function withPhotos(): (Member & { photo: string })[] {
  return allMembers().filter((member): member is Member & { photo: string } => member.photo !== null);
}

/** Every file the headshot directory actually contains. */
function filesOnDisk(): string[] {
  return fs
    .readdirSync(PHOTOS, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
}

// --- the roster and the directory agree, in both directions ---------------------

test("every member's headshot exists on disk", () => {
  const missing = withPhotos()
    .filter((member) => !fs.existsSync(path.join(PHOTOS, member.photo)))
    .map((member) => `${member.name} -> ${member.photo}`);

  assert.deepEqual(missing, [], "headshot file(s) named in the roster are not in public/people");
});

test("no headshot sits in public/people unused", () => {
  // The reverse direction, and the one with a consequence beyond tidiness: everything under
  // public/ is served at a guessable URL. A departed member's photo left here stays
  // downloadable by anyone long after their name comes off the page.
  const claimed = new Set(withPhotos().map((member) => member.photo));
  const orphans = filesOnDisk().filter((file) => !claimed.has(file));

  assert.deepEqual(orphans, [], "file(s) in public/people belong to nobody on the roster");
});

test("the guard is not vacuous — there are photos and they are all claimed", () => {
  // Without this, emptying public/people would make both tests above pass.
  assert.equal(filesOnDisk().length, withPhotos().length);
  assert.ok(allMembers().length >= 7, `expected the full roster, got ${allMembers().length}`);
});

test("exactly the pinned members have no headshot", () => {
  const without = allMembers()
    .filter((member) => member.photo === null)
    .map((member) => member.name);
  assert.deepEqual(without, NO_PHOTO_YET);
});

// --- no member can be silently duplicated or blank ------------------------------

test("names and photos are unique", () => {
  const names = allMembers().map((member) => member.name);
  const photos = withPhotos().map((member) => member.photo);

  assert.equal(new Set(names).size, names.length, "a name appears twice");
  assert.equal(new Set(photos).size, photos.length, "two members share one headshot");
});

test("every member has a name, and every group a heading and members", () => {
  for (const group of PEOPLE) {
    assert.ok(group.heading.trim() !== "", "a group has a blank heading");
    assert.ok(group.members.length > 0, `${group.heading} has no members`);
    for (const member of group.members) {
      assert.ok(member.name.trim() !== "", `a member of ${group.heading} has no name`);
      if (member.photo !== null) {
        assert.ok(member.photo.trim() !== "", `${member.name} has a blank headshot filename`);
      }
    }
  }
  const headings = PEOPLE.map((group) => group.heading);
  assert.equal(new Set(headings).size, headings.length, "two groups share a heading");
});

// --- the featured member's labelled facts ---------------------------------------

test("every detail has a label and a value", () => {
  // A blank label renders a value with nothing explaining it; a blank value renders a label
  // with nothing after it. Neither is distinguishable from a styling bug on the page.
  for (const member of allMembers()) {
    for (const detail of member.details ?? []) {
      assert.ok(detail.label.trim() !== "", `${member.name} has a detail with no label`);
      assert.ok(detail.value.trim() !== "", `${member.name}: "${detail.label}" has no value`);
    }
  }
});

test("an unsupplied fact uses the UNKNOWN sentinel, not a plausible stand-in", () => {
  // The rule this enforces: if you do not know it, say so. The failure mode is writing something
  // that merely looks right — "Assistant Professor" would render as a finished profile while
  // being an invention about a real person, and no reader could tell. Anything that is not the
  // sentinel is therefore a claim, and should be one somebody checked.
  //
  // Kept honest from the other side too: a sentinel that stopped appearing would mean either
  // every fact got filled in (good) or the placeholders were quietly replaced by guesses (bad),
  // so this only asserts the shape of a blank rather than counting them.
  for (const member of allMembers()) {
    for (const detail of member.details ?? []) {
      const looksLikeABlank = /^[—\-–_?.\s]*$/.test(detail.value) || /^(tbd|todo|n\/?a)$/i.test(detail.value);
      if (!looksLikeABlank) continue;
      assert.equal(
        detail.value,
        UNKNOWN,
        `${member.name}: "${detail.label}" is blank but not the UNKNOWN sentinel`,
      );
    }
  }
});

test("a detail never links somewhere that cannot resolve", () => {
  // The one kind of blank that cannot be honest. A missing value renders as an em-dash and reads
  // as missing; a missing URL renders as a link that goes nowhere, which reads as a broken page.
  // So an href must be a real scheme, and must never be attached to an unsupplied value.
  for (const member of allMembers()) {
    for (const detail of member.details ?? []) {
      if (detail.href === undefined) continue;
      assert.ok(
        /^(https:\/\/|mailto:)/.test(detail.href),
        `${member.name}: "${detail.label}" links to ${detail.href}`,
      );
      assert.notEqual(
        detail.value,
        UNKNOWN,
        `${member.name}: "${detail.label}" has a link but no value`,
      );
    }
  }
});

test("a group labels every member's role or none of them", () => {
  // The rule behind the optional `role`: it is omitted when the heading already states it.
  // Half a group carrying titles is the actual mistake — it reads as missing data on the
  // members without one rather than as a heading that covers everybody.
  for (const group of PEOPLE) {
    const withRole = group.members.filter((member) => member.role !== undefined).length;
    assert.ok(
      withRole === 0 || withRole === group.members.length,
      `${group.heading}: ${withRole} of ${group.members.length} members carry a role`,
    );
  }
});

// --- the images stay web-sized -------------------------------------------------

test("no headshot ships at original camera size", () => {
  // The originals run to 2.5MB, and dropping one in here would work perfectly on a fast
  // connection while quietly committing it to git forever.
  //
  // 500KB, raised from 150KB when these became whole uncropped frames: a full photograph
  // carries background a tight crop throws away, so the same picture is legitimately several
  // times larger. The heaviest is ~320KB, which leaves room for a replacement while still
  // catching a raw camera file.
  const LIMIT = 500 * 1024;
  const heavy = filesOnDisk()
    .map((file) => ({ file, bytes: fs.statSync(path.join(PHOTOS, file)).size }))
    .filter((entry) => entry.bytes > LIMIT)
    .map((entry) => `${entry.file} (${Math.round(entry.bytes / 1024)}KB)`);

  assert.deepEqual(heavy, [], `headshot(s) over ${LIMIT / 1024}KB`);
});

// --- the URL and alt-text helpers ----------------------------------------------

test("photoSrc builds a root-relative URL under the photo directory", () => {
  assert.equal(photoSrc("x.jpg"), "/people/x.jpg");
});

test("photoAlt names the person without narrating the medium", () => {
  const alt = photoAlt({ name: "Ada Example, Ph.D.", photo: null });
  assert.equal(alt, "Ada Example, Ph.D.");
  assert.ok(!/photo|image|picture|headshot/i.test(alt), "alt text restates the medium");
});

// ---- alumni --------------------------------------------------------------------------------

test("every alumnus has a name and a role, and no photograph", () => {
  assert.ok(ALUMNI.length > 0, "the alumni list is empty");
  for (const alumnus of ALUMNI) {
    assert.ok(alumnus.name.trim() !== "", "an alumnus has no name");
    assert.ok(alumnus.role.trim() !== "", `${alumnus.name} has no role`);
    // Text only, on purpose: a departed member's committed photo stays downloadable at a
    // guessable URL long after the page stops showing it.
    assert.ok(!("photo" in alumnus), `${alumnus.name} carries a photo`);
  }
});

test("nobody is both a current member and an alumnus", () => {
  const current = new Set(allMembers().map((member) => member.name));
  const both = ALUMNI.filter((alumnus) => current.has(alumnus.name)).map((a) => a.name);
  assert.deepEqual(both, []);
});

test("an alumnus's role line carries their years only when the source gives them", () => {
  assert.equal(
    alumnusRole({ name: "A", role: "Postdoctoral Scholar", years: "2023\u20132025" }),
    "Postdoctoral Scholar, 2023\u20132025",
  );
  // No dangling separator, no empty parentheses.
  assert.equal(alumnusRole({ name: "B", role: "Lab Manager" }), "Lab Manager");
});
