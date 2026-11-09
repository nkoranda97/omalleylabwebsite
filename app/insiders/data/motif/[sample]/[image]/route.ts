import { MOTIF_IMAGES, listMotifs, readMotifBytes, type MotifImage } from "@/lib/data";

/**
 * Serves one motif logo's bytes.
 *
 * The app has never served a file out of `data/` before, and this is how it does so
 * without breaking the two rules that matter.
 *
 * **The seam holds.** This handler asks the seam for bytes by sample and image name.
 * It never resolves, joins, or sees a filesystem path — which is what keeps "nothing
 * above the seam knows where data comes from" true for a route whose entire job is
 * serving a file.
 *
 * **Traversal is impossible rather than defended against.** `generateStaticParams`
 * enumerates the sample/image pairs that actually have bytes, and `dynamicParams =
 * false` means those are the only paths that exist. A request for
 * `/motif/../../etc/passwd`, or for a sample that is not in the database, is a 404
 * from the router before any code here runs. There is no input to sanitise because
 * there is no input.
 *
 * The consequence worth knowing: these responses are baked at build time, so logos
 * added to the tree afterwards need a rebuild to appear. That is the same constraint
 * the rows already have — see the post-sync data pickup entry in the register.
 *
 * **It lives inside `/insiders/data/` for a reason that is not organisation.** Route handlers
 * do not participate in layouts, so the insiders layout never runs for this file — the only
 * thing that can protect these 200 image responses is the shared path prefix. Left at the
 * site root it would have served research images to anyone who guessed a sample name, while
 * the pages referencing them sat behind the boundary.
 */

export const dynamic = "force-static";
export const dynamicParams = false;

/**
 * One entry per logo that has bytes.
 *
 * The nine motif-less samples are deliberately absent rather than enumerated and
 * handled: a path that would only ever 404 is better not routed at all, and leaving
 * them out means the 404 comes from the router rather than from a branch here that
 * could drift from what the table believes.
 */
export async function generateStaticParams() {
  const motifs = await listMotifs();

  return motifs.flatMap((entry) =>
    MOTIF_IMAGES.filter((image) => entry.logos[image].present).map((image) => ({
      sample: entry.sample,
      image,
    })),
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sample: string; image: string }> },
) {
  const { sample, image } = await params;

  const bytes = await readMotifBytes(sample, image as MotifImage);

  return new Response(bytes, {
    headers: {
      "Content-Type": "image/png",
      // The bytes for a given sample and image never change: a new MEME run writes a
      // new tree and needs a rebuild regardless, which is what makes this safe.
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Length": String(bytes.byteLength),
    },
  });
}
