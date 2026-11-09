/**
 * The motif logo reader.
 *
 * The second source below the seam. `sqlite.ts` knows a database file exists; this
 * module is the only place that knows a MEME output tree exists. Nothing above
 * `index.ts` learns either.
 *
 * What it answers is deliberately narrow: for each sample, does a logo exist and how
 * big is it, and — separately — what are its bytes. The app needs no more than that,
 * and reading no more than that is what keeps a 270MB tree cheap to interrogate.
 *
 * The reason availability is read from the filesystem rather than inferred from the
 * database is not fastidiousness. `motif_peaks` is "NA" for twelve real samples and
 * three of them have a motif anyway, because it counts FIMO hits rather than
 * recording whether MEME found anything. Any inference from it is wrong for those
 * three, and wrong in the direction that hides a logo the reader could have seen.
 */

import fs from "node:fs";
import path from "node:path";

import { MOTIF_IMAGES } from "./motif-images.ts";
import { readRuns } from "./sqlite.ts";
import type { MotifImage, MotifLogo, SampleMotifs } from "./motif-images.ts";
import type { QcRun } from "./types.ts";

export { MOTIF_IMAGES } from "./motif-images.ts";
export type { MotifImage, MotifLogo, SampleMotifs } from "./motif-images.ts";

/**
 * Where the MEME tree lives.
 *
 * Resolved per call for the same two reasons as the database path: `process.cwd()`
 * at import time makes the location a property of whatever launched the process, and
 * the override is what gives this module coverage on a machine with no research
 * data. Gitignored along with the rest of `data/`, so it exists only where it was
 * put.
 */
function resolveMemeRoot(): string {
  return (
    process.env.GENOME_BROWSER_MEME_ROOT ?? path.join(process.cwd(), "data", "meme")
  );
}

const IMAGE_SOURCES = {
  summits_logo1: { column: "meme_summits_dir", file: "logo1.png" },
  summits_logo_rc1: { column: "meme_summits_dir", file: "logo_rc1.png" },
} as const satisfies Record<
  MotifImage,
  { column: "meme_summits_dir" | "meme_peaks_dir"; file: string }
>;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Bytes needed to reach the end of IHDR's height field. */
const HEADER_BYTES = 24;

/**
 * Locate a sample's MEME directory from the path the database recorded.
 *
 * The local tree is the pipeline's own `meme/` output with the Midway prefix
 * swapped, so the layout is not this app's invention and must not be hardcoded as
 * if it were: taking the last two segments of the recorded path means a pipeline
 * reorganisation is followed rather than broken.
 *
 * The assertion is what makes that safe. If the recorded path stops ending in
 * `<sample>/<panel>`, the derivation is no longer meaningful and this throws instead
 * of silently reading somewhere else.
 */
function resolveSampleDir(run: QcRun, column: "meme_summits_dir" | "meme_peaks_dir"): string {
  const recorded = run[column];
  if (typeof recorded !== "string" || recorded.trim() === "") {
    throw new Error(
      `${run.sample}: ${column} is empty, so its MEME directory cannot be located`,
    );
  }

  const segments = recorded.replace(/\/+$/, "").split("/");
  const panel = segments.at(-1);
  const owner = segments.at(-2);

  if (owner !== run.sample || panel === undefined || panel === "") {
    throw new Error(
      `${run.sample}: ${column} is "${recorded}", which does not end in ` +
        `<sample>/<panel> — the MEME tree layout changed upstream, so the local ` +
        `path can no longer be derived from it`,
    );
  }

  return path.join(resolveMemeRoot(), owner, panel);
}

/**
 * Read a PNG's dimensions from its header without loading the image.
 *
 * 24 bytes rather than the whole file: the largest logo is 94KB and there are 218 of
 * them, and the only thing needed is the pair of numbers that keeps the table from
 * shifting as images arrive.
 *
 * Every failure names the file. A logo that is present but unreadable is a broken
 * sync or a wrong file, not a sample without a motif, and the two must not converge
 * on the same output.
 */
function readPngDimensions(file: string): { width: number; height: number } {
  const buffer = Buffer.alloc(HEADER_BYTES);
  const handle = fs.openSync(file, "r");
  let read: number;
  try {
    read = fs.readSync(handle, buffer, 0, HEADER_BYTES, 0);
  } finally {
    fs.closeSync(handle);
  }

  if (read < HEADER_BYTES) {
    throw new Error(
      `${file}: only ${read} bytes, too short to hold a PNG header — the file is ` +
        `truncated, not a sample without a motif`,
    );
  }
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error(`${file}: not a PNG — the file has content but no PNG signature`);
  }
  if (buffer.subarray(12, 16).toString("ascii") !== "IHDR") {
    throw new Error(`${file}: PNG signature present but no IHDR chunk follows it`);
  }

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width === 0 || height === 0) {
    throw new Error(`${file}: PNG header declares ${width}x${height}`);
  }

  return { width, height };
}

/**
 * Classify one logo file.
 *
 * The one distinction this whole module turns on: **zero bytes means MEME found no
 * motif; an absent file means something dropped it.** Nine of the 109 real samples
 * are zero-byte — seven HALO controls, which have no motif by construction, and two
 * treatments where the search came back empty. That is the pipeline recording an
 * outcome, the same way a blank `control` records that a sample is a control.
 *
 * Collapsing the two would mean a sync that lost a file rendered as 108 logos and
 * one confident "no motif found", which is precisely the plausible-substitute
 * failure this project refuses everywhere else.
 */
function classify(file: string, sample: string): MotifLogo {
  let stats: fs.Stats;
  try {
    stats = fs.statSync(file);
  } catch {
    throw new Error(
      `${sample}: expected a logo at ${file} and found nothing. An empty file means ` +
        `MEME found no motif; a missing one means the MEME tree is incomplete.`,
    );
  }

  if (!stats.isFile()) {
    throw new Error(`${sample}: ${file} exists but is not a file`);
  }
  if (stats.size === 0) {
    return Object.freeze({ present: false, reason: "no-motif" as const });
  }

  const { width, height } = readPngDimensions(file);
  return Object.freeze({ present: true as const, width, height });
}

/** Fail before per-sample work with a message that explains the likely cause. */
function assertRootExists(): void {
  const root = resolveMemeRoot();
  if (!fs.existsSync(root)) {
    throw new Error(
      `No MEME logo tree at ${root}. It is gitignored along with the rest of ` +
        `data/, so a fresh clone, a worktree, or CI has none until it is copied in. ` +
        `Set GENOME_BROWSER_MEME_ROOT to override the location.`,
    );
  }
}

/** Classify one run's logos: two `stat`s, and a 24-byte header read for each. */
function motifsForRun(run: QcRun): SampleMotifs {
  const logos = {} as { [K in MotifImage]: MotifLogo };
  for (const image of MOTIF_IMAGES) {
    const { column, file } = IMAGE_SOURCES[image];
    logos[image] = classify(path.join(resolveSampleDir(run, column), file), run.sample);
  }
  return Object.freeze({ sample: run.sample, logos: Object.freeze(logos) });
}

/**
 * Every sample's logos, in the order the rows arrive.
 *
 * Not memoized, matching `readRuns()`: holding one tree walk for the process
 * lifetime would keep serving a refreshed tree's old answers.
 */
export async function readMotifs(): Promise<readonly SampleMotifs[]> {
  assertRootExists();
  const runs = await readRuns();
  return Object.freeze(runs.map(motifsForRun));
}

/**
 * One sample's logos, or null when there is no such sample.
 *
 * Narrow on purpose. Answering this by classifying all 109 samples and discarding
 * 108 was measured at 111 whole-tree walks per build — one per prerendered detail
 * page — which is roughly 46,000 filesystem calls to produce what 420 would.
 * Harmless at 109 samples and quadratic in them.
 *
 * Note what this is *not*: a cache. `readRuns()` is still called per invocation, so
 * the reason the seam refuses to memoize — a replaced file being served stale
 * forever — is untouched. The saving is in not doing work for samples nobody asked
 * about.
 */
export async function readMotifsFor(sample: string): Promise<SampleMotifs | null> {
  assertRootExists();
  const run = (await readRuns()).find((candidate) => candidate.sample === sample);
  return run === undefined ? null : motifsForRun(run);
}

/**
 * One logo's bytes.
 *
 * Throws rather than returning an empty buffer for a motif-less sample: empty bytes
 * would reach the browser as a broken image, which is the substitution the caller is
 * relying on this module not to make. The route above enumerates only present logos,
 * so reaching this error means the tree changed since the build.
 */
export async function readMotifBytesFrom(
  sample: string,
  image: MotifImage,
): Promise<Uint8Array<ArrayBuffer>> {
  assertRootExists();
  const run = (await readRuns()).find((candidate) => candidate.sample === sample);
  if (run === undefined) {
    throw new Error(`No such sample: ${sample}`);
  }

  const { column, file } = IMAGE_SOURCES[image];
  const resolved = path.join(resolveSampleDir(run, column), file);

  const logo = classify(resolved, sample);
  if (!logo.present) {
    throw new Error(`${sample}: ${image} has no motif, so there are no bytes to serve`);
  }

  return fs.readFileSync(resolved);
}
