import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildFixture,
  defaultFixture,
  missingRealDatabase,
  REAL_DB_PATH,
} from "../../db/fixture.ts";
import { loadRunsFrom } from "./sqlite.ts";
import { QC_COLUMN_NAMES } from "./types.ts";

/** A path in a fresh temp dir that deliberately has no database at it. */
function unusedPath(name: string): string {
  return path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "genome-browser-absent-")),
    name,
  );
}

// --- happy path, against the fabricated fixture -----------------------------

test("returns one row per fixture sample with every declared field present", async () => {
  const fixture = defaultFixture();
  const runs = await loadRunsFrom(buildFixture(fixture));

  assert.equal(runs.length, fixture.runs.length);
  for (const run of runs) {
    const record = run as unknown as Record<string, unknown>;
    assert.equal(Object.keys(record).length, QC_COLUMN_NAMES.length);
    for (const column of QC_COLUMN_NAMES) {
      assert.ok(column in record, `${run.sample} is missing ${column}`);
    }
  }
});

test("a known fixture row carries the values that were inserted", async () => {
  const runs = await loadRunsFrom(buildFixture());
  const beta = runs.find((r) => r.sample === "SYN_beta");
  assert.ok(beta);

  assert.equal(beta.total_reads, 1000000);
  assert.equal(beta.mapped_reads, 800000);
  assert.equal(beta.mapping_pct, 88.0);
  assert.equal(beta.num_peaks, 500);
  assert.ok(beta.experiment_date instanceof Date);
  assert.equal(beta.experiment_date.getMonth(), 4); // May, from "5/7/25"
  assert.equal(beta.experiment_date.getDate(), 7);
  assert.ok(beta.gdna_batch instanceof Date);
  assert.equal(beta.gdna_batch.getMonth(), 11); // December, from "12/3/25"
});

test("rows come back sorted by sample even though the fixture inserted them otherwise", async () => {
  // This is the assertion that fails if ORDER BY is dropped. It only works
  // because the fixture inserts out of order — in the real database insertion
  // order already equals sorted order, so the same test there proves nothing.
  const fixture = defaultFixture();
  const inserted = fixture.runs.map((r) => r.sample as string);
  assert.notDeepEqual(inserted, [...inserted].sort(), "fixture must insert unsorted");

  const runs = await loadRunsFrom(buildFixture(fixture));
  const returned = runs.map((r) => r.sample);
  assert.deepEqual(returned, [...returned].sort());
});

test("both missing markers resolve to null on the columns that declare both", async () => {
  const runs = await loadRunsFrom(buildFixture());
  // SYN_alpha carries "NA", SYN_delta carries "" — same meaning, one spec.
  assert.equal(runs.find((r) => r.sample === "SYN_alpha")?.experiment_date, null);
  assert.equal(runs.find((r) => r.sample === "SYN_delta")?.experiment_date, null);
  assert.equal(runs.find((r) => r.sample === "SYN_alpha")?.gdna_batch, null);
  assert.equal(runs.find((r) => r.sample === "SYN_delta")?.gdna_batch, null);
});

test("a genuine zero stays 0 and a marker stays null on the same row", async () => {
  const runs = await loadRunsFrom(buildFixture());
  const delta = runs.find((r) => r.sample === "SYN_delta");
  assert.equal(delta?.num_peaks_filt, 0);
  assert.equal(delta?.motif_peaks, null);
});

test("frip and frip_filt derive from mapped_reads", async () => {
  const runs = await loadRunsFrom(buildFixture());
  const beta = runs.find((r) => r.sample === "SYN_beta");
  // 40000 / 800000 * 100, and 8000 / 800000 * 100 — the same denominator for both.
  assert.equal(beta?.frip, 5);
  assert.equal(beta?.frip_filt, 1);
});

test("a zero denominator yields null, never NaN or Infinity", async () => {
  const runs = await loadRunsFrom(buildFixture());
  const gamma = runs.find((r) => r.sample === "SYN_gamma");
  assert.equal(gamma?.mapped_reads, 0);
  assert.equal(gamma?.frip, null);
  assert.equal(gamma?.frip_filt, null);
});

test("a column with no source this run is null, not absent", async () => {
  const runs = await loadRunsFrom(buildFixture());
  for (const run of runs) {
    assert.equal(run.num_peaks_bl, null);
    assert.ok("num_peaks_bl" in (run as unknown as Record<string, unknown>));
  }
});

test("rows and the collection are frozen", async () => {
  const runs = await loadRunsFrom(buildFixture());
  assert.ok(Object.isFrozen(runs));
  assert.ok(Object.isFrozen(runs[0]));
});

test("a collided column carries the value from the intended table", async () => {
  // The two tables share seven names (id, output_dir, sample, run_date,
  // genome_ref, r1, r2). A star join would return 53 keys for 60 selected columns
  // and silently keep whichever came last. r1 is projected from run_metadata, so a
  // fixture where the tables disagree proves which side the query reads.
  const fixture = defaultFixture();
  fixture.metadata = fixture.metadata.map((m) => ({
    ...m,
    r1: "/fixture/from_metadata/r1.fastq.gz",
  }));
  fixture.runs = fixture.runs.map((r) => ({
    ...r,
    r1: "/fixture/from_runs/r1.fastq.gz",
  }));

  const runs = await loadRunsFrom(buildFixture(fixture));
  assert.equal(runs[0].r1, "/fixture/from_metadata/r1.fastq.gz");

  // And nothing the row type does not declare comes along for the ride.
  const keys = Object.keys(runs[0] as unknown as Record<string, unknown>);
  assert.deepEqual(keys.sort(), [...QC_COLUMN_NAMES].sort());
  assert.ok(!keys.includes("id"));
  assert.ok(!keys.includes("genome_ref"));
  assert.ok(!keys.includes("output_dir"));
});

test("num_peaks_rmsk is gone from the row type entirely", async () => {
  const runs = await loadRunsFrom(buildFixture());
  const record = runs[0] as unknown as Record<string, unknown>;
  assert.ok(!("num_peaks_rmsk" in record));
  // @ts-expect-error num_peaks_rmsk was removed: it exists in neither table.
  assert.equal(runs[0].num_peaks_rmsk, undefined);
});

test("the newly added columns coerce to their declared kinds", async () => {
  const runs = await loadRunsFrom(buildFixture());
  const beta = runs.find((r) => r.sample === "SYN_beta");
  assert.ok(beta);

  // Paths stay text.
  assert.equal(typeof beta.bam, "string");
  assert.equal(typeof beta.fimo_peaks_tsv, "string");
  // is_treatment stays text "0"/"1" — not a number, not a boolean.
  assert.equal(beta.is_treatment, "1");
  // alignment_rate is all-NA in this run, so null rather than absent.
  assert.equal(beta.alignment_rate, null);
});

test("control distinguishes structural absence from a named control", async () => {
  const runs = await loadRunsFrom(buildFixture());
  // A control sample legitimately has no control of its own.
  assert.equal(runs.find((r) => r.sample === "SYN_alpha")?.control, null);
  // And so does a treatment sample with none recorded — is_treatment is the
  // authoritative signal, not the blank.
  const delta = runs.find((r) => r.sample === "SYN_delta");
  assert.equal(delta?.control, null);
  assert.equal(delta?.is_treatment, "1");
  // A named control comes through as text.
  assert.equal(runs.find((r) => r.sample === "SYN_beta")?.control, "SYN_alpha");
});

// --- error and failure paths ------------------------------------------------

test("a nonexistent path throws with the path, and creates no file", async () => {
  const absent = unusedPath("not-here.db");
  await assert.rejects(loadRunsFrom(absent), (err: unknown) => {
    assert.ok(err instanceof Error);
    assert.match(err.message, /not-here\.db/);
    assert.match(err.message, /gitignored/);
    return true;
  });
  // readonly is what guarantees this: SQLITE_OPEN_READONLY never creates.
  assert.equal(fs.existsSync(absent), false, "opening must not create a file");
});

test("a zero-byte file throws rather than returning an empty list", async () => {
  const empty = unusedPath("empty.db");
  fs.writeFileSync(empty, "");
  await assert.rejects(loadRunsFrom(empty));
});

test("a file that is not a database throws", async () => {
  const garbage = unusedPath("garbage.db");
  fs.writeFileSync(garbage, "this is not a database, it is a sentence\n");
  await assert.rejects(loadRunsFrom(garbage));
});

test("a second output_dir throws, pointing at the record-key decision", async () => {
  const fixture = defaultFixture();
  fixture.runs[0] = { ...fixture.runs[0], output_dir: "/fixture/results/second_run" };
  fixture.metadata[0] = {
    ...fixture.metadata[0],
    output_dir: "/fixture/results/second_run",
  };

  await assert.rejects(loadRunsFrom(buildFixture(fixture)), (err: unknown) => {
    assert.ok(err instanceof Error);
    assert.match(err.message, /output_dir/);
    assert.match(err.message, /second_run/);
    assert.match(err.message, /deferred-decisions/);
    return true;
  });
});

test("a duplicate sample throws — and only the uniqueness guard catches it", async () => {
  // One output_dir, and the join count still equals the run count, so this row
  // passes the other two guards. Without the uniqueness guard, getRun would
  // return an arbitrary one of the two records.
  const fixture = defaultFixture();
  fixture.runs.push({ ...fixture.runs[0] });

  await assert.rejects(loadRunsFrom(buildFixture(fixture)), (err: unknown) => {
    assert.ok(err instanceof Error);
    assert.match(err.message, /not unique/);
    assert.match(err.message, /SYN_beta/);
    return true;
  });
});

test("an unmatched run throws as an orphan, naming the sample", async () => {
  const fixture = defaultFixture();
  fixture.metadata = fixture.metadata.filter((m) => m.sample !== "SYN_gamma");

  await assert.rejects(loadRunsFrom(buildFixture(fixture)), (err: unknown) => {
    assert.ok(err instanceof Error);
    assert.match(err.message, /no run_metadata match/);
    assert.match(err.message, /SYN_gamma/);
    return true;
  });
});

test("offsetting join errors cannot cancel out and pass the guards", async () => {
  // The regression this fixes: comparing a joined count against the run count let
  // one orphaned run (-1) and one duplicated metadata row (+1) sum to zero, so all
  // guards passed while the result dropped SYN_gamma and returned SYN_delta twice.
  const fixture = defaultFixture();
  fixture.metadata = fixture.metadata.filter((m) => m.sample !== "SYN_gamma");
  fixture.metadata.push({ ...fixture.metadata[1] });

  await assert.rejects(loadRunsFrom(buildFixture(fixture)), (err: unknown) => {
    assert.ok(err instanceof Error);
    // Whichever check fires first, it must name a real problem — never succeed.
    assert.match(err.message, /no run_metadata match|duplicate \(output_dir, sample\)/);
    return true;
  });
});

test("an empty database says so rather than blaming the record key", async () => {
  await assert.rejects(
    loadRunsFrom(buildFixture({ runs: [], metadata: [] })),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /empty/);
      assert.doesNotMatch(err.message, /record key|URL slug/);
      return true;
    },
  );
});

test("a wrong-schema database still names the path", async () => {
  // SQLite defers its header and schema checks to the first statement, so this
  // fails after the open call rather than inside it — the path has to be added by
  // the statement-phase wrapper, not the open wrapper.
  const partial = unusedPath("partial.db");
  const db = new Database(partial);
  db.exec(`CREATE TABLE pipeline_runs (id INTEGER PRIMARY KEY, "sample" TEXT)`);
  db.close();

  await assert.rejects(loadRunsFrom(partial), (err: unknown) => {
    assert.ok(err instanceof Error);
    assert.match(err.message, /partial\.db/);
    return true;
  });
});

test("a garbage file names the path too", async () => {
  const garbage = unusedPath("garbage2.db");
  fs.writeFileSync(garbage, "definitely not a database\n");
  await assert.rejects(loadRunsFrom(garbage), (err: unknown) => {
    assert.ok(err instanceof Error);
    assert.match(err.message, /garbage2\.db/);
    return true;
  });
});

test("a missing numerator or denominator yields null, like a zero one", async () => {
  const fixture = defaultFixture();
  fixture.runs[0] = { ...fixture.runs[0], reads_in_peaks: "NA" };
  fixture.runs[2] = { ...fixture.runs[2], mapped_reads: "NA" };

  const runs = await loadRunsFrom(buildFixture(fixture));
  const beta = runs.find((r) => r.sample === "SYN_beta");
  assert.equal(beta?.frip, null, "null numerator must not produce NaN");
  assert.equal(beta?.frip_filt, 1, "the filtered pair has its own numerator");

  const alpha = runs.find((r) => r.sample === "SYN_alpha");
  assert.equal(alpha?.frip, null, "null denominator must not produce NaN");
  assert.equal(alpha?.frip_filt, null);
});

test("duplicated metadata throws as duplication, not as orphans", async () => {
  // The mismatch runs the other way, so a message that assumed orphans would
  // print an empty list and send the reader after the wrong problem.
  const fixture = defaultFixture();
  fixture.metadata.push({ ...fixture.metadata[1] });

  await assert.rejects(loadRunsFrom(buildFixture(fixture)), (err: unknown) => {
    assert.ok(err instanceof Error);
    assert.match(err.message, /duplicate \(output_dir, sample\)/);
    assert.doesNotMatch(err.message, /no run_metadata match/);
    return true;
  });
});

test("a real SQL NULL throws rather than passing through as absence", async () => {
  // The TSV could not represent NULL; SQLite can, and no column is NOT NULL.
  const fixture = defaultFixture();
  fixture.runs[0] = { ...fixture.runs[0], total_reads: null };

  await assert.rejects(loadRunsFrom(buildFixture(fixture)), (err: unknown) => {
    assert.ok(err instanceof Error);
    assert.match(err.message, /total_reads/);
    return true;
  });
});

test("readonly is in force, not merely intended", async () => {
  const dbPath = buildFixture();
  const handle = new Database(dbPath, { readonly: true, fileMustExist: true });
  assert.throws(
    () => handle.prepare("DELETE FROM pipeline_runs").run(),
    /SQLITE_READONLY|readonly/i,
  );
  handle.close();
});

// --- machine-local: only runnable where the real database is --------------

test(
  "the real database returns exactly 109 rows with no coercion errors",
  { skip: missingRealDatabase() },
  async () => {
    const runs = await loadRunsFrom(REAL_DB_PATH);
    assert.equal(runs.length, 109);
  },
);

test(
  "nulls land in exactly the eight columns with no source or no value",
  { skip: missingRealDatabase() },
  async () => {
    const runs = await loadRunsFrom(REAL_DB_PATH);
    const counts = new Map<string, number>();
    for (const run of runs) {
      const record = run as unknown as Record<string, unknown>;
      for (const column of QC_COLUMN_NAMES) {
        if (record[column] === null) {
          counts.set(column, (counts.get(column) ?? 0) + 1);
        }
      }
    }
    assert.deepEqual(Object.fromEntries([...counts].sort()), {
      // Genuinely unknown.
      experiment_date: 8,
      gdna_batch: 14,
      // Absent for this sample.
      max_peak_score: 4,
      motif_peaks: 12,
      // Structural: a control has no control, and one treatment has none recorded.
      control: 10,
      // Features that were switched off for this run.
      alignment_rate: 109,
      subsampled_frags: 109,
      // Computed by the pipeline but never logged, so no source at all.
      num_peaks_bl: 109,
    });
  },
);
