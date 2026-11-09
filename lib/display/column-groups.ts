/**
 * How the 37 columns are grouped for the detail page.
 *
 * The browse table shows one flat row per sample, which is right for comparing
 * samples and wrong for reading one. A single 37-cell strip has no shape: the
 * identity fields, the QC numbers, and the 16 file paths are different kinds of
 * thing and want different presentation.
 *
 * Data rather than markup so the grouping is testable, and so a column added to the
 * spec cannot silently vanish from the page — `groupColumns` fails loudly on any
 * column it was not told where to put.
 */

export type ColumnGroup = {
  title: string;
  /** Why this group exists, shown to the reader — these columns are not obvious. */
  note?: string;
  columns: readonly string[];
};

/**
 * The intended grouping, in reading order.
 *
 * Identity first because it answers "which sample is this", metrics second because
 * they are what the page is for, files last because they are long, uniform, and
 * scanned rather than read.
 */
export const DETAIL_GROUPS: readonly ColumnGroup[] = [
  {
    title: "Identity",
    note: "Sample type is authoritative; a control sample legitimately has no control of its own.",
    columns: ["sample", "is_treatment", "control", "experiment_date", "gdna_batch"],
  },
  {
    title: "Sequencing",
    columns: [
      "total_reads",
      "trimmed_reads",
      "mapped_reads",
      "mapping_pct",
      "median_frag_size",
    ],
  },
  {
    title: "Peaks",
    columns: [
      "num_peaks",
      "num_peaks_filt",
      "num_peaks_bl",
      "reads_in_peaks",
      "reads_in_peaks_filt",
      "frip",
      "frip_filt",
      "max_peak_score",
      "motif_peaks",
    ],
  },
  {
    title: "Not recorded for this run",
    note:
      "Empty because the pipeline features that populate them were switched off, or " +
      "because it computes the value without logging it — not because the sample failed.",
    columns: ["alignment_rate", "subsampled_frags"],
  },
  {
    title: "Files",
    note:
      "Absolute paths on the HPC filesystem. Shown for reference; they are not " +
      "reachable from here.",
    columns: [
      "r1",
      "r2",
      "trimmed_r1",
      "trimmed_r2",
      "bam",
      "bigwig",
      "peaks_narrowpeak",
      "peaks_filt_narrowpeak",
      "summits_bed",
      "summits_fasta",
      "peaks_fasta",
      "meme_summits_dir",
      "meme_peaks_dir",
      "fimo_summits_tsv",
      "fimo_peaks_tsv",
      "homer_annotations",
    ],
  },
];

/**
 * Check the grouping covers exactly the columns it was given.
 *
 * Throws rather than dropping, because a column silently missing from a detail page
 * is indistinguishable from a column the pipeline stopped sending — the same class
 * of quiet wrongness the data layer refuses elsewhere.
 */
export function groupColumns(
  allColumns: readonly string[],
  groups: readonly ColumnGroup[] = DETAIL_GROUPS,
): readonly ColumnGroup[] {
  const grouped = groups.flatMap((group) => group.columns);

  const duplicated = grouped.filter((c, i) => grouped.indexOf(c) !== i);
  if (duplicated.length > 0) {
    throw new Error(
      `Column(s) appear in more than one group: ${[...new Set(duplicated)].join(", ")}`,
    );
  }

  const known = new Set(allColumns);
  const unknown = grouped.filter((c) => !known.has(c));
  if (unknown.length > 0) {
    throw new Error(`Grouped column(s) are not in the row type: ${unknown.join(", ")}`);
  }

  const placed = new Set(grouped);
  const ungrouped = allColumns.filter((c) => !placed.has(c));
  if (ungrouped.length > 0) {
    throw new Error(
      `Column(s) have no group and would not be shown: ${ungrouped.join(", ")} — ` +
        `add them to DETAIL_GROUPS in lib/display/column-groups.ts`,
    );
  }

  return groups;
}

/**
 * Columns the browse table hides until asked for.
 *
 * Nothing is deleted — every one is revealable from the Columns control, and all of
 * them appear on the detail page. The default exists because rendering all 37 made a
 * table eight screens wide, and measurement showed where the width went: the 16 file
 * paths were roughly 80% of it while sharing one long prefix and varying only by a
 * sample name already in the first column. A global search across them was also
 * low-signal for the same reason — "zhuzhu" matched all 109 rows.
 *
 * The three metrics here carry no value for this run: two because the pipeline
 * features that populate them were switched off, and `num_peaks_bl` because the
 * pipeline computes it without logging it. They are hidden rather than dropped
 * because a future run will fill them, and the detail page states why they are empty
 * rather than leaving a blank to be misread as a failed sample.
 */
export const TABLE_HIDDEN_BY_DEFAULT: readonly string[] = [
  "alignment_rate",
  "subsampled_frags",
  "num_peaks_bl",
  ...DETAIL_GROUPS.find((g) => g.title === "Files")!.columns,
];

/** The columns the browse table shows before the reader changes anything. */
export function defaultVisibleColumns(allColumns: readonly string[]): readonly string[] {
  const hidden = new Set(TABLE_HIDDEN_BY_DEFAULT);
  return allColumns.filter((c) => !hidden.has(c));
}

/**
 * The browse table's full column order, spec columns plus the motif logos.
 *
 * The logos are not spec columns — they come from the filesystem, not the database —
 * so the table's list can no longer be `QC_COLUMN_NAMES` as-is.
 *
 * They sit immediately after `motif_peaks` because that is the metric they are the
 * evidence for. Appending them instead would have been simpler and would have put
 * the picture of the motif sixteen file-path columns away from the count of peaks
 * containing it.
 *
 * Throws rather than silently dropping or duplicating, on the same grounds as
 * `groupColumns`: a column missing from the table is indistinguishable from a column
 * the pipeline stopped sending.
 */
export function tableColumnOrder(
  specColumns: readonly string[],
  motifColumns: readonly string[],
  after = "motif_peaks",
): readonly string[] {
  const overlap = motifColumns.filter((c) => specColumns.includes(c));
  if (overlap.length > 0) {
    throw new Error(`Motif column(s) collide with spec columns: ${overlap.join(", ")}`);
  }

  const anchor = specColumns.indexOf(after);
  if (anchor === -1) {
    throw new Error(
      `Cannot place the motif columns: no "${after}" column in the row type`,
    );
  }

  return [
    ...specColumns.slice(0, anchor + 1),
    ...motifColumns,
    ...specColumns.slice(anchor + 1),
  ];
}
