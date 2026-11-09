/**
 * The data seam.
 *
 * Everything above this module depends on the row type and these two functions
 * — never on where rows come from. They come from a local SQLite database that a
 * separate sync script refreshes; nothing above this file knows that, which is
 * what made swapping the source from a tab-separated export a change to one
 * module and nothing else.
 *
 * Both functions are async even though the current implementation could be
 * synchronous. Keeping the signature stable is the point of the boundary.
 *
 * There are now two sources behind this one boundary — a SQLite file and the
 * pipeline's MEME output tree — and a second function group for the latter. The
 * motif data deliberately does *not* become fields on `QcRun`: that type is derived
 * from a spec of all-TEXT database columns with missing markers and coercion rules,
 * and a filesystem-derived object with pixel dimensions has none of those
 * properties. The seam is the module boundary, not the row type.
 */

import { readMotifBytesFrom, readMotifs, readMotifsFor } from "./motifs.ts";
import { readRuns } from "./sqlite.ts";
import type { MotifImage, SampleMotifs } from "./motif-images.ts";
import type { QcRun } from "./types.ts";

export type { QcRun } from "./types.ts";
export { MOTIF_IMAGES } from "./motif-images.ts";
export type { MotifImage, MotifLogo, SampleMotifs } from "./motif-images.ts";

/**
 * Every QC run, ordered by `sample`.
 *
 * The order is pinned by the query rather than inherited from a file: SQL
 * guarantees no order without an explicit clause, so "source order" stopped
 * meaning anything once the source became a relational table.
 *
 * Not memoized. Reopening the database on each call is what keeps a replaced file
 * from being served stale indefinitely — see `lib/data/sqlite.ts`, including the
 * note that this makes the read path fresh but not the prerendered page.
 */
export async function listRuns(): Promise<readonly QcRun[]> {
  return readRuns();
}

/** One run by its `sample` identifier, or null when there is no such sample. */
export async function getRun(sample: string): Promise<QcRun | null> {
  const runs = await readRuns();
  return runs.find((run) => run.sample === sample) ?? null;
}

/**
 * Every sample's motif logos: whether each exists, and how big it is.
 *
 * Availability comes from the filesystem, never from `motif_peaks` — that column is
 * "NA" for twelve real samples of which three have a motif anyway, so inferring from
 * it would hide three logos a reader could otherwise see.
 */
export async function listMotifs(): Promise<readonly SampleMotifs[]> {
  return readMotifs();
}

/**
 * One sample's logos, or null when there is no such sample.
 *
 * Reads only that sample's files. Filtering the full set instead cost 111 whole-tree
 * walks per build, one for each prerendered detail page.
 */
export async function getMotifs(sample: string): Promise<SampleMotifs | null> {
  return readMotifsFor(sample);
}

/**
 * One logo's bytes, for the route that serves it.
 *
 * This is what keeps the seam rule true for a route whose whole job is serving a
 * file: it asks for bytes by sample and image name, and never learns a path.
 */
export async function readMotifBytes(
  sample: string,
  image: MotifImage,
): Promise<Uint8Array<ArrayBuffer>> {
  return readMotifBytesFrom(sample, image);
}
