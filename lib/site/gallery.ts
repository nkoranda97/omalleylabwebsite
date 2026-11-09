/**
 * The lab's own photographs, as data.
 *
 * Declared here rather than written into the pages so a test can hold them against `public/`, the
 * same way `people.ts` holds the headshots: a declared file that is missing breaks an image, and an
 * undeclared one is served at a guessable URL with nothing pointing at it. Every committed asset
 * directory has that check; these two are no exception.
 *
 * All of them come from the lab's previous site, downscaled to 1200px on the long edge. Alt text
 * describes what each photograph shows. It is accessibility text written from the images, not lab
 * copy.
 */

export type GalleryPhoto = {
  /** Path under `public/`, e.g. `home/bench.webp`. */
  file: string;
  alt: string;
  /** Intrinsic pixel size, so the browser reserves the box before the file arrives. */
  width: number;
  height: number;
  /**
   * Where the hero's `object-cover` takes its crop from, as a literal Tailwind class so the scanner
   * sees it. Only for a photo whose subject is off-centre: the hero crops every tile to 4:3, and a
   * portrait cropped from the middle can lose the thing it was taken of. Omitted means centred.
   */
  position?: string;
};

/** The directories these photos live in. One place, so the test reads the same list. */
export const GALLERY_DIRS = ["home", "research"] as const;

/** The hero grid, in reading order: top-left, top-right, bottom-left, bottom-right. */
export const HERO_PHOTOS: readonly GalleryPhoto[] = [
  {
    file: "home/arabidopsis-trays.webp",
    alt: "A gloved hand tending trays of Arabidopsis rosettes, each pot marked with a yellow label.",
    width: 1200,
    height: 800,
  },
  {
    file: "home/strawberry-flower.webp",
    alt: "A white wild strawberry flower opening above its leaves in a growth chamber.",
    width: 900,
    height: 1200,
    position: "object-[center_35%]",
  },
  {
    file: "home/seedlings-on-plates.webp",
    alt: "Two rows of young seedlings growing along strips on clear plates.",
    width: 900,
    height: 1200,
    position: "object-[center_45%]",
  },
  {
    file: "home/bench.webp",
    alt: "A lab bench with racks of pipette tips, a pipette and a stack of Petri dishes.",
    width: 1200,
    height: 800,
  },
];

/** The research page's photograph. */
export const RESEARCH_PHOTO: GalleryPhoto = {
  file: "research/growth-chamber.webp",
  alt: "A researcher in a lab coat and purple gloves tending seedlings on a growth-chamber shelf.",
  width: 799,
  height: 1200,
};

/** Where a photo is served from. */
export function gallerySrc(photo: GalleryPhoto): string {
  return `/${photo.file}`;
}
