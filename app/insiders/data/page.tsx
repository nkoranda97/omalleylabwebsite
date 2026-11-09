import { MOTIF_IMAGES, listMotifs, listRuns, type QcRun, type SampleMotifs } from "@/lib/data";
import { QC_COLUMN_NAMES } from "@/lib/data/types";
import { tableColumnOrder } from "@/lib/display/column-groups";
import { assertLabelled } from "@/lib/display/labels";
import { motifImageUrl, tableLogoBox } from "@/lib/display/motif";
import {
  QcRunsTable,
  type MotifCell,
  type QcTableRow,
} from "@/components/qc-runs-table";

export const metadata = { title: "DAP-seq data" };

/**
 * The browse page.
 *
 * A Server Component: it reads through the seam and hands rows to the table, which
 * is a client component because TanStack Table needs client state for the sorting
 * and filtering.
 *
 * Two reads through the seam now, and the motif data travels *beside* the rows
 * rather than inside them. `QcTableRow` cells are `string | number | null`, and
 * widening that to carry an object would put `formatValue` in scope — the single
 * formatter that keeps display, search, and the detail page agreeing, which they
 * once did not. So the row gets only what sorting needs and the images are looked up
 * by sample.
 */

/**
 * Render a date as `YYYY-MM-DD`, read back with the same local getters that built it.
 *
 * This has to happen on the server. The seam builds dates at local midnight, so a
 * `Date` crossing to the client is an instant that browser getters may read as the
 * previous or next calendar day depending on the gap between the two timezones.
 * `toISOString()` would have the same problem in reverse — it converts to UTC.
 */
function isoDate(value: Date): string {
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${value.getFullYear()}-${month}-${day}`;
}

/**
 * Flatten a row for display, converting dates to strings before they leave the server.
 *
 * Motif cells carry a marker when a logo exists and `null` when it does not. That is
 * all sorting needs, and using `null` is deliberate rather than lazy: it means
 * absences are placed by the same `sortUndefined: "last"` mechanism that already
 * keeps missing QC values terminal in both directions, instead of a second rule that
 * could disagree with the first.
 */
function toTableRow(run: QcRun, motifs: SampleMotifs): QcTableRow {
  const cells: QcTableRow = {};
  for (const column of QC_COLUMN_NAMES) {
    const value = run[column];
    cells[column] = value instanceof Date ? isoDate(value) : value;
  }
  for (const image of MOTIF_IMAGES) {
    cells[image] = motifs.logos[image].present ? "motif" : null;
  }
  return cells;
}

/**
 * Pre-scale and pre-crop each logo on the server.
 *
 * Doing the geometry here means the browser reserves the exact box before any image
 * arrives, so 100 lazily-loaded logos cannot shift the table as they land.
 */
function toMotifCells(motifs: readonly SampleMotifs[]): Record<string, MotifCell> {
  const cells: Record<string, MotifCell> = {};
  for (const entry of motifs) {
    for (const image of MOTIF_IMAGES) {
      const logo = entry.logos[image];
      if (!logo.present) continue;
      cells[`${entry.sample}/${image}`] = {
        src: motifImageUrl(entry.sample, image),
        ...tableLogoBox(logo.width, logo.height),
      };
    }
  }
  return cells;
}

export default async function DataPage() {
  const [runs, motifs] = await Promise.all([listRuns(), listMotifs()]);

  const bySample = new Map(motifs.map((entry) => [entry.sample, entry]));
  const rows = runs.map((run) => {
    const found = bySample.get(run.sample);
    // A row with no motif entry would otherwise render as a confident "no motif",
    // which is a claim rather than a blank. Both reads come from the same rows, so
    // this cannot fire today — and that is the point of asserting it.
    if (found === undefined) {
      throw new Error(`${run.sample} has a QC row but no motif entry`);
    }
    return toTableRow(run, found);
  });
  const columns = tableColumnOrder(QC_COLUMN_NAMES, MOTIF_IMAGES);
  const withoutMotif = motifs.filter((m) => !m.logos.summits_logo1.present).length;
  // Throws if a column has no label or a label has no column — the same
  // fail-at-build-time contract groupColumns gives the detail page.
  assertLabelled(columns);

  return (
    // A div, not a `<main>`: the insiders layout above provides the page's one main landmark.
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">DAP-seq data</h1>
        {/*
          The section's own heading, now that the lab's name lives on the landing page.

          The second sentence is load-bearing rather than descriptive: motif cells render
          blank for samples with no motif, and without this a reader cannot tell "MEME
          searched and found nothing" from "this value was never recorded". It is the cue
          that went missing when the old page subtitle was removed.
        */}
        <p className="text-muted-foreground text-sm">
          {`${runs.length} runs. Click a sample for its files and provenance. ` +
            `${withoutMotif} have no motif — MEME searched and found none.`}
        </p>
      </header>

      <QcRunsTable columns={columns} rows={rows} motifCells={toMotifCells(motifs)} />
    </div>
  );
}
