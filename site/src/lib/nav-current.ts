// The client router moves the persisted header into every new page, so the
// server-rendered aria-current freezes at whatever page loaded first. This
// module re-derives it after each swap. Base.astro's frontmatter imports
// normalizePath for the initial render, so server and client can never
// disagree about what counts as the current page.

/** Comparison form of a pathname: trailing-slash-insensitive, '/' for the root. */
export function normalizePath(pathname: string): string {
  return pathname.replace(/\/+$/, '') || '/';
}

export function initNavCurrent(): void {
  const update = () => {
    const here = normalizePath(window.location.pathname);
    for (const link of document.querySelectorAll<HTMLAnchorElement>('header nav a')) {
      if (normalizePath(link.pathname) === here) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
  };
  document.addEventListener('astro:after-swap', update);
}
