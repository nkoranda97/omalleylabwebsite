import type { ReactNode } from "react";

/**
 * An outbound link inside a paragraph.
 *
 * The underlined olive treatment, in one place: each publication entry's outbound links use it,
 * so a colour decision is a thing the site does rather than a class string repeated per link.
 *
 * The people page's contact link is deliberately not this: it underlines quietly and only takes the
 * link colour on hover, which suits a data row rather than running prose.
 */
export function ProseLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      className="decoration-site-link text-site-deep font-medium underline decoration-1 underline-offset-2"
    >
      {children}
    </a>
  );
}
