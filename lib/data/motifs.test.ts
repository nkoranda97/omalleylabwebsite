import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  buildFixture,
  buildMemeFixture,
  defaultFixture,
  defaultMemeFixture,
  missingRealDatabase,
  missingRealMeme,
  type MemeFixture,
} from "../../db/fixture.ts";
import { MOTIF_IMAGES, readMotifBytesFrom, readMotifs, readMotifsFor } from "./motifs.ts";

/**
 * The motif reader's contract.
 *
 * Four of the reader's six outcomes are throws, and they are the requirement: a
 * dropped file, a corrupt one, a sample with no directory, and a tree whose layout
 * no longer matches what the database records. None of them would ever be exercised
 * by hand on a machine where the tree happens to be complete, which is why they are
 * tested first and most.
 */

/** Point both the database and the MEME root at fabricated data for one block. */
async function withFixtures(
  fn: (root: string) => Promise<void>,
  meme: MemeFixture = defaultMemeFixture(),
  dbPath: string = buildFixture(),
): Promise<void> {
  const previousDb = process.env.GENOME_BROWSER_DB;
  const previousRoot = process.env.GENOME_BROWSER_MEME_ROOT;
  const root = buildMemeFixture(meme);

  process.env.GENOME_BROWSER_DB = dbPath;
  process.env.GENOME_BROWSER_MEME_ROOT = root;
  try {
    await fn(root);
  } finally {
    if (previousDb === undefined) delete process.env.GENOME_BROWSER_DB;
    else process.env.GENOME_BROWSER_DB = previousDb;
    if (previousRoot === undefined) delete process.env.GENOME_BROWSER_MEME_ROOT;
    else process.env.GENOME_BROWSER_MEME_ROOT = previousRoot;
  }
}

/**
 * The default tree with `SYN_gamma`'s dropped file healed.
 *
 * `readMotifs()` reads the whole tree and throws on the first incomplete sample, so
 * the default fixture — which carries a deliberately absent file — cannot be used to
 * assert anything about the success path. That is the reader behaving correctly, and
 * needing this helper is the evidence.
 */
function readableMeme(): MemeFixture {
  return {
    ...defaultMemeFixture(),
    SYN_gamma: { logo1: { kind: "empty" }, logo_rc1: { kind: "empty" } },
  };
}

const logosFor = async (sample: string) => {
  const found = (await readMotifs()).find((m) => m.sample === sample);
  assert.ok(found, `${sample} missing from readMotifs()`);
  return found.logos;
};

// --- the four failures, first -----------------------------------------------

test("a dropped logo throws, naming the sample and the path", async () => {
  // SYN_gamma's logo_rc1 is absent while its sibling is present. This is a sync
  // that lost a file, and it must not read as "no motif".
  await withFixtures(async () => {
    await assert.rejects(readMotifs(), (error: Error) => {
      assert.match(error.message, /SYN_gamma/);
      assert.match(error.message, /logo_rc1\.png/);
      return true;
    });
  });
});

test("a non-empty file that is not a PNG throws", async () => {
  await withFixtures(async (root) => {
    const file = path.join(root, "SYN_alpha", "summits", "logo1.png");
    fs.writeFileSync(file, "this is not a PNG, it is an HTML error page");

    await assert.rejects(readMotifs(), (error: Error) => {
      assert.match(error.message, /SYN_alpha/);
      assert.match(error.message, /PNG/);
      return true;
    });
  });
});

test("a truncated file too short to hold an IHDR throws rather than reading garbage", async () => {
  await withFixtures(async (root) => {
    const file = path.join(root, "SYN_alpha", "summits", "logo1.png");
    // The PNG signature and nothing else: a plausible partial download.
    fs.writeFileSync(file, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

    await assert.rejects(readMotifs(), /SYN_alpha/);
  });
});

test("a sample with no directory at all throws, naming the sample", async () => {
  await withFixtures(async (root) => {
    fs.rmSync(path.join(root, "SYN_beta"), { recursive: true });
    await assert.rejects(readMotifs(), (error: Error) => {
      assert.match(error.message, /SYN_beta/);
      return true;
    });
  });
});

test("a recorded MEME path that no longer ends in the sample throws", async () => {
  // The layout assertion: the reader derives the local directory from
  // meme_summits_dir, so if the pipeline reorganises, that must be loud rather
  // than 109 broken images.
  const fixture = defaultFixture();
  const beta = fixture.metadata.find((row) => row.sample === "SYN_beta");
  assert.ok(beta);
  beta.meme_summits_dir = "/fixture/meme/somewhere/else";

  await withFixtures(
    async () => {
      await assert.rejects(readMotifs(), (error: Error) => {
        assert.match(error.message, /SYN_beta/);
        assert.match(error.message, /somewhere\/else/);
        return true;
      });
    },
    readableMeme(),
    buildFixture(fixture),
  );
});

test("readMotifBytesFrom refuses a motif-less sample instead of returning empty bytes", async () => {
  // An empty buffer would reach the browser as a broken image, which is exactly
  // the substitution the project forbids.
  await withFixtures(async () => {
    await assert.rejects(readMotifBytesFrom("SYN_delta", "summits_logo1"), /SYN_delta/);
  });
});

test("readMotifBytesFrom refuses an unknown sample", async () => {
  await withFixtures(async () => {
    await assert.rejects(readMotifBytesFrom("NOT_A_SAMPLE", "summits_logo1"), /NOT_A_SAMPLE/);
  });
});

// --- the two outcomes a reader actually sees ---------------------------------

test("a present logo reports the dimensions written into its header", async () => {
  await withFixtures(async () => {
    const logos = await logosFor("SYN_beta");
    assert.deepEqual(logos["summits_logo1"], { present: true, width: 1664, height: 358 });
  }, readableMeme());
});

test("the two logos of one sample report their own widths, not a shared one", async () => {
  await withFixtures(async () => {
    const logos = await logosFor("SYN_beta");
    assert.equal(
      logos["summits_logo1"].present && logos["summits_logo1"].width,
      1664,
    );
    assert.equal(
      logos["summits_logo_rc1"].present && logos["summits_logo_rc1"].width,
      404,
    );
  }, readableMeme());
});

test("a zero-byte logo reports no-motif and does not throw", async () => {
  await withFixtures(async () => {
    const logos = await logosFor("SYN_delta");
    for (const image of MOTIF_IMAGES) {
      assert.deepEqual(logos[image], { present: false, reason: "no-motif" });
    }
  }, readableMeme());
});

test("readMotifBytesFrom returns the file's exact bytes", async () => {
  await withFixtures(async (root) => {
    const expected = fs.readFileSync(path.join(root, "SYN_alpha", "summits", "logo1.png"));
    const actual = await readMotifBytesFrom("SYN_alpha", "summits_logo1");
    assert.deepEqual(Buffer.from(actual), expected);
  });
});

test("every database sample appears once, and the result is frozen", async () => {
  await withFixtures(async () => {
    const motifs = await readMotifs();
    const samples = motifs.map((m) => m.sample);
    assert.deepEqual(
      [...samples].sort(),
      ["SYN_alpha", "SYN_beta", "SYN_delta", "SYN_gamma"],
    );
    assert.equal(new Set(samples).size, samples.length);
    assert.ok(Object.isFrozen(motifs));
    assert.ok(Object.isFrozen(motifs[0]));
    assert.ok(Object.isFrozen(motifs[0].logos));
  }, readableMeme());
});

// --- the root, resolved per call --------------------------------------------

test("the MEME root is read per call, not captured at import", async () => {
  // Same reasoning as the database path: a module-load capture makes the location
  // a property of whatever launched the process.
  await withFixtures(async () => {
    const first = await readMotifs();
    assert.ok(first.length > 0);

    const other = buildMemeFixture({
      ...readableMeme(),
      SYN_beta: {
        logo1: { kind: "present", width: 999, height: 358 },
        logo_rc1: { kind: "empty" },
      },
    });
    process.env.GENOME_BROWSER_MEME_ROOT = other;

    const logos = await logosFor("SYN_beta");
    assert.equal(logos["summits_logo1"].present && logos["summits_logo1"].width, 999);
  }, readableMeme());
});

test("an absent MEME root fails loudly and names it", async () => {
  const previousDb = process.env.GENOME_BROWSER_DB;
  const previousRoot = process.env.GENOME_BROWSER_MEME_ROOT;
  process.env.GENOME_BROWSER_DB = buildFixture();
  process.env.GENOME_BROWSER_MEME_ROOT = "/nonexistent/genome-browser/meme";
  try {
    await assert.rejects(readMotifs(), /nonexistent\/genome-browser\/meme/);
  } finally {
    if (previousDb === undefined) delete process.env.GENOME_BROWSER_DB;
    else process.env.GENOME_BROWSER_DB = previousDb;
    if (previousRoot === undefined) delete process.env.GENOME_BROWSER_MEME_ROOT;
    else process.env.GENOME_BROWSER_MEME_ROOT = previousRoot;
  }
});

test("the image identifiers are a closed set of exactly two", () => {
  assert.deepEqual([...MOTIF_IMAGES], ["summits_logo1", "summits_logo_rc1"]);
});

// --- claims that can only be checked against the real tree -------------------

test(
  "exactly 9 of the 109 real samples have no motif, and all 109 have a directory",
  { skip: missingRealDatabase() || missingRealMeme() },
  async () => {
    const motifs = await readMotifs();
    assert.equal(motifs.length, 109);

    const absent = motifs
      .filter((m) => !m.logos["summits_logo1"].present)
      .map((m) => m.sample)
      .sort();
    assert.deepEqual(absent, [
      "HALO_2606",
      "HALO_LHa",
      "HALO_LHb",
      "HALO_NWaug",
      "HALO_amp",
      "HALO_dap",
      "HALO_dap_b2",
      "MTHFD2_aug1",
      "PWP1_dap_b2",
    ]);
  },
);

test(
  "availability is not what motif_peaks says: TP53_amp has NA and a real logo",
  { skip: missingRealDatabase() || missingRealMeme() },
  async () => {
    // The specific inference this reader must not make. Three real samples have
    // motif_peaks "NA" and a motif anyway, because motif_peaks is a FIMO hit count
    // rather than "did MEME find a motif".
    const motifs = await readMotifs();
    for (const sample of ["TGIF2_amp", "TP53_LH", "TP53_amp"]) {
      const found = motifs.find((m) => m.sample === sample);
      assert.ok(found, `${sample} missing`);
      assert.ok(
        found.logos["summits_logo1"].present,
        `${sample} should have a logo despite motif_peaks being NA`,
      );
    }
  },
);

test(
  "real logos are a constant height and a widely varying width",
  { skip: missingRealDatabase() || missingRealMeme() },
  async () => {
    // The measurement the table's fixed-height treatment depends on.
    const present = (await readMotifs())
      .map((m) => m.logos["summits_logo1"])
      .filter((l) => l.present);

    const heights = new Set(present.map((l) => (l.present ? l.height : 0)));
    assert.ok(heights.size <= 2, `expected one or two heights, got ${[...heights]}`);

    const widths = present.map((l) => (l.present ? l.width : 0));
    assert.ok(Math.max(...widths) / Math.min(...widths) > 3, "widths should vary widely");
  },
);

// --- narrowing: one sample costs one sample's work ---------------------------

test("readMotifsFor reads only the sample asked about", async () => {
  // Answering this by classifying all 109 and discarding 108 was measured at 111
  // whole-tree walks per build, one per prerendered detail page. The guard is that
  // deleting another sample's logos entirely must not affect this sample's answer —
  // which it would if the reader still walked the tree.
  await withFixtures(async (root) => {
    fs.rmSync(path.join(root, "SYN_gamma"), { recursive: true });

    const beta = await readMotifsFor("SYN_beta");
    assert.ok(beta !== null);
    assert.equal(beta.logos["summits_logo1"].present, true);

    // And the whole-tree read still fails on the sample that is genuinely broken.
    await assert.rejects(readMotifs(), /SYN_gamma/);
  }, readableMeme());
});

test("readMotifsFor agrees with readMotifs for every sample", async () => {
  // The narrow path must not become a second, subtly different classifier.
  await withFixtures(async () => {
    const all = await readMotifs();
    for (const entry of all) {
      assert.deepEqual(await readMotifsFor(entry.sample), entry, entry.sample);
    }
  }, readableMeme());
});

test("readMotifsFor returns null for an unknown sample rather than throwing", async () => {
  await withFixtures(async () => {
    assert.equal(await readMotifsFor("NOT_A_SAMPLE"), null);
  }, readableMeme());
});

test("readMotifsFor still fails loudly on its own sample's broken tree", async () => {
  // Narrowing must not turn a dropped file into a quiet absence.
  await withFixtures(async () => {
    await assert.rejects(readMotifsFor("SYN_gamma"), /logo_rc1\.png/);
  });
});
