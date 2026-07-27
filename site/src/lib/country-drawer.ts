// ---------------------------------------------------------------------------
// The country drawer: passport and destination pages open in a panel on the
// right instead of navigating away. Links stay real links — middle-click,
// modifiers, no-JS and crawlers all get the full page — and the drawer fetches
// the same prerendered page and lifts its <main> into the panel. The pure
// helpers below are unit-tested; the initCountryDrawer wiring is DOM glue
// verified in the browser.
// ---------------------------------------------------------------------------
import { initSortableTable } from './table-ui.ts';
import { initDestSearch } from './dest-search.ts';
import { initRankTip } from './rank-tip.ts';

export type CountryKind = 'passport' | 'destination';

/** Which country page a pathname is, if any: `{base}passport/xxx/` or `{base}destination/xxx/`. */
export function countryPath(pathname: string, base: string): CountryKind | null {
  const prefix = base.endsWith('/') ? base : `${base}/`;
  if (!pathname.startsWith(prefix)) return null;
  const m = /^(passport|destination)\/[^/]+\/?$/.exec(pathname.slice(prefix.length));
  return m ? (m[1] as CountryKind) : null;
}

/** True only for the gesture that would navigate in place — anything else (middle
 *  click, cmd/ctrl/shift/alt) keeps its browser meaning and is left alone. */
export function isPlainLeftClick(e: {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): boolean {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

/** Whether a guess at the reader's next click is worth the bytes. A prefetch is
 *  a page they may never ask for, so Data Saver — which is the reader saying
 *  exactly "don't fetch what I didn't ask for" — vetoes it outright, and so do
 *  the connections where a speculative page would compete with the one they are
 *  actually reading. Everything else, including a browser that reports no
 *  connection at all, gets the warm path. */
export function shouldPrefetch(conn?: { saveData?: boolean; effectiveType?: string }): boolean {
  if (!conn) return true;
  if (conn.saveData) return false;
  return conn.effectiveType !== 'slow-2g' && conn.effectiveType !== '2g';
}

/** Warm a url at most once for the session. The pointer crosses a table row many
 *  times on its way down the ranking and each crossing raises the same intent, so
 *  the request is asked for once and the answer kept. Failures are not retried
 *  here on purpose: a click still fetches for itself, and a hover that missed
 *  should not keep re-missing every time the pointer passes. */
export function createPrefetcher(warm: (url: string) => void): (url: string) => void {
  const asked = new Set<string>();
  return (url) => {
    if (asked.has(url)) return;
    asked.add(url);
    warm(url);
  };
}

/** Crossing a link is not intent; resting on one is. A url fires only after the
 *  pointer has held it for `dwellMs`; hovering anything newer — another link or
 *  none at all — drops the pending ask, and jitter within the same link does not
 *  restart the clock. Without this, one swipe across the weight ribbon's 199
 *  slats reads as 199 separate intents and asks for dozens of full pages at
 *  once — enough to stall the page (and, in dev, the server) mid-gesture. */
export function createDwell(
  dwellMs: number,
  fire: (url: string) => void,
): { hover: (url: string | null) => void; cancel: () => void } {
  let pending: ReturnType<typeof setTimeout> | undefined;
  let pendingUrl: string | null = null;
  const cancel = () => {
    if (pending !== undefined) clearTimeout(pending);
    pending = undefined;
    pendingUrl = null;
  };
  return {
    hover(url) {
      if (url !== null && url === pendingUrl) return;
      cancel();
      if (url === null) return;
      pendingUrl = url;
      pending = setTimeout(() => {
        pending = undefined;
        pendingUrl = null;
        fire(url);
      }, dwellMs);
    },
    cancel,
  };
}

interface CountryPage {
  title: string;
  /** The page's <main>, detached and ready to adopt. */
  main: DocumentFragment;
  /** Page-scoped <style> text (Astro's scoped blocks travel with their markup). */
  styles: string[];
  /** Stylesheet hrefs the built page loads; missing ones are added to the head. */
  sheets: string[];
}

const pages = new Map<string, CountryPage>();
const stack: string[] = [];
let lastFocus: HTMLElement | null = null;
let loadSeq = 0;
let bound = false;

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel);
const root = () => $('#country-drawer');

/** Highlight the host-page table row whose country is showing in the drawer.
 *  Passing null clears it. Rows outside the drawer that link to `url` get the
 *  marker; the drawer's own copy of the page is skipped. */
function markActiveRow(url: string | null): void {
  for (const tr of document.querySelectorAll('tr.is-drawer-active')) tr.classList.remove('is-drawer-active');
  if (!url) return;
  const path = new URL(url).pathname;
  for (const a of document.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    if (a.closest('#country-drawer') || a.pathname !== path) continue;
    a.closest('tr')?.classList.add('is-drawer-active');
  }
}

function parsePage(html: string): CountryPage | null {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const main = doc.querySelector('main');
  if (!main) return null;
  const fragment = document.createDocumentFragment();
  // importNode, not adoptNode: scripts inside a parsed document are inert and
  // stay inert either way, but imported nodes leave the parsed doc intact.
  for (const child of [...main.children]) fragment.appendChild(document.importNode(child, true));
  return {
    title: doc.title,
    main: fragment,
    styles: [...doc.querySelectorAll('style')].map((s) => s.textContent ?? ''),
    sheets: [...doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].map((l) => l.href),
  };
}

/** The built site splits CSS per page; whatever the fetched page loads and this
 *  one doesn't gets appended once, keyed by href, and stays for the session. */
function ensureSheets(sheets: string[]): void {
  const loaded = new Set([...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].map((l) => l.href));
  for (const href of sheets) {
    if (loaded.has(href)) continue;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }
}

/** The topmost host-page section still in view — whatever the reader is looking
 *  at. We hold its viewport position across the reflow so the shift is silent. */
function topVisibleSection(): HTMLElement | null {
  const main = document.querySelector('main');
  if (!main) return null;
  for (const child of main.children) {
    if (child instanceof HTMLElement && child.getBoundingClientRect().bottom > 0) return child;
  }
  return main instanceof HTMLElement ? main : null;
}

/** Hold one element's line on screen while the layout under it keeps moving.
 *  Reads where the anchor sits now, and each call scrolls off however far it has
 *  drifted from where it stood when the pin was made. The target is fixed at
 *  creation, never re-read from a frame — a frame the correction could not fully
 *  cover must not ratchet the goal along with it. */
export function createScrollPin(readTop: () => number, scrollBy: (dy: number) => void): () => void {
  const target = readTop();
  return () => {
    const drift = readTop() - target;
    if (drift) scrollBy(drift);
  };
}

/** Whether the island should be tucked out of sight, decided from successive
 *  scroll offsets. Reading down the page is the one gesture the controls have
 *  nothing to add to, so they drop away; the first hint of scrolling back up is
 *  a reader looking for something, and they return before being asked for.
 *
 *  `jitter` is the movement too small to be a direction — a trackpad settling,
 *  a sticky header's own reflow — and leaves the state alone. Near the top the
 *  island always shows: there is nothing up there for it to be in the way of,
 *  and it is where a freshly opened sheet starts. Absent a `from`, the first
 *  call only arms the watcher — re-arming on a country swap must not read the
 *  reset to the top as an upward scroll from the last page's depth. A caller
 *  that already knows where the scrollport stands passes it and spends nothing:
 *  the first event of the reader's first gesture then counts like any other. */
export function createScrollTuck({
  jitter = 6,
  home = 32,
  from = null,
}: { jitter?: number; home?: number; from?: number | null } = {}): (top: number) => boolean {
  let last: number | null = from;
  let tucked = false;
  return (top) => {
    const previous = last;
    last = top;
    if (top <= home) return (tucked = false);
    if (previous === null) return tucked;
    const dy = top - previous;
    if (Math.abs(dy) < jitter) return tucked;
    return (tucked = dy > 0);
  };
}

/** Read a CSS duration as a number of milliseconds, falling back when the token
 *  is absent or in units we did not expect — a timing that lands on NaN would
 *  make the move never finish, which is worse than a stale constant. */
export function parseMs(value: string, fallback: number): number {
  const match = /^\s*(-?[\d.]+)(ms|s)\s*$/.exec(value);
  if (!match) return fallback;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n * (match[2] === 's' ? 1000 : 1) : fallback;
}

/** The sheet's slide and the column's are one gesture, so both take their timing
 *  from the same tokens in global.css rather than each keeping a copy. */
function moveTiming(): { duration: number; easing: string } {
  const root = getComputedStyle(document.documentElement);
  const easing = root.getPropertyValue('--drawer-ease').trim();
  return {
    duration: parseMs(root.getPropertyValue('--drawer-move'), 240),
    easing: easing || 'cubic-bezier(0.2, 0.7, 0.3, 1)',
  };
}

/** The columns the shift moves. The masthead's inner bar rides with <main> so the
 *  logo stays over the text it belongs to. */
function shiftedColumns(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('main, .nav-inner')];
}

/** The glides currently in flight, cancelled when a new shift starts so an
 *  open-then-close leaves one animation running, not two fighting over the same
 *  transform. */
let glides: Animation[] = [];

/** Move the host page left to clear the sheet (or restore it).
 *
 *  The layout change itself is one step — the class toggles, the column narrows,
 *  every paragraph re-wraps exactly once — and the *gliding* is a FLIP on top of
 *  it: measure where the columns sat before, measure where they sit after, then
 *  animate the difference away as a transform. Transforms run on the compositor,
 *  so the move costs no style, layout or paint per frame. Interpolating the
 *  margins instead would animate layout over a 199-row table, which is what made
 *  this move visibly step.
 *
 *  Narrowing makes the content above the fold taller, which would slide the table
 *  down at a fixed scroll offset — so the scroll is re-pinned in the same
 *  synchronous pass, landing with the reflow in a single paint. It is forced
 *  `instant` because the page sets `scroll-behavior: smooth`, which would
 *  otherwise animate the correction a beat behind and surface exactly the jump we
 *  mean to hide. Scrolling is vertical, so it cannot disturb the horizontal
 *  deltas measured around it.
 *
 *  The CSS shift is gated to wide viewports; below that this toggles a class that
 *  does nothing, every delta is zero, and the call stays a safe no-op. */
function shiftPage(on: boolean): void {
  const body = document.body;
  if (body.classList.contains('drawer-shifted') === on) return;

  for (const glide of glides) glide.cancel();
  glides = [];

  const columns = shiftedColumns();
  const anchor = topVisibleSection();
  const pin = anchor
    ? createScrollPin(
        () => anchor.getBoundingClientRect().top,
        (dy) => window.scrollBy({ top: dy, behavior: 'instant' }),
      )
    : null;
  const before = columns.map((el) => el.getBoundingClientRect().left);

  body.classList.toggle('drawer-shifted', on);
  pin?.();

  // Every other gesture on this site is gated on the media query in CSS; a
  // scripted animation has to ask for itself. Under reduce the layout change
  // above is the whole move, which is the treatment reduce should get anyway.
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const { duration, easing } = moveTiming();
  columns.forEach((el, i) => {
    const dx = before[i] - el.getBoundingClientRect().left;
    // Sub-pixel deltas are not worth a composited layer, and a zero delta is the
    // narrow-viewport no-op.
    if (Math.abs(dx) < 1) return;
    glides.push(
      el.animate({ transform: [`translateX(${dx}px)`, 'none'] }, { duration, easing }),
    );
  });
}

/** Whether a url is the country the sheet is already showing — the top of the
 *  stack, not merely somewhere in its history. Clicking the highlighted row
 *  again is a reader confirming where they are, not asking for anything, so the
 *  drawer holds still rather than re-rendering and throwing away their scroll. */
export function isShowing(url: string, history: readonly string[]): boolean {
  return history.length > 0 && history[history.length - 1] === url;
}

/** What a click made while the sheet is open should do, from which of the
 *  drawer's regions the target sits in.
 *
 *  Anything landing outside the panel dismisses. A click on another country is
 *  the one exception, and it never reaches this decision: the capture handler
 *  swaps the sheet and stops the event, so a reader walking down the ranking
 *  keeps the drawer while a reader reaching past it puts the drawer away. */
export function drawerClickAction(hit: {
  back: boolean;
  close: boolean;
  inPanel: boolean;
}): 'back' | 'close' | 'none' {
  if (hit.back) return 'back';
  if (hit.close) return 'close';
  return hit.inPanel ? 'none' : 'close';
}

function setModal(open: boolean): void {
  // Header and footer go inert so focus and pointer stay on the sheet and the
  // ranking — no focus-trap arithmetic. <main> is left live on purpose: the
  // reader can scroll the ranking behind the sheet and click another row to
  // swap the country showing, without the drawer closing. The scroll stays
  // unlocked too; the sheet is fixed, so the page just moves underneath it.
  for (const el of document.querySelectorAll('header, footer')) el.toggleAttribute('inert', open);
}

function render(url: string, page: CountryPage): void {
  const el = root();
  if (!el) return;
  const content = $('#drawer-content');
  const dialog = el.querySelector<HTMLElement>('.drawer-panel');
  if (!content || !dialog) return;

  ensureSheets(page.sheets);
  content.replaceChildren(page.main.cloneNode(true));
  // Re-attach the page's scoped styles next to the markup they style.
  for (const css of page.styles) {
    const style = document.createElement('style');
    style.textContent = css;
    content.appendChild(style);
  }
  dialog.setAttribute('aria-label', page.title);

  const full = $<HTMLAnchorElement>('#drawer-full');
  if (full) full.href = url;
  const back = $('#drawer-back');
  if (back) back.hidden = stack.length < 2;
  markActiveRow(url);

  // The injected copy of a country page carries the same table/filter ids as
  // the host page can, so behavior re-init is scoped to the drawer's subtree.
  initSortableTable({
    root: content,
    table: '#holders',
    filter: '#filter',
    noResults: '#no-results',
    initialSort: 'credit',
    defaultAsc: { credit: false, name: true, rank: true, score: false },
  });
  // The passport page's destination-map search, same deal: its own script
  // arrived inert with the fetched page, so the drawer wires the clone here.
  initDestSearch({ root: content });
  // And the door ledgers' pointer-steered row tips.
  initRankTip({ root: content });
  content.scrollTop = 0;
  resetTuck();
  content.focus({ preventScroll: true });
}

/** The island's watcher, re-armed whenever a country lands so the scroll reset
 *  that comes with it is not read as the reader shooting back to the top. */
let tuck = createScrollTuck();
let tuckQueued = false;

/** Show the island and forget which way the last page was going. */
function resetTuck(): void {
  tuck = createScrollTuck({ from: $('#drawer-content')?.scrollTop ?? 0 });
  $('.drawer-island')?.classList.remove('is-tucked');
}

/** Scroll fires far faster than the compositor can use, so the class is settled
 *  once per frame; the handler itself only reads scrollTop, which is cheap. */
function onDrawerScroll(e: Event): void {
  if (!(e.target instanceof HTMLElement) || e.target.id !== 'drawer-content') return;
  if (tuckQueued) return;
  tuckQueued = true;
  requestAnimationFrame(() => {
    tuckQueued = false;
    const content = $('#drawer-content');
    const island = $('.drawer-island');
    if (content && island) island.classList.toggle('is-tucked', tuck(content.scrollTop));
  });
}

/** The requests still on the wire, so a hover and the click that follows it share
 *  one fetch. Without this the click would start its own and the head start would
 *  be spent; with it, clicking mid-flight simply awaits the answer already coming. */
const inflight = new Map<string, Promise<CountryPage | null>>();

/** Fetch and parse a country page into the session cache, once per url. Resolves
 *  null on any failure — the caller decides whether that is worth showing. */
function fetchPage(url: string): Promise<CountryPage | null> {
  const cached = pages.get(url);
  if (cached) return Promise.resolve(cached);
  const pending = inflight.get(url);
  if (pending) return pending;
  const req = (async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status}`);
      const page = parsePage(await res.text());
      if (!page) throw new Error('no <main> in response');
      pages.set(url, page);
      return page;
    } catch {
      return null;
    } finally {
      inflight.delete(url);
    }
  })();
  inflight.set(url, req);
  return req;
}

async function load(url: string): Promise<void> {
  const seq = ++loadSeq;
  const content = $('#drawer-content');
  const cached = pages.get(url);
  if (cached) {
    render(url, cached);
    return;
  }
  content?.replaceChildren(skeleton());
  const page = await fetchPage(url);
  if (seq !== loadSeq) return;
  if (page) render(url, page);
  else content?.replaceChildren(failure(url));
}

function skeleton(): HTMLElement {
  const skel = document.createElement('div');
  skel.className = 'drawer-skel';
  skel.setAttribute('aria-label', 'Loading');
  skel.setAttribute('role', 'status');
  for (let i = 0; i < 8; i++) {
    const bar = document.createElement('i');
    if (i === 0) bar.className = 'skel-mark';
    skel.appendChild(bar);
  }
  return skel;
}

function failure(url: string): HTMLElement {
  const err = document.createElement('div');
  err.className = 'drawer-error';
  const p = document.createElement('p');
  p.textContent = 'This page could not be loaded in the drawer.';
  const a = document.createElement('a');
  a.className = 'btn btn-ghost';
  a.href = url;
  a.setAttribute('data-drawer-bypass', '');
  a.textContent = 'Open the full page instead';
  err.append(p, a);
  return err;
}

function open(url: string): void {
  const el = root();
  if (!el) return;
  if (el.hidden) {
    lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    el.hidden = false;
    setModal(true);
    shiftPage(true);
    // Two frames, not one: the panel must commit its off-screen transform
    // before is-open lands, or the slide-in plays as a pop.
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-open')));
  }
  // Every landing country also resets it, but the failure path never renders —
  // and a sheet that opens with its only escape hatch tucked away is a trap.
  resetTuck();
  stack.push(url);
  void load(url);
}

function close(): void {
  const el = root();
  if (!el || el.hidden) return;
  stack.length = 0;
  loadSeq++;
  markActiveRow(null);
  shiftPage(false);
  setModal(false);
  el.classList.remove('is-open');
  const panel = el.querySelector<HTMLElement>('.drawer-panel');
  const finish = () => {
    el.hidden = true;
    $('#drawer-content')?.replaceChildren();
  };
  // transitionend is the clean signal; the timeout covers reduced motion,
  // where no transition runs and the event never fires.
  let done = false;
  const once = () => {
    if (done) return;
    done = true;
    finish();
  };
  panel?.addEventListener('transitionend', once, { once: true });
  setTimeout(once, 400);
  lastFocus?.focus();
  lastFocus = null;
}

function onClick(e: MouseEvent): void {
  const a = (e.target as Element | null)?.closest?.('a[href]');
  if (!(a instanceof HTMLAnchorElement)) return;
  if (a.hasAttribute('data-drawer-bypass') || a.target === '_blank' || a.hasAttribute('download')) return;
  if (a.origin !== location.origin) return;
  if (!isPlainLeftClick(e)) return;
  if (a.closest('#country-drawer') && a.closest('.drawer-island')) {
    // Drawer chrome: back/close are buttons, the full-page link bypasses above.
    return;
  }
  if (!countryPath(a.pathname, import.meta.env.BASE_URL)) return;
  // Capture phase, before the view-transition router's own click listener:
  // stopPropagation keeps this navigation out of its hands entirely. It is
  // stopped even for the country already showing — that click asks for nothing,
  // but it must not fall through to a navigation or to the backdrop dismissal.
  e.preventDefault();
  e.stopPropagation();
  if (isShowing(a.href, stack)) return;
  open(a.href);
}

/** Which country page a pointer or focus event is aimed at, if any — the same
 *  test the click handler applies, minus the questions only a click can answer
 *  (which button, which modifiers). Hovering is not committing, so a link that
 *  bypasses the drawer or opens a tab is still worth warming: the reader is
 *  going to that page either way, and the browser cache is shared. */
function hoveredCountryUrl(e: Event): string | null {
  const a = (e.target as Element | null)?.closest?.('a[href]');
  if (!(a instanceof HTMLAnchorElement)) return null;
  if (a.origin !== location.origin) return null;
  if (!countryPath(a.pathname, import.meta.env.BASE_URL)) return null;
  return a.href;
}

const prefetch = createPrefetcher((url) => void fetchPage(url));

// Every country link in the templates carries `data-astro-prefetch="false"`, and
// a new one must too. The ClientRouter would otherwise prefetch the same url on
// the same hover, and its copy is the wrong one to keep: it stops at the HTTP
// cache, while the fetch below keeps the *parsed* page, which is what the panel
// needs — and the click it prefetches for never navigates anyway, because the
// drawer intercepts it. The attribute has to be in the markup rather than set
// from here: the router binds a mouseenter listener per anchor at page load and
// that listener never re-reads the attribute, so anything marked afterwards is
// already on its list.

/** A cold drawer waits on the network before it has anything to show, and that
 *  wait is longer than the whole opening gesture — so the row the pointer is
 *  resting on gets fetched before it is clicked. Resting, literally: the url
 *  goes through the dwell above, so a pointer merely passing through on its way
 *  somewhere else asks for nothing. By the time a real click lands the page is
 *  usually parsed and in the cache, and the drawer renders in the same frame it
 *  opens. `focusin` covers the keyboard, and skips the dwell: tabbing moves at
 *  key-repeat speed at worst, and landing on a row is already a settled intent. */
const dwell = createDwell(80, prefetch);
function onHover(e: Event): void {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (!shouldPrefetch(conn)) return;
  const url = hoveredCountryUrl(e);
  if (e.type === 'focusin') {
    if (url) prefetch(url);
    return;
  }
  dwell.hover(url);
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key !== 'Escape') return;
  const el = root();
  if (el && !el.hidden) {
    e.preventDefault();
    close();
  }
}

function back(): void {
  if (stack.length < 2) return;
  stack.pop();
  void load(stack[stack.length - 1]);
  const btn = $('#drawer-back');
  if (btn) btn.hidden = stack.length < 2;
}

export function initCountryDrawer(): void {
  if (bound || !root()) return;
  bound = true;
  // Document-level listeners bound once for the session; every handler queries
  // the live DOM, so they survive the client router swapping the body.
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeydown);
  // pointerover, not pointerenter: enter does not bubble, and one delegated
  // listener has to serve 199 rows that the drawer itself keeps replacing.
  document.addEventListener('pointerover', onHover);
  document.addEventListener('focusin', onHover);
  // Capture, because scroll does not bubble — and bound on the document rather
  // than the scrollport so it outlives the router swapping the body.
  document.addEventListener('scroll', onDrawerScroll, { capture: true, passive: true });
  document.addEventListener('click', (e) => {
    const el = root();
    if (!el || el.hidden) return;
    const t = e.target as Element | null;
    const action = drawerClickAction({
      back: !!t?.closest?.('#drawer-back'),
      close: !!t?.closest?.('#drawer-close'),
      inPanel: !!t?.closest?.('.drawer-panel'),
    });
    if (action === 'back') back();
    else if (action === 'close') close();
  });
  // A real navigation replaces the body: release the scroll lock and the inert
  // header/footer (both persist across swaps) before the new page lands.
  document.addEventListener('astro:before-swap', () => {
    stack.length = 0;
    loadSeq++;
    markActiveRow(null);
    // The new page lands unshifted; drop the class without re-pinning — there is
    // no stable anchor across a body swap, and the fresh page starts at its top.
    document.body.classList.remove('drawer-shifted');
    setModal(false);
    lastFocus = null;
  });
}
