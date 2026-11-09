import Link from "next/link";
import { notFound } from "next/navigation";

import { MOTIF_IMAGES, getMotifs, getRun, listRuns, type QcRun, type SampleMotifs } from "@/lib/data";
import { QC_COLUMN_NAMES } from "@/lib/data/types";
import { DETAIL_GROUPS, groupColumns } from "@/lib/display/column-groups";
import { formatValue } from "@/lib/display/format";
import { columnLabel } from "@/lib/display/labels";
import { DATA_HOME } from "@/lib/site/nav";
import {
  motifAltText,
  motifImageUrl,
  noMotifReason,
  scaleToHeight,
} from "@/lib/display/motif";

/**
 * Everything about one sample.
 *
 * `sample` is the URL slug, which works because every value is distinct and matches
 * `[A-Za-z0-9_.-]+` so it needs no encoding. That is a property of a database holding
 * one run directory rather than a guarantee — the reader asserts a single
 * `output_dir` on every read, so a second one fails loudly here instead of quietly
 * serving whichever duplicate came first. See the record-key entry in the register.
 */

/**
 * Prerender a page per sample at build time.
 *
 * The browse route is already static, and leaving this one dynamic would mean the
 * two halves of the same app disagreed about when they read the database. It also
 * turns a missing database into a build failure rather than a runtime one, which is
 * the louder of the two.
 */
export async function generateStaticParams() {
  const runs = await listRuns();
  return runs.map((run) => ({ sample: run.sample }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ sample: string }>;
}) {
  const { sample } = await params;
  return { title: `${sample} · DAP-seq data` };
}

/** Render a date as YYYY-MM-DD using the same local getters that built it. */
function isoDate(value: Date): string {
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${value.getFullYear()}-${month}-${day}`;
}

function display(run: QcRun, column: string): string {
  const value = (run as unknown as Record<string, unknown>)[column];
  if (value instanceof Date) return isoDate(value);
  return formatValue(column, value as string | number | null);
}

/** How tall a logo renders here: big enough that the axis is worth reading. */
const DETAIL_LOGO_HEIGHT = 180;

/**
 * The motif MEME found, or a statement of why there is none.
 *
 * Shown whole, axis included — the opposite of the table, where the `bits` scale is
 * illegible clutter. At this size it is the point: a reader comparing two samples
 * wants to know how much information each position carries, not just which letter won.
 *
 * The two motif-less populations are told apart rather than merged, because they are
 * different facts. A control sample has no transcription factor to bind, so no motif
 * is the expected outcome; a treatment with no motif is a result. `is_treatment` is
 * authoritative for the distinction — it must not be guessed from the sample name,
 * since `HALOb_b2` is a treatment despite the `HALO` prefix.
 */
function MotifSection({ run, motifs }: { run: QcRun; motifs: SampleMotifs }) {
  const present = MOTIF_IMAGES.filter((image) => motifs.logos[image].present);

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold tracking-tight">Motif</h2>

      {present.length === 0 ? (
        <p className="text-muted-foreground max-w-prose text-xs">
          {noMotifReason(run.is_treatment)}
        </p>
      ) : (
        <>
          <p className="text-muted-foreground max-w-prose text-xs">
            {`Motif 1 from the summit sequences, forward strand and reverse complement. ` +
              `Letter height is information content in bits.`}
          </p>
          <div className="flex flex-wrap gap-4">
            {present.map((image) => {
              // The filter above guarantees this, and the type does not — so read it
              // through a check rather than a non-null assertion.
              const logo = motifs.logos[image];
              if (!logo.present) throw new Error(`${run.sample}: ${image} vanished mid-render`);
              const { width, height } = scaleToHeight(
                logo.width,
                logo.height,
                DETAIL_LOGO_HEIGHT,
              );
              return (
                <figure key={image} className="flex flex-col gap-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={motifImageUrl(run.sample, image)}
                    alt={motifAltText(run.sample, image)}
                    width={width}
                    height={height}
                    className="bg-background rounded border"
                  />
                  <figcaption className="text-muted-foreground text-xs">
                    {columnLabel(image)}
                  </figcaption>
                </figure>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

export default async function SamplePage({
  params,
}: {
  params: Promise<{ sample: string }>;
}) {
  const { sample } = await params;
  const run = await getRun(sample);

  // getRun returns null rather than throwing precisely so this can be a 404 instead
  // of a 500 — an unknown sample is a bad URL, not a broken app.
  if (run === null) notFound();

  // Read after the 404 check: an unknown sample should not make the motif reader
  // throw on a directory that was never going to exist.
  //
  // Absent motif data is a failure, not a result. Rendering "MEME found no motif"
  // for a sample whose logos could not be read would state a scientific claim the
  // app does not have — the exact substitution the reader below the seam throws four
  // different ways to prevent, undone at the last step. Unreachable today, since the
  // sample came from getRun and both read the same rows; the guard is here so it
  // stays unreachable.
  const motifs = await getMotifs(sample);
  if (motifs === null) {
    throw new Error(
      `${sample} has QC data but no motif entry, so whether it has a motif is ` +
        `unknown rather than negative`,
    );
  }

  // Throws if the spec has grown a column no group claims, rather than omitting it.
  const groups = groupColumns(QC_COLUMN_NAMES, DETAIL_GROUPS);

  return (
    // A div, not a `<main>`: the insiders layout above provides the page's one main landmark.
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        {/*
          Constructed, not "/" — after the move a literal root href would send a reader from
          a sample page out of the insiders area entirely, onto the public landing page.
        */}
        <Link href={DATA_HOME} className="text-muted-foreground w-fit text-sm hover:underline">
          ← All runs
        </Link>
        <h1 className="font-mono text-2xl font-semibold tracking-tight">{run.sample}</h1>
        <p className="text-muted-foreground text-sm">
          {run.is_treatment === "0"
            ? "Control sample."
            : run.control === null
              ? "Treatment sample, no control recorded."
              : `Treatment sample, control ${run.control}.`}
        </p>
      </header>

      {/* Before the column groups: it is the one thing on this page that is a
          picture rather than a number, and the reason the sample was run. */}
      <MotifSection run={run} motifs={motifs} />

      {groups.map((group) => (
        <section key={group.title} className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold tracking-tight">{group.title}</h2>
          {group.note ? (
            <p className="text-muted-foreground max-w-prose text-xs">{group.note}</p>
          ) : null}
          <dl className="divide-border grid grid-cols-1 divide-y rounded border text-sm">
            {group.columns.map((column) => {
              const value = display(run, column);
              return (
                <div
                  key={column}
                  className="grid grid-cols-[14rem_1fr] gap-4 px-3 py-1.5"
                >
                  <dt className="text-muted-foreground text-xs">{columnLabel(column)}</dt>
                  <dd className="font-mono text-xs break-all tabular-nums">
                    {value === "" ? (
                      <span className="text-muted-foreground italic">not recorded</span>
                    ) : (
                      value
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        </section>
      ))}
    </div>
  );
}
