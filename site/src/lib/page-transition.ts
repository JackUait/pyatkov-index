// Every page of the index owns an instrument, and this module is the only place
// that knows which one. It resolves the page being navigated TO into a gesture
// key, which global.css paints onto the view-transition pseudo-elements.

import { normalizePath } from './nav-current.ts';

export type TransitionKey = 'ink' | 'doors' | 'scale' | 'rule' | 'country' | 'plain';

/** A pathname with the deploy base removed and normalized: '/', '/openness', … */
export function routePath(pathname: string, base = '/'): string {
  const here = normalizePath(pathname);
  const root = normalizePath(base);
  if (root === '/') return here;
  if (here === root) return '/';
  // The '/' is load-bearing: without it '/pyatkov-index-old' would read as a
  // path under the '/pyatkov-index' base.
  return here.startsWith(`${root}/`) ? here.slice(root.length) : here;
}

export function transitionKey(pathname: string, base = '/'): TransitionKey {
  const route = routePath(pathname, base);
  if (route === '/') return 'ink';
  if (route === '/openness') return 'doors';
  if (route === '/destinations') return 'scale';
  if (route === '/methodology') return 'rule';
  // Singular. '/destinations' cannot match, because the next character there is
  // 's' and not the slash.
  if (route.startsWith('/passport/') || route.startsWith('/destination/')) return 'country';
  return 'plain';
}

/** The attribute pair a navigation writes onto <html>. */
export function stampFor(
  pathname: string,
  direction: string,
  base = '/',
): { to: TransitionKey; nav: 'forward' | 'back' } {
  return {
    to: transitionKey(pathname, base),
    nav: direction === 'back' ? 'back' : 'forward',
  };
}

export function initPageTransition(base = '/'): void {
  let stamp = { to: 'plain' as TransitionKey, nav: 'forward' as 'forward' | 'back' };

  const write = () => {
    const root = document.documentElement;
    root.dataset.to = stamp.to;
    root.dataset.nav = stamp.nav;
  };
  const clear = () => {
    delete document.documentElement.dataset.to;
    delete document.documentElement.dataset.nav;
  };

  document.addEventListener('astro:before-preparation', (event) => {
    const e = event as Event & { to: URL; direction: string };
    stamp = stampFor(e.to.pathname, e.direction, base);
    // Written here for Astro's non-native fallback, where the outgoing page's
    // animation runs before the swap and would otherwise read the page it is
    // leaving instead of the one it is going to.
    write();
  });

  document.addEventListener('astro:before-swap', (event) => {
    const e = event as Event & { viewTransition?: { finished: Promise<void> } };
    // Held until the animation is actually over: data-to also retimes the
    // ribbon's own sweep, and that override must not outlive the transition.
    e.viewTransition?.finished.then(clear, clear);
  });

  // Astro copies the incoming document's <html> attributes over this one during
  // the swap, which drops data-nav — no server render carries it. after-swap
  // fires inside the update callback, so re-writing here still lands before the
  // browser captures the new state.
  document.addEventListener('astro:after-swap', write);
}
