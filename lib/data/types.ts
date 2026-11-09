/**
 * The row shape everything above the data seam depends on.
 *
 * Callers of the seam import from here. They never learn where rows came from,
 * what format they were stored in, or which strings meant "absent" — that is the
 * whole point of the seam, and it is what makes swapping the data source a
 * one-module change.
 */

export type ColumnKind = "text" | "int" | "float" | "date";

/** Dates arrive in one of two shapes, declared per column rather than sniffed. */
export type DateFormat = "M/D/YY" | "iso-datetime";

/**
 * How one column is read.
 *
 * `missing` lists every string that means "absent" for this column. It is a list
 * because the two sources disagreed: the retired tab-separated export wrote "NA"
 * where the database writes "" for the same absent cells, and one spec had to serve
 * both readers across the swap. The database is now the only source, so the "NA"
 * branch on the date columns is retained permissiveness rather than a live
 * disagreement — harmless, and it costs nothing if an export is ever read again.
 *
 * `format` applies to date columns only. Sniffing the format would turn a known
 * fact into a runtime guess whose failure mode is a silently wrong date.
 */
export type ColumnSpec = {
  kind: ColumnKind;
  missing: readonly string[];
  format?: DateFormat;
};

/**
 * Every column the row type carries, in export order.
 *
 * The source stores everything as text — numbers, dates and booleans alike. This
 * map is what turns that back into types worth sorting and displaying.
 */
export const QC_COLUMNS = {
  // Identity and provenance
  sample: { kind: "text", missing: [] },
  is_treatment: {
    // Text "0"/"1", not a real boolean and not a number: it carries no arithmetic
    // meaning, and it is authoritative — controls are never inferred from naming.
    kind: "text",
    missing: [],
  },
  control: {
    // Blank means "no control applies" *or* "none was recorded". Ten rows are
    // blank while only nine are controls, so the biconditional with is_treatment
    // is false and must not be encoded.
    kind: "text",
    missing: [""],
  },
  experiment_date: { kind: "date", missing: ["NA", ""], format: "M/D/YY" },
  gdna_batch: { kind: "date", missing: ["NA", ""], format: "M/D/YY" },

  // QC metrics
  total_reads: { kind: "int", missing: ["NA"] },
  trimmed_reads: { kind: "int", missing: ["NA"] },
  mapped_reads: { kind: "int", missing: ["NA"] },
  mapping_pct: { kind: "float", missing: ["NA"] },
  alignment_rate: { kind: "float", missing: ["NA"] },
  subsampled_frags: { kind: "int", missing: ["NA"] },
  median_frag_size: { kind: "int", missing: ["NA"] },
  num_peaks: { kind: "int", missing: ["NA"] },
  num_peaks_filt: { kind: "int", missing: ["NA"] },
  // Only computed when the blacklist is enabled — a per-run setting, so the
  // column stays declared rather than churning in and out of the row type.
  num_peaks_bl: { kind: "int", missing: ["NA"] },
  reads_in_peaks: { kind: "int", missing: ["NA"] },
  reads_in_peaks_filt: { kind: "int", missing: ["NA"] },
  // Derived, not stored: a percentage of mapped_reads on a 0-100 scale.
  frip: { kind: "float", missing: ["NA"] },
  frip_filt: { kind: "float", missing: ["NA"] },
  max_peak_score: { kind: "float", missing: ["NA"] },
  motif_peaks: { kind: "int", missing: ["NA"] },

  // File paths. All are absolutes on the HPC filesystem, so they can be
  // displayed but not linked to or served.
  r1: { kind: "text", missing: [] },
  r2: { kind: "text", missing: [] },
  trimmed_r1: { kind: "text", missing: [] },
  trimmed_r2: { kind: "text", missing: [] },
  bam: { kind: "text", missing: [] },
  bigwig: { kind: "text", missing: [] },
  peaks_narrowpeak: { kind: "text", missing: [] },
  peaks_filt_narrowpeak: { kind: "text", missing: [] },
  summits_bed: { kind: "text", missing: [] },
  summits_fasta: { kind: "text", missing: [] },
  peaks_fasta: { kind: "text", missing: [] },
  meme_summits_dir: { kind: "text", missing: [] },
  meme_peaks_dir: { kind: "text", missing: [] },
  fimo_summits_tsv: { kind: "text", missing: [] },
  fimo_peaks_tsv: { kind: "text", missing: [] },
  homer_annotations: { kind: "text", missing: [] },
} as const satisfies Record<string, ColumnSpec>;

export type QcColumnName = keyof typeof QC_COLUMNS;

export const QC_COLUMN_NAMES = Object.keys(QC_COLUMNS) as QcColumnName[];

/** What each column kind coerces to. */
type CoercedValue<K extends ColumnKind> = K extends "text"
  ? string
  : K extends "date"
    ? Date
    : number;

/**
 * One sample's QC results.
 *
 * Derived from `QC_COLUMNS` rather than written out, so the declared field types
 * cannot drift from the kinds coercion actually applies. Adding a column to the
 * map above is all it takes to add it here.
 *
 * Every field except `sample` is nullable. Only some columns carry a missing
 * marker today, but the source treats absence as expressible in any column, so
 * narrowing the type to today's set would bake a property of one export into a
 * contract every caller relies on. `sample` is exempt because it is the record
 * key: a row without one cannot be identified, linked to, or looked up.
 *
 * Fields are readonly. This app only ever reads, and rows are handed out from a
 * frozen array, so mutation would be a bug in either direction.
 */
export type QcRun = {
  readonly [K in QcColumnName]: K extends "sample"
    ? string
    : CoercedValue<(typeof QC_COLUMNS)[K]["kind"]> | null;
};
