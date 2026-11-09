/**
 * Which motif images this app serves — a declaration with no imports at all.
 *
 * It is a separate leaf module for a reason the build found: the browse table is a
 * client component, and reaching for these identifiers through `index.ts` pulled the
 * whole reader — and `better-sqlite3` with it — into the client bundle. A constant
 * and a string union do not need a database driver.
 *
 * This mirrors how `types.ts` already works: pure vocabulary lives in a leaf that
 * both sides import, while the seam's *functions* stay in `index.ts`. Nothing here
 * names a file path, a table, or a query, so the seam rule is intact — `index.ts`
 * re-exports these so the seam's surface reads as one place.
 *
 * The set is closed on purpose. These identifiers arrive from a URL segment, so a
 * fixed set of two means no caller-supplied string is ever joined into a path.
 * Adding the `peaks` panel or motif 2 is an entry here plus one in the reader's
 * source map, not a rewrite.
 */

export const MOTIF_IMAGES = ["summits_logo1", "summits_logo_rc1"] as const;

export type MotifImage = (typeof MOTIF_IMAGES)[number];

/**
 * One logo: either it exists with known dimensions, or MEME found no motif.
 *
 * There is no third case, because every other filesystem state is a bug and throws.
 * In particular there is no "unknown" — a logo whose status could not be determined
 * is not a value to render, it is a failure to report.
 */
export type MotifLogo =
  | { readonly present: true; readonly width: number; readonly height: number }
  | { readonly present: false; readonly reason: "no-motif" };

export type SampleMotifs = {
  readonly sample: string;
  readonly logos: { readonly [K in MotifImage]: MotifLogo };
};
