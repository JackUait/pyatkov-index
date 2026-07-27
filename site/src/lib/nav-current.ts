// The client router moves the persisted header into every new page, so the
// server-rendered aria-current freezes at whatever page loaded first. This
// module re-derives it after each swap. Base.astro's frontmatter imports
// normalizePath for the initial render, so server and client can never
// disagree about what counts as the current page.

/** Comparison form of a pathname: trailing-slash-insensitive, '/' for the root. */
export function normalizePath(pathname: string): string {
  return pathname.replace(/\/+$/, '') || '/';
}

/** First path segment after the base → the nav link, base-relative, that owns it.
 *  A country page has no nav link of its own, so without this the masthead goes
 *  blank the moment you open one and the reader loses the branch they are in. */
const OWNER: Record<string, string> = {
  passport: '',
  destination: 'openness/',
};

/** The nav href whose SECTION contains `pathname`, or null when the path is a nav
 *  destination itself (its own link is already `page`) or belongs to no section. */
export function sectionHref(pathname: string, base: string): string | null {
  const root = normalizePath(base);
  const here = normalizePath(pathname);
  const prefix = root === '/' ? '' : root;
  if (here !== root && !here.startsWith(`${prefix}/`)) return null;
  const segment = here.slice(prefix.length + 1).split('/')[0];
  const owner = OWNER[segment];
  return owner === undefined ? null : `${prefix}/${owner}`;
}

export function initNavCurrent(): void {
  // The brand link points at the site root, so the header carries the base with
  // it — no need to thread the build-time value through the layout's script.
  const base = document.querySelector<HTMLAnchorElement>('header .brand')?.pathname ?? '/';
  const update = () => {
    const here = normalizePath(window.location.pathname);
    const section = sectionHref(window.location.pathname, base);
    for (const link of document.querySelectorAll<HTMLAnchorElement>('header nav a')) {
      const target = normalizePath(link.pathname);
      // 'page' only for the page you are actually on; a section you are merely
      // inside is 'true' — the same highlight, an honest weaker claim.
      if (target === here) link.setAttribute('aria-current', 'page');
      else if (section !== null && target === normalizePath(section)) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    }
  };
  document.addEventListener('astro:after-swap', update);
}
