---
date: 2026-08-04
topic: lab-site-structure
---

# Lab site structure

## Summary

Turn the DAP-seq browser into one section of a lab website: public pages for the lab's
outward face, and a password-protected insiders area holding the data browser alongside
protocols and inventory. This brainstorm settles the route skeleton and the boundary
between public and private. Pages arrive as placeholders — content and styling come later,
section by section.

---

## Problem Frame

The app is currently a single-purpose data browser occupying the whole site: the browse
table is `/`, a detail page is `/<sample>`, and motif logos are served from `/motif/...`.
Every route is public, and the entire build depends on gitignored research data.

None of that survives the pivot intact. A lab website has an outward face that anyone can
read and an inward face that only members should reach, and the data browser belongs on
the inward side. Three things follow that are cheap to get right now and expensive to
retrofit:

**The boundary has to be one place.** A password protects a *set* of pages. If that set is
defined by enumerating paths, the list drifts — a fourth insiders section ships six months
from now and nobody remembers to add it. The structure should make the protected surface
obvious enough that forgetting is hard.

**The logo route is a hole.** The 200 prerendered motif images are served from `/motif/...`
independent of the pages that reference them. Moving the browser behind a password while
leaving that route at the root protects the page and not the data: anyone who guesses a
sample name still gets the image. A front door with the windows open.

**The public site currently cannot be built without the research database.** Both
`generateStaticParams` calls read it, and `/data/` is gitignored, so a fresh clone fails
the build outright. That is tolerable while the browser *is* the site. It stops being
tolerable when someone needs to edit "About the Lab" — the person most likely to do that is
the person least likely to have a copy of the database.

---

## Key Decisions

**A route group for the public layout, a real path segment for the insiders boundary.**
These are different tools and the pivot needs both. `app/(public)/` gives the public pages a
shared nav and footer without adding a URL segment, so the home page stays at `/`. A real
`app/insiders/` segment gives the protected area a single parent — one layout to attach
protection to, one prefix to match, and a URL that tells a reader the page is private. Using
a route group for the insiders side instead would produce the same shared layout with no URL
marker and no single boundary, which is exactly the enumerate-and-drift problem above.

**Everything the research data touches lives under `/insiders/data`.** The browse table, the
detail pages, and the motif image route move together. Two properties fall out of that: the
image route ends up inside the protected boundary rather than beside it, and the build's
dependence on gitignored data is confined to one subtree instead of spread across the site.

**The browser moves now rather than later.** Moving it is the groundwork; leaving it at `/`
and relocating "when the site is ready" means doing the same URL migration twice and living
with a public data browser in between. The cost is that today's bookmarks stop working, which
matters to one person for one week.

**Placeholders, not content.** Every new page renders its own name and nothing else. The
value of this pass is that the shape exists and is navigable — filling pages is separate work
that can happen in any order, by whoever, without touching structure.

**No authentication mechanism is chosen here, deliberately.** How the password works — where
it lives, what enforces it, what hosting supports — is unresolved and out of scope. The
structure's job is to make that choice cheap and reversible when it arrives: one boundary to
protect, no protected page outside it.

### The shape

```
app/
  layout.tsx                    root shell: fonts, globals — nothing else
  (public)/
    layout.tsx                  public nav and footer
    page.tsx                    /                      the lab's landing page
    about/page.tsx              /about
    people/page.tsx             /people                lab members
    publications/page.tsx       /publications
    news/page.tsx               /news
  insiders/
    layout.tsx                  insiders nav — the single boundary
    page.tsx                    /insiders              hub linking the sections
    data/
      page.tsx                  /insiders/data         the browse table, moved
      [sample]/page.tsx         /insiders/data/<sample>
      motif/[sample]/[image]/route.ts                  logo bytes, moved inside
    protocols/page.tsx          /insiders/protocols
    inventory/page.tsx          /insiders/inventory
```

The nesting is the security argument, not an organizational preference: everything private
is under one parent, and nothing private is anywhere else.

---

## Actors

A1. **Public visitor** — anyone on the internet. Reads the lab's outward pages. Should never
reach a protected page or any research artifact, including images.

A2. **Lab insider** — a member with the password. Reaches the data browser, protocols, and
inventory, and moves between them without leaving the insiders area.

A3. **Site maintainer** — whoever edits or adds pages. Frequently the same person as A2, but
not necessarily, and **not assumed to have a copy of the research database**. This actor is
why the build-without-data requirement exists.

---

## Requirements

**The public site**

R1. Public pages exist for the landing page, about the lab, lab members, publications, and
news, each reachable at its own URL and linked from a shared navigation.

R2. Public pages share one layout — navigation and footer — so adding a sixth public page is
a file, not a copy-paste.

R3. The landing page remains at `/`.

R4. Every public page renders as a placeholder naming itself, with no content or styling
commitments.

**The insiders area**

R5. All protected pages sit beneath a single `/insiders` parent, and no protected page or
asset exists outside it.

R6. `/insiders` is itself a page — a hub linking the sections it contains — rather than a
bare directory that only resolves deeper.

R7. Protocols and inventory exist as placeholder pages alongside the data browser.

R8. The insiders area has its own layout and navigation, distinct from the public one, so a
reader can tell which side of the boundary they are on.

**Moving the existing browser**

R9. The browse table, the detail pages, and the motif image route move under
`/insiders/data`, keeping their current behaviour — filtering, sorting, pagination, the motif
logos, and the detail pages all work exactly as they do now.

R10. No internal link points at an old location. The detail page's back link, the sample
links in the table, and the motif image URLs all resolve under the new structure.

R11. The motif image route is not reachable from outside the insiders boundary.

R12. The number of prerendered entries is unchanged by the move: 109 detail pages and 200
image responses still exist, at their new paths.

**Groundwork that keeps later options open**

R13. Every route whose build depends on the research database sits within `/insiders/data`,
so the coupling has one location rather than being spread across the site.

R14. Adding a new insiders section requires creating a directory, not editing a list of
protected paths.

R15. Nothing in the structure presumes a particular authentication mechanism.

---

## Key Flows

F1. **A visitor reads the lab's public face.**
**Trigger:** arriving at `/` from a search result or a citation.
Lands on the landing page, moves between about, people, publications, and news through the
shared nav. Sees no reference to research data and no route into the insiders area beyond,
at most, a single unobtrusive link.

F2. **An insider opens the data browser.**
**Trigger:** navigating to `/insiders` with the password.
Reaches the hub, chooses data, protocols, or inventory. Inside the data browser the
experience is what exists today. Moving between the three insiders sections never passes back
through the public site.

F3. **A maintainer edits a public page without the research data.**
**Trigger:** a labmate clones the repo to fix a typo on the about page.
Runs the site locally and edits the page. Whether this currently succeeds is the subject of
R13 rather than a promise this flow makes — see Outstanding Questions.

---

## Acceptance Examples

AE1. **Covers R11.** A motif logo URL constructed by hand, outside the insiders boundary,
does not serve image bytes. Today `/motif/TP53_b2/summits_logo1` returns a PNG to anyone;
after the move, no path outside `/insiders` does.

AE2. **Covers R9, R10, R12.** Opening `/insiders/data`, filtering to controls with a motif,
and clicking through to a sample works end to end: the filter narrows to two rows, the
detail page shows both motif logos, and the back link returns to the filtered table.

AE3. **Covers R5, R14.** Adding a fourth insiders section — equipment, say — requires
creating one directory under `insiders/` and nothing else. No list of protected routes is
edited, because there is no such list.

AE4. **Covers R4, R6.** Every page in the skeleton, public and insiders, responds and names
itself. A reader clicking every nav link finds no dead ends and no blank screens.

AE5. **Covers R13.** Every route file that reads the research database lives under
`insiders/data/`. Grepping the rest of `app/` for a seam import finds nothing.

---

## Scope Boundaries

### In scope
The route skeleton, both layouts and their navigation, placeholder pages for all sections,
and relocating the existing browser and its image route with links updated.

### Deferred for later
- **Authentication itself.** No mechanism, no enforcement, no session handling. The structure
  makes one boundary available; filling it is separate work.
- **Content and styling for every page.** Deliberately. The point of this pass is that the
  shape exists.
- **Making the public site buildable without the research database.** R13 confines the
  coupling so this stays a small change later; it does not perform the change.
- **M6, the Midway sync.** Unchanged in priority and explicitly not part of this.
- **Restoring the no-motif cue** removed with the page subtitle, which now has a natural home
  in a data-section header rather than the site's landing page.

### Outside this product's identity
- **A public data portal.** The research data is for the lab, behind the password. This is not
  a publication-grade browser for outside readers, and designing for that audience would
  change the data browser's every decision.
- **A LIMS.** Protocols and inventory are pages a person reads and edits, not a sample-tracking
  system with workflows, approvals, or state machines.
- **A CMS.** Pages are files in the repo, edited by people who can open a pull request. Adding
  an authoring interface would be a larger product than the site it serves.

---

## Dependencies / Assumptions

- **Authentication is unresolved and intentionally undecided.** The structure assumes only
  that whatever arrives can attach to a single route subtree. If the eventual mechanism
  cannot — if it turns out to operate per-page or per-file — R5 and R14 need revisiting.
- **Static prerendering and password protection are in tension, and the tension is not
  resolved here.** The site currently bakes 313 entries at build time and serves them as
  files. A protected page that is a static file needs something in front of it. This is a real
  constraint on the eventual mechanism, recorded so the choice is made with it in view rather
  than discovered afterwards.
- **The public page list is a first cut.** Landing, about, people, publications, news. Sections
  will be added; the structure treats that as routine.
- **The existing browser's behaviour is a fixed point.** Filtering, sorting, the motif logos,
  and the detail pages are finished work. The move must not change them, and any change is a
  regression rather than a redesign.

---

## Outstanding Questions

### Deferred to planning
- Whether the public site should be made buildable without the research database in the same
  pass that relocates the routes, or in a later one. R13 makes either order possible; the
  planner can weigh whether doing it immediately is cheap enough to bundle.
- Whether the public site links to `/insiders` at all, or whether insiders navigate there
  directly. A visible link is friendlier to members and advertises the protected area to
  everyone else.
- Whether the sample detail page keeps `/insiders/data/<sample>` or gains a segment such as
  `/insiders/data/samples/<sample>`. The second reads better if the data section ever holds a
  second kind of record; the first is shorter and matches what exists.
- Whether the browse table's page header should carry the section's name now that the site has
  a landing page holding the lab's name.

---

## Sources / Research

- The current route surface is four files: `app/page.tsx`, `app/[sample]/page.tsx`,
  `app/motif/[sample]/[image]/route.ts`, and `app/layout.tsx`. There is no `middleware.ts`.
- Three places hold internal URLs that the move invalidates: the detail page's back link in
  `app/[sample]/page.tsx`, the sample link in `components/qc-runs-table.tsx`, and
  `MOTIF_ROUTE_SEGMENT` in `lib/display/motif.ts`. The last is a single constant, which is why
  the image route's URL is cheap to change.
- Both `generateStaticParams` implementations read through the data seam, which is what makes
  the whole build fail without `data/` — verified by building a fresh clone, where it exits
  naming the missing path.
- `docs/build-ladder.md` and `docs/deferred-decisions.md` carry the existing milestone ladder
  and 13 open decisions. Several are affected by the pivot: how failures surface in production
  now has a public audience, and the open entry on serving research data acquires a second
  reader in the form of the public site.
- `CLAUDE.md` §1 currently describes the project as a single-purpose browser and says "keep it
  focused — this is a data browser, not a platform." The pivot contradicts that framing
  directly, and the document needs updating rather than quietly diverging.
