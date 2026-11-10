/**
 * The lab roster, as data.
 *
 * Same reasoning as `nav.ts`: declared here rather than written inline in JSX so a test can
 * check it. The drift this structure invites is a photo and a person coming apart — a file
 * renamed, a member added without an image, a departed member's photo left behind in a
 * web-served directory. None of those are visible when reading the page component, and all
 * three are caught by reading this list against `public/people/`.
 *
 * Roles are verbatim from the lab's current site. Where a group heading already states the
 * role, `role` is omitted rather than repeated — see `MemberGroup` below.
 */

export type Member = {
  /** The name as it should read, honorifics included. */
  name: string;
  /**
   * This person's own title, when the group heading does not already say it.
   *
   * Optional because "Principal Investigator ▸ Ronan O’Malley ▸ Principal Investigator" reads
   * as a template with a hole in it. A group of one needs no sub-label; a group whose
   * members hold different titles needs one on every member.
   */
  role?: string;
  /**
   * Filename under `public/people/`, verified to exist by `people.test.ts` — or `null` when no
   * usable photograph has been supplied, which renders a placeholder drawn in code.
   *
   * `null` rather than an optional field, so leaving it out is a type error: a missing photo is
   * stated, and the test pins exactly who it is stated for. Not a shared placeholder file either,
   * which would be one file claimed by several members.
   */
  photo: string | null;
  /**
   * Where the 4:5 frame's `object-cover` takes its crop from, as a literal Tailwind class so the
   * scanner sees it. Only for a photo whose subject is far off-centre, where the page's generic
   * crop would show the background instead of the person. The file itself stays a whole frame.
   * Omitted means the generic crop.
   */
  position?: string;
  /**
   * Labelled facts shown beside a featured member's photograph.
   *
   * Only the PI has these today. They fill the space a group of one leaves next to a single
   * photograph — and they are facts rather than prose deliberately. A paragraph about the lab's
   * research would repeat the home page's tagline and the research page; an appointment and a
   * training history appear nowhere else on the site.
   *
   * Facts also survive better than copy: prose written as a placeholder gets rewritten, whereas
   * these are fields that are filled once and stay correct.
   */
  details?: readonly MemberDetail[];
};

/** One labelled fact. `href` turns the value into a link; omit it for plain text. */
export type MemberDetail = {
  label: string;
  value: string;
  href?: string;
};

/**
 * A value nobody has supplied yet.
 *
 * An explicit sentinel, not a plausible-looking guess. "Assistant Professor" would render as a
 * completed profile while being an invention about a real person, and nobody reading the page
 * could tell. An em-dash under its own label reads as a blank on a form — it says which fact is
 * missing, which is the useful thing for whoever fills it in.
 *
 * A test asserts that unfilled details use exactly this, so the tempting shortcut of writing
 * something that merely looks right fails rather than ships.
 */
export const UNKNOWN = "——";

export type MemberGroup = {
  /** The role this group holds, stated once. */
  heading: string;
  members: readonly Member[];
};

/** The directory under `public/` holding the headshots. One place, so the test can read it. */
export const PHOTO_DIR = "people";

/**
 * Everyone currently in the lab, grouped by role, in the order the lab's previous site lists them.
 *
 * Grouped rather than flat, so "who runs this lab" is answered by the first heading rather than by
 * reading every entry. Ordered by seniority, which is a presentation choice and not a claim about
 * anybody: PI, then the people whose position is a job, then students by degree. Within a group the
 * order is as-listed.
 */
export const PEOPLE: readonly MemberGroup[] = [
  {
    heading: "Principal Investigator",
    members: [
      {
        name: "Ronan O\u2019Malley, Ph.D.",
        /* The previous site shows the lab logo in place of a photograph. */
        photo: null,
        /*
         * Institution is known and the rest are blanks waiting on someone who knows them. The
         * previous site lists no personal email, so none is invented here; the lab's contact
         * address is on the Contact page.
         *
         * Scholarly profiles (Google Scholar, ORCID) belong in this list too and are left out
         * rather than stubbed, because a link is the one kind of blank that cannot be honest —
         * an `href` pointing nowhere is a broken link, not a missing value.
         *
         * Order matters: the page lays these out in two columns flowing left to right, so
         * consecutive pairs share a row — position, then contact, then training.
         */
        details: [
          { label: "Appointment", value: UNKNOWN },
          { label: "Department", value: UNKNOWN },
          { label: "Institution", value: "The University of Chicago" },
          { label: "Email", value: UNKNOWN },
          { label: "Ph.D.", value: UNKNOWN },
          { label: "Postdoc", value: UNKNOWN },
        ],
      },
    ],
  },
  {
    heading: "Postdocs & Staff",
    members: [
      { name: "Jhong-He Yu, Ph.D.", role: "Postdoctoral Scholar", photo: "jhong-he-yu.jpg" },
      {
        name: "Eva Mei Shouse, Ph.D.",
        role: "Postdoctoral Scholar",
        photo: "eva-mei-shouse.jpg",
        /* A wide landscape frame with her at the right edge; centred, it shows only the rice. */
        position: "object-right",
      },
      { name: "Nick Koranda", role: "Lab Manager", photo: "nicholas-koranda.jpg" },
    ],
  },
  {
    heading: "Graduate Students",
    members: [
      { name: "Pinky Lee", photo: "pinky-lee.jpg" },
      { name: "Fabian Halblander", photo: "fabian-halblander.jpg" },
      /* The previous site shows a stock illustration in place of a photograph. */
      { name: "Ernesto Gagarin", photo: null },
    ],
  },
  {
    heading: "Undergraduate Students",
    members: [{ name: "Hannah Berley", photo: "hannah-berley.jpg" }],
  },
];

/**
 * Someone who has left the lab.
 *
 * No photo field, deliberately. Everything in `public/` is served at a guessable URL with no access
 * check, so a former member's committed headshot stays downloadable long after the page stops
 * showing it. A name and a role carry what an alumni list is for.
 */
export type Alumnus = {
  name: string;
  role: string;
  /** As the source gives them, e.g. "2023–2025". Omitted when the source gives none. */
  years?: string;
};

/** Former members, in the previous site's order. */
export const ALUMNI: readonly Alumnus[] = [
  { name: "Lin Yang", role: "Postdoctoral Scholar", years: "2023\u20132025" },
  { name: "Laura Gerard-Guillard", role: "Lab Manager" },
  { name: "Xiaocheng Yu, Ph.D.", role: "Postdoctoral Scholar" },
];

/** The line under an alumnus's name: the role, with years only when the source gives them. */
export function alumnusRole(alumnus: Alumnus): string {
  return alumnus.years === undefined ? alumnus.role : `${alumnus.role}, ${alumnus.years}`;
}

/** Where a headshot file is served from. */
export function photoSrc(photo: string): string {
  return `/${PHOTO_DIR}/${photo}`;
}

/** Every member, ungrouped, in display order. Exported for the tests and for counting. */
export function allMembers(): Member[] {
  return PEOPLE.flatMap((group) => group.members);
}

/**
 * Alt text for a headshot, or the accessible label of the placeholder that stands in for one.
 *
 * Names the person rather than describing the image, and deliberately omits the word
 * "photo" — a screen reader already announces that it is an image, so "Photo of X" is
 * read aloud as "image, photo of X".
 */
export function photoAlt(member: Pick<Member, "name" | "photo">): string {
  return member.name;
}
