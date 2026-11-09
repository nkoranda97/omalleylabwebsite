import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import {
  buildFixture,
  buildMemeFixture,
  defaultFixture,
  defaultMemeFixture,
  missingRealMeme,
  schemaSql,
} from "./fixture.ts";
import { coerceValue } from "../lib/data/coerce.ts";
import { QC_COLUMNS } from "../lib/data/types.ts";

test("the committed snapshot replays into a fresh database", () => {
  // Regression guard: `.schema` emits a CREATE TABLE for sqlite_sequence, which
  // AUTOINCREMENT creates implicitly and SQLite refuses to replay as a reserved
  // name. The snapshot must come from sqlite_master filtered to exclude sqlite_%.
  assert.doesNotMatch(schemaSql(), /sqlite_sequence/);

  const db = new Database(":memory:");
  assert.doesNotThrow(() => db.exec(schemaSql()));
  db.close();
});

test("the fixture reports the tables and column counts the snapshot declares", () => {
  const db = new Database(buildFixture(), { readonly: true, fileMustExist: true });
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all()
    .map((r) => (r as { name: string }).name);
  assert.deepEqual(tables, ["pipeline_runs", "run_metadata"]);

  assert.equal(db.prepare("PRAGMA table_info(pipeline_runs)").all().length, 34);
  assert.equal(db.prepare("PRAGMA table_info(run_metadata)").all().length, 26);
  db.close();
});

test("a fixture row round-trips through coercion", () => {
  const db = new Database(buildFixture(), { readonly: true, fileMustExist: true });
  const row = db
    .prepare("SELECT * FROM pipeline_runs WHERE sample = ?")
    .get("SYN_delta") as Record<string, string>;
  const md = db
    .prepare("SELECT * FROM run_metadata WHERE sample = ?")
    .get("SYN_delta") as Record<string, string>;

  // A genuine zero survives as 0, not as absence.
  assert.equal(coerceValue(row.num_peaks_filt, QC_COLUMNS.num_peaks_filt, "num_peaks_filt"), 0);
  // The "NA" marker.
  assert.equal(coerceValue(row.motif_peaks, QC_COLUMNS.motif_peaks, "motif_peaks"), null);
  // The empty-string marker, on a column that declares both.
  assert.equal(
    coerceValue(md.experiment_date, QC_COLUMNS.experiment_date, "experiment_date"),
    null,
  );
  db.close();
});

test("both missing markers appear across the fixture, not just one", () => {
  const db = new Database(buildFixture(), { readonly: true, fileMustExist: true });
  const dates = db
    .prepare("SELECT sample, experiment_date FROM run_metadata")
    .all() as { sample: string; experiment_date: string }[];
  const markers = new Set(
    dates.map((r) => r.experiment_date).filter((v) => v === "NA" || v === ""),
  );
  assert.deepEqual([...markers].sort(), ["", "NA"]);
  db.close();
});

test("the fixture contains a treatment sample with a blank control", () => {
  // The HALOb_b2 shape. Code encoding "blank control implies is_treatment='0'"
  // must fail here rather than in production.
  const db = new Database(buildFixture(), { readonly: true, fileMustExist: true });
  const odd = db
    .prepare("SELECT sample FROM pipeline_runs WHERE control = '' AND is_treatment = '1'")
    .all();
  assert.equal(odd.length, 1);
  db.close();
});

test("the fixture inserts rows in an order that is not sorted by sample", () => {
  // Otherwise the ORDER BY assertion in the reader's tests would be vacuous.
  const db = new Database(buildFixture(), { readonly: true, fileMustExist: true });
  const inserted = db
    .prepare("SELECT sample FROM pipeline_runs ORDER BY rowid")
    .all()
    .map((r) => (r as { sample: string }).sample);
  assert.notDeepEqual(inserted, [...inserted].sort());
  db.close();
});

test("two fixtures are independent", () => {
  const a = buildFixture();
  const b = buildFixture();
  assert.notEqual(a, b);

  const dbA = new Database(a);
  dbA.prepare("DELETE FROM pipeline_runs").run();
  dbA.close();

  const dbB = new Database(b, { readonly: true, fileMustExist: true });
  assert.equal(
    (dbB.prepare("SELECT COUNT(*) c FROM pipeline_runs").get() as { c: number }).c,
    defaultFixture().runs.length,
  );
  dbB.close();
});

test("the fixture lands outside the repository", () => {
  const dbPath = buildFixture();
  assert.ok(fs.existsSync(dbPath));
  assert.doesNotMatch(dbPath, new RegExp(process.cwd().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

// --- the MEME logo tree -----------------------------------------------------

test("the MEME fixture writes a summits directory per sample", () => {
  const root = buildMemeFixture();
  for (const sample of Object.keys(defaultMemeFixture())) {
    assert.ok(
      fs.statSync(path.join(root, sample, "summits")).isDirectory(),
      `${sample} has no summits directory`,
    );
  }
});

test("the two logos of one sample carry their own widths", () => {
  // A reader that measures one file and reuses the answer would pass on every
  // sample where the two happen to match, which is most of the real tree.
  const root = buildMemeFixture();
  const width = (sample: string, name: string) =>
    fs.readFileSync(path.join(root, sample, "summits", `${name}.png`)).readUInt32BE(16);

  assert.equal(width("SYN_beta", "logo1"), 1664);
  assert.equal(width("SYN_beta", "logo_rc1"), 404);
  assert.notEqual(width("SYN_beta", "logo1"), width("SYN_beta", "logo_rc1"));
});

test("a fabricated logo carries the PNG signature and a parseable IHDR", () => {
  const root = buildMemeFixture();
  const bytes = fs.readFileSync(path.join(root, "SYN_alpha", "summits", "logo1.png"));

  assert.deepEqual(
    [...bytes.subarray(0, 8)],
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    "PNG signature",
  );
  assert.equal(bytes.subarray(12, 16).toString("ascii"), "IHDR");
  assert.equal(bytes.readUInt32BE(16), 404);
  assert.equal(bytes.readUInt32BE(20), 358, "MEME's constant logo height");
});

test("an empty logo is exactly zero bytes, not a small file", () => {
  // The distinction the reader depends on: zero means "no motif", any content
  // means "should be an image".
  const root = buildMemeFixture();
  for (const name of ["logo1", "logo_rc1"]) {
    const file = path.join(root, "SYN_delta", "summits", `${name}.png`);
    assert.equal(fs.statSync(file).size, 0);
  }
});

test("an absent logo is genuinely missing while its sibling is present", () => {
  const root = buildMemeFixture();
  const dir = path.join(root, "SYN_gamma", "summits");
  assert.ok(fs.existsSync(path.join(dir, "logo1.png")));
  assert.ok(!fs.existsSync(path.join(dir, "logo_rc1.png")));
});

test("MEME fixtures do not interfere and land outside the repository", () => {
  const a = buildMemeFixture();
  const b = buildMemeFixture();
  assert.notEqual(a, b);
  assert.doesNotMatch(a, new RegExp(process.cwd().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("every fixture metadata row records a per-sample MEME directory", () => {
  // The motif reader derives the local path from these, so a shared value would
  // make its layout assertion vacuous.
  for (const row of defaultFixture().metadata) {
    assert.equal(row.meme_summits_dir, `/fixture/meme/${row.sample}/summits`);
    assert.equal(row.meme_peaks_dir, `/fixture/meme/${row.sample}/peaks`);
  }
});

test("missingRealMeme reports a reason or false, never true", () => {
  const result = missingRealMeme();
  if (result === false) {
    assert.ok(fs.existsSync(path.join(process.cwd(), "data", "meme")));
  } else {
    assert.match(result, /data\/meme/);
    assert.match(result, /gitignored/);
  }
});

test("no database file is tracked, and the backstop still ignores one anywhere", () => {
  const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" })
    .split("\n")
    .filter((f) => /\.(db|sqlite|sqlite3)$/.test(f));
  assert.deepEqual(tracked, [], "a database file is tracked");

  // db/schema.sql is committable; a .db in the same folder is not.
  const ignored = execFileSync("git", ["check-ignore", "db/probe.db"], {
    encoding: "utf8",
  }).trim();
  assert.equal(ignored, "db/probe.db");
  assert.throws(() =>
    execFileSync("git", ["check-ignore", "db/schema.sql"], { stdio: "pipe" }),
  );
});
