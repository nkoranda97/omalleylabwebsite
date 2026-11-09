import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { INSIDERS_PREFIX } from "./nav.ts";

/**
 * The structural claims the site's shape rests on, held by reading the tree.
 *
 * Following the precedent set by `lib/display/sticky-column.test.ts` and the client-bundle
 * guard in `lib/display/motif.test.ts`: when an invariant is structural rather than
 * behavioural, a test that reads source is the cheapest thing that can hold it. None of
 * these three claims is visible in any single file, and all three are the kind that erode
 * quietly — a route added in the wrong place, a prefix hardcoded in a second location.
 */

const ROOT = process.cwd();
const APP = path.join(ROOT, "app");

/** Every routable file: pages and route handlers. */
function routeFiles(): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === "page.tsx" || entry.name === "route.ts") found.push(full);
    }
  };
  walk(APP);
  return found.sort();
}

/**
 * The URL a route file resolves to, computed from its location rather than trusted.
 *
 * Route groups are stripped because parentheses are excluded from the path — which is the
 * property that lets the public group's landing page live at `/`.
 */
function urlFor(file: string): string {
  const segments = path
    .relative(APP, path.dirname(file))
    .split(path.sep)
    .filter((segment) => segment !== "" && !segment.startsWith("("));
  return `/${segments.join("/")}`;
}

/** Resolve one import specifier to a file on disk, or null when it is external. */
function resolveImport(fromFile: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = path.join(ROOT, specifier.slice(2));
  else if (specifier.startsWith(".")) base = path.resolve(path.dirname(fromFile), specifier);
  else return null; // a package, not our source

  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/**
 * Everything a file pulls in, transitively, within this repo.
 *
 * Transitive rather than direct on purpose. A public page that imports a helper that imports
 * the seam recouples the whole site's build to the gitignored research database just as
 * surely as importing it outright, and a direct-import check would not see it.
 */
function transitiveImports(entry: string, seen = new Set<string>()): Set<string> {
  if (seen.has(entry)) return seen;
  seen.add(entry);

  const source = fs.readFileSync(entry, "utf8");
  for (const match of source.matchAll(/from\s+["']([^"']+)["']/g)) {
    const resolved = resolveImport(entry, match[1]);
    if (resolved !== null) transitiveImports(resolved, seen);
  }
  return seen;
}

const DATA_SUBTREE = path.join(APP, "insiders", "data");
const SEAM = path.join(ROOT, "lib", "data", "index.ts");

// --- the research data is confined to one subtree ------------------------------

test("only routes under the data section reach the research database", () => {
  // The property that keeps "make the public site buildable without data/" achievable
  // later. A route outside the data subtree that reaches the seam recouples the whole
  // build — including the About page a labmate wants to edit without a copy of the
  // database.
  const offenders: string[] = [];

  for (const file of routeFiles()) {
    const reachesSeam = transitiveImports(file).has(SEAM);
    const inDataSubtree = file.startsWith(DATA_SUBTREE + path.sep);
    if (reachesSeam && !inDataSubtree) offenders.push(path.relative(ROOT, file));
  }

  assert.deepEqual(offenders, [], "route(s) outside the data section reach the seam");
});

test("the data section's routes do reach it, so the guard is not vacuous", () => {
  // Without this, deleting the data browser entirely would make the test above pass.
  const reaching = routeFiles()
    .filter((file) => transitiveImports(file).has(SEAM))
    .map((file) => path.relative(ROOT, file))
    .sort();

  assert.equal(reaching.length, 3, `expected browse, detail and image routes: ${reaching}`);
  for (const file of reaching) {
    assert.ok(file.startsWith("app/insiders/data/"), file);
  }
});

test("no public page reaches the research database, transitively", () => {
  for (const file of routeFiles()) {
    if (!path.relative(APP, file).startsWith("(public)")) continue;
    assert.ok(
      !transitiveImports(file).has(SEAM),
      `${path.relative(ROOT, file)} reaches the seam`,
    );
  }
});

// --- nothing protected sits outside the prefix ---------------------------------

test("every route under the insiders directory resolves inside the prefix", () => {
  for (const file of routeFiles()) {
    if (!path.relative(APP, file).startsWith("insiders")) continue;
    const url = urlFor(file);
    assert.ok(
      url === INSIDERS_PREFIX || url.startsWith(`${INSIDERS_PREFIX}/`),
      `${path.relative(ROOT, file)} resolves to ${url}`,
    );
  }
});

test("no route outside the insiders directory resolves inside the prefix", () => {
  // The reverse direction. A route group could otherwise produce an /insiders URL from
  // somewhere else in the tree, giving the prefix two sources and any path-matching guard
  // a page it never knew about.
  for (const file of routeFiles()) {
    if (path.relative(APP, file).startsWith("insiders")) continue;
    const url = urlFor(file);
    assert.ok(
      url !== INSIDERS_PREFIX && !url.startsWith(`${INSIDERS_PREFIX}/`),
      `${path.relative(ROOT, file)} resolves to ${url} from outside insiders/`,
    );
  }
});

test("the motif image route is inside the prefix", () => {
  // Named specifically because it is the one that would have leaked. Route handlers do not
  // participate in layouts, so its nesting under the insiders layout protects nothing —
  // only the path does, and this asserts the path.
  const image = routeFiles().find((file) => file.endsWith(path.join("motif", "[sample]", "[image]", "route.ts")));
  assert.ok(image !== undefined, "the motif image route should exist");
  assert.ok(urlFor(image).startsWith(`${INSIDERS_PREFIX}/`), urlFor(image));
});

// --- the prefix lives in exactly one place -------------------------------------

test("only the nav module hardcodes the insiders prefix", () => {
  // This is what makes adding a section a directory rather than an audit, and what makes
  // relocating the boundary a one-constant change. A second hardcoded copy is the seed of
  // the enumerate-and-drift problem the real path segment was chosen to avoid.
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules") walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry.name) || entry.name.includes(".test.")) continue;
      const relative = path.relative(ROOT, full);
      if (relative === path.join("lib", "site", "nav.ts")) continue;
      if (fs.readFileSync(full, "utf8").includes('"/insiders')) offenders.push(relative);
    }
  };
  for (const dir of ["app", "lib", "components"]) walk(path.join(ROOT, dir));

  assert.deepEqual(offenders, [], "the prefix should come from lib/site/nav.ts alone");
});

test("there is no enumerated list of protected paths to keep in sync", () => {
  // R14 stated as an absence. The protected set is the directory tree; if some file grew a
  // literal list of insiders routes, that list would be the thing that drifts.
  const navSource = fs.readFileSync(path.join(ROOT, "lib", "site", "nav.ts"), "utf8");
  const literals = [...navSource.matchAll(/"\/insiders/g)].length;
  assert.equal(literals, 1, "even the nav derives its entries from one prefix constant");
});
