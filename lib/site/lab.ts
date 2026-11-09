/**
 * Who this site belongs to, in one place.
 *
 * Everything that names the lab, addresses it, or emails it reads from here. Copies of a name
 * scattered across layouts are renamed by finding each one by hand, and the one missed is the one
 * that ships.
 *
 * Address and email are the lab's own, as listed on its previous site's contact page. The phone
 * number that page carried was the site builder's placeholder, so there is deliberately none here.
 */

export const LAB = {
  /** The wordmark, the tab title and the hero heading. */
  name: "O’Malley Lab",
  /** The footer's formal form. */
  legalName: "O’Malley Laboratory",
  institution: "The University of Chicago",
  /** One line each: building, street, city. Rendered as an `<address>` block. */
  address: [
    "Cummings Life Science Center",
    "920 E 58th Street",
    "Chicago, IL 60637",
  ],
  email: "gzy8899@uchicago.edu",
} as const;

/** The email action, built rather than written out at each call site. */
export function mailto(): string {
  return `mailto:${LAB.email}`;
}
