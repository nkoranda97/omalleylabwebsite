---
title: "feat: Landing page content parity with the current lab site"
type: feat
status: completed
date: 2026-08-05
origin: https://zhanglab.odoo.com/ (scraped 2026-08-05)
---

# feat: Landing page content parity with the current lab site

## Summary

Replace the landing page's invented placeholder sections with the current lab site's actual
sections and wording, and rename the About tab to Research.

Today the landing page below the hero is three blocks I wrote: a "What we work on" grid of
three research areas, a "Recent paper" with a fabricated citation, and two placeholder news
items. None of it is true. The current site has real content in those slots — an open-positions
block, a real paper with its PMID and abstract, and a real award — and this plan copies that
content across verbatim.

The hero is explicitly out of scope: it keeps the eyebrow, lede and two buttons it has now.
Only the sections beneath it change.

One thing is deliberately deferred. The current site floats a generic document icon beside its
paper abstract, which is being dropped rather than reproduced, and a better way to present the
paper is a separate piece of work. This plan ships the paper as plain type in the meantime.

## Problem Frame

The landing page reads as finished and is not. Its three lower sections describe a lab that
does not exist: "Epigenomics", "Computational methods" and "Gene regulation" are plausible
research areas rather than this lab's, the paper block cites "Journal name, 2026, PMID
00000000", and the news items say "A placeholder announcement". Anyone landing on the site
gets a confident-looking page of fiction.

Meanwhile the real content is one site over and is better than anything invented: the lab is
hiring for three named roles, has a 2023 *Nature* paper with a brain-wide epigenomic atlas, and
won an NIDA Avenir Award. That is a landing page. The work is transcription, not authorship.

Separately, the About tab is misnamed relative to the current site, which calls the same
destination Research and points its hero button there.

## Requirements

Traceable to the request and to the scrape of https://zhanglab.odoo.com/.

**R1.** The "What we work on" section is removed from the landing page, along with the
`RESEARCH` constant that feeds it.

**R2.** The `/about` route becomes `/research`: the directory, the nav entry, its label, its
page heading and metadata title, and every link pointing at it.

**R3.** The landing page's sections below the hero match the current site's, in its order:
open positions, then Recent paper, then Lab news.

**R4.** Wording in those sections is verbatim from the current site. The exact strings are
recorded in *Sources & Research* below so implementation transcribes rather than paraphrases.

**R5.** No document icon appears beside the paper. The existing citation `<aside>` — which was
built as a replacement for that icon — goes too, since the current site has no journal-name
column.

**R6.** The hiring block's "More details here" resolves to the real PDF, hosted by this repo
rather than hot-linked to the other site.

**R7.** The hero is unchanged, except that its first button's href follows the `/about` to
`/research` rename.

**R8.** Placeholder copy that is not replaced by real content does not survive on this page. It
is either real or absent.

## Key Technical Decisions

### The PDF is committed, not hot-linked

The current site's "here" link points at
`zhanglab.odoo.com/web/content/719?unique=fd29…&download=true` — an Odoo content ID with a hash
query. Linking to it would make our page depend on their CMS keeping that ID stable, and it
breaks the moment the old site is retired, which is the point of building this one.

The file is `Comp_Postdoc_Neuro_Postdoc_Tech_2025May.pdf`, 68KB, two pages, authored by Zhuzhu
Zhang in May 2025. It is already in `~/Downloads` and byte-identical to what their server
returns, so it is committed to `public/` and linked from there.

68KB is small enough that the objection raised against the headshots — git keeps every byte
forever — does not apply with any force.

### The award keeps its logo, and loses its typo

The news item on the current site pairs the award text with the NIH/NIDA vertical logo. That is
a real institutional mark attached to a real award, not decoration, so it comes across.

The award sentence as published reads "from Nation Institute on Drug Abuse". This plan writes
"National". Copying a typo is not fidelity to wording, it is fidelity to a mistake, and this one
is in the name of the agency that gave the award.

### The paper is plain type for now

The current site's paper block is a title, a PMID, an abstract and a link, with a generic
document glyph floating in the whitespace to the right. The glyph is dropped per R5.

Nothing replaces it yet. A richer treatment is wanted and is explicitly a later piece of work,
so this plan does not invent an interim visual — an empty right-hand column is a more honest
signal that something is coming than a stand-in graphic would be.

### Hiring content is transcribed with its dates visible

The positions PDF is dated May 2025 and the award August 2024. Both are copied as published.
Where the source shows a date, the page shows that date, so a stale item is legible as stale
rather than looking current. Whether the positions are still open is a question for the lab, not
something this plan can resolve — it is flagged in *Risks*.

## High-Level Technical Design

No new architecture. The landing page is one server component with static content; the change is
to its markup and to one route directory name.

The `/about` to `/research` rename is a `git mv` plus three references: the `PUBLIC_NAV` entry,
the hero button, and the page's own heading and metadata. `lib/site/nav.test.ts` already compares
`PUBLIC_NAV` against the directories that exist under `app/(public)/`, so a rename that misses
either side fails a test rather than shipping a dead nav link.

Content lives inline in the page rather than in a data module. This is deliberate: `lib/site/`
holds structures that tests check for drift — the nav against the route tree, the roster against
`public/people/`. A block of prose has no counterpart to drift against, so a constant would add
indirection and buy nothing. Positions are the one arguable case, and three items used once do
not earn a module.

## Output Structure

```
app/(public)/
  research/page.tsx        renamed from about/page.tsx, heading and metadata updated
  page.tsx                 What we work on removed; three sections rewritten with real content
lib/site/nav.ts            PUBLIC_NAV: /about About -> /research Research
public/
  hiring-positions.pdf     committed from ~/Downloads, linked by the hiring block
  nida-avenir-award.webp   the NIH/NIDA mark shown with the award item
```

## Implementation Units

### U1 — Rename About to Research

**Goal:** `/research` replaces `/about` everywhere, with no dead links and no stale label.

**Files:**
- Move: `app/(public)/about/page.tsx` → `app/(public)/research/page.tsx`
- Modify: `lib/site/nav.ts` (the `PUBLIC_NAV` entry), `app/(public)/page.tsx` (hero button href
  and label)

**Approach:** `git mv` the directory so history follows the file. Update the nav entry to
`{ href: "/research", label: "Research" }`. In the page, change `title` and `PageHeader title` to
"Research" and revise the lede, which currently says "What the lab studies, how we work, and
where to find us" — still true of a Research page, so a light edit at most.

The hero's first button reads "About the lab" and points at `/about`. Both change: the href to
`/research` and the label to something that matches, which the current site words as "Learn
more". R7 keeps the hero otherwise untouched.

**Patterns to follow:** `lib/site/nav.ts` is the single declaration of which public pages exist;
do not add a second list.

**Verification:** `npm test` — `nav.test.ts` compares nav hrefs against directories and fails on
either half of a partial rename. Then grep the tree for `"/about"` and expect nothing. Then load
`/research` and confirm the nav marks it, and that `/about` 404s rather than rendering.

### U2 — Remove "What we work on"

**Goal:** The invented research-areas grid is gone.

**Files:** Modify `app/(public)/page.tsx`

**Approach:** Delete the section and the `RESEARCH` constant. Check whether `SectionCurve` or the
surrounding spacing assumed that block's presence — the curve currently sits between the paper
and news sections, so it should be unaffected, but the vertical rhythm wants a look.

**Verification:** `npm run build`, then load `/` and confirm the page runs hero → hiring → paper
→ news with no orphaned divider or doubled gap. Confirm no unused-variable lint warning.

### U3 — The hiring section

**Goal:** The current site's open-positions block, verbatim, with a working PDF link.

**Files:**
- Create: `public/hiring-positions.pdf` (copied from
  `~/Downloads/Comp_Postdoc_Neuro_Postdoc_Tech_2025May.pdf`)
- Modify: `app/(public)/page.tsx`

**Approach:** A section in the same labelled-row idiom the people page established, or a plain
left-aligned block — implementation's call, but it must not become a card grid. Three positions
render as a list; each is a bold role name and a description. The application paragraph carries a
`mailto:` on the address. "here" links to the committed PDF.

Strings are in *Sources & Research*; transcribe them, do not rewrite them. The em dash in the
source is a hyphen-minus surrounded by spaces; render a real en dash.

**Test scenarios:** No unit tests — this is static copy with no branching. The verification is
visual and link-level.

**Verification:** Load `/`, click "here" and confirm the PDF opens rather than 404s. Confirm the
`mailto:` carries the right address. Run the contrast sweep over the page. Confirm the PDF is
tracked by git and is 68KB, not something larger that got copied by mistake.

### U4 — The real paper

**Goal:** The placeholder citation is replaced by the actual paper, with no icon and no invented
journal column.

**Files:** Modify `app/(public)/page.tsx`

**Approach:** Keep the "Recent paper" heading. Below it: the title in bold, `PMID: 38092919`, the
abstract paragraph, and the "Other publications" link to `/publications`. Delete the `<aside>`
holding "Journal name / 2026 · PMID 00000000".

Leave the right-hand column empty rather than filling it. That space is the subject of the
follow-up work.

**Verification:** Load `/` and confirm no fabricated numbers remain anywhere on the page — grep
the rendered HTML for `00000000` and `Journal name` and expect nothing. Confirm the PMID is
38092919.

### U5 — The award

**Goal:** The real news item replaces the two placeholders.

**Files:**
- Create: `public/nida-avenir-award.webp` (fetched from the current site)
- Modify: `app/(public)/page.tsx`

**Approach:** One item: the logo, the award sentence, and "August, 2024". Write "National
Institute on Drug Abuse" per the decision above. The `NEWS` constant currently holds two
placeholder objects; with a single real item, inline it and drop the constant unless the shape
earns keeping.

The logo is a bitmap with a white field. On the moss-green news band it will need a white or
light plate behind it rather than sitting directly on the green, or a transparent variant.
Implementation should check how it looks before deciding — this is the sort of thing that reads
fine in a mockup and badly in a browser.

**Verification:** Load `/`, confirm the logo renders and is not distorted, and that the award text
and date read correctly. Run the contrast sweep — the news band is moss green and has already
caught one white-on-green failure on this site.

## Scope Boundaries

**Not in this plan:**

- **The hero.** Unchanged per R7, beyond the one href the rename forces.
- **A richer paper presentation.** Explicitly the next piece of work. This plan removes the icon
  and ships plain type; it does not design the replacement.
- **The splash photograph.** To be changed later; untouched here.
- **The other nav labels.** The current site says "Our team" and "Lab news" where this site says
  "People" and "News". Only About → Research was requested, and the shorter labels read better in
  a nav bar.
- **The `/research` page's own body.** It stays the placeholder it is; only its name changes. The
  current site has real research content, and moving that across is its own unit of work.
- **Publications and News pages.** The landing page links to both. Both stay placeholders.

## Risks & Dependencies

**The hiring content may be out of date.** The PDF is dated May 2025 and the award August 2024.
Publishing "we're hiring" for roles that are filled is worse than saying nothing. Someone at the
lab should confirm the three positions are still open before this reaches anyone. The page shows
the dates it was given, which limits the damage but does not remove it.

**The NIH/NIDA logo is a federal agency mark.** Showing it beside an award from that agency is
ordinary practice and the lab already publishes it this way, so this plan copies that use. Worth
a glance rather than a legal review.

**The abstract is long.** Roughly 430 characters of dense prose. On the current site it sits in a
narrow column and reads as a wall. Whatever measure it gets here, it should be checked at mobile
width, where long text over a constrained column is where line-length problems show.

**Dependency:** the PDF and the logo must be in the repo before U3 and U5 can be verified. Both
are confirmed obtainable: the PDF is in `~/Downloads` and the logo URL was fetched during planning.

## System-Wide Impact

- **`nav.test.ts`** compares `PUBLIC_NAV` against the directories under `app/(public)/`. The
  rename must be complete on both sides or the suite fails — which is the guard working.
- **`boundary.test.ts`** walks `app/` for routable files and asserts no public page reaches the
  data seam. A renamed directory is still a public page reaching nothing, so it stays green.
  Worth re-running rather than assumed, since it counts routes.
- **Prerendering.** Both pages are static; the route count in `npm run build` should stay at 323.
  A change in that number means something unintended became dynamic.
- **`/about` becomes a 404.** Nothing links to it after U1, and the site has no external audience
  yet, so no redirect is planned. If the URL has been shared, a redirect is a one-line addition to
  `next.config.ts`.

## Deferred to Implementation

- **Section shapes.** Whether the hiring block uses the people page's labelled-row layout or a
  plain left-aligned column. Both fit the site; pick by looking at it.
- **Whether `NEWS` stays a constant.** One real item may not justify the indirection.
- **How the NIDA logo sits on the moss band.** Needs a plate, a transparent variant, or a lighter
  section background. Decide in a browser.
- **The `/research` lede.** The current wording may survive the rename unchanged.

## Sources & Research

Scraped from https://zhanglab.odoo.com/ on 2026-08-05, walking the DOM in order so section
sequence and wording are recorded rather than summarised.

**Section order:** hero → open positions (no heading) → "Recent paper" → "Lab news" → footer.

**Nav:** Research → `/research`, Our team → `/team`, Publications → `/publications`, Lab news →
`/labnews`. The hero's "Learn more" button points at `/research`, which is what makes About →
Research the right rename.

### Verbatim strings

Open positions, intro (bold as marked):

> We're **hiring** in the NeuroEpigenomics Lab @UChicago! **Come join us** to explore how gene
> regulation shapes the brain using cutting-edge genomics, neuroscience, and computational tools.

> **Computational Postdoc** - Lead single-cell genomics & multi-omics analysis in brain
> development and addiction

> **Neuroscience Postdoc** - Integrate viral tracing, rodent behavior, & single-cell genomics to
> study circuits in addiction & stress

> **Research Technician** - Execute and optimize single-cell genomics protocols; contribute to
> assay development & mouse work

> More details **here**

> Interested candidates please send a single PDF file including the following to Dr. Zhuzhu Zhang
> (zhuzhuzhang@uchicago.edu):
>
> - 1-page summary of present and future research interests
> - CV
> - Contact information for three references

Recent paper:

> **Recent paper**
>
> **Brain-wide correspondence of neuronal epigenomics and distant projections.**
>
> PMID: 38092919
>
> Our lab is interested in understanding the epigenomic and gene regulatory mechanisms that shape
> brain function, both during normal postnatal development and in response to environmental
> challenges, such as exposure to substances of abuse. We aim to uncover how molecular changes
> influence brain maturation, neural circuitry complexity, and maladaptive plasticity, with a
> focus on the dynamic regulation of gene expression at the cell-type level.
>
> **Other publications** → `/publications`

Lab news:

> **Lab news**
>
> [NIH/NIDA vertical logo]
>
> **Zhang Lab received the Avenir Award in Genetics and Epigenetics of Substance Use from Nation
> Institute on Drug Abuse**
>
> August, 2024

Note "Nation Institute" above is the published text; see *Key Technical Decisions* for why this
plan writes "National".

### Assets

| Asset | Source | Size |
| --- | --- | --- |
| Hiring PDF | `~/Downloads/Comp_Postdoc_Neuro_Postdoc_Tech_2025May.pdf`, identical to the file the current site serves at content ID 719 | 68KB, 2pp, May 2025 |
| NIDA logo | `zhanglab.odoo.com/web/image/443-156332cc/web-NIH_NIDA_Vertical_Logo_2Color.webp`, confirmed reachable | 600x400 WebP, 6.8KB, opaque white field |

### What was removed and why

The reference's paper block floats a generic document glyph in the whitespace right of the
abstract. It carries no information and is the one thing the request singles out to drop.
