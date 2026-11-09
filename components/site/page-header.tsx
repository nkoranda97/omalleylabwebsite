/**
 * The banner every inner public page opens with.
 *
 * A title and nothing else. It carried an optional lede until every page dropped it, and an unused
 * prop is worse than no prop — the next person to add a page would reasonably assume the site wants
 * one there.
 *
 * Shared so the inner pages are a heading rather than a copied layout, and so a new page is a file.
 * The deep plum field echoes the hero without competing with it: same palette, a third of the height,
 * no motion.
 */
export function PageHeader({ title }: { title: string }) {
  return (
    <header className="bg-site-deep">
      <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-20">
        <h1 className="font-display text-4xl font-bold tracking-tight text-white sm:text-5xl">
          {title}
        </h1>
      </div>
    </header>
  );
}
