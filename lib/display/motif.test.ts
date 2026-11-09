import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { missingRealDatabase } from "../../db/fixture.ts";
import { listRuns } from "../data/index.ts";
import { MOTIF_IMAGES } from "../data/motif-images.ts";
import {
  LOGO_AXIS_WIDTH,
  MOTIF_ROUTE_SEGMENT,
  TABLE_LOGO_HEIGHT,
  isMotifColumn,
  motifAltText,
  motifImageUrl,
  noMotifReason,
  scaleToHeight,
  tableLogoBox,
} from "./motif.ts";
import { QC_COLUMN_NAMES } from "../data/types.ts";

test("a logo URL sits inside the insiders data section", () => {
  // Covers AE1. The images must not be reachable outside the boundary — leaving them at
  // /motif/... would protect the browser and serve the research images to anyone.
  assert.equal(
    motifImageUrl("TP53_b2", "summits_logo1"),
    "/insiders/data/motif/TP53_b2/summits_logo1",
  );
  assert.equal(
    motifImageUrl("TP53_b2", "summits_logo_rc1"),
    "/insiders/data/motif/TP53_b2/summits_logo_rc1",
  );
});

test("no logo URL is produced outside the insiders prefix", () => {
  for (const image of MOTIF_IMAGES) {
    for (const sample of ["TP53_b2", "HALO_LH", "a.b-c_d"]) {
      assert.ok(motifImageUrl(sample, image).startsWith("/insiders/"), `${sample}/${image}`);
    }
  }
});

test("every image identifier produces a distinct URL for one sample", () => {
  const urls = MOTIF_IMAGES.map((image) => motifImageUrl("SYN_beta", image));
  assert.equal(new Set(urls).size, urls.length);
});

test("motif columns are exactly the image ids, and no QC column is one", () => {
  for (const image of MOTIF_IMAGES) assert.ok(isMotifColumn(image));
  for (const column of QC_COLUMN_NAMES) {
    assert.ok(!isMotifColumn(column), `${column} must not be treated as an image`);
  }
  assert.ok(!isMotifColumn("summits_logo2"), "an unshipped image is not a motif column");
});

// --- the scaling that makes logos comparable --------------------------------

test("scaling fixes the height and lets the width follow the motif length", () => {
  // The real extremes: an 8bp motif and a 32bp one, both 358px tall.
  assert.equal(scaleToHeight(404, 358).height, TABLE_LOGO_HEIGHT);
  assert.equal(scaleToHeight(1664, 358).height, TABLE_LOGO_HEIGHT);
  assert.ok(scaleToHeight(1664, 358).width > scaleToHeight(404, 358).width);
});

test("two logos of different widths scale to the same height", () => {
  // The property the column depends on: letters are one size in every row, so a
  // narrow and a wide motif can be compared rather than merely both displayed.
  const narrow = tableLogoBox(404, 358);
  const wide = tableLogoBox(1664, 358);
  assert.equal(narrow.height, wide.height);
  assert.notEqual(narrow.width, wide.width);
});

test("the table box crops exactly MEME's axis away", () => {
  const box = tableLogoBox(404, 358);
  const scale = TABLE_LOGO_HEIGHT / 358;

  assert.equal(box.offset, Math.round(LOGO_AXIS_WIDTH * scale));
  assert.equal(box.imageWidth, Math.round(404 * scale));
  assert.equal(box.width, box.imageWidth - box.offset, "the box shows the plot only");
  assert.ok(box.width < box.imageWidth, "something was actually cropped");
});

test("the crop is the same number of source pixels at every motif width", () => {
  // The measurement this depends on: MEME draws its axis once at a fixed size, so
  // the offset must not scale with the image's width.
  const offsets = [404, 562, 772, 1087, 1664].map((w) => tableLogoBox(w, 358).offset);
  assert.equal(new Set(offsets).size, 1, `offsets varied: ${offsets}`);
});

test("scaling preserves aspect ratio to the nearest pixel", () => {
  const { width, height } = scaleToHeight(772, 359);
  assert.equal(height, TABLE_LOGO_HEIGHT);
  assert.ok(Math.abs(width / height - 772 / 359) < 0.02);
});

test("the widest real logo stays within a bounded column", () => {
  // 1664px is the widest motif observed. The ceiling is deliberately generous — the
  // logos are the feature here — but it is a ceiling: if a future run pushes past
  // it, the fixed-height choice needs revisiting rather than silently widening the
  // table by another screen.
  assert.ok(tableLogoBox(1664, 358).width < 300, "widest logo column");
});

test("a logo no wider than the axis throws rather than becoming an empty cell", () => {
  // A zero-width box would render as nothing, indistinguishable from a sample with
  // no motif — the exact substitution this project refuses.
  assert.throws(() => tableLogoBox(LOGO_AXIS_WIDTH, 358), /nothing to show/);
  assert.throws(() => tableLogoBox(40, 358), /nothing to show/);
});

test("a zero-height logo throws rather than dividing by zero", () => {
  // The reader rejects a 0-dimension PNG header, so this is unreachable through the
  // seam — but silently producing Infinity here would be exactly the plausible
  // wrong value the project forbids.
  assert.throws(() => scaleToHeight(404, 0), /height 0/);
  assert.throws(() => tableLogoBox(404, 0), /height 0/);
});

// --- labels ------------------------------------------------------------------

test("a control's missing motif is an expected outcome, a treatment's is a result", () => {
  // Seven of the nine real motif-less samples are controls and two are treatments.
  // One message for both would report a normal outcome as a null result on seven of
  // them, and the reverse on two.
  const control = noMotifReason("0");
  const treatment = noMotifReason("1");

  assert.match(control, /expected result for a control/);
  assert.match(treatment, /came back empty/);
  assert.notEqual(control, treatment);
  assert.doesNotMatch(control, /came back empty/);
});

test("only is_treatment 0 reads as a control, never the sample name", () => {
  // HALOb_b2 is a treatment despite the prefix; HALO_LH and HALOa_b2 are controls
  // that do have motifs. Any name-based shortcut is wrong on all three.
  assert.equal(noMotifReason("1"), noMotifReason(null), "an unset flag is not a control");
  assert.notEqual(noMotifReason("0"), noMotifReason("1"));
});

test("alt text names the sample and distinguishes the two strands", () => {
  assert.match(motifAltText("TP53_b2", "summits_logo1"), /TP53_b2/);
  assert.match(motifAltText("TP53_b2", "summits_logo1"), /forward/);
  assert.match(motifAltText("TP53_b2", "summits_logo_rc1"), /reverse complement/);
  assert.notEqual(
    motifAltText("TP53_b2", "summits_logo1"),
    motifAltText("TP53_b2", "summits_logo_rc1"),
  );
});

// --- the reserved segment ----------------------------------------------------

test(
  "no real sample collides with the route segment the image route reserves",
  { skip: missingRealDatabase() },
  async () => {
    // Still relevant after the move, which is why this was re-pointed rather than deleted:
    // `motif/` and `[sample]/` are still siblings, now under `insiders/data/`, and a static
    // segment still wins over a dynamic one. A sample named "motif" would be unreachable.
    const samples = (await listRuns()).map((run) => run.sample);
    assert.ok(
      !samples.includes(MOTIF_ROUTE_SEGMENT),
      `a sample named "${MOTIF_ROUTE_SEGMENT}" would be shadowed by the image route`,
    );
  },
);

// --- the client-bundle boundary ----------------------------------------------

test("this module reaches for the leaf, never the seam", () => {
  // The browse table is a client component and imports this file. Importing
  // ../data/index.ts here pulls the reader — and better-sqlite3 — into the client
  // bundle, which fails the build. The build is the real guard; this one just says
  // why in one line instead of six Turbopack errors.
  const source = fs.readFileSync(new URL("./motif.ts", import.meta.url), "utf8");
  assert.doesNotMatch(
    source,
    /from\s+"\.\.\/data\/(index|sqlite|motifs)\.ts"/,
    "import from ../data/motif-images.ts instead — see the comment in motif.ts",
  );
});
