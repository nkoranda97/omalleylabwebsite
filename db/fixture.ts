/**
 * Builds a fabricated SQLite database for tests.
 *
 * Why this exists: the real database is gitignored, so it is absent on a fresh
 * clone and invisible to CI. Without a fixture the reader has no automated
 * coverage at all.
 *
 * Why it is a temporary *file* rather than `:memory:`: the driver rejects
 * `readonly` on in-memory databases, and two connections to `:memory:` do not
 * share tables — so a reader that opens a path read-only could never see one.
 * The file lands in the OS temp directory, which keeps it outside the repo
 * entirely and leaves the tree-wide `*.db` ignore rules untouched. Nothing here
 * is research data; every value is invented.
 */

import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** One row's worth of cells. `null` inserts a real SQL NULL. */
export type FixtureRow = Record<string, string | null>;

export type Fixture = {
  runs: FixtureRow[];
  metadata: FixtureRow[];
};

const SCHEMA_PATH = path.join(import.meta.dirname, "schema.sql");

const OUTPUT_DIR = "/fixture/results/synthetic";

/**
 * Values shared by every fabricated run row. Overridden per sample below.
 *
 * The run-scoped parameters carry the shapes that defeat the numeric coercion
 * regexes on purpose — `1.0e-05` and `[2, 5, 15]` — so that any future attempt to
 * pull run parameters into the row type fails here rather than in production.
 */
const RUN_DEFAULTS: FixtureRow = {
  run_date: "2026-01-02T03:04:05",
  output_dir: OUTPUT_DIR,
  genome_ref: "/fixture/ref/genome.fasta",
  genome_size: "3000000000",
  control: "SYN_alpha",
  threads: "16",
  mapq: "30",
  max_frags: "",
  macs3_format: "BAMPE",
  macs3_foldch_levels: "[2, 5, 15]",
  macs3_meme_foldch_level: "5",
  meme_nmotifs: "2",
  meme_minw: "6",
  meme_maxw: "20",
  meme_maxpeaks: "1000",
  fimo_thresh: "1.0e-05",
  sample: "SYN_placeholder",
  r1: "/fixture/raw/placeholder.R1.fastq.gz",
  r2: "/fixture/raw/placeholder.R2.fastq.gz",
  is_treatment: "1",
  total_reads: "1000000",
  trimmed_reads: "900000",
  mapped_reads: "800000",
  alignment_rate: "NA",
  reads_in_peaks: "40000",
  reads_in_peaks_filt: "8000",
  max_peak_score: "12.5",
  mapping_pct: "88.0",
  motif_peaks: "5",
  subsampled_frags: "NA",
  median_frag_size: "120",
  num_peaks: "500",
  num_peaks_filt: "100",
};

const METADATA_DEFAULTS: FixtureRow = {
  output_dir: OUTPUT_DIR,
  sample: "SYN_placeholder",
  author: "Fixture",
  run_date: "2026-01-02T03:04:05",
  experiment_date: "5/7/25",
  gdna_batch: "12/3/25",
  genome_ref: "/fixture/ref/genome.fasta",
  gene_annotation: "/fixture/ref/genes.gtf",
  r1: "/fixture/raw/placeholder.R1.fastq.gz",
  r2: "/fixture/raw/placeholder.R2.fastq.gz",
  trimmed_r1: "/fixture/trimmed/placeholder.R1.fastq.gz",
  trimmed_r2: "/fixture/trimmed/placeholder.R2.fastq.gz",
  bam: "/fixture/bam/placeholder.bam",
  bigwig: "/fixture/bigWig/placeholder.bw",
  peaks_narrowpeak: "/fixture/macs/placeholder_peaks.narrowPeak",
  peaks_filt_narrowpeak: "/fixture/macs/placeholder_peaks_filt.narrowPeak",
  summits_bed: "/fixture/macs/placeholder_summits.bed",
  summits_fasta: "/fixture/fasta/placeholder.summits.fasta",
  peaks_fasta: "/fixture/fasta/placeholder.peaks.fasta",
  fimo_summits_tsv: "/fixture/fimo/placeholder/summits/fimo.tsv",
  fimo_peaks_tsv: "/fixture/fimo/placeholder/peaks/fimo.tsv",
  homer_annotations: "/fixture/annotations/placeholder.txt",
  report_csv: "/fixture/stats/report.csv",
};

function run(sample: string, overrides: FixtureRow = {}): FixtureRow {
  return { ...RUN_DEFAULTS, sample, ...overrides };
}

/**
 * The MEME directories are templated per sample rather than shared.
 *
 * Every other path default keeps the literal `placeholder`, because nothing reads
 * them. These two are read: the motif reader locates a sample's logos by taking the
 * last two segments of `meme_summits_dir` and joining them under the local MEME
 * root, so a shared value would make its layout assertion vacuous.
 */
function meta(sample: string, overrides: FixtureRow = {}): FixtureRow {
  return {
    ...METADATA_DEFAULTS,
    sample,
    meme_summits_dir: `/fixture/meme/${sample}/summits`,
    meme_peaks_dir: `/fixture/meme/${sample}/peaks`,
    ...overrides,
  };
}

/**
 * The standard fabricated set: four samples carrying the awkward cases
 * deliberately rather than by luck.
 *
 * Insertion order is `beta, delta, alpha, gamma`, which is **not** sorted by
 * sample. That matters: in the real database insertion order already equals
 * `ORDER BY sample`, so a test comparing returned order against sorted order
 * there cannot tell a query that has the clause from one that lost it. Here it
 * can.
 */
export function defaultFixture(): Fixture {
  return {
    runs: [
      // A plain treatment sample with everything present.
      run("SYN_beta"),
      // HALOb_b2's shape: a treatment sample with no control recorded. Any code
      // encoding "blank control implies a control sample" fails on this row.
      // Also carries a genuine 0, distinct from a missing marker.
      run("SYN_delta", { control: "", num_peaks_filt: "0", motif_peaks: "NA" }),
      // A control sample: blank control is structural here, not unknown.
      run("SYN_alpha", { is_treatment: "0", control: "", max_peak_score: "NA" }),
      // Degenerate FRiP denominator — must yield null, never NaN or Infinity.
      run("SYN_gamma", { mapped_reads: "0", reads_in_peaks: "0", reads_in_peaks_filt: "0" }),
    ],
    metadata: [
      meta("SYN_beta"),
      // The database's empty-string marker for both date columns.
      meta("SYN_delta", { experiment_date: "", gdna_batch: "" }),
      // The retired mock export's "NA" marker for the same two columns, which the
      // spec still accepts. Keeps that branch of coercion exercised.
      meta("SYN_alpha", { experiment_date: "NA", gdna_batch: "NA" }),
      meta("SYN_gamma"),
    ],
  };
}

function insert(db: Database.Database, table: string, rows: FixtureRow[]): void {
  for (const row of rows) {
    const columns = Object.keys(row);
    const placeholders = columns.map(() => "?").join(", ");
    const quoted = columns.map((c) => `"${c}"`).join(", ");
    db.prepare(`INSERT INTO ${table} (${quoted}) VALUES (${placeholders})`).run(
      ...columns.map((c) => row[c]),
    );
  }
}

/**
 * Write a fabricated database to a fresh temp directory and return its path.
 *
 * Each call gets its own directory, so fixtures never interfere. The schema comes
 * from the committed snapshot, resolved relative to this module rather than the
 * working directory — these helpers are imported from tests in another folder.
 */
export function buildFixture(fixture: Fixture = defaultFixture()): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "genome-browser-fixture-"));
  const dbPath = path.join(dir, "fixture.db");

  const db = new Database(dbPath);
  try {
    db.exec(fs.readFileSync(SCHEMA_PATH, "utf8"));
    insert(db, "pipeline_runs", fixture.runs);
    insert(db, "run_metadata", fixture.metadata);
  } finally {
    db.close();
  }

  return dbPath;
}

/** Re-export for tests that want to assert against the snapshot directly. */
export function schemaSql(): string {
  return fs.readFileSync(SCHEMA_PATH, "utf8");
}

// --- the MEME logo tree -----------------------------------------------------

/**
 * What one fabricated logo file should be.
 *
 * The three kinds are the three the real tree contains, and the distinction
 * between the last two is the whole point: an empty file is the pipeline recording
 * that MEME found no motif, while an absent one means something dropped it. The
 * reader must treat them differently, so the fixture has to be able to produce both.
 */
export type MemeLogoSpec =
  | { kind: "present"; width: number; height: number }
  | { kind: "empty" }
  | { kind: "absent" };

export type MemeSampleSpec = { logo1: MemeLogoSpec; logo_rc1: MemeLogoSpec };
export type MemeFixture = Record<string, MemeSampleSpec>;

/** MEME writes every logo at this height regardless of motif width. */
const LOGO_HEIGHT = 358;

/**
 * Bytes that a PNG dimension reader can parse: the 8-byte signature followed by a
 * structurally complete IHDR chunk carrying the requested width and height.
 *
 * These are **not renderable images** — the CRC is not computed and there is no
 * image data. That is deliberate and sufficient: the only code that looks inside
 * these files reads the signature and the two dimensions out of the IHDR, and the
 * route handler streams bytes without interpreting them. Nothing in the test suite
 * renders a pixel. Fabricating a real PNG encoder here would add a dependency to
 * prove something no test asks.
 */
function pngHeader(width: number, height: number): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const chunk = Buffer.alloc(25);
  chunk.writeUInt32BE(13, 0); // IHDR carries 13 bytes of data
  chunk.write("IHDR", 4, "ascii");
  chunk.writeUInt32BE(width, 8);
  chunk.writeUInt32BE(height, 12);
  chunk[16] = 8; // bit depth
  chunk[17] = 6; // colour type: RGBA, matching what MEME writes
  // compression, filter, interlace and the CRC stay zero.

  return Buffer.concat([signature, chunk]);
}

const present = (width: number): MemeLogoSpec => ({
  kind: "present",
  width,
  height: LOGO_HEIGHT,
});

/**
 * The standard fabricated tree, carrying the awkward cases deliberately.
 *
 * Keyed to the samples `defaultFixture()` invents, so the two fixtures describe the
 * same four samples.
 */
export function defaultMemeFixture(): MemeFixture {
  return {
    // Two logos of visibly different widths. A reader that measures one file and
    // reuses the answer for the other passes on every other sample and fails here.
    SYN_beta: { logo1: present(1664), logo_rc1: present(404) },
    // The shape of the nine real zero-byte samples: MEME found no motif. Already
    // carries motif_peaks "NA" in the database fixture.
    SYN_delta: { logo1: { kind: "empty" }, logo_rc1: { kind: "empty" } },
    SYN_alpha: { logo1: present(404), logo_rc1: present(404) },
    // A dropped file rather than an empty one — the case that must throw.
    SYN_gamma: { logo1: present(562), logo_rc1: { kind: "absent" } },
  };
}

/**
 * Write a fabricated MEME tree to a fresh temp directory and return its root.
 *
 * Mirrors `buildFixture()`: its own directory per call, outside the repo entirely,
 * so no ignore rule is being relied on and no two tests interfere. The layout
 * matches the real tree — `<root>/<sample>/summits/<file>` — because that is what
 * the reader derives from `meme_summits_dir`.
 */
export function buildMemeFixture(spec: MemeFixture = defaultMemeFixture()): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "genome-browser-meme-"));

  for (const [sample, logos] of Object.entries(spec)) {
    const dir = path.join(root, sample, "summits");
    fs.mkdirSync(dir, { recursive: true });

    for (const [name, logo] of Object.entries(logos)) {
      const file = path.join(dir, `${name}.png`);
      if (logo.kind === "absent") continue;
      fs.writeFileSync(
        file,
        logo.kind === "empty" ? Buffer.alloc(0) : pngHeader(logo.width, logo.height),
      );
    }
  }

  return root;
}

/** Where the real MEME tree lives, for tests that can only run where it does. */
export const REAL_MEME_ROOT = path.join(process.cwd(), "data", "meme");

/**
 * A `node:test` skip reason when the real MEME tree is absent, or `false` to run.
 *
 * Same contract as `missingRealDatabase()` — a visible skip beats a test that
 * quietly passes because its data was never there.
 */
export function missingRealMeme(): string | false {
  return fs.existsSync(REAL_MEME_ROOT)
    ? false
    : `no local MEME tree at ${path.relative(process.cwd(), REAL_MEME_ROOT)} — data/ is gitignored`;
}

/** Where the real database lives, for tests that can only run where it does. */
export const REAL_DB_PATH = path.join(process.cwd(), "data", "pipeline_db.db");

/**
 * A `node:test` skip reason when the real database is absent, or `false` to run.
 *
 * Pass as `test(name, { skip: missingRealDatabase() }, fn)`. A visible skip is the
 * point: a test that quietly passes because its data vanished is worse than one
 * that announces it did not run.
 */
export function missingRealDatabase(): string | false {
  return fs.existsSync(REAL_DB_PATH)
    ? false
    : `no local database at ${path.relative(process.cwd(), REAL_DB_PATH)} — data/ is gitignored`;
}
