/**
 * What each column is called on screen.
 *
 * Column *ids* are the pipeline's names and stay exactly as they are — they are the
 * search keys, the URL segments, and the contract with the database. This module is
 * only about what a reader sees, which had been the raw identifier: `num_peaks_filt`,
 * `gdna_batch`, `frip`.
 *
 * Three rules, applied to all 39:
 *
 * 1. **No underscores.** Words, separated by spaces.
 * 2. **No abbreviations** of project jargon — `num`, `pct`, `filt`, `frag`, `bl`,
 *    `gdna`, `r1`/`r2` are all spelled out. Established names of the field stay:
 *    tools (MEME, FIMO, HOMER) and measures (FRiP) are what these things are *called*
 *    rather than shortenings of a phrase anyone says out loud, and expanding them
 *    tells a reader of this data less, not more. File formats went the other way —
 *    the concept is clearer than the extension, so `bam` reads as "Aligned Reads
 *    File". The paths still contain the extensions, so search finds them either way.
 * 3. **One capitalization rule everywhere:** title case, with short function words
 *    (`in`, `of`, `with`, `after`) left lowercase. A test enforces it, because
 *    consistency here is only visible when every label is read side by side and is
 *    easy to break one entry at a time.
 */

/** Function words that stay lowercase inside a label, never at the start. */
const MINOR_WORDS: readonly string[] = ["in", "of", "with", "after", "and", "the"];

export const COLUMN_LABELS: Readonly<Record<string, string>> = Object.freeze({
  // Identity
  sample: "Sample",
  // Not "Is Treatment", and not 0/1 either — the values render as Control and
  // Treatment. See lib/display/format.ts.
  is_treatment: "Sample Type",
  control: "Control Sample",
  experiment_date: "Experiment Date",
  gdna_batch: "Genomic DNA Batch",

  // Sequencing
  total_reads: "Total Reads",
  trimmed_reads: "Trimmed Reads",
  mapped_reads: "Mapped Reads",
  mapping_pct: "Mapping Percentage",
  alignment_rate: "Alignment Rate",
  subsampled_frags: "Subsampled Fragments",
  median_frag_size: "Median Fragment Size",

  // Peaks
  num_peaks: "Number of Peaks",
  num_peaks_filt: "Number of Filtered Peaks",
  // "After" rather than "outside": the pipeline computes this only when the blacklist
  // is on, and it counts what survived it, matching how `_filt` reads.
  num_peaks_bl: "Number of Peaks after Blacklist",
  reads_in_peaks: "Reads in Peaks",
  reads_in_peaks_filt: "Reads in Filtered Peaks",
  // FRiP stays. It is what the measure is *called* in this field rather than a
  // shortening of a phrase anyone says out loud — the same reason MEME and FIMO stay.
  // Spelled out it became the widest header on the table, spending that width to tell
  // this data's readers something they already know.
  frip: "FRiP",
  frip_filt: "Filtered FRiP",
  max_peak_score: "Maximum Peak Score",
  motif_peaks: "Peaks with Motif",

  // Motif logos
  summits_logo1: "Motif Logo",
  summits_logo_rc1: "Motif Logo, Reverse Complement",

  // Files
  r1: "Read 1 File",
  r2: "Read 2 File",
  trimmed_r1: "Trimmed Read 1 File",
  trimmed_r2: "Trimmed Read 2 File",
  bam: "Aligned Reads File",
  bigwig: "Coverage Track File",
  peaks_narrowpeak: "Peaks File",
  peaks_filt_narrowpeak: "Filtered Peaks File",
  summits_bed: "Summits File",
  summits_fasta: "Summit Sequences File",
  peaks_fasta: "Peak Sequences File",
  meme_summits_dir: "MEME Summits Directory",
  meme_peaks_dir: "MEME Peaks Directory",
  fimo_summits_tsv: "FIMO Summits Results File",
  fimo_peaks_tsv: "FIMO Peaks Results File",
  homer_annotations: "HOMER Annotations File",
});

/**
 * The label for a column.
 *
 * Throws rather than falling back to the raw id. A fallback would mean a column added
 * upstream quietly reappears as `some_new_column` among 39 human labels — visible
 * enough to look like a bug and quiet enough to ship, which is the failure mode this
 * project refuses everywhere else.
 */
export function columnLabel(column: string): string {
  const label = COLUMN_LABELS[column];
  if (label === undefined) {
    throw new Error(
      `No display label for column "${column}" — add one to COLUMN_LABELS in ` +
        `lib/display/labels.ts`,
    );
  }
  return label;
}

/**
 * Check the label set covers exactly the columns it was given.
 *
 * Same contract as `groupColumns`: a column with no label and a label with no column
 * are both drift, and both should stop a build rather than surface on screen.
 */
export function assertLabelled(columns: readonly string[]): void {
  const missing = columns.filter((c) => COLUMN_LABELS[c] === undefined);
  if (missing.length > 0) {
    throw new Error(`Column(s) have no display label: ${missing.join(", ")}`);
  }

  const known = new Set(columns);
  const extra = Object.keys(COLUMN_LABELS).filter((c) => !known.has(c));
  if (extra.length > 0) {
    throw new Error(
      `Label(s) refer to columns that no longer exist: ${extra.join(", ")}`,
    );
  }
}

/** Whether a label follows the one capitalization rule. Exported so tests can assert it. */
export function capitalizationProblem(label: string): string | null {
  const words = label.split(/[\s,]+/).filter((w) => w !== "");

  for (const [index, word] of words.entries()) {
    // Tool names and things like "DNA" are deliberately all-caps.
    if (/^[A-Z0-9]+$/.test(word)) continue;
    // A bare number is a position, not a word: "Read 1 File".
    if (/^\d+$/.test(word)) continue;

    const minor = MINOR_WORDS.includes(word.toLowerCase());
    if (index === 0 || !minor) {
      if (!/^[A-Z]/.test(word)) {
        return `"${word}" should be capitalized`;
      }
    } else if (word !== word.toLowerCase()) {
      return `"${word}" is a function word and should be lowercase`;
    }
  }

  return null;
}
