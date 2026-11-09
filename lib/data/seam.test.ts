import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildFixture,
  buildMemeFixture,
  defaultFixture,
  defaultMemeFixture,
  missingRealDatabase,
  missingRealMeme,
} from "../../db/fixture.ts";
import * as seam from "./index.ts";
import { listRuns, getRun, getMotifs, listMotifs } from "./index.ts";
import { QC_COLUMN_NAMES } from "./types.ts";

/**
 * Seam-level behavior, exercised only through the public surface.
 *
 * The cross-implementation parity test that lived here retired with the mock
 * reader: its job was verifying the source swap at column parity, and once the row
 * type grew past what a 19-column export can express there was nothing left to
 * compare. The reconciliation it proved is locked in by the reader's own tests.
 *
 * Ordering is asserted in sqlite.test.ts rather than here, against a fixture that
 * inserts out of sorted order — the real database's insertion order already equals
 * sorted, so the same assertion here could not tell a missing `ORDER BY` from a
 * present one.
 */

/**
 * Run a block with the seam pointed at a fabricated database.
 *
 * Without this the seam had no coverage on any machine lacking the gitignored
 * research data — every test here was gated, so `listRuns`/`getRun` went
 * unexercised on a clone and in CI.
 */
async function withFixture(fn: () => Promise<void>): Promise<void> {
  const previous = process.env.GENOME_BROWSER_DB;
  process.env.GENOME_BROWSER_DB = buildFixture();
  try {
    await fn();
  } finally {
    if (previous === undefined) delete process.env.GENOME_BROWSER_DB;
    else process.env.GENOME_BROWSER_DB = previous;
  }
}

// --- the seam's contract, exercised without any research data ---------------

test("listRuns returns every row with the full row shape", async () => {
  await withFixture(async () => {
    const runs = await listRuns();
    assert.equal(runs.length, defaultFixture().runs.length);
    for (const run of runs) {
      const record = run as unknown as Record<string, unknown>;
      assert.equal(Object.keys(record).length, QC_COLUMN_NAMES.length);
    }
  });
});

test("getRun finds a sample and matches what listRuns holds", async () => {
  await withFixture(async () => {
    const one = await getRun("SYN_beta");
    assert.ok(one !== null);
    assert.equal(one.total_reads, 1000000);

    const fromList = (await listRuns()).find((r) => r.sample === "SYN_beta");
    assert.deepEqual(one, fromList);
  });
});

test("getRun returns null for an unknown sample rather than throwing", async () => {
  await withFixture(async () => {
    assert.equal(await getRun("NOT_A_REAL_SAMPLE"), null);
  });
});

test("the seam is not memoized, and its rows cannot be mutated", async () => {
  await withFixture(async () => {
    const first = await listRuns();
    const second = await listRuns();

    // Equality, not identity. The memo was deliberately dropped: holding one parse
    // for the process lifetime would serve a replaced database's old rows forever.
    assert.deepEqual(first, second);
    assert.notStrictEqual(first, second);

    assert.ok(Object.isFrozen(first));
    assert.ok(Object.isFrozen(first[0]));
  });
});

test("a failure below the seam propagates rather than becoming an empty list", async () => {
  const previous = process.env.GENOME_BROWSER_DB;
  process.env.GENOME_BROWSER_DB = "/nonexistent/genome-browser/absent.db";
  try {
    await assert.rejects(listRuns(), /absent\.db/);
    await assert.rejects(getRun("SYN_beta"), /absent\.db/);
  } finally {
    if (previous === undefined) delete process.env.GENOME_BROWSER_DB;
    else process.env.GENOME_BROWSER_DB = previous;
  }
});

// --- the motif surface, on the same boundary --------------------------------

/** Point the seam at both fabricated sources, with no dropped file. */
async function withBothFixtures(fn: () => Promise<void>): Promise<void> {
  const previousDb = process.env.GENOME_BROWSER_DB;
  const previousRoot = process.env.GENOME_BROWSER_MEME_ROOT;
  process.env.GENOME_BROWSER_DB = buildFixture();
  process.env.GENOME_BROWSER_MEME_ROOT = buildMemeFixture({
    ...defaultMemeFixture(),
    SYN_gamma: { logo1: { kind: "empty" }, logo_rc1: { kind: "empty" } },
  });
  try {
    await fn();
  } finally {
    if (previousDb === undefined) delete process.env.GENOME_BROWSER_DB;
    else process.env.GENOME_BROWSER_DB = previousDb;
    if (previousRoot === undefined) delete process.env.GENOME_BROWSER_MEME_ROOT;
    else process.env.GENOME_BROWSER_MEME_ROOT = previousRoot;
  }
}

test("the seam exposes exactly the two source groups and nothing else", () => {
  // The boundary's whole value is being small enough to read. A helper leaking out
  // of here is how "nothing above knows where data comes from" erodes.
  assert.deepEqual(Object.keys(seam).sort(), [
    "MOTIF_IMAGES",
    "getMotifs",
    "getRun",
    "listMotifs",
    "listRuns",
    "readMotifBytes",
  ]);
});

test("listMotifs covers every sample listRuns returns", async () => {
  await withBothFixtures(async () => {
    const runs = await listRuns();
    const motifs = await listMotifs();
    assert.deepEqual(
      motifs.map((m) => m.sample),
      runs.map((r) => r.sample),
      "one motif entry per run, in the same order",
    );
  });
});

test("getMotifs finds a sample and returns null for an unknown one", async () => {
  await withBothFixtures(async () => {
    const found = await getMotifs("SYN_beta");
    assert.ok(found !== null);
    assert.equal(found.logos["summits_logo1"].present, true);

    assert.equal(await getMotifs("NOT_A_REAL_SAMPLE"), null);
  });
});

test("a motif read failure propagates rather than becoming an absent logo", async () => {
  const previous = process.env.GENOME_BROWSER_MEME_ROOT;
  process.env.GENOME_BROWSER_MEME_ROOT = "/nonexistent/genome-browser/meme";
  try {
    await assert.rejects(listMotifs(), /nonexistent\/genome-browser\/meme/);
  } finally {
    if (previous === undefined) delete process.env.GENOME_BROWSER_MEME_ROOT;
    else process.env.GENOME_BROWSER_MEME_ROOT = previous;
  }
});

// --- claims that can only be checked against the real dataset ---------------

test(
  "the real database returns all 109 runs through the seam",
  { skip: missingRealDatabase() },
  async () => {
    assert.equal((await listRuns()).length, 109);
  },
);

test(
  "sample is unique and URL-path-safe, so it can serve as the record slug",
  { skip: missingRealDatabase() },
  async () => {
    const runs = await listRuns();
    assert.equal(new Set(runs.map((r) => r.sample)).size, runs.length);
    for (const run of runs) assert.match(run.sample, /^[A-Za-z0-9_.-]+$/);
  },
);

test(
  "every real sample has both logos accounted for through the seam",
  { skip: missingRealDatabase() || missingRealMeme() },
  async () => {
    const motifs = await listMotifs();
    assert.equal(motifs.length, 109);
    // Accounted for means classified, not present: 9 legitimately have no motif.
    for (const entry of motifs) {
      for (const image of seam.MOTIF_IMAGES) {
        assert.ok(entry.logos[image], `${entry.sample} ${image} unclassified`);
      }
    }
  },
);

test(
  "the file paths the detail page will need are present",
  { skip: missingRealDatabase() },
  async () => {
    // They are HPC absolutes, so they are displayable but not linkable.
    const run = await getRun("TGIF2_NWaug");
    assert.ok(run);
    assert.equal(run.is_treatment, "1");
    for (const column of ["bam", "bigwig", "peaks_narrowpeak", "r1"] as const) {
      assert.match(run[column] ?? "", /^\/project\//, `${column} should be an absolute path`);
    }
  },
);
