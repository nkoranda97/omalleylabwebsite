import Database from "better-sqlite3";
import path from "node:path";

import { coerceValue } from "./coerce.ts";
import {
  QC_COLUMNS,
  QC_COLUMN_NAMES,
  type QcColumnName,
  type QcRun,
} from "./types.ts";

/**
 * The database's location. This function and the loader below are the only place in
 * the codebase that knows a file or a table exists at all.
 *
 * The file is gitignored along with the rest of `data/`, so it exists only on
 * machines that put it there. A fresh clone or a separate worktree has nothing
 * until it is copied in.
 *
 * Resolved per call rather than at module load, for two reasons. `process.cwd()` at
 * import time makes the location a property of whatever launched the process, which
 * is wrong for a service started from another directory. And `GENOME_BROWSER_DB`
 * lets the seam's own tests point at a fabricated fixture, so `listRuns`/`getRun`
 * have coverage on a machine that has no research data — previously they had none.
 */
function resolveDbPath(): string {
  return (
    process.env.GENOME_BROWSER_DB ??
    path.join(process.cwd(), "data", "pipeline_db.db")
  );
}

/**
 * Which table each directly-sourced column comes from.
 *
 * `r1` and `r2` exist in both tables with identical values, and are taken from
 * `run_metadata` so that every file path comes from the provenance table. That
 * consistency is also what makes the choice testable: a fixture where the two
 * tables disagree proves the projection reads the intended one.
 */
const DIRECT = {
  sample: "p",
  is_treatment: "p",
  control: "p",
  experiment_date: "m",
  gdna_batch: "m",

  total_reads: "p",
  trimmed_reads: "p",
  mapped_reads: "p",
  mapping_pct: "p",
  alignment_rate: "p",
  subsampled_frags: "p",
  median_frag_size: "p",
  num_peaks: "p",
  num_peaks_filt: "p",
  reads_in_peaks: "p",
  reads_in_peaks_filt: "p",
  max_peak_score: "p",
  motif_peaks: "p",

  r1: "m",
  r2: "m",
  trimmed_r1: "m",
  trimmed_r2: "m",
  bam: "m",
  bigwig: "m",
  peaks_narrowpeak: "m",
  peaks_filt_narrowpeak: "m",
  summits_bed: "m",
  summits_fasta: "m",
  peaks_fasta: "m",
  meme_summits_dir: "m",
  meme_peaks_dir: "m",
  fimo_summits_tsv: "m",
  fimo_peaks_tsv: "m",
  homer_annotations: "m",
  // `as const satisfies` rather than an annotation: the annotation would widen
  // `keyof typeof DIRECT` to every column name, which silently collapses the
  // Exclude below to `never` and disarms the overlap guard.
} as const satisfies Readonly<Partial<Record<QcColumnName, "p" | "m">>>;

/**
 * Columns the row type carries that this database has no source for.
 *
 * `num_peaks_bl` is computed by the pipeline but not written by its logging script,
 * so it reads as absent for every row. It stays declared rather than removed
 * because the gap is upstream and fixable — see the upstream section of
 * docs/deferred-decisions.md. Unlike `frip` it cannot be derived from anything the
 * database does have.
 */
const UNSOURCED: readonly Exclude<QcColumnName, keyof typeof DIRECT>[] = [
  "num_peaks_bl",
];

/**
 * The row query.
 *
 * Every column is named explicitly. A `SELECT p.*, m.*` would select 60 columns
 * and return 53 keys, because the two tables share seven names (`id`,
 * `output_dir`, `sample`, `run_date`, `genome_ref`, `r1`, `r2`) and the last one
 * silently wins. That is harmless only while the shared columns agree, which no
 * index, key, or constraint enforces — and the two tables are written by separate
 * pipeline steps.
 *
 * `ORDER BY` is explicit because SQL guarantees no order without it. Note that
 * insertion order in the real database already equals `ORDER BY sample`, so this
 * clause is invisible there; the fixture inserts out of order so a test can catch
 * its removal.
 */
const ROW_QUERY = `SELECT
${Object.entries(DIRECT)
  .map(([column, table]) => `  ${table}."${column}" AS "${column}"`)
  .join(",\n")}
FROM pipeline_runs p
INNER JOIN run_metadata m
  ON p."output_dir" = m."output_dir" AND p."sample" = m."sample"
ORDER BY p."sample"`;

function fail(source: string, detail: string): never {
  throw new Error(`${detail} (reading ${source})`);
}

/**
 * Check the three things that hold by accident rather than by guarantee.
 *
 * None of these is enforced by the schema — there are no indexes, no foreign keys
 * and no unique constraints. Each guard converts a future silent corruption into a
 * message. They are single queries over a small table, so the happy path pays
 * almost nothing and the expensive "which rows?" lookups run only on failure.
 */
function assertInvariants(db: Database.Database, source: string): void {
  const dirs = db
    .prepare(`SELECT COUNT(DISTINCT "output_dir") AS n FROM pipeline_runs`)
    .get() as { n: number };
  if (dirs.n === 0) {
    // Distinct from the wrong-cardinality case below: a schema-only database is a
    // sync that has not run or did not finish, and reporting it as a record-key
    // problem would send the reader somewhere irrelevant.
    fail(
      source,
      `pipeline_runs is empty — the database has the schema but no rows, so the ` +
        `browse table would render as legitimately empty`,
    );
  }
  if (dirs.n !== 1) {
    const names = db
      .prepare(`SELECT DISTINCT "output_dir" AS d FROM pipeline_runs ORDER BY d`)
      .all()
      .map((r) => (r as { d: string }).d);
    fail(
      source,
      `Expected exactly one output_dir, found ${dirs.n}: ${names.join(", ")}. ` +
        `"sample" is only unique within a single run directory, so it can no longer ` +
        `serve as the record key or URL slug — see the record-key entry in ` +
        `docs/deferred-decisions.md`,
    );
  }

  const samples = db
    .prepare(
      `SELECT COUNT(*) AS total, COUNT(DISTINCT "sample") AS distinct_samples FROM pipeline_runs`,
    )
    .get() as { total: number; distinct_samples: number };
  if (samples.total !== samples.distinct_samples) {
    const dupes = db
      .prepare(
        `SELECT "sample" AS s FROM pipeline_runs GROUP BY "sample" HAVING COUNT(*) > 1 ORDER BY s`,
      )
      .all()
      .map((r) => (r as { s: string }).s);
    fail(
      source,
      `"sample" is not unique in pipeline_runs — duplicated: ${dupes.join(", ")}. ` +
        `getRun would return an arbitrary one of them`,
    );
  }

  // Two independent emptiness checks rather than one count comparison. Comparing
  // the joined count against the run count looks equivalent and is not: an orphaned
  // run subtracts one while a duplicated metadata row adds one, so the two cancel
  // and every guard passes while the result silently drops one sample and returns
  // another twice. Emptiness cannot cancel.
  const orphans = db
    .prepare(
      `SELECT p."sample" AS s FROM pipeline_runs p
       LEFT JOIN run_metadata m
         ON p."output_dir" = m."output_dir" AND p."sample" = m."sample"
       WHERE m."id" IS NULL ORDER BY s`,
    )
    .all()
    .map((r) => (r as { s: string }).s);
  if (orphans.length > 0) {
    fail(
      source,
      `${orphans.length} run(s) have no run_metadata match, so the join would ` +
        `silently drop them — unmatched: ${orphans.join(", ")}`,
    );
  }

  const dupes = db
    .prepare(
      `SELECT "sample" AS s FROM run_metadata
       GROUP BY "output_dir", "sample" HAVING COUNT(*) > 1 ORDER BY s`,
    )
    .all()
    .map((r) => (r as { s: string }).s);
  if (dupes.length > 0) {
    fail(
      source,
      `run_metadata has duplicate (output_dir, sample) rows, so the join would ` +
        `return a sample more than once — duplicated: ${dupes.join(", ")}`,
    );
  }
}

/**
 * A percentage of mapped reads, as the pipeline's export reports it.
 *
 * `null` rather than `NaN` when the denominator is missing or zero: the cell
 * formatter renders `NaN` as the literal string "NaN", which is exactly the
 * silent-garbage outcome this codebase rejects.
 */
function percentOfMapped(numerator: number | null, mapped: number | null): number | null {
  if (numerator === null || mapped === null || mapped === 0) return null;
  const percent = (numerator / mapped) * 100;
  // Belt-and-braces: the guards above already exclude the paths that produce a
  // non-finite result, so this rests the never-NaN property on code rather than on
  // reasoning about which inputs are reachable.
  return Number.isFinite(percent) ? percent : null;
}

function toRow(raw: Record<string, unknown>): QcRun {
  const row: Record<string, unknown> = {};

  for (const column of Object.keys(DIRECT) as QcColumnName[]) {
    row[column] = coerceValue(raw[column] as string, QC_COLUMNS[column], column);
  }

  for (const column of UNSOURCED) row[column] = null;

  row.frip = percentOfMapped(
    row.reads_in_peaks as number | null,
    row.mapped_reads as number | null,
  );
  row.frip_filt = percentOfMapped(
    row.reads_in_peaks_filt as number | null,
    row.mapped_reads as number | null,
  );

  // Assemble-then-check, because this builds the row column by column rather than
  // iterating the spec: a column added to the spec but not sourced here would
  // otherwise arrive as undefined and read as absent. (A column listed in both
  // DIRECT and UNSOURCED is a type error, so it cannot reach this check.)
  for (const column of QC_COLUMN_NAMES) {
    if (!(column in row)) {
      throw new Error(
        `Column "${column}" is declared in the row type but the reader has no source ` +
          `for it — add it to DIRECT or UNSOURCED, or derive it, in lib/data/sqlite.ts`,
      );
    }
  }

  return Object.freeze(row) as QcRun;
}

/**
 * Read every run from the database at an explicit path.
 *
 * Opened `readonly`, which is what actually prevents SQLite from creating a file:
 * under `SQLITE_OPEN_READONLY` a missing path fails rather than being created.
 * `fileMustExist` is belt-and-braces that becomes load-bearing only if `readonly`
 * is ever dropped. The driver's own error carries no path, so the wrapper adds it —
 * otherwise a missing database is an unactionable failure.
 *
 * The connection does not outlive the call. A long-lived handle whose file is
 * replaced by `rename` keeps serving the deleted inode indefinitely with no error,
 * and `PRAGMA data_version` does not fire because it only reports changes to the
 * file the connection still holds. Reopening a small read-only database is cheap
 * enough that the safe option is also the simple one.
 *
 * Note what this does and does not buy. It makes the *read path* immune to a file
 * swap, which is realised under `next dev`. It does not make the *app* fresh: the
 * browse route is prerendered, so production serves HTML baked at build time and a
 * sync still needs a rebuild or a revalidation strategy. That choice is an open
 * entry in docs/deferred-decisions.md.
 */
export async function loadRunsFrom(dbPath: string): Promise<readonly QcRun[]> {
  let db: Database.Database;
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
  } catch (cause) {
    throw new Error(
      `Could not open the pipeline database at ${dbPath}. ` +
        `Data lives under data/ and is gitignored, so it is not carried by a clone ` +
        `or a worktree and must be copied in per machine.`,
      { cause },
    );
  }

  try {
    // One transaction so the guards and the row query see the same snapshot.
    // Without it they are five independent statements, and a writer landing between
    // them would let all three guards pass against a state the returned rows did
    // not come from.
    const read = db.transaction(() => {
      assertInvariants(db, dbPath);
      return db.prepare(ROW_QUERY).all() as Record<string, unknown>[];
    });
    return Object.freeze(read.deferred().map(toRow));
  } catch (cause) {
    // The open call is wrapped above, but SQLite defers its header check to the
    // first statement — so a truncated, garbage, or wrong-schema file fails here
    // instead, with a driver message that carries no path. Invariant and coercion
    // failures already name their column or table, so pass those through.
    if (cause instanceof Error && !cause.message.includes(dbPath)) {
      throw new Error(`${cause.message} (reading ${dbPath})`, { cause });
    }
    throw cause;
  } finally {
    db.close();
  }
}

/** Read every run from the database this app is configured to use. */
export function readRuns(): Promise<readonly QcRun[]> {
  return loadRunsFrom(resolveDbPath());
}
