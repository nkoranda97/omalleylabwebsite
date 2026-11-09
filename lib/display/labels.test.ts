import { test } from "node:test";
import assert from "node:assert/strict";

import { MOTIF_IMAGES } from "../data/motif-images.ts";
import { QC_COLUMN_NAMES } from "../data/types.ts";
import { tableColumnOrder } from "./column-groups.ts";
import {
  COLUMN_LABELS,
  assertLabelled,
  capitalizationProblem,
  columnLabel,
} from "./labels.ts";
import { formatValue } from "./format.ts";

const ALL_COLUMNS = tableColumnOrder(QC_COLUMN_NAMES, MOTIF_IMAGES);

// --- coverage ----------------------------------------------------------------

test("every column has a label and every label has a column", () => {
  assert.doesNotThrow(() => assertLabelled(ALL_COLUMNS));
  assert.equal(Object.keys(COLUMN_LABELS).length, ALL_COLUMNS.length);
});

test("a column with no label throws instead of showing its identifier", () => {
  // A fallback to the raw id would put `some_new_column` among 39 human labels:
  // conspicuous enough to look like a bug, quiet enough to ship.
  assert.throws(() => columnLabel("some_new_column"), /No display label/);
  assert.throws(() => assertLabelled([...ALL_COLUMNS, "some_new_column"]), /no display label/);
});

test("a label left behind by a removed column throws too", () => {
  assert.throws(() => assertLabelled(ALL_COLUMNS.slice(1)), /no longer exist/);
});

// --- the three rules ---------------------------------------------------------

test("no label contains an underscore", () => {
  for (const [column, label] of Object.entries(COLUMN_LABELS)) {
    assert.ok(!label.includes("_"), `${column} -> "${label}" still has an underscore`);
  }
});

test("no label keeps a piece of project jargon", () => {
  // The specific shortenings the pipeline's column names use. Each must be spelled
  // out; a label that still says "num" or "pct" has not been translated, only tidied.
  const jargon = [
    /\bnum\b/i,
    /\bpct\b/i,
    /\bfilt\b/i,
    /\bfrag\b/i,
    /\bfrags\b/i,
    /\bbl\b/i,
    /\bgdna\b/i,
    /\bmax\b/i,
    /\bdir\b/i,
    /\br1\b/i,
    /\br2\b/i,
    /\btsv\b/i,
  ];
  for (const [column, label] of Object.entries(COLUMN_LABELS)) {
    for (const pattern of jargon) {
      assert.ok(
        !pattern.test(label),
        `${column} -> "${label}" still contains ${pattern}`,
      );
    }
  }
});

test("every label follows one capitalization rule", () => {
  for (const [column, label] of Object.entries(COLUMN_LABELS)) {
    assert.equal(
      capitalizationProblem(label),
      null,
      `${column} -> "${label}": ${capitalizationProblem(label)}`,
    );
  }
});

test("the capitalization check actually rejects the shapes it should", () => {
  // Otherwise the test above passes on anything.
  assert.match(capitalizationProblem("number of peaks") ?? "", /number/);
  assert.match(capitalizationProblem("Number Of Peaks") ?? "", /Of/);
  assert.match(capitalizationProblem("Reads In Peaks") ?? "", /In/);
  assert.equal(capitalizationProblem("Number of Peaks"), null);
  assert.equal(capitalizationProblem("Reads in Peaks"), null);
  assert.equal(capitalizationProblem("Read 1 File"), null, "a bare number is not a word");
  assert.equal(capitalizationProblem("Genomic DNA Batch"), null, "an initialism stays");
  assert.equal(capitalizationProblem("MEME Summits Directory"), null, "a tool name stays");
  assert.equal(capitalizationProblem("Of Peaks"), null, "a leading function word is capitalized");
});

// --- the specific complaints -------------------------------------------------

test("is_treatment is not called that, and does not read as a digit", () => {
  assert.equal(columnLabel("is_treatment"), "Sample Type");
  assert.doesNotMatch(columnLabel("is_treatment"), /^Is /);

  assert.equal(formatValue("is_treatment", "0"), "Control");
  assert.equal(formatValue("is_treatment", "1"), "Treatment");
});

test("an unmapped sample-type code shows itself rather than vanishing", () => {
  // A pipeline that starts writing "2" should be noticed, not blanked.
  assert.equal(formatValue("is_treatment", "2"), "2");
  assert.equal(formatValue("is_treatment", null), "", "absent is still absent");
});

test("searching a word now finds what searching a digit could not", () => {
  // Search runs through this same formatter, so the words are searchable and the
  // digits are not — which is the right way round for a reader.
  assert.match(formatValue("is_treatment", "0").toLowerCase(), /control/);
});

test("labels a reader would most likely stumble over are spelled out", () => {
  assert.equal(columnLabel("gdna_batch"), "Genomic DNA Batch");
  assert.equal(columnLabel("num_peaks_filt"), "Number of Filtered Peaks");
  assert.equal(columnLabel("mapping_pct"), "Mapping Percentage");
  assert.equal(columnLabel("median_frag_size"), "Median Fragment Size");
  assert.equal(columnLabel("subsampled_frags"), "Subsampled Fragments");
});

test("the field's own names survive, because expanding them would say less", () => {
  // Tools, as proper nouns.
  for (const [column, tool] of [
    ["meme_summits_dir", "MEME"],
    ["fimo_peaks_tsv", "FIMO"],
    ["homer_annotations", "HOMER"],
  ] as const) {
    assert.match(columnLabel(column), new RegExp(`^${tool} `));
  }

  // And FRiP, which is what the measure is called rather than a shortening. It also
  // keeps its internal lowercase i, which the capitalization rule must not "fix".
  assert.equal(columnLabel("frip"), "FRiP");
  assert.equal(columnLabel("frip_filt"), "Filtered FRiP");
  assert.equal(capitalizationProblem("FRiP"), null);
  assert.equal(capitalizationProblem("Filtered FRiP"), null);
});

test("labels are distinct, so no two columns read the same", () => {
  const labels = Object.values(COLUMN_LABELS);
  assert.equal(new Set(labels).size, labels.length);
});

test("the two logo columns are distinguishable at a glance", () => {
  assert.equal(columnLabel("summits_logo1"), "Motif Logo");
  assert.match(columnLabel("summits_logo_rc1"), /Reverse Complement/);
});
