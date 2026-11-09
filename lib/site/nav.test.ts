import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  DATA_HOME,
  INSIDERS_NAV,
  INSIDERS_PREFIX,
  PUBLIC_NAV,
  navHrefs,
  sampleHref,
} from "./nav.ts";

/**
 * The nav matches the pages that exist.
 *
 * This is the drift guard the nav-as-data decision exists for. A page added without a nav
 * entry is unreachable; a nav entry without a page is a dead link. Both are invisible until
 * someone clicks, and both are caught here by comparing the declaration against the
 * directory tree.
 */

const APP = path.join(process.cwd(), "app");

/** Directories directly under a route parent that contain a page. */
function pageDirectories(parent: string): string[] {
  const root = path.join(APP, parent);
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    // Dynamic segments and route groups are not nav destinations.
    .filter((entry) => !entry.name.startsWith("[") && !entry.name.startsWith("("))
    .filter((entry) => fs.existsSync(path.join(root, entry.name, "page.tsx")))
    .map((entry) => entry.name)
    .sort();
}

// --- the public nav -----------------------------------------------------------

test("the public nav lists every public page, and no page it lacks", () => {
  // Add app/(public)/contact/page.tsx without a nav entry and this fails.
  const directories = pageDirectories("(public)");
  const fromNav = navHrefs(PUBLIC_NAV)
    .filter((href) => href !== "/")
    .map((href) => href.slice(1))
    .sort();

  assert.deepEqual(fromNav, directories);
});

test("the landing page is in the nav and lives at the root", () => {
  assert.equal(PUBLIC_NAV[0].href, "/");
  assert.ok(fs.existsSync(path.join(APP, "(public)", "page.tsx")));
});

test("exactly one route resolves to the site root", () => {
  // app/page.tsx and app/(public)/page.tsx both resolve to `/`, which is a build error
  // rather than a precedence question.
  assert.ok(!fs.existsSync(path.join(APP, "page.tsx")), "app/page.tsx must not survive");
});

test("public nav hrefs are root-relative with no trailing slash", () => {
  for (const href of navHrefs(PUBLIC_NAV)) {
    assert.ok(href.startsWith("/"), href);
    assert.ok(href === "/" || !href.endsWith("/"), `${href} has a trailing slash`);
  }
});

test("public nav labels are present and distinct", () => {
  const labels = PUBLIC_NAV.map((link) => link.label);
  for (const label of labels) assert.ok(label.trim().length > 0);
  assert.equal(new Set(labels).size, labels.length);
});

test("the public nav does not advertise the insiders area", () => {
  // The footer carries that link. Putting a protected destination in the main navigation
  // would present it as an ordinary section of the public site.
  for (const href of navHrefs(PUBLIC_NAV)) {
    assert.ok(!href.startsWith(INSIDERS_PREFIX), href);
  }
});

// --- the insiders nav ---------------------------------------------------------

test("the insiders nav lists every insiders section, and no section it lacks", () => {
  const directories = pageDirectories("insiders");
  const fromNav = navHrefs(INSIDERS_NAV)
    .map((href) => href.slice(INSIDERS_PREFIX.length + 1))
    .sort();

  assert.deepEqual(fromNav, directories);
});

test("every insiders nav href stays inside the boundary", () => {
  // An entry pointing outside would be a link out of the protected area dressed as a
  // section of it.
  for (const href of navHrefs(INSIDERS_NAV)) {
    assert.ok(href.startsWith(`${INSIDERS_PREFIX}/`), href);
  }
});

test("insiders nav labels are present and distinct", () => {
  const labels = INSIDERS_NAV.map((link) => link.label);
  for (const label of labels) assert.ok(label.trim().length > 0);
  assert.equal(new Set(labels).size, labels.length);
});

test("every insiders section carries a description for the hub to render", () => {
  // The hub lists sections as tiles, and a tile's second line is this. Without the guard a
  // fourth section reaches the hub as a heading over blank space — visible only to whoever
  // happens to open the page.
  for (const link of INSIDERS_NAV) {
    assert.ok(
      link.description !== undefined && link.description.trim().length > 0,
      `${link.label} has no description`,
    );
  }
});

test("the insiders hub exists as a page rather than a bare directory", () => {
  // /insiders lists its sections; a redirect would make the URL a lie and would need
  // revisiting the moment a fourth section exists.
  assert.ok(fs.existsSync(path.join(APP, "insiders", "page.tsx")));
});

// --- constructed paths --------------------------------------------------------

test("the data section's paths derive from one prefix", () => {
  assert.equal(DATA_HOME, "/insiders/data");
  assert.equal(sampleHref("TP53_b2"), "/insiders/data/TP53_b2");
  assert.ok(DATA_HOME.startsWith(INSIDERS_PREFIX));
  assert.ok(sampleHref("x").startsWith(INSIDERS_PREFIX));
});

test("the data section is itself an insiders nav entry", () => {
  assert.ok(navHrefs(INSIDERS_NAV).includes(DATA_HOME));
});
