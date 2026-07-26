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

export type MoveKey = 'right' | 'left' | 'down' | 'up' | 'plain';

/** The masthead's order, which is the site's map. A wipe travels toward the
 *  page you are going to: right toward a higher seat, left toward a lower
 *  one. Country pages sit below the map — going to one steps down, leaving
 *  one steps up — and an origin the map does not know reads as a fresh
 *  entrance, which moves forward. */
const NAV_ORDER = ['/', '/openness', '/destinations', '/methodology'];

export function moveFor(fromPathname: string, toPathname: string, base = '/'): MoveKey {
  const toKey = transitionKey(toPathname, base);
  const fromKey = transitionKey(fromPathname, base);
  if (toKey === 'country') return 'down';
  if (toKey === 'plain') return 'plain';
  if (fromKey === 'country') return 'up';
  const from = NAV_ORDER.indexOf(routePath(fromPathname, base));
  const to = NAV_ORDER.indexOf(routePath(toPathname, base));
  if (from === to) return 'plain';
  if (from === -1) return 'right';
  return to > from ? 'right' : 'left';
}

/** The attribute trio a navigation writes onto <html>. */
export function stampFor(
  fromPathname: string,
  toPathname: string,
  direction: string,
  base = '/',
): { to: TransitionKey; nav: 'forward' | 'back'; move: MoveKey } {
  return {
    to: transitionKey(toPathname, base),
    nav: direction === 'back' ? 'back' : 'forward',
    move: moveFor(fromPathname, toPathname, base),
  };
}

export function initPageTransition(base = '/'): void {
  let stamp = {
    to: 'plain' as TransitionKey,
    nav: 'forward' as 'forward' | 'back',
    move: 'plain' as MoveKey,
  };

  const write = () => {
    const root = document.documentElement;
    root.dataset.to = stamp.to;
    root.dataset.nav = stamp.nav;
    root.dataset.move = stamp.move;
  };

  document.addEventListener('astro:before-preparation', (event) => {
    const e = event as Event & { from?: URL; to: URL; direction: string };
    stamp = stampFor(e.from?.pathname ?? location.pathname, e.to.pathname, e.direction, base);
    // Written here for Astro's non-native fallback, where the outgoing page's
    // animation runs before the swap and would otherwise read the page it is
    // leaving instead of the one it is going to.
    write();
  });

  // Astro copies the incoming document's <html> attributes over this one during
  // the swap, which drops data-nav — no server render carries it. after-swap
  // fires inside the update callback, so re-writing here still lands before the
  // browser captures the new state.
  document.addEventListener('astro:after-swap', write);

  // The stamp is never cleared. Every navigation overwrites it, and the gesture
  // rules only match ::view-transition-* pseudo-elements, which exist solely
  // during a transition — so a stamp left standing paints nothing.
  //
  // It has to stay for the one rule that outlives the transition: data-to also
  // retimes the ribbon's own 0.9s ink-sweep. Removing the attribute when the
  // transition finishes would drop that override while the sweep is still
  // running, and the changed delay would snap the strip's fill forward.
  // A cold load carries no stamp at all, so the ribbon keeps its own timing
  // there, which is what the load choreography was tuned against.
}
