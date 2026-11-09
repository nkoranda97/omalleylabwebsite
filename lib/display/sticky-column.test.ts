import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * The invariant a sticky column depends on: **row background colours must be opaque.**
 *
 * The browse table pins `sample` with `bg-inherit`, and `background-color: inherit`
 * takes the parent's *computed* value including its alpha channel. So any row state
 * painted with a half-transparent colour makes the pinned cell half-transparent too,
 * and the columns scrolling underneath composite straight through the sample name.
 *
 * This shipped once, from stock shadcn's `hover:bg-muted/50`. It is invisible at rest
 * and only appears while hovering a scrolled table, which is why it needs a tripwire
 * rather than trust: no screenshot taken at rest would ever show it, and the headless
 * browser cannot apply `:hover` to reproduce it.
 */

const read = (file: string) =>
  fs.readFileSync(path.join(process.cwd(), file), "utf8");

/** The `<tr>` className in the shadcn table primitive. */
function tableRowClasses(): string {
  const source = read("components/ui/table.tsx");
  const start = source.indexOf("function TableRow(");
  assert.notEqual(start, -1, "TableRow not found — did the primitive get renamed?");
  const end = source.indexOf("function TableHead(", start);
  return source.slice(start, end === -1 ? undefined : end);
}

test("no row background carries an alpha channel", () => {
  const row = tableRowClasses();

  // `bg-muted/50`, `bg-foreground/10`, and friends: a slash after a colour utility is
  // Tailwind's opacity modifier.
  const translucent = [...row.matchAll(/\bbg-[a-z-]+\/\d+/g)].map((m) => m[0]);
  assert.deepEqual(
    translucent,
    [],
    `translucent row background(s) ${translucent.join(", ")} — the pinned sample ` +
      `column inherits the alpha and the scrolling columns show through it. Flatten ` +
      `with color-mix against --background instead.`,
  );
});

test("the hover state is still styled, just opaquely", () => {
  // Guards the other direction: deleting the hover rather than flattening it would
  // pass the test above and lose the row highlight the dense table relies on.
  const row = tableRowClasses();
  assert.match(row, /hover:bg-\[color-mix\(/, "row hover should be a flattened colour");
  assert.match(row, /var\(--background\)/, "flattened against the page background");
});

test("the pinned column still declares an inherited background", () => {
  // If the helper stops using bg-inherit the reasoning above no longer applies — and
  // whatever replaces it needs its own opacity argument, so this should be revisited
  // rather than silently passing.
  assert.match(read("components/qc-runs-table.tsx"), /bg-inherit/);
});
