# Deferred Decisions

Decisions consciously postponed, with the reason and what would force them. A
deferred decision that lives only in conversation is indistinguishable later from
one nobody thought about — so it goes here instead.

**How entries leave:** by being made and recorded, never by being forgotten. A
resolved entry moves to [Resolved](#resolved) with the decision and the date.
Entries are never deleted. If an entry no longer seems to matter, that is itself a
decision — record it as one.

Milestone references (M1–M9) point at [build-ladder.md](build-ladder.md).

---

## Open



### How the all-empty columns are handled

**Decision:** What to do with columns that carry no values for this run —
`subsampled_frags` and `alignment_rate` (both `"NA"` in all 109 rows) and
`num_peaks_bl` (computed by the pipeline but not logged, so no source at all).

**Why deferred:** Inspecting the database reframed this. None of the three is broken
or unused, but they are empty for two different reasons. `subsampled_frags` and
`alignment_rate` are empty because the features that populate them were switched off
for this run: `subsampled_frags` is `"NA"` and its parameter
`max_frags` is blank, so subsampling was disabled. `num_peaks_bl` is a different
case that was initially misdiagnosed here as the same one: it is absent from the
database because the logging script does not write it, not because the feature was
off. The mock export is provably the same run — all nine shared numeric columns
match on every one of the 109 rows and `frip` reproduces exactly — and it carries
109 non-`"NA"` `num_peaks_bl` values. So the blacklist was on. It stays declared in
the row type and reads as absent, and the fix is upstream. `num_peaks_rmsk` was
removed outright: it exists in neither table, so there is nothing to decide.

That means the real question is not "hide or show a dead column" but "how does
the browse table represent a pipeline feature that was not run" — which will
differ per run rather than being fixed once.

**What would force it:** Already partly forced — all three render as conspicuously
empty columns now that the browse page reads the database. A future run with these
features enabled would populate them and settle it.

### How failures surface in production

**Decision:** Whether the app needs an `error.tsx` boundary, and what it should say.

**Why deferred:** M5 made the read path fail loudly and verified it — a missing
database returns a 500 with no table rather than an empty one, and the thrown
message names the path and explains the gitignore consequence. But that message
only reaches the server log. There is no `app/error.tsx`, so a production build
renders Next's scrubbed "server-side exception" page, and the guidance a reader
needs to fix their setup is invisible to them. Under `next dev` the overlay shows
it, which is why this was easy to miss.

**What would force it:** Anyone other than the author running the app, or a
deploy. M2 is the natural place, since it is already working in this layer.

**Raised by M9 (2026-08-04):** there is now a public audience. A scrubbed
"server-side exception" page on the lab's landing page is a different kind of problem from one
on an internal browser, and the public pages fail for entirely different reasons than the data
routes do — they have no data dependency at all.

### Whether to check the schema against the committed snapshot

**Decision:** Whether a check compares the live database's column set against
`db/schema.sql`, and where it runs.

**Why deferred:** M5 committed the snapshot and builds the test fixture from it,
which means the fixture can silently drift: a pipeline column addition leaves the
snapshot stale, and on a clone the whole suite can pass green against a schema that
no longer exists. A machine-local comparison would close that, and was deliberately
left out of M5's scope rather than forgotten. Note what it would *not* catch — the
drift that actually threatens this app is semantic, like `frip`'s denominator
moving upstream, and a column-set diff cannot see that.

**What would force it:** The pipeline changing the schema, which structural drift
would otherwise surface only as a `no such column` error at read time.

### How precise the row type should be

**Decision:** Whether `QcRun` should narrow the fields that can never actually be
null, and whether columns with a known value set should validate against it.

**Why deferred:** Both are deliberate looseness, surfaced by review. Seventeen
fields — `is_treatment` and the 16 file paths — declare no missing marker and so can
never be null, yet the type says `T | null`, which makes every consumer write a dead
null check. The uniformity was chosen so that a column becoming nullable upstream is
not a breaking change, and that reasoning still holds; the cost is precision. On the
other side, `is_treatment` accepts any non-empty string, so a pipeline that started
writing `"True"` would produce a plausible-looking row rather than a loud failure.
Adding a `oneOf` to the column spec would close that but grows the spec surface.

Both are worth deciding together, since they pull in opposite directions: one wants
the type looser than the data, the other wants it tighter.

**What would force it:** M2 or M3 writing dead null checks often enough to be
annoying, or a pipeline change to a small-value-set column.

### What immutability the seam promises

**Decision:** Whether rows should be deeply frozen rather than shallowly.

**Why deferred:** `Object.freeze` on a row is shallow, so the `Date` objects behind
`experiment_date` and `gdna_batch` stay mutable even though the fields are
`readonly` and the row is frozen. Nothing mutates them today. The failure mode is a
formatter that normalizes a `Date` in place, which would corrupt the value for every
later reader in the same request.

**What would force it:** Any code that touches a `Date` from a row rather than
reading it. A display formatter is the likely first one, at M2.



### The Midway access method

**Decision:** How the sync script reaches Midway 3 — SFTP pull, mounted path,
scheduled export dropped somewhere readable, or something else.

**Why deferred:** Genuinely undecided, and it depends on access we have not yet
established. Hardcoding a guess would be worse than leaving it open.

**What would force it:** M6. Nothing before it needs an answer, since the app
never contacts Midway.

### `sample` as the record key and URL slug

**Decision:** Whether `sample` remains the record identifier and detail-page slug.

**Why deferred:** It holds in the real database — `sample` is distinct across all
109 rows in both tables, and every value matches `[A-Za-z0-9_.-]+`, so they are
URL-path-safe with no encoding. But it holds for a fragile reason: the database
contains exactly **one** `output_dir`, which makes §6's documented composite key
`(output_dir, sample)` degenerate. So `sample` is not proven unique — it is unique
*within a single run directory*, and nothing observed so far says two runs could
not both contain a `TP53_b2`.

**What would force it:** A second `output_dir` arriving. That is the specific
event to watch, and it would change detail-page URLs and the seam's `getRun`
signature together. Worth deciding before then rather than during.

### How the app picks up new data after a sync

**Decision:** What makes the browse page reflect a refreshed database —
revalidation, a rendering mode that reads per request, or simply rebuilding as
part of the sync.

**Why deferred:** Discovered while building M1: `next build` prerenders the
browse route as static content, so the rows are baked in at build time. That is
the right default for data this read-mostly, and it costs nothing today because
the mock export never changes. But it means a sync alone would not change what
visitors see. Choosing between revalidation and a rebuild step depends on how the
sync ends up being triggered, which is itself deferred to M6.

**What would force it:** M6 landing the sync script, or deploying anywhere the
data refreshes without a rebuild.

**Raised by M7 (2026-08-03):** the same question now has a second answer riding on
it. Motif logos are served by a route handler prerendered at build time, so ~200
image responses are baked alongside the rows. A sync that adds logos changes nothing
a visitor sees until a rebuild — and the *build itself* now needs both `data/` sources
present, where before it needed one. That does not change the question, but it raises
what turns on it.


### Whether the MEME tree gets a declared manifest

**Decision:** Whether the files the app depends on inside `data/meme/` are declared
somewhere checkable, the way `db/schema.sql` snapshots the database's shape.

**Why deferred:** M7 closed the sharp edge of this without closing the question. The
two files the app reads now fail loudly when absent — a dropped `logo1.png` breaks the
build naming the sample and path, rather than rendering 108 logos and one silent gap.
But nothing states the *set* of files that matters, so a sync could copy a subset that
happens to satisfy today's reader and not tomorrow's. The tree is also 270MB of which
the app uses about 8MB, so a manifest would double as the sync's copy list.

**What would force it:** M6 deciding what the sync copies, or adding the `peaks`
logos and motif 2 — at which point the implicit set grows from two files to six.

### Whether the `peaks` logos and motif 2 are ever shown

**Decision:** Whether the browse table and detail page grow beyond the summits
motif 1 logo and its reverse complement.

**Why deferred:** Everything needed is already there. `meme_nmotifs` is `"2"`, so the
100 samples with a motif each have `logo2.png` and `logo_rc2.png`, and a full `peaks/`
directory sits beside `summits/` with the same 109-sample coverage. The image
identifier set is closed precisely so adding either is one entry plus one column
rather than a rewrite. It was left out because two logos per row is already 528px of
table width and nobody has yet asked to compare summit motifs against peak motifs.

**What would force it:** Anyone wanting that comparison, or a run where the second
motif turns out to carry the signal.

### Whether to generate logo thumbnails at sync time

**Decision:** Whether the sync writes small versions of each logo, instead of the app
serving and the browser scaling the full 404–1664px originals.

**Why deferred:** Not a problem yet, and measuring said so. The 200 served logos total
about 8MB, `loading="lazy"` means a 50-row page fetches only what is scrolled past,
and pre-computed dimensions stop the table shifting as they land. `next/image` was
rejected for this (see the resolved entry), so thumbnails are the remaining lever if
page weight ever does bite — and generating them at sync time keeps the app static.

**What would force it:** A page-size measurement that hurts, or a dataset several
times larger than 109 samples.

### Whether the facet/threshold split survives a different run

**Decision:** Which columns get a pick-from-a-list control rather than a bound.

**Why deferred:** The split is calibrated on one run's cardinality and is a bet, not a
property of the schema. `gdna_batch` has a facet because 109 samples came from three
batches; `experiment_date` because they span eight days. A run with forty batches turns
that facet into a scroll, and a run with two dates makes `motif_peaks` — currently 28
distinct values and a threshold — arguably facetable instead. The `~15 distinct` boundary
between the two is a judgment: nothing in today's data sits near it, so the data cannot
test it.

A test caps facet cardinality against the real database, so crossing the line fails
loudly rather than shipping an unusable control. That converts the bet into a tripwire
but does not decide what to do when it fires.

**What would force it:** A run where a facetable column's distinct count grows past a
scannable list — the test is what will say so.

### The flash of unfiltered rows on a shared filtered link

**Decision:** Whether opening a filtered URL should avoid briefly showing the full table.

**Why deferred:** A consequence of keeping the table prerendered (see the resolved
URL-state entry). Filters are read from `window.location.search` in an effect, so a
visitor arriving at a filtered link sees all 109 rows for the frame before it runs. The
alternative measured worse: `useSearchParams` removes the flash and takes the entire table
out of the prerendered HTML for *every* visitor, including everyone who arrives unfiltered.

It is a narrow cost — the unfiltered view is a valid page rather than a broken one, and
only people who opted into a filtered link see it. Fixing it properly means making the
route dynamic or rendering a skeleton, both of which cost more than the flash does.

**What would force it:** Filtered links becoming the normal way people arrive, or a
dataset large enough that the unfiltered first paint is slow rather than merely wrong.

### How the insiders area is actually protected

**Decision:** What enforces the password on `/insiders` — middleware, a hosting feature,
an edge function, something else.

**Why deferred:** The user asked for the structure first and said explicitly that the setup
is unknown. Choosing a mechanism against an unknown hosting target would be guessing.

**What the structure already committed to, and why it constrains the answer.** Everything
protected shares the `/insiders` path prefix, and the mechanism must be able to match a path
prefix — because a **layout cannot** be the enforcement point. Route handlers do not
participate in layouts, so the motif image route beneath `insiders/` never renders through
`insiders/layout.tsx`; a layout-based guard would cover the pages and serve 200 research
images to anyone. Any per-page or per-component approach has the same hole.

There is a second constraint worth having in view when the choice is made: this site
prerenders 321 entries and serves them as static files. A protected page that is a static
file needs something in front of it, which rules out approaches that assume a server renders
every request.

**What would force it:** Anyone outside the lab being able to reach the site. Until then the
insiders area is a naming convention, and `CLAUDE.md` §1 says so plainly so nobody assumes
otherwise. Since the O'Malley conversion there is a second, nearer trigger: the first O'Malley
pipeline database copied into `data/` is served to anyone who can reach the site, and some of
it may be unpublished.

### Real-data tests and §6 facts are pinned to the Zhang run

**Decision:** When and how to recalibrate the browser's run-specific facts for the O'Malley
lab's data.

**Why deferred:** This site was converted from the Zhang lab's, and the browser was built and
measured against a Zhang-lab database. No O'Malley database exists in `data/` yet, so there is
nothing to measure. Rewriting the facts as guesses would be the plausible-value substitution
§9 forbids.

**What is pinned:** the real-data tests skip without `data/` and will fail against a different
run.
- `lib/data/sqlite.test.ts` asserts 109 rows and exact per-column null counts.
- `lib/data/seam.test.ts` asserts 109 runs and nine samples with no motif, and reads
  `TGIF2_NWaug`.
- `lib/data/motifs.test.ts` names the nine motif-less samples and the three `motif_peaks`
  exceptions.
- `lib/table/filter-integration.test.ts` pins `TGIF2_amp`, `TP53_LH` and `TP53_amp`.
- `lib/table/filters.test.ts` has four tripwires whose form is generic but whose thresholds
  were set on that run.

There is also code that misbehaves rather than throws: `TABLE_HIDDEN_BY_DEFAULT` in
`lib/display/column-groups.ts` hides three columns because they were empty in that run, and
the facet/threshold split (see its own entry) was chosen against it. `CLAUDE.md` §6 carries
the same facts and now says whose run they describe.

**What would force it:** the first O'Malley database and MEME tree in `data/`. Run `npm test`
with them present. The failures are the list of facts to re-measure, and the schema and
coercion layer will fail loudly on the first value that does not fit.

## Upstream — pipeline follow-ups

Work that belongs to the Snakemake pipeline rather than this app. The pipeline owns
the schema; these are things this app noticed and cannot fix from here.

### `frip`, `frip_filt` and `num_peaks_bl` should be logged

**What:** None of the three exists in `pipeline_runs`, though all appear in the QC
export the pipeline produces. The logging script should write them alongside the
other QC metrics.

`num_peaks_bl` is the one that actually loses data. `frip` and `frip_filt` can be
recomputed from columns the database does have; `num_peaks_bl` cannot be derived
from anything, so it reads as absent for every row and the peak funnel loses its
third stage. It is worth confirming while looking at the logging script whether the
omission is deliberate — the column is only *computed* when the blacklist is
enabled, but it was enabled for this run, so conditionality does not explain the
absence.

**Why it matters:** The app derives them as
`reads_in_peaks / mapped_reads × 100`, which reproduces the export **to two
decimals** on all 109 rows — the worst row diverges by 0.005, so an equality test
against the exported values would fail. A working stopgap, not a blocker. The problem is that the
definition then lives in two places. If the pipeline ever changes what FRiP means
— a different denominator, or computing it from filtered reads — the app keeps
returning its own number and nothing fails. A wrong metric that still renders is
worse than a missing one.

**Until then:** the seam derives both, and the formula in `lib/data/sqlite.ts`
carries a comment pointing here so the next reader knows it is a stopgap rather
than the intended source.

---

## Resolved

### Which columns to display

**Decided:** 2026-07-30.

**Decision:** 18 of 37 shown by default, all 37 available from a Columns control.
Hidden by default: the 16 file paths and the three metrics with no value for this run
(`alignment_rate`, `subsampled_frags`, `num_peaks_bl`). `sample` cannot be hidden — it
is the row's identity and its link to the detail page.

**Why:** the choice was reframed rather than just answered. The register asked *which*
columns to display, as a static pick; for a data browser the right shape is a defensible
default plus a control, so nothing is deleted and the reader can reach anything. The
default follows measurement: the table was eight screens wide, the paths were ~80% of
that while sharing one long prefix and varying only by a sample name already in column
one, and a global search over them was low-signal for the same reason. They read
properly on the detail page, which is why hiding them costs nothing. Result: 1.4 screens
instead of 8.2.

### How the table stays readable at 37 columns

**Decided:** 2026-07-30.

**Decision:** The table scrolls internally with a sticky header and a pinned `sample`
column. No row striping — with 18 columns and an anchored identity it was not needed,
and shadcn's default has none. The pinned column shows a soft gradient edge rather than
a hairline, and only once there is something hidden to its left.

**Why the gradient rather than a border:** values scroll *underneath* the pinned column,
so a clipped `99531670` reads as a perfectly plausible `9531670`. A hairline says "next
column"; a soft edge says "this value continues beneath". That is the difference between
a misread figure and an obviously obscured one, which matters more in a QC table than
it would in most.

### How `frip` is formatted

**Decided:** 2026-07-30.

**Decision:** Two decimals with a `%` — `14.25%`.

**Why:** two decimals is what the pipeline's own export served, so the precision follows
upstream rather than being invented; the derived value's 17 significant digits were
arithmetic noise. The unit is not decoration: `frip` reads like a 0–1 fraction and is a
0–100 percentage, which is exactly the confusion this project already hit once when a
maximum of 14.25 looked anomalous.

**What it exposed:** search compared raw values while the reader saw formatted ones, so
typing `14.25` matched nothing. Display, search, and the detail page now share one
formatter, and search looks only at visible columns. Sorting still uses raw values.

### How text columns sort

**Decided:** 2026-07-30, in M3.

**Decision:** `nullsLast` was generalized from `number | Date` to include strings, so
one comparator covers every column. Strings compare by code point rather than
`localeCompare`, because locale collation would make ordering depend on the reader's
environment and these values are identifiers and paths rather than prose.

Code-point ordering is also what makes dates work: they cross to the client as ISO
strings, which sort chronologically as text. The conversion was added at M2 to avoid
a timezone bug and turned out to be what makes date sorting possible at all.

### Whether in-memory pagination and sorting survive real data

**Decided:** 2026-07-30, in M3.

**Decision:** In memory, for now. The real dataset is 109 rows — the same as the mock
— so sorting, filtering and paging the whole set client-side costs nothing, and the
alternative would have been optimizing against a scale that does not exist.

**What would reopen it:** A materially larger export. The specific costs to watch, in
order: the seam opens a connection and coerces every row per call; the full row set is
serialized into the page twice, once as HTML and once as the RSC payload; and lint
already notes that React Compiler skips memoizing the table because TanStack's hook
returns functions it cannot memoize safely, which makes per-keystroke filtering
re-render more than it otherwise would. None of the three matters at 109 rows.

### What counts as a missing value

**Decided:** 2026-07-29, in M5.

**Decision:** Each column declares its own list of strings that mean absent, and
coercion consults that list rather than a single global sentinel. Anything that is
neither a declared marker nor parseable throws, naming the column and the value.
Non-string input throws too.

**Why a list rather than a value:** the two sources disagree. The database writes
`""` for `experiment_date` (8 rows) and `gdna_batch` (14 rows); the mock export
wrote `"NA"` for those same rows. Both readers shared one spec through the swap, so
those two columns declare `["NA", ""]`. Every other column declares only what its
source uses, which is why an empty cell in a numeric column is still format drift
rather than absence.

**What it deliberately did not do:** encode "blank `control` implies a control
sample". Ten rows have a blank `control` and only nine are controls, so the
biconditional is false on the current data and would throw on a legitimate row.
`is_treatment` is the authoritative signal. The distinction between structurally
absent and genuinely unknown is therefore not carried in the row type — every
absence is `null` — and deriving the *reason* at the display boundary is left to
whoever needs it.

### Which date format a column uses

**Decided:** 2026-07-29, in M5.

**Decision:** Date columns declare their format in the column spec rather than
having it sniffed. `experiment_date` and `gdna_batch` are `M/D/YY`; the ISO
datetime format is declared and parsed but belongs to `run_date`, which is
run-scoped and therefore not in the row type.

**Why:** sniffing turns a known fact into a runtime guess whose failure mode is a
silently wrong date. Declaring it also meant the existing guard *narrowed* rather
than loosened: `experiment_date` still rejects an ISO string, which it did before,
and an ISO column rejects `M/D/YY`. Both directions are tested.

### Drizzle dropped; `better-sqlite3` used directly

**Decided:** 2026-07-29, before M5 started.

**Decision:** No ORM. The seam reads SQLite through `better-sqlite3` directly.
`CLAUDE.md` §2 was rewritten to match, since it had specified Drizzle plus
`drizzle-kit`.

**Why:** Every column in this schema is `TEXT`, so an ORM infers `string | null`
for all of them — identical to what the driver already returns, and no more useful
than a hand-written type. The escape hatch for that (`$type<number>()`) is a
compile-time cast only: the runtime value stays a string, so a numeric sort would
be wrong in a way the type system certifies as correct. The one feature that would
genuinely help, a read transform, cannot see sibling columns — and the rules here
need siblings, since `control` is blank *because* `is_treatment` is `"0"`.

Decisively, `drizzle-kit pull` writes a migration journal into the repo. That puts
`migrate`/`push` one typo away from a schema the Snakemake pipeline owns, which is
this project's worst available failure mode. Not installing the tooling removes the
hazard entirely rather than relying on discipline.

**What it cost:** If the dataset ever grows enough to push sorting and pagination
into SQL, a query builder would make a dynamic `ORDER BY` safer than string
assembly. That is a whitelist map when it happens, not an ORM.

**What would reopen it:** The app needing to write, a second database arriving, or
enough tables that hand-written queries stop being obviously correct.

### How the export reconciles with the CLAUDE.md §6 schema

**Decided:** 2026-07-29, by inspecting the real database.

**Decision:** The two tables match §6 exactly — every documented column is
present, all TEXT, with an auto-increment `id`. `pipeline_runs` and
`run_metadata` hold 109 rows each and join 1:1 on `(output_dir, sample)` with zero
orphans on either side. Between them they carry 52 distinct data columns against
the mock export's 19, and they cover the same 109 samples, so the mock was derived
from this data.

The mock's 19 columns map cleanly except for four:

- `frip` and `frip_filt` are **not stored**, though
  `reads_in_peaks / mapped_reads × 100` and its filtered pair reproduce both
  exactly on all 109 rows. That is a pipeline logging gap, not an app design
  choice — see the upstream section. The seam derives them as a stopgap.
- `num_peaks_bl` is not in the database because the logging script does not write
  it. Initially recorded here as a disabled-blacklist case; that was wrong — the
  same run's export carries 109 values for it, so the feature was on.
- `num_peaks_rmsk` does not exist in the database and was `"NA"` in all 109 mock
  rows, so nothing is lost.

Everything else agrees value-for-value, with one cosmetic difference: the mock
wrote `mapping_pct` as `85` where the database has `85.0`. Coercion normalizes
both to the same number, which is a point in favor of having put coercion at the
seam.

**What it left open:** two questions this inspection surfaced rather than settled
— what counts as a missing value, and which date format a column uses. Both are
open entries above and both block M5.

### Ladder order: real data moved ahead of the UI rungs

**Decided:** 2026-07-29

**Decision:** The worked order became M1 → M5 → M2 → M3 → M4 → M6. Milestones keep
their original identities and numbers; only the sequence changed, so every
reference to "M5" or "M6" elsewhere in this register still points at the same
work.

**Why:** The original order put the data source last for one reason — the source
database was out of date, so designing a schema against it meant designing
against data about to change. That was a constraint, not a preference, and it
expired as soon as current data became reachable. Three entries still open in
this register are all answered by the same input: the real column set settles
which columns to display, the real row count settles whether sorting and
pagination stay in memory, and the real join key settles whether `sample` can
remain the record key. Doing the UI rungs first would mean deciding all three
twice. Getting data also front-loads the least predictable part of the project,
since the Midway access method is still entirely undecided.

**What it cost:** The seam's signature-preserving guarantee no longer gets a
meaningful test at M5. The original plan would have swapped the implementation
with a table, sorting, and a detail page sitting above the seam, so "nothing above
it changed" would have meant something. Running M5 second, only a throwaway page
is above it, and the check passes trivially. The guarantee is not lost — it just
gets demonstrated later and implicitly, by M2 through M4 being built without ever
referencing SQLite. Worth knowing rather than discovering later that the
demonstration was skipped.

**What would reopen it:** Current data turning out not to be current after all,
or the schema reconciliation proving large enough that the UI rungs are better
built against mock data while it is sorted out.

### How motif-logo availability is determined

**Resolved:** 2026-08-03 (M7)

**Decision:** From the filesystem, never inferred from a database column.

**Why:** `motif_peaks` looks like the answer and is not. It is `"NA"` for twelve of
the 109 samples, but three of those — `TGIF2_amp`, `TP53_LH`, `TP53_amp` — have real
motif logos, because the column counts FIMO hits rather than recording whether MEME
found a motif at all. Inferring from it would hide three logos a reader could
otherwise see, and `is_treatment` is no better: `HALO_LH` and `HALOa_b2` are controls
that do have motifs. Only the tree knows. A test pins those exact three samples so
the inference cannot creep back in.

### How a sample with no motif is represented

**Resolved:** 2026-08-03 (M7)

**Decision:** A zero-byte logo file means MEME found no motif — a declared sentinel,
rendered as a blank cell that still reserves the row's height. An *absent* file means
the tree is incomplete and throws, naming the sample and the path.

**Why:** The nine zero-byte files are the pipeline recording an outcome, the same way
a blank `control` records that a sample is a control (§6). Collapsing "empty" and
"missing" would mean a sync that lost a file rendered as 108 logos and one confident
absence — the plausible-substitute failure §9 exists to prevent. Keeping them
separate means four of the reader's six outcomes throw.

The cell was briefly labelled `no motif found` and is now blank at the user's
request. What a blank cannot say is *why* it is blank, so the browse page header
carries the count and the reason; that sentence is load-bearing, not decoration.
Letting the blank cell collapse to zero height was tried and reverted — it made those
nine samples render as squeezed rows, reading as a rendering fault rather than a fact.

### Where the logo bytes are served from

**Resolved:** 2026-08-03 (M7)

**Decision:** A route handler at `app/motif/[sample]/[image]/route.ts`, prerendered
with `generateStaticParams` and `dynamicParams = false`. Not a mirror under `public/`.

**Why:** The standing data rule is that pipeline data lives under `data/` and nowhere
else, and a gitignore exception *inside* a committed directory is how research data
eventually gets committed. A mirror is also a second copy to keep fresh, which is a
sync concern that does not exist yet.

The security property came free and is better than the alternative:
`generateStaticParams` enumerates the 200 sample/image pairs that actually have bytes
and `dynamicParams = false` means those are the only paths that exist, so traversal
is impossible rather than defended against — there is no input to sanitise because
there is no input. Verified: a present logo returns 200 `image/png` byte-identical to
`data/meme`, while a motif-less sample, an unknown sample, an unshipped image id, and
`/motif/../../etc/passwd` all 404.

`next/image` was rejected. Its value is resizing and format conversion, and against a
route handler that needs either request-time optimization — making the one
image-bearing surface dynamic while every other route is static — or `unoptimized`,
which reduces it to a plain `<img>`. What matters across 100 images on a page is the
explicit box, and the seam reports each logo's intrinsic size.

### How a variable-width logo sits in a fixed-width column

**Resolved:** 2026-08-03 (M7)

**Decision:** Fix the height, let the width follow the motif, and crop MEME's `bits`
axis away in the table while showing it whole on the detail page.

**Why:** Every logo is 358px tall but 404–1664px wide, because width tracks motif
length. Constraining width would render an 8bp and a 32bp motif at different letter
scales, so two logos in one column could not be compared — the only thing the column
is for. Constraining height makes letters one size everywhere; the widest motif lands
near 264px at the 60px row height.

The axis crop is measured rather than guessed, which is what makes it defensible.
Profiling per-column ink coverage across many logos puts the tick marks at columns
79–84, the axis line itself at 85–86, and letters from 87 — MEME draws its axis once
at a fixed size rather than scaling it with the plot, so 87 is a constant of the tool.
Cropping to 86 left the line's second pixel as a hairline down every cell, which only
the browser caught. If MEME changes its axis rendering the crop becomes wrong, but
wrong *visibly* — a clipped letter or a sliver of axis — rather than a plausible
picture of the wrong thing.

### Ladder order: M7 inserted ahead of M6

**Resolved:** 2026-08-03

**Decision:** Motif logos were added as a new rung M7 and worked before M6, the sync
script. The ladder is now M1 → M5 → M2 → M3 → M4 → M7 → M6.

**Why:** Recorded because the work-in-order gate requires it — inserting a rung ahead
of a pending one is a reorder, and one done silently is indistinguishable later from
an accident. The reason is that the images arrived: `data/meme/` was copied to the
machine, so the feature became buildable while M6's central decision (how the sync
reaches Midway) is still entirely open and needs a conversation before code.

What it cost: M6 now has two sources to sync rather than one, and the images are
prerendered, so the post-sync data-pickup question it inherits got heavier. Both are
recorded above rather than discovered later.

### How columns are labelled on screen

**Resolved:** 2026-08-03

**Decision:** Every column carries a written label in `lib/display/labels.ts`: no
underscores, project jargon spelled out, one capitalization rule. `is_treatment`
became **Sample Type**, and its stored `"0"` / `"1"` render as **Control** and
**Treatment**.

**Why:** Headers had been the pipeline's raw identifiers, which is right for a
schema and wrong for a reader — `gdna_batch`, `num_peaks_filt`, `mapping_pct`.

The rule is "no abbreviations", not "no short names", and the difference took a
correction to get right. Established names of the field stay: tools (MEME, FIMO,
HOMER) and measures (**FRiP**) are what these things are *called*, not shortenings of
a phrase anyone says out loud, so expanding them tells a reader of this data less.
FRiP was spelled out on the first pass and became the widest header on the table in
order to say something its audience already knows. File formats went the other way,
since "Aligned Reads File" tells a reader more than "BAM File" and the path still
carries the extension for search.

`is_treatment` was the sharpest case: it is the one column whose value decides how
every other number on the row should be read, and it was asking the reader to
remember which digit meant which. The digits stay authoritative underneath — the
detail page still branches on the raw value and sorting still uses it — so this is a
display mapping, not a data change. A side effect worth having: because search runs
through the same formatter, typing "control" now finds the nine control samples
where before it found nothing.

Labels are checked rather than trusted. A column with no label throws instead of
falling back to its identifier, a label with no column throws too, and tests enforce
the no-underscore, no-jargon and capitalization rules across all 39 at once —
consistency here is only visible when every label is read side by side, and is easy
to break one entry at a time.

**What it cost, and what it bought back.** The long labels first made the table
wider: 1.6 screens became 2.0, because "Fraction of Reads in Filtered Peaks" is
nearly four times the width of `frip_filt`. Letting the header wrap and giving it a
96px floor ended at **1.49 screens — narrower than the identifier version had been**,
because columns now size to their data rather than to their header. The floor was
measured: it buys a 29% shorter header for 0.15 screens, and 112px was strictly worse
than 96px on both axes.

### Which columns can be filtered, and how

**Resolved:** 2026-08-04 (M8)

**Decision:** Declared in `lib/table/filters.ts` — five facets, thirteen thresholds, and
no control for the other twenty-three columns. Absence is selectable everywhere it exists.

**Why:** Measured first. Three columns are null on all 109 rows, and eighteen have a
distinct value per row (`sample` plus the sixteen paths). Deriving the filterable set from
the column list would have shipped three controls that cannot narrow anything and eighteen
offering 109 options each. The free-text search is the right tool for the unique columns.

Two tests assert the measurements against the real database rather than trusting the list:
no all-empty column may offer a control, and no unique-per-row column may offer a facet. A
third catches a kind mismatch the column spec already knows enough to detect — a threshold
on a `text` column.

"Not recorded" being selectable turned out to need work the plan had not anticipated. The
requirement was written for facets, but `max_peak_score` and `motif_peaks` are numeric and
a bound excludes nulls by design, leaving "which samples have no peak score" unanswerable.
Thresholds gained a third state: bounds alone match in-range rows, bounds plus the flag add
the nulls, and the flag alone matches only the nulls.

### Where filter controls live, and what hiding a column does to them

**Resolved:** 2026-08-04 (M8)

**Decision:** In the toolbar, not in column headers. Hiding a column **keeps** its filter.

**Why:** Per-column filter menus were rejected because the header is already the most
crowded surface on the page — twenty columns, two-line labels, a 96px floor, a sort control
in every cell — and because active filter state would scatter across twenty columns, most
of them off screen. A reader could not answer "what am I filtered by" without scrolling
horizontally, which is the same failure the pinned `sample` column exists to prevent.

Hiding a column keeps its filter because hiding is a display choice about width, not a
statement about which rows matter; silently widening someone's result set because they
tidied the view is the more surprising behaviour, and a kept filter is the reversible one.
That only holds because the chip row exists — for a hidden column the chip is the *only*
on-screen cause for a short result set, so it is a precondition rather than a polish pass.
A test asserts `filterChips` never consults visibility, by reading its own source.

**Note the deliberate asymmetry.** Hiding a column removes it from *search* but not from
*filters*. Search narrows by a side effect of what happens to be visible, so a match with
no visible cause is unattributable; a filter was chosen by name and is named back in a
chip. Recorded because the two now treat "hidden" oppositely, which reads as a bug until
the reason is written down.

### How shareable filter state coexists with a prerendered route

**Resolved:** 2026-08-04 (M8). **This corrects the plan, which had it wrong.**

**Decision:** Read `window.location.search` in an effect. **Not** `useSearchParams`, and
no `Suspense` boundary.

**Why the plan was wrong:** It committed to `useSearchParams` wrapped in `Suspense`, on the
bundled docs' guidance that a prerendered route needs the boundary or the build fails. The
docs are correct about the mechanism. What the plan got wrong was the blast radius: it
claimed only the toolbar subtree would become client-rendered, but the hook has to live
where the filter state lives — the table component — so the bailout took every row out of
the prerendered HTML. Measured at **zero `<table>` tags** in the build output.

This app bakes 313 entries at build time as a core property, and paying for a shareable
link with the table's markup — for every visitor, including everyone arriving unfiltered —
is the wrong trade. The effect approach keeps the prerender intact and removes the
`Suspense` build trap that was the riskiest part of the work: a failure invisible in `next
dev` and fatal in `next build`.

Writes go through `history.replaceState`, not `router.push`: pushing adds a history entry
per keystroke in a bound field and makes the back button walk every intermediate state. An
equality check guards the write, which is what the encoder's byte-stability guarantee is
for.

Malformed input degrades rather than throwing, inverting this codebase's usual stance on
purpose. A URL is user-editable text and a link shared before a column was renamed should
show a wider view, not a 500 — nobody's data is at risk from a dropped filter, while a
crash on a pasted link costs someone their afternoon.

**What it cost:** the flash of unfiltered rows, recorded as an open entry above.

### Ladder order: M8 inserted ahead of M6

**Resolved:** 2026-08-04

**Decision:** Filtering was added as a new rung M8 and worked before M6, the sync script.
The ladder is now M1 → M5 → M2 → M3 → M4 → M7 → M8 → M6.

**Why:** Recorded because the work-in-order gate requires it — inserting a rung ahead of a
pending one is a reorder, and one done silently is indistinguishable later from an accident.
The reason is the same as M7's: this was buildable now, while M6's central decision (how the
sync reaches Midway) is still entirely open and needs a conversation before code.

**What it cost:** nothing structural. Filtering is entirely above the data seam — no new
reads, no new columns, no change to what the seam returns.

### The public/insiders split, and why the two halves use different mechanisms

**Resolved:** 2026-08-04 (M9)

**Decision:** `app/(public)/` is a route group; `app/insiders/` is a real path segment.

**Why the asymmetry:** each half does what only it can. A route group cannot create a URL
prefix, and a URL prefix is the only thing a path-matching guard can match — so the protected
side must be a real segment. The public pages want shared chrome and *not* a prefix, so the
landing page stays at `/`, which is exactly a route group.

The rejected alternative was a `(insiders)` group: same shared layout, no path marker, and
protection reduced to enumerating `/data`, `/protocols`, `/inventory` and keeping that list
correct forever. That list is the thing that drifts, and drift here means a page ships
unprotected. `lib/site/boundary.test.ts` asserts the absence of any such list, and that the
prefix is hardcoded in exactly one constant.

Keeping `app/layout.tsx` as the single root layout is a related decision: route groups can
define *multiple* root layouts, and navigating between two of them forces a full page reload.
Retaining one root makes both new layouts nested, so crossing between the two sides stays a
client-side navigation.

### The path prefix is the enforcement surface; a layout is not

**Resolved:** 2026-08-04 (M9). **This corrects the brainstorm that preceded the plan.**

**Decision:** The protected surface is the `/insiders` path prefix. `insiders/layout.tsx` is
navigation and chrome, and carries a comment saying so.

**Why the brainstorm was wrong:** it argued for the real segment on the grounds of "one layout
to attach protection to." Research found that route handlers do not participate in layouts, so
the motif image route — 200 prerendered PNG responses of research data — never renders through
any layout above it. A layout-based guard would have protected the 109 detail pages and left
every logo reachable by anyone who guessed a sample name. Right structure, wrong reason, and
the wrong reason is the kind something gets built on.

The nesting is retained for organisation and shared chrome. The guarantee is about the prefix,
and it is held by a test that computes each route's URL from its location on disk rather than
trusting where the file sits relative to a layout.

### Where research-data-dependent routes live

**Resolved:** 2026-08-04 (M9)

**Decision:** All of them under `app/insiders/data/`, asserted transitively.

**Why:** the whole build reads the gitignored database, so a fresh clone cannot build the site
at all. That was tolerable while the browser *was* the site. With public pages it stops being
tolerable: the person most likely to edit "About the Lab" is the person least likely to hold a
copy of the research data.

This does not fix that — it confines the coupling to one subtree so the fix stays small. The
guard is transitive rather than direct, because a public page importing a helper that reaches
the seam recouples the build just as surely as importing the seam outright, and a
direct-import check would not see it.

### Three site-shape questions the plan settled

**Resolved:** 2026-08-04 (M9)

- **The public site links to the insiders area**, from the footer rather than the main nav. Members need to find it and the URL is guessable anyway — obscurity was never the protection. Keeping it out of the main nav avoids presenting a protected destination as an ordinary section of the public site.
- **Sample pages stay at `/insiders/data/<sample>`** rather than gaining a `samples/` segment. The extra segment would only pay off if the data section ever held a second kind of record, which is speculation.
- **The data section carries its own heading**, now that the lab's name lives on the landing page. Writing it was the natural moment to restore the sentence stating how many samples have no motif and why — the cue lost when the old page subtitle was removed, which had left blank logo cells indistinguishable from unrecorded values.

### Ladder order: M9 inserted ahead of M6

**Resolved:** 2026-08-04

**Decision:** The lab site structure was added as a new rung M9 and worked before M6.
The ladder is now M1 → M5 → M2 → M3 → M4 → M7 → M8 → M9 → M6.

**Why:** recorded because the work-in-order gate requires it. The reason is that the pivot
came from the user and changes what every later rung is about, so doing it before more browser
work avoided building further on a frame that was about to change.

**What it cost:** every URL the browser had. Bookmarks break, and no redirects were added —
a redirect from `/` to the browse table would defeat the pivot by making the data browser the
site's front door again.

### Ladder order: M10 inserted ahead of M6

**Resolved:** 2026-11-09

**Decision:** Converting the site to the O'Malley lab's was added as rung M10 and worked
before M6. The ladder is now M1 → M5 → M2 → M3 → M4 → M7 → M8 → M9 → M10 → M6.

**Why:** recorded because the work-in-order gate requires it. The conversion changes whose
data the sync would carry, so it comes first.

### The O'Malley site's page set

**Resolved:** 2026-11-09

**Decision:** The public pages are Home, Research, People, Publications and Contact. News and
the landing page's featured-paper preview were removed, with their data, assets and tests.
Contact is the address and an email action, with no form.

**Why:** the lab's previous site has no news and no featured paper, and an empty News page
would claim a feed that does not exist. A form would post nowhere, because the site is served
as static files.

### The O'Malley site's visual identity

**Resolved:** 2026-11-09

**Decision:** Plum and lime taken from the lab's own photographs, Fraunces headings,
near-square buttons, a white nav bar, and a hero with text beside the photographs. The
tokens are named by role (`--site-ink`, `--site-accent`…) rather than by hue, and stay additive
so the data table's shadcn tokens are untouched. Chosen by the user over teal-and-coral and
soil-and-terracotta.

**Why:** two labs at one university sharing a template are compared side by side. Shared
structure is fine, but a shared identity reads as one group's site with the names swapped.
Hue-named tokens (`mint`, `sage`) re-valued to plum would have misled every later edit.

**What it rules out:** lime is a fill under ink text (9.1:1) and never text, a focus ring or
an indicator on a light surface (1.7:1). Rings and underlines use the olive link colour.

### Missing photos and former members

**Resolved:** 2026-11-09

**Decision:** A member with no usable photograph is `photo: null` and renders the lab's mark
in the same frame. The people test pins exactly who that is. Former members are a separate
text-only list with no photo field.

**Why:** a shared placeholder file would be one file claimed by several members, which breaks
the one-file-per-member guard. Alumni have no photos because a departed member's committed
photo stays downloadable at a guessable URL.

### A residue guard against the Zhang template

**Resolved:** 2026-11-09

**Decision:** `lib/site/residue.test.ts` fails on `zhuzhu` or `zhang lab` in the contents of
`app/`, `components/` and `lib/site/`, and on `zhang` or `zhuzhu` in any filename under
`public/`.

**Why:** the template keeps evolving in the Zhang repository, and changes ported from it
bring names along. The surname alone is deliberately not matched: real O'Malley co-authors
carry it, and the generated publication records list them.

### Production builds wait for an O'Malley database

**Resolved:** 2026-11-09

**Decision:** The converted site is not built for production until an O'Malley database and
MEME tree are in `data/`, and it is checked under `npm run dev` until then. The Zhang data is
never used as a build stand-in.

**Why:** the browser's routes prerender from `data/`, so a build without it fails, as designed
(`CLAUDE.md` §8). Using the Zhang data would put Zhang samples on unprotected `/insiders` pages.
Making those routes build without data was considered and rejected, because it would change
the browser's behaviour, which the conversion left alone.
