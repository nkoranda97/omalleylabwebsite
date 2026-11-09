/**
 * The site's navigation, as data.
 *
 * Not written inline in the layouts, for one reason: this structure invites a specific
 * drift. Someone adds `app/insiders/equipment/` and forgets the nav, so the page exists
 * and nothing links to it. With the nav as data, a test compares it against the
 * directories that actually exist and fails when they disagree — a nav written inline in
 * JSX cannot be checked that way.
 *
 * Same shape as `DETAIL_GROUPS` and `COLUMN_LABELS`: declare it, then assert it.
 */

export type NavLink = {
  href: string;
  label: string;
  /**
   * One line saying what the section holds, for surfaces that list sections rather than
   * link to them in a bar.
   *
   * Declared here rather than in the hub that renders it, for the reason the whole module
   * exists: a fourth section added to the nav would otherwise reach the hub as a tile with
   * a blank line under it, and nothing would say so. The insiders entries all carry one and
   * a test holds that. The public nav has none — a nav bar has no room for a sentence.
   */
  description?: string;
};

/** Where everything private lives. The prefix, not a layout, is the protected surface. */
export const INSIDERS_PREFIX = "/insiders";

/**
 * What the protected area is called on screen.
 *
 * A constant for the same reason the prefix is one. This label appears in four places — the
 * public nav pill, the public footer, the insiders header, and the hub's own heading — and it
 * was hardcoded in all four, which is precisely the drift this module exists to prevent. It was
 * renamed from "Lab members" and the rename had to touch every copy by hand; the next one is a
 * single edit here.
 */
export const INSIDERS_LABEL = "Insiders";

/**
 * The public pages, in reading order.
 *
 * The landing page first because it is the site's front door. The rest are ordered the way
 * a visitor is likely to want them: what the lab is, who is in it, what it has published,
 * how to reach it.
 */
export const PUBLIC_NAV: readonly NavLink[] = [
  { href: "/", label: "Home" },
  { href: "/research", label: "Research" },
  { href: "/people", label: "People" },
  { href: "/publications", label: "Publications" },
  { href: "/contact", label: "Contact" },
];

/**
 * The insiders sections, in reading order.
 *
 * Every href begins with the insiders prefix — a nav entry pointing outside it would be a
 * link out of the protected area dressed as a section of it.
 */
export const INSIDERS_NAV: readonly NavLink[] = [
  {
    href: `${INSIDERS_PREFIX}/data`,
    label: "Data",
    description:
      "Every DAP-seq run, searchable and sortable. Files, provenance and motif logos per sample.",
  },
  {
    href: `${INSIDERS_PREFIX}/protocols`,
    label: "Protocols",
    description: "Bench protocols and standard operating procedures.",
  },
  {
    href: `${INSIDERS_PREFIX}/inventory`,
    label: "Inventory",
    description: "Strains, plasmids and reagents the lab holds.",
  },
];

/**
 * Where the browse table lives.
 *
 * Exported so the detail page's back link and any other route into the data section are
 * constructed rather than written out — the same reasoning that keeps motif image URLs in
 * one place.
 */
export const DATA_HOME = `${INSIDERS_PREFIX}/data`;

/** One sample's detail page. */
export function sampleHref(sample: string): string {
  return `${DATA_HOME}/${sample}`;
}

/**
 * Check a nav list against the page directories that exist beside it.
 *
 * Exported for the tests rather than called at render time: a missing nav entry is a
 * mistake to catch in CI, not a reason to crash a page a reader is looking at.
 */
export function navHrefs(nav: readonly NavLink[]): string[] {
  return nav.map((link) => link.href);
}
