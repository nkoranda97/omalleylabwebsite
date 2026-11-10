@AGENTS.md

# CLAUDE.md

This file orients any AI assistant (Claude Code, etc.) working on this project.
Read it at the start of every session before making changes.

Section numbers are stable — `docs/build-ladder.md`, `docs/deferred-decisions.md`,
and the plans under `docs/plans/` cite them. Fix content in place; do not renumber.

---

## 1. What this project is

The **O'Malley lab website** (Ronan O'Malley, The University of Chicago), with two sides.

It began as a copy of the Zhang lab's site and was converted in November 2026: the structure,
data seam and tests are shared, while the content and visual identity are the O'Malley lab's
own (see `docs/plans/2026-11-09-1415-feat-omalley-lab-site-conversion-plan.md`). The Zhang
template keeps evolving in its own repository. When porting a change from it, the residue guard
(`lib/site/residue.test.ts`) catches a Zhang name that comes along with it.

**Public** — the lab's outward face: landing page, research, people, publications, contact.
Anyone can read it. These are pages, edited as files in this repo.

**Insiders** (`/insiders`) — password-protected, for lab members. It holds the
**DAP-seq data browser** plus protocols and inventory. The browser is the mature part
of this project: a searchable, sortable, filterable table of DAP-seq /
transcription-factor binding runs, with a detail page per sample showing its files,
provenance, and motif logos. It replaced an older PHP page and is the thing most of
this document is about.

The project started as *only* that browser, and §1 used to end with "this is a data
browser, not a platform." The pivot to a lab site is why that line is gone — but keep
the half of it that still applies: **the data browser stays a data browser, and the
site around it stays pages.** Not a LIMS, not a CMS, not a public data portal. See the
scope boundaries in `docs/brainstorms/2026-08-04-lab-site-structure-requirements.md`.

**No authentication exists yet.** `/insiders` is a path prefix and a naming convention,
nothing more — every page under it is currently public. The mechanism is an open
register entry, and the structure exists so that choice is one rule rather than an
audit. Do not assume the area is protected because the URL says so.

---

## 2. Tech stack

- **Framework:** Next.js 16 (App Router) with React 19, TypeScript.
- **Package manager:** npm. (Use `npm`, not yarn/pnpm/bun.)
- **Database:** SQLite — a single local file. No database server to run.
- **DB access:** `better-sqlite3` directly. **No ORM.**
- **Styling:** Tailwind CSS 4.
- **UI components:** shadcn/ui. The data table specifically uses shadcn's
  data-table pattern built on **TanStack Table** — this is the well-trodden path
  for exactly this kind of searchable/sortable/paginated table. Use it.
- **Tests:** Node's built-in `node:test`, run directly on `.ts` files. No test
  framework, no config file. Requires Node ≥ 22.18 for TypeScript type-stripping.
  Tests that need the real database skip visibly when it is absent, so a clone runs
  green without pretending to have verified anything.

Do not swap any of these out without discussing it with the user first.

**Why no ORM.** Drizzle was the original choice and was dropped on 2026-07-29
after being evaluated against the real database. Every column in this schema is
`TEXT`, so an ORM infers `string | null` for all of them — exactly what the driver
already returns, meaning zero type information gained. Worse, `drizzle-kit pull`
writes a migration journal, which puts `migrate`/`push` one typo away from a
schema this app must never touch (§6). Typing is handled instead by the coercion
layer described in §6, which validates values and fails loudly with the offending
column named — something an ORM's read-transform cannot do, because it sees one
value at a time with no sibling context.

---

## 3. Architecture & data flow

The source data lives on **UChicago Midway 3 (an HPC cluster)**. We **cannot** hold
a live connection to it. So:

```
Midway 3 (source DB / export + the pipeline's MEME output tree)
        │
        │  periodic sync (a standalone script, run occasionally)
        ▼
data/  ◄─── our source of truth for the running app
  pipeline_db.db     the SQLite file: rows
  meme/              a directory tree: motif logo images
        │
        │  read-only, both behind the same data seam (§4)
        ▼
Next.js app  ───►  users' browsers
```

Key consequences — keep these true at all times:

- **The Next.js app only ever READS from `data/`.** It never writes there, and never
  talks to Midway directly.
- **The sync is a separate concern** from the web app. It's a standalone script
  (see §5) that rebuilds/refreshes the local SQLite file on demand or on a schedule
  (e.g. cron). Don't entangle sync logic with page-rendering logic.
- The dataset is **read-mostly and updates infrequently.** Optimize for fast reads
  and simple code, not for concurrent writes.

---

## 4. Directory structure

Conventional Next.js App Router layout. What exists today:

```
/app                    # routes (App Router)
  /layout.tsx           # root shell only — fonts, globals, <html>
  /(public)/            # route group: shared chrome, NOT a URL segment
    layout.tsx          # public nav + footer
    page.tsx            # / — the lab's landing page
    research|people|publications|contact/page.tsx
  /insiders/            # a REAL segment: the protected path prefix
    layout.tsx          # insiders nav — chrome, not a guard (see below)
    page.tsx            # /insiders — the hub
    protocols|inventory/page.tsx
    data/               # everything that reads research data lives here
      page.tsx          # the browse table
      [sample]/page.tsx # the detail page
      motif/[sample]/[image]/route.ts
/lib
  /data                 # THE DATA SEAM — see below
    /types.ts           # QcRun row type + the per-column spec it derives from
    /coerce.ts          # TEXT -> typed values, missing markers, comparators
    /sqlite.ts          # reads the database, read-only
    /motifs.ts          # reads the MEME logo tree, read-only
    /motif-images.ts    # leaf: the closed set of images + their types, no imports
    /index.ts           # the public surface — see below for all six exports
    /*.test.ts          # tests sit beside their subjects
  /display              # how values read on screen: labels, format, grouping, motif geometry
  /site                 # nav as data, the roster, plus the structural boundary guards
    /lab.ts             # the lab's name, address and contact email — the one source
    /nav.ts             # the nav lists, INSIDERS_PREFIX and INSIDERS_LABEL
    /people.ts          # the roster grouped by role, plus text-only alumni
    /gallery.ts         # the hero and research photographs: alt, size, crop focus
    /research.ts        # the research statement, shown on two pages
    /residue.test.ts    # fails on any Zhang-lab token in served source or public/ names
    /publications.ts    # PMID order + human overrides; merges the generated records
    /publications-records.ts  # GENERATED by scripts/publications.mjs — do not edit
  /table                # ordering, search, filtering, column defs
                        # (JSX-free so node --test can import them)
    /filters.ts         # which columns are filterable, predicates, chips
    /filter-url.ts      # filter state <-> query string, both directions
/scripts                # standalone tools, run by hand — never part of the build
  /publications.mjs     # regenerates publication metadata from Europe PMC
/db                     # artifacts ABOUT the data, which this repo owns
  /schema.sql           # committed DDL snapshot, zero rows
  /fixture.ts           # builds a fabricated database and MEME tree for tests
/public                 # web-served static assets, COMMITTED — see the note below
  /people/              # six headshots, whole frames, downscaled only
  /home/                # four photographs for the landing page's hero grid
  /research/            # one photograph for the research page
/data                   # gitignored wholesale — never committed
  /pipeline_db.db       # the real SQLite database
  /meme/                # the pipeline's MEME output tree, <sample>/{summits,peaks}/
  /mock/                # the tab-separated mock export (retired; kept as a record)
/docs
  /build-ladder.md      # what gets built, in order (§7)
  /deferred-decisions.md
  /plans/, /brainstorms/
```

Planned but not yet built: `/scripts/sync.ts` (§5), `/app/error.tsx`, and any
authentication (all in the register).

**Two structural rules about that tree, both easy to get wrong.**

The asymmetry between `(public)` and `insiders` is deliberate: a route group cannot
create a URL prefix, and a URL prefix is the only thing a path-matching guard can use —
so the protected side must be a real segment. The public side wants shared chrome and
*not* a prefix, which is exactly what a group is for.

**A layout is not a boundary.** Route handlers do not participate in layouts, so
`insiders/layout.tsx` never runs for the motif image route beneath it. A guard attached
to the layout would protect the pages and serve 200 research images to anyone. What is
enforceable is the shared `/insiders` path prefix. `lib/site/boundary.test.ts` holds
this by reading the tree: the seam stays confined to `insiders/data/`, nothing outside
`insiders/` resolves into the prefix, and the prefix itself is hardcoded in exactly one
constant.

`/db` holds things *about* the database rather than app code — the schema snapshot
and the test fixture builder. Nothing under `/db` is imported by the app; only by
tests. No database file is ever committed: the fixture is fabricated and written to
the OS temp directory, so the tree-wide `*.db` ignore rules stay untouched.

**`/public` is committed, and that is not a contradiction of "no data in the repo."**
The rule in §9 is about *research* data — the pipeline's output, which lives only in
gitignored `data/`. Headshots are site content, like the wordmark: the public pages
cannot render without them, so they belong in version control. Two consequences worth
keeping straight. Everything here is served at a guessable URL with no access check,
so a photo of someone no longer on the roster stays downloadable after their name comes
off the page — `lib/site/people.test.ts` fails on any file in `public/people/` that no
member claims, which is what keeps that from happening quietly. Former members are a
text-only list for the same reason: they carry no photo field at all. `gallery.test.ts`
holds the same both-directions rule over `public/home/` and `public/research/`, so every
committed photograph directory has one. And git keeps every byte forever, so images are
downscaled before they land here rather than after, and both tests cap any single file at
500KB so a raw camera file cannot be committed by accident.

**A member with no photograph is `photo: null`, never a shared placeholder file.** The page
draws the lab's mark in the same 4:5 frame instead, labelled with the member's name, and
`people.test.ts` pins exactly who has no photo so a missing one is always a deliberate edit.

**The headshots are whole frames, and the crop is deliberately generic.** Each is its
original photograph, downscaled only; what the 4:5 frame on the page shows is whatever CSS
`object-cover` takes from it, biased slightly upward because heads sit above centre in most
portraits. An earlier pass cropped each one to a hand-picked box so every face landed at the
same scale, which is genuinely better when the boxes are right and worse than nothing when
they are not — several were wrong. Framing is a judgement to be made by someone looking at
the photographs, so the code does not try. Until those crops exist the page shows
heads-and-torsos, and some candid shots show a good deal of landscape.

The people page is also where the site's **labelled-row layout** comes from: a section rule
spanning the measure, the role label in a 168px left column that pins as you scroll past its
group, and the content beside it. It replaced four stacked full-width label bands. The
measurement that drove it is worth keeping: with circular portraits the photographs (nine,
on the Zhang roster it was measured on) occupied 18.2% of the page's area — effectively ~14%, since a circle keeps only 78.5% of its
box and discards precisely the corners where heads and shoulders sit. The 4:5 frames put that
at 31.9%. If a future change makes the images smaller again, that is the number to check.

**The data seam is the most important structural rule here.** Everything above
`lib/data/index.ts` depends only on the row type and the seam's six exports:
`listRuns()` / `getRun(sample)` for QC rows, and `listMotifs()` / `getMotifs(sample)`
/ `readMotifBytes(sample, image)` / `MOTIF_IMAGES` for motif logos. No page,
component, or test above the seam may reference a file path, a SQL query, a table
name, or the string `"NA"`. That is what makes changing the data source a one-module
change. If you find yourself importing `better-sqlite3` anywhere outside
`lib/data/` — the `db/` test-fixture builder being the one sanctioned exception —
stop. A test pins the seam's export list, because a boundary's value is being small
enough to read.

**There are two sources behind that one boundary**, and the motif one is deliberately
*not* fields on `QcRun`. That type derives from a spec of all-TEXT database columns
with missing markers and coercion rules; a filesystem-derived object carrying pixel
dimensions has none of those properties. The seam is the module, not the row type.

**A client component must not reach the seam.** `lib/data/index.ts` pulls in
`better-sqlite3`, so importing it from anything marked `"use client"` — even for a
constant — drags the driver into the browser bundle and fails the build. Shared
vocabulary lives in leaf modules with no imports (`types.ts`, `motif-images.ts`) that
either side may import; the seam re-exports them so its surface still reads as one
place.

Other conventions:

- **Default to React Server Components** (the App Router default). Only mark a file
  `"use client"` when it truly needs browser interactivity (e.g. the interactive
  table controls). Keep client components small and push data fetching to the server.
- Inside `lib/`, imports are relative and carry explicit `.ts` extensions — `npm test`
  runs under plain `node`, which does not resolve the `@/*` alias. From `app/`, use `@/`.
- Never commit the SQLite file or any secrets. `/data/` and `.env*` are gitignored,
  with `*.db` / `*.sqlite` backstops tree-wide.

---

## 5. The data sync (`/scripts/sync.ts`)

This is the piece that keeps the local SQLite file up to date from Midway. **Not
built yet** — it is the last rung of the ladder (§7).

- It runs **outside** the web app, occasionally (manually at first, later on a cron/schedule).
- Preferred approach: read a **periodic export/dump** from Midway (a file we can
  fetch or copy) and rebuild the local SQLite tables from it. Only attempt a direct
  DB query if a connection is actually available.
- **Two things to sync, not one.** The database *and* the MEME logo tree under
  `data/meme/`. They must stay consistent with each other: the app locates a sample's
  logos from the `meme_summits_dir` the database records, so a refreshed database
  paired with a stale tree fails loudly rather than silently mismatching. Whether the
  sync copies the whole tree or a declared subset is an open register entry.
- It should be **idempotent**: running it twice in a row leaves a correct database,
  not duplicated rows. Rebuild-from-scratch is fine and simplest for a small dataset.
- If the source is unreachable, it should **fail loudly and leave the old data
  intact** rather than wiping the file. The website must keep working on stale data.

The exact Midway access method (SFTP pull, mounted path, scheduled export, etc.)
is **not decided yet** — treat it as a TODO and ask the user before hardcoding it.

**Gotcha if the sync swaps files.** Replacing the database by `mv`-ing a new file
over the old one leaves any long-lived connection holding the *old* inode, serving
stale rows indefinitely with no error and no signal — `PRAGMA data_version` does
not fire, because it only reports changes to the file the connection still holds.
If the sync swaps files rather than writing in place, the app must notice (watch
the path's inode/mtime and reopen) or be rebuilt.

The app side of this is already handled: the seam opens a connection per call and
closes it, so it never holds a stale inode, and it resolves both paths per call rather
than at import. What remains is the prerendering — the browse route, the detail pages
*and* the ~200 motif images are all baked at build time, so a sync still needs a
rebuild or a revalidation strategy to become visible. That choice is an open register
entry, and M7 raised what rides on it.

---

## 6. The data model / domain

The database has **two tables**, both created and populated by the Snakemake
pipeline's Python logging script — **not** by this app. Treat the pipeline as
the owner of the schema; the web app only READS these tables.

> **Never run schema migrations against this database.** No `migrate`, no `push`,
> no generated DDL. The pipeline owns the schema. We deliberately do not install
> tooling that could do this (§2).

> **The specific facts below describe the Zhang lab's run, not the O'Malley lab's.** The
> browser was built and measured against a Zhang-lab database: 109 samples, one `output_dir`,
> nine zero-byte logos, the TGIF2/TP53/HALO names, the per-column missing-value counts. No
> O'Malley database has been placed in `data/` yet. The schema and the mechanisms (the
> missing-value rules, the coercion layer, the motif layout) are the pipeline's and should
> carry over. The numbers will not, and the real-data tests that pin them will fail
> against a different run until they are recalibrated. See the register entry "Real-data
> tests and §6 facts are pinned to the Zhang run". Do not rewrite these as O'Malley facts
> until someone has measured them.

### How the data is stored (this affects every query)

- **Every column is TEXT**, including numbers, dates, and booleans. That's how the
  pipeline declares them.
- **Missing values use two different markers, inconsistently.** The string `"NA"`
  appears in `alignment_rate`, `subsampled_frags`, `motif_peaks`, and
  `max_peak_score`; the **empty string** appears in `max_frags`, `gdna_batch`,
  `control`, and `experiment_date`. Handle both.
- **Empty does not always mean "missing."** `control` is blank precisely *because*
  `is_treatment` is `"0"` — a control sample has no control, which is correct
  rather than absent. `max_frags` is blank because subsampling was disabled for
  the run. Only `experiment_date` and `gdna_batch` are genuinely unknown.
- **`is_treatment` is text `"0"` / `"1"`**, not a real boolean. It is authoritative:
  do not infer controls from sample naming. One `HALO*`-named sample is a treatment.
  The UI labels the column **Sample Type** and renders the digits as **Control** /
  **Treatment**, but the stored value is unchanged and remains what code branches on
  — see `lib/display/labels.ts` and the labelling entry in the register.
- **Two date formats coexist.** `experiment_date` and `gdna_batch` are `M/D/YY`;
  `run_date` is an ISO 8601 datetime recording when the pipeline logged the run.
- **Four columns the QC export shows are not in the database.** Three of them are
  the same problem: the pipeline computes them and its logging script does not write
  them. `frip` and `frip_filt` are derived as `reads_in_peaks / mapped_reads × 100`
  as a stopgap. `num_peaks_bl` cannot be derived, so it reads as absent — note it is
  only *computed* when the blacklist is enabled, but the blacklist WAS on for this
  run: the same export that omits it from the database carries 109 values for it.
  All three are in the register's upstream section. `num_peaks_rmsk` is different —
  it does not exist anywhere, and is not in the row type.
- Because numbers are stored as text, **SQL sorts them alphabetically** (`"10"`
  before `"9"`). Don't work around this per query — the seam coerces to real
  numbers and dates once, and exports a comparator that keeps missing values in
  one terminal position regardless of sort direction. Use it.

### Tables

Both tables share a composite join key: **(`output_dir`, `sample`)**. There's no
declared foreign key, and no indexes at all — join on both columns by convention.
They are 1:1 with no orphans in either direction.

**Caveat on the key:** only **one** distinct `output_dir` exists today, which makes
the composite key degenerate and `sample` unique by accident rather than by
guarantee. `sample` is currently the record key and detail-page URL slug. A second
run directory would break that; see the register.

**`pipeline_runs`** — one row per sample per run: QC metrics + the parameters
the pipeline ran with. 33 data columns plus `id`.
- Run parameters: `run_date`, `output_dir`, `genome_ref`, `genome_size`,
  `control`, `threads`, `mapq`, `max_frags`, `macs3_format`,
  `macs3_foldch_levels`, `macs3_meme_foldch_level`, `meme_nmotifs`, `meme_minw`,
  `meme_maxw`, `meme_maxpeaks`, `fimo_thresh`. These are **run-level**: every one
  holds a single identical value across all rows, so they are not useful as table
  columns.
- Sample identity: `sample`, `r1`, `r2`, `is_treatment`
- QC metrics (numbers-as-text): `total_reads`, `trimmed_reads`, `mapped_reads`,
  `alignment_rate`, `reads_in_peaks`, `reads_in_peaks_filt`, `max_peak_score`,
  `mapping_pct`, `motif_peaks`, `subsampled_frags`, `median_frag_size`,
  `num_peaks`, `num_peaks_filt`
- Plus an auto-increment `id` primary key.

**`run_metadata`** — one row per sample per run: provenance + every input/output
file path. 25 data columns plus `id`.
- Join keys: `output_dir`, `sample`
- Provenance: `author`, `run_date`, `experiment_date`, `gdna_batch`
- Reference paths: `genome_ref`, `gene_annotation`
- Raw inputs: `r1`, `r2`
- Generated paths: `trimmed_r1`, `trimmed_r2`, `bam`, `bigwig`,
  `peaks_narrowpeak`, `peaks_filt_narrowpeak`, `summits_bed`, `summits_fasta`,
  `peaks_fasta`, `meme_summits_dir`, `meme_peaks_dir`, `fimo_summits_tsv`,
  `fimo_peaks_tsv`, `homer_annotations`, `report_csv`
- Plus an auto-increment `id` primary key.

All paths are Midway absolutes (`/project/...`), so the app can display them but
cannot link to or serve them.

### The MEME logo tree (`data/meme/`)

Not in the database — a directory tree the pipeline writes, copied to `data/meme/`.
It is the pipeline's own output with the Midway prefix swapped, laid out as
`<sample>/{summits,peaks}/`. Each panel holds `logo1.png`, `logo_rc1.png`,
`logo2.png`, `logo_rc2.png` (because `meme_nmotifs` is `"2"`), the `.eps`
equivalents, and `meme.{html,txt,xml}`. The app reads only the two summits PNGs; the
rest is provenance.

Four things to know before touching it:

- **Never hardcode the layout.** `run_metadata.meme_summits_dir` records the path for
  every sample, and all 109 values end in `<sample>/summits`. The reader derives the
  local directory from the last two segments of that value and asserts the
  second-to-last equals `sample`, so a pipeline reorganisation fails loudly instead
  of producing 109 broken images.
- **Nine `logo1.png` files are zero bytes, not absent.** That is MEME reporting it
  found no motif — seven HALO controls, which have none by construction, and two
  treatments whose search came back empty. Same pattern as blank `control` above:
  empty is a recorded outcome, not a missing value. An *absent* file is a broken
  tree and throws.
- **`motif_peaks` does not tell you which nine.** It is `"NA"` for twelve samples and
  three of those — `TGIF2_amp`, `TP53_LH`, `TP53_amp` — have real motifs, because it
  counts FIMO hits rather than recording whether MEME found anything. Availability
  comes from the filesystem only. `is_treatment` is no help either: `HALO_LH` and
  `HALOa_b2` are controls that do have motifs.
- **Logos are a constant 358px tall and 404–1664px wide**, since width tracks motif
  length. Anything that constrains width instead of height renders an 8bp and a 32bp
  motif at different letter scales and destroys the comparison. See the register.

Domain context: this is **DAP-seq** data — where transcription factors bind
across a genome. `pipeline_runs` is what the main browse table shows; the
per-record detail page joins to `run_metadata` on (`output_dir`, `sample`)
to show file paths and provenance, and shows the motif logo above both.

---

## 7. How work is sequenced

Two documents govern what gets built and what has been consciously postponed.
Read both before starting a piece of work; they are short by design.

- **`docs/build-ladder.md`** — an ordered list of milestones, each ending in an app
  you can open in a browser. It also carries the gates that apply to every
  milestone (open it in a browser before calling it done; read the bundled Next.js
  docs before writing against a Next API; one commit per milestone; work in order
  or record the reorder).
- **`docs/deferred-decisions.md`** — every decision deliberately deferred, with why
  and what would force it. Also an upstream section for things that belong to the
  pipeline rather than this app. A decision leaves the register by being made and
  recorded, never by being forgotten.

Plans live in `docs/plans/`, brainstorms in `docs/brainstorms/`. When something in
this file turns out to be wrong, fix it here and note it in the register — that is
what happened to the ORM choice and the missing-value rules above.

---

## 8. Commands

```bash
npm run dev        # start the local dev server (usually http://localhost:3000)
npm run build      # production build
npm run start      # run the production build locally
npm run lint       # check for code problems
npm run typecheck  # tsc --noEmit — the only thing that actually checks types
npm test           # node --test over lib/data/ and db/

npx shadcn@latest add <component>   # add a shadcn/ui component (e.g. table, input)
```

`GENOME_BROWSER_DB` overrides the database path; `GENOME_BROWSER_MEME_ROOT`
overrides the MEME tree. Unset, the seam looks in `data/pipeline_db.db` and
`data/meme/` relative to the working directory. Both are resolved per call, not at
import, and the seam's own tests point them at fabricated fixtures — which is how
`listRuns`/`getRun`/`listMotifs` have coverage on a machine with no research data.

`npm test` runs TypeScript directly through Node's type-stripping, which *erases*
types rather than checking them — so a type error passes the tests. `npm run
typecheck` is what catches it. Run both.

**Two things only `npm run build` can tell you.** It needs both `data/` sources present,
and it is where a Suspense-boundary mistake surfaces: `useSearchParams` in a client
component on a prerendered route fails the build while working perfectly under `npm run
dev`, which renders on demand. The browse table deliberately avoids that hook — see the
URL-state entry in the register — but the trap applies to anything that reaches for it.

The browse table is at **`/insiders/data`**, not `/`. The site root is the public
landing page.

**`npm run start` reads neither source.** The browse route, the detail pages and the
motif images are all prerendered, so the production server serves baked output (313
entries against the Zhang run's 109 samples; the count follows whatever database is in
`data/`). Use `npm run dev` when you need to exercise a read
path or see a data error. Conversely `npm run build` now needs *both* `data/` sources
present, where it used to need one.

There is no migration tooling and there should never be (§6). The sync script (§5)
is not built yet, so it has no command.

When you tell the user to run one of these, say what it does and what success looks like.

---

## 9. Guardrails / gotchas

- **Read-only web app.** Pages read SQLite; they never write to it or to Midway.
- **Nothing above the seam knows where data comes from.** See §4. This is the rule
  that makes the data source swappable, and it is easy to break by accident.
- **Fail loudly; never substitute a plausible value.** A silent `null` is
  indistinguishable from legitimately missing data, and an empty list renders as a
  legitimately empty table — so both hide the bug instead of showing it. When a
  value doesn't parse or a file is absent, throw and name the column, value, or path.
- **Don't break the browse table.** Search, sort, and pagination on the main table
  are the whole point of the app. Test that they still work after changes.
- **No secrets in the repo.** Any Midway credentials or paths go in `.env` (gitignored).
- **No research data in the repo, ever.** `/data/` is gitignored wholesale. A
  consequence worth remembering: the database exists only on the machine that put
  it there, so a fresh clone, a worktree, or CI has no data at all.
- **Stale-but-working beats fresh-but-broken.** A failed sync must never take the
  site down.
- **When unsure, ask in plain English.** The user can't catch a wrong assumption by
  reading the code, so surface assumptions instead of burying them.
