import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
// The named export, not the default: the package's default is a memo() object,
// which survives tsx's CJS interop but arrives as a namespace under Vite's.
// Memoising is our job anyway — see the cache below.
import { Flag } from 'react-svg-country-flags';
import { EXTRA_FLAGS } from './flags-extra.ts';

// ---------------------------------------------------------------------------
// Flags come from react-svg-country-flags: 203 hand-drawn 21x15 rounded cards,
// one React component each. The site ships no client JS, so we render them to
// static markup at build time and inline the result — React never reaches the
// browser. The build touches ~40k flags (199 destination pages x 199 rows), so
// the markup is memoised per (code, class) pair; the set is small and every
// page of the build is one process.
//
// The package covers 195 of our 199 economies; flags-extra.ts draws Macao,
// Taiwan, Saint Kitts and Nevis and Kosovo in the same style, and takes
// precedence over the package's blank. Anything outside both still gets the
// blank, which is the honest thing to show for a flag we do not have.
// ---------------------------------------------------------------------------

const cache = new Map<string, string>();

export function flagMarkup(iso2: string, className = 'flag'): string {
  const code = iso2.toUpperCase();
  const key = `${code}|${className}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  let markup = (EXTRA_FLAGS[code] ??
    renderToStaticMarkup(createElement(Flag, { country: code, className })))
    // The cards hardcode width="21" height="15"; presentation attributes beat
    // nothing but lose to CSS, so they are harmless — but stripping them lets
    // .flag size itself from the type around it without an !important arms race.
    .replace(/^(<svg\b[^>]*?)\s+width="\d+"/, '$1')
    .replace(/^(<svg\b[^>]*?)\s+height="\d+"/, '$1')
    // Every card names its mask "mask0_3_NN" and the blank names its "a", so
    // the ids are page-global and unguarded. Namespacing them keeps a flag from
    // shadowing a heading anchor; duplicates between two copies of the same
    // flag are harmless, since both define the identical mask.
    .replace(/\sid="([^"]+)"/g, ' id="flag-$1"')
    .replace(/url\(#([^)]+)\)/g, 'url(#flag-$1)');

  // The blank card is the one component in the package that takes no props and
  // declares no viewBox — without both it renders classless and, once the
  // width/height are gone, sizeless.
  if (!markup.includes('viewBox=')) {
    markup = markup.replace(/^<svg\b/, '<svg viewBox="0 0 21 15"');
  }
  if (className && !/^<svg\b[^>]*\sclass=/.test(markup)) {
    markup = markup.replace(/^<svg\b/, `<svg class="${className}"`);
  }

  // Decorative in every position we use it: the country name is always right
  // there in the same link, cell or heading.
  markup = markup.replace(/^<svg\b/, '<svg aria-hidden="true" focusable="false"');

  cache.set(key, markup);
  return markup;
}
