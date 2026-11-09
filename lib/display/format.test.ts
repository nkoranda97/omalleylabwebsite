import { test } from "node:test";
import assert from "node:assert/strict";

import { formatValue, isPercentColumn } from "./format.ts";

test("percentage columns show two decimals and a unit", () => {
  // The derived value carries 17 significant digits of arithmetic noise.
  assert.equal(formatValue("frip", 14.245639639683342), "14.25%");
  assert.equal(formatValue("frip_filt", 12.212384677920628), "12.21%");
  // Two decimals matches what the pipeline's own export served.
  assert.equal(formatValue("frip", 0.34), "0.34%");
  assert.equal(formatValue("frip", 0), "0.00%");
});

test("only the percentage columns get the unit", () => {
  assert.ok(isPercentColumn("frip"));
  assert.ok(isPercentColumn("frip_filt"));
  assert.ok(!isPercentColumn("mapping_pct"), "already 2dp at source, and not derived");
  assert.equal(formatValue("mapping_pct", 84.71), "84.71");
  assert.equal(formatValue("total_reads", 125671976), "125671976");
});

test("absent renders empty so it cannot read as 0", () => {
  assert.equal(formatValue("frip", null), "");
  assert.equal(formatValue("num_peaks", null), "");
  assert.equal(formatValue("control", undefined), "");
  // And a genuine zero is not blank.
  assert.equal(formatValue("num_peaks_filt", 0), "0");
});

test("strings pass through untouched", () => {
  assert.equal(formatValue("sample", "HALO_2606"), "HALO_2606");
  assert.equal(formatValue("experiment_date", "2025-05-07"), "2025-05-07");
  assert.equal(formatValue("is_treatment", "0"), "Control", "the code reads as a word");
});

test("what the reader sees is what search will match", () => {
  // The pairing that makes searching "14.25" work at all.
  const shown = formatValue("frip", 14.245639639683342);
  assert.ok(shown.includes("14.25"));
});
