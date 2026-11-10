import Image from "next/image";

import { Logo } from "@/components/site/logo";
import { PageHeader } from "@/components/site/page-header";
import {
  ALUMNI,
  PEOPLE,
  UNKNOWN,
  type Member,
  type MemberDetail,
  allMembers,
  alumnusRole,
  photoAlt,
  photoSrc,
} from "@/lib/site/people";

export const metadata = { title: "People" };

/**
 * The roster.
 *
 * Follows the lab's previous team page — headshot, name, role — grouped by role so "who runs this
 * lab" is answered by the first heading, and with former members in their own text-only list.
 *
 * **The photos are whole frames and the crop is generic.** `public/people/` holds each original
 * uncropped, downscaled only, and the square the circle shows is whatever `object-cover` takes
 * from the middle. An earlier pass cropped each photo to a hand-picked box so every face landed
 * at the same scale; the boxes were wrong often enough to be worse than no boxes, so framing is
 * now a decision left to a person looking at the photographs. Expect heads-and-torsos rather
 * than headshots until those crops are made.
 *
 * `next/image` here, where the motif logos in the browse table use a plain `<img>`. Not an
 * inconsistency: those are served by a route handler, which would force request-time
 * optimization on the one image-bearing surface of an otherwise static site. These are static
 * files in `public/`, which is exactly the case the optimizer is built for — it converts them
 * to WebP/AVIF and lazy-loads the rows below the fold for free.
 */

/**
 * The frame every portrait is drawn into.
 *
 * **4:5 portrait, not a circle, and the uncropped photos are why.** A circle keeps only 78.5% of
 * its own box and discards the corners — which is exactly where heads and shoulders sit, so a
 * circle crops hardest at the part worth showing. Measured on an earlier circular version, the
 * photographs occupied 18.2% of this page's area, effectively ~14% once the corners are
 * discounted: a page about people where the people were a minority of the pixels. A 4:5 frame
 * uses the whole box and, at the same column width, reads about a third larger.
 *
 * No cap on the width — the grid column sets it, so there is no fixed number to keep in sync
 * with the breakpoints. `relative` because `fill` positions the image absolutely inside this
 * box, and the aspect ratio is what gives it a height to fill. Rounding and `overflow-hidden`
 * live here rather than on the image, so the container does the cropping and the image is only
 * ever told to cover it.
 *
 * The faint surface fill shows only while a photograph is still loading; `cover` leaves no
 * letterboxing once it arrives.
 */
const BOX =
  "relative aspect-[4/5] w-full overflow-hidden rounded-lg ring-1 ring-site-ink/10";

/**
 * What the optimizer is told about the rendered width, per breakpoint.
 *
 * These track the grid: below `md` the label column stacks and the tiles sit two across; from
 * `md` up they sit three across in the space left over beside a 168px label column. Wrong values
 * here do not break the layout, they just make the browser pick a poorly-sized variant, so they
 * are worth keeping honest when the grid changes.
 *
 * **Doubled, because `sizes` is the frame's width and `cover` draws past it.** The browser picks a
 * variant to fill the `<img>` box, but a photo wider than 4:5 is scaled to the frame's *height* and
 * overflows sideways, so the pixels actually on screen are wider than the box by (photo aspect ÷
 * 0.8). A 3:2 landscape needs 1.875× the frame width; told only the frame width, the browser fetched
 * a 640px variant for a frame needing ~1125 device pixels and the photo rendered visibly blurred.
 * 2× covers any source up to 8:5. Portrait sources overfetch a little, which is the cheaper error.
 */
const SIZES = "(min-width: 1280px) 600px, (min-width: 768px) 480px, 90vw";

/**
 * Where the generic crop takes its square from: horizontally centred, biased upward.
 *
 * One rule for every photo, not a per-photo adjustment. In almost any portrait the head sits above
 * the middle of the frame, so a dead-centre square tends to land on the torso. 30% splits the
 * difference without being a judgement about any particular photo, and it has no effect at all
 * on the landscape-orientation sources, where `cover` already fills the height exactly and only
 * the horizontal position is free.
 */
const CROP_FROM = "object-[center_30%]";

/** The entrance, shared by every entry so the page arrives as one sequence. */
const ENTER = "animate-in fade-in slide-in-from-bottom-3 duration-700 [animation-fill-mode:backwards]";

/**
 * The photograph itself.
 *
 * `fill` rather than explicit width/height, and the uncropped photos are the reason: the sources
 * are portrait, landscape and square, so there is no one pair of dimensions to pass — and passing
 * a square pair for a 3:4 photo is what makes `next/image` distort it. `fill` takes its box from
 * `BOX` and leaves the aspect ratio to `object-cover`, which crops to the frame instead of
 * stretching to it. Dropping in a replacement photo at any shape needs no code change.
 *
 * A member with no photograph gets the lab's mark on a pale plum field in the same frame, so the
 * grid keeps its rhythm and the gap reads as deliberate rather than as an image that failed to
 * load. `role="img"` with the name as its label, so a screen reader meets the same thing it would
 * for a photograph.
 */
function Photo({ member, eager }: { member: Member; eager: boolean }) {
  if (member.photo === null) {
    return (
      <div
        role="img"
        aria-label={photoAlt(member)}
        className={`${BOX} bg-site-surface flex items-center justify-center`}
      >
        <Logo className="text-site-deep/35 h-2/5 w-auto" />
      </div>
    );
  }
  return (
    <div className={`${BOX} bg-site-accent/15`}>
      <Image
        src={photoSrc(member.photo)}
        alt={photoAlt(member)}
        fill
        sizes={SIZES}
        className={`object-cover ${member.position ?? CROP_FROM}`}
        loading={eager ? "eager" : "lazy"}
      />
    </div>
  );
}

/**
 * The olive role line under a name.
 *
 * The link colour rather than the lime accent: lime on this paper measures 1.7:1 and could never be
 * text. Olive measures 5.3:1, passes for 14px body text, and still reads as the accent the role
 * line is meant to carry.
 */
function Role({ children }: { children: string }) {
  return <p className="text-site-link mt-0.5 text-sm font-medium">{children}</p>;
}

/**
 * One member in a grid: photograph, name, role.
 *
 * Left-aligned rather than centred, because every other block on this site is — the hero, the
 * research columns, the page headings. Centring the only grid on the site would read as a
 * different page.
 *
 * No hover state. These are not links: there are no per-person pages to go to, so anything that
 * lit up under the cursor would be promising a destination that does not exist.
 */
function Portrait({
  member,
  index,
  eager,
}: {
  member: Member;
  index: number;
  /** True above the fold, where an image should not wait for an intersection check. */
  eager: boolean;
}) {
  return (
    <li
      className={ENTER}
      /*
       * Inline, not a Tailwind `delay-*` class. The delay depends on the member's position, and
       * Tailwind resolves class names by scanning source text — a class assembled from a
       * variable matches nothing and emits no CSS. Learned the hard way on the table's hover
       * colour; the same trap, so the same fix.
       */
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <Photo member={member} eager={eager} />
      <p className="font-display text-site-ink mt-3 leading-snug font-semibold">{member.name}</p>
      {member.role === undefined ? null : <Role>{member.role}</Role>}
    </li>
  );
}

/**
 * One labelled fact, and the blank it shows when nobody has supplied it.
 *
 * A missing value is muted rather than omitted, because the label is the useful part: "Ph.D. ——"
 * says which fact is absent, where dropping the row entirely would hide that anything is. That
 * makes this block read as a form while it is incomplete and as a profile once it is not.
 */
function Detail({ detail }: { detail: MemberDetail }) {
  const missing = detail.value === UNKNOWN;
  return (
    <div>
      {/*
        ink/70 for both the label and a blank. At 12px and 14px these are normal-size text needing
        4.5:1; ink/70 measures 5.6:1 on the paper, where /50 would be 3.1:1.
        A blank does not need to be faint to read as a blank: the em-dash is the signal, so the
        distinction from a real value survives at a compliant weight. Relying on lightness alone
        would also have made absence a colour-only cue.
      */}
      <dt className="text-site-ink/70 text-xs tracking-wide uppercase">{detail.label}</dt>
      <dd className={`mt-0.5 text-sm ${missing ? "text-site-ink/70" : "text-site-ink"}`}>
        {detail.href === undefined || missing ? (
          detail.value
        ) : (
          <a
            href={detail.href}
            className="decoration-site-link hover:text-site-deep underline decoration-1 underline-offset-2 transition-colors"
          >
            {detail.value}
          </a>
        )}
      </dd>
    </div>
  );
}

/**
 * The featured member: photograph in the first column, name and labelled facts beside it.
 *
 * A group of one in a three-column grid left two empty columns next to a single photograph,
 * which was the emptiest and most conspicuous space on the page. What fills it is facts rather
 * than prose, on purpose: a paragraph about the lab's research would say again what the landing
 * page's tagline and the research page already say, whereas an appointment and a training
 * history appear nowhere else on this site.
 *
 * The PI's role is not repeated as a line of its own — the section label to the left already says
 * Principal Investigator, and the Appointment row carries the formal title.
 */
function FeaturedPortrait({ member }: { member: Member }) {
  return (
    <li className={`${ENTER} grid gap-x-8 gap-y-6 sm:grid-cols-3`}>
      <Photo member={member} eager />
      {/*
        Centred against the photograph, not top-aligned. Aligning the name to the top of a 4:5
        frame left the facts ending two-thirds of the way up and a bare ~210px below them — the
        same emptiness this block was added to fill, just moved. Centring reads as a deliberate
        pairing instead of a column that ran out of content.
      */}
      <div className="sm:col-span-2 sm:self-center">
        <p className="font-display text-site-ink text-2xl leading-tight font-bold tracking-tight">
          {member.name}
        </p>
        {member.details === undefined ? null : (
          /*
            Two columns from `sm` up. In one column six rows ran to a tall thin strip beside a
            wide photograph; in two they sit as a block of roughly the frame's proportions.
          */
          <dl className="border-site-ink/15 mt-5 grid gap-x-8 gap-y-4 border-t pt-5 sm:grid-cols-2">
            {member.details.map((detail) => (
              <Detail key={detail.label} detail={detail} />
            ))}
          </dl>
        )}
      </div>
    </li>
  );
}

export default function Page() {
  // One running count across every group, so the entrance reads as a single sequence down the
  // page rather than restarting at each heading.
  // Keyed on the name, which the roster test holds unique: photos can be null, and two nulls
  // would collide here.
  const order = new Map(allMembers().map((member, index) => [member.name, index]));

  return (
    <>
      <PageHeader title="People" />

      <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-20">
        <div className="flex flex-col gap-12 sm:gap-16">
          {PEOPLE.map((group, groupIndex) => {
            // The first group is the PI's: featured rather than gridded, and eagerly loaded
            // because it is the only one above the fold. Keyed on position rather than on the
            // heading text, so renaming the heading cannot silently demote it.
            const lead = groupIndex === 0;
            return (
              /*
                Label on the left, people on the right — rather than a full-width label band over
                each group. Four stacked bands made the same 12px-uppercase-plus-rule figure four
                times down a short page, and each one cost vertical space that the photographs
                wanted. Beside the group it costs none, and the rule still spans the whole measure
                because it sits on the section rather than on the label.
              */
              <section
                key={group.heading}
                className="border-site-ink/15 grid gap-x-10 gap-y-6 border-t pt-6 md:grid-cols-[168px_1fr]"
              >
                {/*
                  The same uppercase tracked eyebrow the hero uses for "The University of Chicago".
                  Borrowed rather than invented, so a new section on this site has an established
                  shape to take.

                  ink/70, not /50: at 12px this is normal-size text and needs 4.5:1, which /50
                  misses at 3.1:1. /70 measures 5.6:1 and is still visibly quieter than the names.

                  Sticky from `md` up, where the label has a column of its own to travel down. It
                  answers "whose photographs am I looking at" without a glance back up the page,
                  and it needs `self-start` — a grid item stretches to its row by default, and a
                  full-height item has nowhere to stick to. `top-24` clears the 68px site header.
                */}
                <h2 className="text-site-ink/70 self-start text-xs font-semibold tracking-[0.18em] uppercase md:sticky md:top-24">
                  {group.heading}
                </h2>

                {/*
                  Three columns, not four, so a group of three fills its row rather than leaving
                  the last column empty as though a photograph had failed to load.
                */}
                <ul className={lead ? "" : "grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3"}>
                  {group.members.map((member) =>
                    lead ? (
                      <FeaturedPortrait key={member.name} member={member} />
                    ) : (
                      <Portrait
                        key={member.name}
                        member={member}
                        eager={false}
                        index={order.get(member.name) ?? 0}
                      />
                    ),
                  )}
                </ul>
              </section>
            );
          })}

          {/*
            Former members, in the same labelled row as the groups above but as text: no
            photographs, for the reason on the `Alumnus` type. Two columns of name and role,
            which is all an alumni list is for.
          */}
          <section className="border-site-ink/15 grid gap-x-10 gap-y-6 border-t pt-6 md:grid-cols-[168px_1fr]">
            <h2 className="text-site-ink/70 self-start text-xs font-semibold tracking-[0.18em] uppercase md:sticky md:top-24">
              Alumni
            </h2>
            <ul className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
              {ALUMNI.map((alumnus) => (
                <li key={alumnus.name}>
                  <p className="font-display text-site-ink leading-snug font-semibold">
                    {alumnus.name}
                  </p>
                  <Role>{alumnusRole(alumnus)}</Role>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
