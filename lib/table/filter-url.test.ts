import { test } from "node:test";
import assert from "node:assert/strict";

import { MOTIF_IMAGES } from "../data/motif-images.ts";
import { NOT_RECORDED } from "./filters.ts";
import { decodeFilters, encodeFilters } from "./filter-url.ts";

/**
 * The shareable filter URL.
 *
 * Two properties carry this module. It round-trips, so a pasted link reproduces the view
 * it was copied from. And it is **stable** — identical state must encode byte-identically,
 * because the component writes on every state change with `replaceState`, and an unstable
 * encoding would rewrite the URL on re-renders that changed nothing.
 *
 * Every malformed input is asserted to *degrade*, not throw. That inverts this codebase's
 * usual stance and the reason is in the module comment: a URL is user-editable text, and
 * a stale shared link should show a wider view rather than a 500.
 */

const facet = (id: string, values: string[]) => ({ id, value: values });
const bound = (id: string, v: [number | undefined, number | undefined, boolean]) => ({
  id,
  value: v,
});

// --- round trip ---------------------------------------------------------------

test("empty state encodes to an empty query", () => {
  assert.equal(encodeFilters([]), "");
  assert.deepEqual(decodeFilters(""), []);
});

test("a facet round-trips with every selected value", () => {
  const state = [facet("is_treatment", ["0", "1"])];
  const encoded = encodeFilters(state);
  assert.match(encoded, /is_treatment=0%2C1/);
  assert.deepEqual(decodeFilters(encoded), state);
});

test("a threshold round-trips both bounds", () => {
  const state = [bound("num_peaks", [100, 5000, false])];
  assert.deepEqual(decodeFilters(encodeFilters(state)), state);
});

test("a one-sided bound round-trips without inventing the other side", () => {
  assert.deepEqual(
    decodeFilters(encodeFilters([bound("num_peaks", [100, undefined, false])])),
    [bound("num_peaks", [100, undefined, false])],
  );
  assert.deepEqual(
    decodeFilters(encodeFilters([bound("num_peaks", [undefined, 100, false])])),
    [bound("num_peaks", [undefined, 100, false])],
  );
});

test("a zero bound survives the round trip rather than reading as absent", () => {
  const state = [bound("num_peaks", [0, undefined, false])];
  assert.deepEqual(decodeFilters(encodeFilters(state)), state);
});

test("include-nulls round-trips, alone and alongside bounds", () => {
  for (const state of [
    [bound("max_peak_score", [undefined, undefined, true])],
    [bound("max_peak_score", [10, undefined, true])],
    [bound("max_peak_score", [10, 20, true])],
  ]) {
    assert.deepEqual(decodeFilters(encodeFilters(state)), state, JSON.stringify(state));
  }
});

test("facets and thresholds round-trip together", () => {
  const state = [
    facet("is_treatment", ["1"]),
    facet(MOTIF_IMAGES[0], ["motif"]),
    bound("frip", [1, undefined, false]),
  ];
  assert.deepEqual(decodeFilters(encodeFilters(state)), state);
});

test("the not-recorded sentinel round-trips distinctly", () => {
  const state = [facet("gdna_batch", [NOT_RECORDED])];
  const decoded = decodeFilters(encodeFilters(state));
  assert.deepEqual(decoded, state);
  // And is not confusable with a user typing the words.
  assert.notDeepEqual(decodeFilters("gdna_batch=not%20recorded"), state);
});

// --- stability ----------------------------------------------------------------

test("identical state encodes byte-identically, whatever the input order", () => {
  // The property that stops replaceState firing on re-renders that changed nothing.
  const a = encodeFilters([facet("is_treatment", ["1"]), bound("num_peaks", [5, undefined, false])]);
  const b = encodeFilters([bound("num_peaks", [5, undefined, false]), facet("is_treatment", ["1"])]);
  assert.equal(a, b);
  assert.equal(a, encodeFilters(decodeFilters(a)), "a decode/encode cycle is a fixed point");
});

test("encoding is idempotent across repeated cycles", () => {
  let query = encodeFilters([facet("control", ["H1", NOT_RECORDED]), bound("frip", [1, 9, true])]);
  for (let i = 0; i < 3; i++) {
    const next = encodeFilters(decodeFilters(query));
    assert.equal(next, query, `cycle ${i}`);
    query = next;
  }
});

// --- malformed input degrades rather than throwing ----------------------------

test("an unknown column is ignored and the rest survives", () => {
  const decoded = decodeFilters("not_a_column=x&is_treatment=1");
  assert.deepEqual(decoded, [facet("is_treatment", ["1"])]);
});

test("a column that exists but is not filterable is ignored", () => {
  assert.deepEqual(decodeFilters("bam=%2Fproject%2Fx.bam"), []);
  assert.deepEqual(decodeFilters("sample=TP53_b2"), [], "sample is search's job, not a filter's");
});

test("a non-numeric bound drops that bound and keeps the other", () => {
  assert.deepEqual(decodeFilters("num_peaks=abc..500"), [
    bound("num_peaks", [undefined, 500, false]),
  ]);
  assert.deepEqual(decodeFilters("num_peaks=100..xyz"), [
    bound("num_peaks", [100, undefined, false]),
  ]);
});

test("a threshold with nothing usable is dropped entirely", () => {
  assert.deepEqual(decodeFilters("num_peaks=abc..xyz"), []);
  assert.deepEqual(decodeFilters("num_peaks=.."), []);
});

test("a threshold parameter missing its separator is dropped", () => {
  // Someone hand-editing the URL, or an older encoding.
  assert.deepEqual(decodeFilters("num_peaks=500"), []);
});

test("an empty facet parameter is dropped rather than becoming an empty selection", () => {
  assert.deepEqual(decodeFilters("control="), []);
  assert.deepEqual(decodeFilters("control=,,"), []);
});

test("garbage never throws, whatever it looks like", () => {
  for (const query of [
    "?????",
    "&&&",
    "=",
    "num_peaks",
    "num_peaks=..+none",
    "is_treatment=%",
    "gdna_batch=" + "x".repeat(5000),
    "frip=1..2..3",
  ]) {
    assert.doesNotThrow(() => decodeFilters(query), `"${query.slice(0, 40)}"`);
  }
});

test("a duplicated parameter takes one value rather than merging into nonsense", () => {
  const decoded = decodeFilters("is_treatment=1&is_treatment=0");
  assert.equal(decoded.length, 1);
  assert.deepEqual(decoded[0].value, ["1"], "URLSearchParams.get takes the first");
});

// --- URL safety ---------------------------------------------------------------

test("a value containing URL-significant characters round-trips", () => {
  // No real value needs this today — samples match [A-Za-z0-9_.-] and dates are ISO —
  // but the encoder must not depend on that staying true.
  for (const awkward of ["a&b", "a=b", "a+b", "a b", "a%b", "a,b", "a..b", "a+none"]) {
    const state = [facet("control", [awkward])];
    const decoded = decodeFilters(encodeFilters(state));
    if (awkward.includes(",")) {
      // A comma is the value separator, so it legitimately splits — assert that rather
      // than pretending otherwise.
      assert.deepEqual(decoded[0].value, awkward.split(","), awkward);
    } else {
      assert.deepEqual(decoded, state, awkward);
    }
  }
});
