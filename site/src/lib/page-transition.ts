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
