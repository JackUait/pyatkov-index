export const SITE_ORIGIN = 'https://jackuait.github.io';

/** Resolve a pathname to its canonical absolute URL.
 *  The pathname must ALREADY carry the base path — both Astro.url.pathname and
 *  `${import.meta.env.BASE_URL}foo/` do — so nothing is prepended here; doing so under
 *  BASE_PATH=/pyatkov-index/ would double the segment. Absolute http(s) input passes
 *  through unchanged, which makes the function idempotent and safe on an og:image prop
 *  that may be either form. */
export function absUrl(pathname: string): string {
  return new URL(pathname, SITE_ORIGIN).href;
}

export function pageId(pathname: string, hash: string): string {
  return `${absUrl(pathname)}#${hash}`;
}

/** Stable @ids for the nodes shared by every page, anchored on the site root so they are
 *  the same string no matter which page emits them — that is what lets consumers merge
 *  the per-page graphs into one site graph. */
export const ID = {
  website: pageId(import.meta.env.BASE_URL, 'website'),
  creator: pageId(import.meta.env.BASE_URL, 'creator'),
  // Anchored on methodology/, the one page that actually defines the Dataset node — a
  // fragment @id names the document the node is described in, and the other 402 pages
  // only reference it.
  dataset: pageId(`${import.meta.env.BASE_URL}methodology/`, 'dataset'),
};
