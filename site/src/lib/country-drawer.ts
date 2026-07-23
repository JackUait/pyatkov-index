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

/** Slide the host page left to clear the sheet (or restore it), re-pinning the
 *  scroll so the reflow — the column narrows, so everything above the fold grows
 *  taller — never moves what the reader is looking at. The reflow and the
 *  correcting scroll are measured and applied in one synchronous pass, so they
 *  land in a single paint; the scroll is forced `instant` because the page sets
 *  `scroll-behavior: smooth`, which would otherwise animate the correction a
 *  beat behind the reflow and surface exactly the jump we mean to hide. The CSS
 *  shift is gated to wide viewports; below that this toggles a class that does
 *  nothing, the delta is zero, and the call stays a safe no-op. */
function shiftPage(on: boolean): void {
  const body = document.body;
  if (body.classList.contains('drawer-shifted') === on) return;
  const anchor = topVisibleSection();
  const before = anchor ? anchor.getBoundingClientRect().top : 0;
  body.classList.toggle('drawer-shifted', on);
  if (!anchor) return;
  const delta = anchor.getBoundingClientRect().top - before;
  if (delta) window.scrollBy({ top: delta, behavior: 'instant' });
}

function setModal(open: boolean): void {
  // inert makes the page behind the drawer truly unreachable — no focus trap
  // arithmetic. The drawer root sits outside all three, so it stays live.
  for (const el of document.querySelectorAll('header, main, footer')) el.toggleAttribute('inert', open);
  const body = document.body;
  if (open) {
    // Compensate the scrollbar the lock removes, or the page shifts left.
    body.style.paddingRight = `${window.innerWidth - document.documentElement.clientWidth}px`;
    body.style.overflow = 'hidden';
  } else {
    body.style.paddingRight = '';
    body.style.overflow = '';
  }
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
  content.scrollTop = 0;
  content.focus({ preventScroll: true });
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
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status}`);
    const page = parsePage(await res.text());
    if (!page) throw new Error('no <main> in response');
    pages.set(url, page);
    if (seq === loadSeq) render(url, page);
  } catch {
    if (seq === loadSeq) content?.replaceChildren(failure(url));
  }
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
  if (a.closest('#country-drawer') && a.closest('.drawer-bar')) {
    // Drawer chrome: back/close are buttons, the full-page link bypasses above.
    return;
  }
  if (!countryPath(a.pathname, import.meta.env.BASE_URL)) return;
  // Capture phase, before the view-transition router's own click listener:
  // stopPropagation keeps this navigation out of its hands entirely.
  e.preventDefault();
  e.stopPropagation();
  open(a.href);
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
  document.addEventListener('click', (e) => {
    const t = e.target as Element | null;
    if (t?.closest?.('#drawer-close') || t?.closest?.('.drawer-scrim')) close();
    if (t?.closest?.('#drawer-back')) back();
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
