/**
 * How motif logos are addressed and presented.
 *
 * Above the seam. A URL is this app's own public surface rather than knowledge of
 * where a file lives, so building one belongs here — and keeping it here keeps it
 * unit-testable, which the route handler itself is not.
 *
 * The identifiers double as browse-table column ids. That is deliberate: one string
 * serves as the column id, the URL segment, and a near-mirror of the filename in the
 * MEME tree, so there is no mapping table to fall out of sync.
 */

// The leaf, not the seam. Importing `../data/index.ts` here would pull the reader
// and `better-sqlite3` into the browse table's client bundle for the sake of a
// constant and a string union.
import { MOTIF_IMAGES, type MotifImage } from "../data/motif-images.ts";
import { DATA_HOME } from "../site/nav.ts";

/** Re-exported so display code has one import for everything motif-shaped. */
export type { MotifImage };

/**
 * The segment the image route occupies inside the data section.
 *
 * It sits beside `[sample]`, so a sample named `motif` would be unreachable. No such sample
 * exists and a test asserts it rather than trusting it — that collision survived the move
 * under `/insiders/data`, where `motif/` and `[sample]/` are still siblings.
 */
export const MOTIF_ROUTE_SEGMENT = "motif";

/**
 * Where a logo's bytes are served from.
 *
 * Built from `DATA_HOME` rather than the site root, so the images live inside the insiders
 * path prefix along with the pages that reference them. Leaving them at `/motif/...` would
 * have protected the browser and served the research images to anyone who guessed a sample
 * name.
 */
export function motifImageUrl(sample: string, image: MotifImage): string {
  return `${DATA_HOME}/${MOTIF_ROUTE_SEGMENT}/${sample}/${image}`;
}

/** Whether a browse-table column renders an image rather than text. */
export function isMotifColumn(column: string): column is MotifImage {
  return (MOTIF_IMAGES as readonly string[]).includes(column);
}

/**
 * The height every logo renders at in the table, in pixels.
 *
 * Height rather than width, and this is the whole readability argument. MEME writes
 * every logo 358px tall but 404–1664px wide, because the width tracks motif length.
 * Constraining the width would render an 8bp and a 32bp motif at different letter
 * scales, so two logos in the same column could not be compared — which is the only
 * thing the column is for. Constraining the height instead makes the letters one
 * size everywhere and lets the cell be as wide as the motif is long.
 *
 * 60 rather than 32: at 32 the letter shapes and colours were visible but the
 * sequence was not readable, and 40 was still cramped. The cost is column width —
 * the widest motif lands near 264px — which is the trade this height buys.
 */
export const TABLE_LOGO_HEIGHT = 60;

/**
 * Where the plot area starts, past the `bits` axis MEME draws, in source pixels.
 *
 * **Measured, not guessed.** Rendering logos to a canvas and profiling per-column ink
 * coverage gives the same picture at every motif width from 404 to 1664: columns
 * 79–84 hold the tick marks at 2–3% coverage, columns **85–86** are the axis line
 * itself at 82–84%, and coverage from 87 on is letters. MEME draws its axis once at a
 * fixed size rather than scaling it with the plot, so this is a constant of the tool
 * rather than a fraction of the image.
 *
 * 87 and not 86: cropping to 86 left the second pixel of the axis line showing as a
 * hairline down the left of every cell, which the browser gate caught.
 *
 * The axis is cropped in the table because at row height the tick numbers and the
 * rotated label are illegible noise occupying a fifth of a narrow logo's width. The
 * detail page shows the logo whole, where the scale is readable and worth having.
 *
 * If MEME ever changes its axis rendering this crop becomes wrong — but wrong
 * *visibly*, as a clipped letter or a sliver of axis, rather than as a plausible
 * picture of the wrong thing.
 */
export const LOGO_AXIS_WIDTH = 87;

/** Where a cropped logo's box and its underlying image sit, in display pixels. */
export type LogoBox = {
  /** The cell's width: the plot area only, with the axis cropped off. */
  width: number;
  height: number;
  /** Width to render the full image at, before cropping. */
  imageWidth: number;
  /** How far left to shift the image so the axis falls outside the box. */
  offset: number;
};

/**
 * Scale a logo to the table's fixed height and crop its axis away.
 *
 * Throws on a source narrower than the axis rather than producing a zero-width or
 * negative box — that would render as an empty cell, indistinguishable from a sample
 * with no motif.
 */
export function tableLogoBox(
  width: number,
  height: number,
  target: number = TABLE_LOGO_HEIGHT,
): LogoBox {
  if (height <= 0) throw new Error(`Cannot scale a logo of height ${height}`);
  if (width <= LOGO_AXIS_WIDTH) {
    throw new Error(
      `A logo ${width}px wide is no wider than MEME's ${LOGO_AXIS_WIDTH}px axis, ` +
        `so cropping it would leave nothing to show`,
    );
  }

  const scale = target / height;
  const offset = Math.round(LOGO_AXIS_WIDTH * scale);
  const imageWidth = Math.round(width * scale);

  return { width: imageWidth - offset, height: target, imageWidth, offset };
}

/** Scale a logo's intrinsic size to a target height, axis included. */
export function scaleToHeight(
  width: number,
  height: number,
  target: number = TABLE_LOGO_HEIGHT,
): { width: number; height: number } {
  if (height <= 0) throw new Error(`Cannot scale a logo of height ${height}`);
  return { width: Math.round((width / height) * target), height: target };
}

/**
 * Why a sample has no motif, which is two different facts.
 *
 * A control has no transcription factor to bind one, so no motif is the expected
 * outcome. A treatment with no motif is a result: the run worked and the search came
 * back empty. Seven of the nine real motif-less samples are controls and two are
 * treatments, so merging them would report a normal outcome as a null result on seven
 * samples and vice versa.
 *
 * `is_treatment` is authoritative and the name must not be used instead —
 * `HALOb_b2` is a treatment despite the prefix, and `HALO_LH` and `HALOa_b2` are
 * controls that do have motifs. Extracted from the page so this branch is testable
 * without a DOM, the way the ordering rules are.
 */
export function noMotifReason(isTreatment: string | null): string {
  return isTreatment === "0"
    ? "No motif, which is the expected result for a control sample — there is no " +
        "transcription factor here to bind one."
    : "MEME searched the summit sequences and found no motif. The sample ran " +
        "successfully; the search came back empty.";
}

/** Alt text naming the sample and which strand the logo shows. */
export function motifAltText(sample: string, image: MotifImage): string {
  const strand = image.endsWith("_rc1") ? "reverse complement" : "forward";
  return `${sample} summits motif logo, ${strand} strand`;
}
