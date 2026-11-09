/**
 * The site's primary button: lime fill under ink text, olive on hover, a 2px radius.
 *
 * Classes rather than a component, because the callers render it on different elements — a
 * `Link` for pages, a plain `<a>` for the `mailto:` action — and it is the colour and shape that
 * must not drift between them, not the element. The caller adds its own margin.
 *
 * Lime is a fill under ink text here (9.1:1) and turns olive under white on hover (5.9:1); see the
 * palette note in `app/globals.css`.
 */
const BASE =
  "bg-site-accent text-site-ink hover:bg-site-link focus-visible:ring-site-deep inline-block rounded-xs text-sm font-medium transition-all hover:-translate-y-px hover:text-white focus-visible:ring-2 focus-visible:outline-none";

/** `compact` is the header's smaller size; everything else is the default. */
export function buttonClass(size: "default" | "compact" = "default"): string {
  return `${BASE} ${size === "compact" ? "px-5 py-2" : "px-6 py-3"}`;
}
