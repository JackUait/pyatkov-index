# Persistent Chrome Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The header and footer persist as live DOM nodes across page navigations instead of being torn down and re-rendered.

**Architecture:** Astro's `ClientRouter` turns navigations into in-place document swaps; `transition:persist` moves the existing `<header>`/`<footer>` nodes into each new page. Client-side state the swap can't carry — `aria-current` in the persisted nav, the `data-top` flag on `<html>` — is re-derived on `astro:after-swap`. Per-page table/ribbon initializers move behind `astro:page-load` so they re-run for swapped-in content.

**Tech Stack:** Astro 7 (`astro:transitions`), TypeScript, Vitest (node env — pure helpers only, DOM glue is browser-verified), yarn 4.

**Spec:** `docs/superpowers/specs/2026-07-23-persistent-chrome-design.md`

## Global Constraints

- TDD: failing test first, minimal code to green, then refactor.
- Run only the new/changed test files, never the whole suite: `yarn vitest run <file>` from the repo root.
- No linter is configured in this repo; skip lint steps.
- Unit tests run in Vitest's default node environment — no DOM. Only pure helpers get unit tests (repo convention documented in `site/src/lib/table-ui.ts`).
- Dev server quirk: a background `yarn dev` may report failure yet keep serving — verify with `curl`, and use a fresh port each time.
- All site paths are under `site/`; lib imports from `.astro` files keep the `.ts` extension (existing convention).

---

### Task 1: `nav-current` module — shared path normalization + swap-time `aria-current`

**Files:**
- Create: `site/src/lib/nav-current.ts`
- Create: `site/src/lib/__tests__/nav-current.test.ts`
- Modify: `site/src/layouts/Base.astro` (frontmatter lines 10–11: replace the inline `norm` helper)

**Interfaces:**
- Consumes: nothing.
- Produces: `normalizePath(pathname: string): string` and `initNavCurrent(): void`, both imported by `Base.astro` (Task 2 wires `initNavCurrent` into the body script).

- [x] **Step 1: Write the failing test**

Create `site/src/lib/__tests__/nav-current.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { normalizePath } from '../nav-current.ts';

describe('normalizePath', () => {
  it('keeps the root as a bare slash', () => {
    expect(normalizePath('/')).toBe('/');
  });

  it('strips a trailing slash so /openness/ and /openness compare equal', () => {
    expect(normalizePath('/openness/')).toBe('/openness');
  });

  it('collapses repeated trailing slashes', () => {
    expect(normalizePath('/openness///')).toBe('/openness');
  });

  it('leaves an already-bare path alone', () => {
    expect(normalizePath('/openness')).toBe('/openness');
  });

  it('normalizes an empty path to the root', () => {
    expect(normalizePath('')).toBe('/');
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `yarn vitest run site/src/lib/__tests__/nav-current.test.ts`
Expected: FAIL — cannot resolve `../nav-current.ts`.

- [x] **Step 3: Write the implementation**

Create `site/src/lib/nav-current.ts`:

```ts
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
```

- [x] **Step 4: Run the test to verify it passes**

Run: `yarn vitest run site/src/lib/__tests__/nav-current.test.ts`
Expected: PASS (5 tests).

- [x] **Step 5: Replace Base.astro's inline `norm` with the shared helper**

In `site/src/layouts/Base.astro` frontmatter, replace:

```ts
const norm = (p: string) => p.replace(/\/+$/, '') || '/';
const here = norm(Astro.url.pathname);
```

with:

```ts
import { normalizePath } from '../lib/nav-current.ts';
const here = normalizePath(Astro.url.pathname);
```

(the `import` line goes with the other imports at the top of the frontmatter) and in the nav markup replace `norm(item.href)` with `normalizePath(item.href)`:

```astro
<a href={item.href} aria-current={here === normalizePath(item.href) ? 'page' : undefined}>{item.label}</a>
```

- [x] **Step 6: Typecheck the site**

Run: `cd site && yarn typecheck`
Expected: 0 errors (warnings/hints unchanged from before the edit).

- [x] **Step 7: Commit**

```bash
git add site/src/lib/nav-current.ts site/src/lib/__tests__/nav-current.test.ts site/src/layouts/Base.astro
git commit -m "feat(site): share one path normalizer between server nav and client"
```

---

### Task 2: ClientRouter + persisted header/footer + swap-aware elevation

**Files:**
- Modify: `site/src/layouts/Base.astro` (head, header/footer tags, body script)
- Modify: `site/src/lib/nav-elevation.ts` (`initNavElevation`)

**Interfaces:**
- Consumes: `initNavCurrent` from Task 1.
- Produces: the `astro:page-load` / `astro:after-swap` lifecycle that Task 3's page scripts rely on (dispatched by `<ClientRouter />`).

- [x] **Step 1: Add the router and persist directives in `Base.astro`**

Add to the frontmatter imports:

```ts
import { ClientRouter } from 'astro:transitions';
```

Add `<ClientRouter />` inside `<head>`, right after the `<meta name="theme-color" ...>` line.

Change the header/footer open tags (attribute only, contents untouched):

```astro
<header transition:persist="header">
```

```astro
<footer transition:persist="footer">
```

- [x] **Step 2: Wire `initNavCurrent` into the layout's body script**

Replace the body `<script>` block at the bottom of `Base.astro`:

```astro
<script>
  import { initNavElevation } from '../lib/nav-elevation.ts';
  import { initNavCurrent } from '../lib/nav-current.ts';
  initNavElevation();
  initNavCurrent();
</script>
```

- [x] **Step 3: Re-apply `data-top` after each swap in `nav-elevation.ts`**

In `initNavElevation`, after the `window.addEventListener('scroll', ...)` line, add:

```ts
  // A client-router swap replaces <html>'s attributes with the incoming
  // page's static ones, which never carry the JS-set flag. after-swap fires
  // before the new page's first paint, so re-applying here means the bar
  // never flashes elevated at the top of a swapped-in page.
  document.addEventListener('astro:after-swap', update);
```

- [x] **Step 4: Typecheck the site**

Run: `cd site && yarn typecheck`
Expected: 0 errors.

- [x] **Step 5: Commit**

```bash
git add site/src/layouts/Base.astro site/src/lib/nav-elevation.ts
git commit -m "feat(site): persist the header and footer across navigations"
```

---

### Task 3: Per-page initializers behind `astro:page-load`

**Files:**
- Modify: `site/src/pages/index.astro` (script block, ~line 117)
- Modify: `site/src/pages/openness.astro` (script block, ~line 63)
- Modify: `site/src/pages/destination/[iso3].astro` (script block, ~line 135)

**Interfaces:**
- Consumes: the `astro:page-load` event dispatched by Task 2's `<ClientRouter />` (fires on initial load and after every swap, after new scripts have run).
- Produces: nothing new — same page behavior, now swap-safe.

- [x] **Step 1: Wrap `index.astro`'s init calls**

Replace the script block with:

```astro
<script>
  import { initSortableTable } from '../lib/table-ui.ts';
  import { initRibbonTip } from '../lib/ribbon-tip.ts';

  // Module scripts run once per session under the client router; page-load
  // fires again after every swap, re-binding against the fresh DOM. On other
  // pages the element guards make these calls no-ops.
  document.addEventListener('astro:page-load', () => {
    initRibbonTip({ figure: '.ribbon-figure', ribbon: '.ribbon', tip: '.ribbon-tip' });
    initSortableTable({
      table: '#rankings',
      filter: '#filter',
      noResults: '#no-results',
      initialSort: 'rank',
      defaultAsc: { rank: true, name: true, score: false },
    });
  });
</script>
```

- [x] **Step 2: Wrap `openness.astro`'s init call**

Replace the script block with:

```astro
<script>
  import { initSortableTable } from '../lib/table-ui.ts';

  // Module scripts run once per session under the client router; page-load
  // fires again after every swap, re-binding against the fresh DOM. On other
  // pages the element guards make this call a no-op.
  document.addEventListener('astro:page-load', () => {
    initSortableTable({
      table: '#openness-table',
      filter: '#filter',
      noResults: '#no-results',
      initialSort: 'rank',
      defaultAsc: { rank: true, name: true, score: false },
    });
  });
</script>
```

- [x] **Step 3: Wrap `destination/[iso3].astro`'s init call**

Replace the script block with:

```astro
<script>
  import { initSortableTable } from '../../lib/table-ui.ts';

  // Module scripts run once per session under the client router; page-load
  // fires again after every swap, re-binding against the fresh DOM. On other
  // pages the element guards make this call a no-op.
  document.addEventListener('astro:page-load', () => {
    initSortableTable({
      table: '#holders',
      filter: '#filter',
      noResults: '#no-results',
      initialSort: 'credit',
      defaultAsc: { credit: false, name: true, rank: true, score: false },
    });
  });
</script>
```

- [x] **Step 4: Typecheck the site**

Run: `cd site && yarn typecheck`
Expected: 0 errors.

- [x] **Step 5: Commit**

```bash
git add site/src/pages/index.astro site/src/pages/openness.astro 'site/src/pages/destination/[iso3].astro'
git commit -m "feat(site): re-init page scripts on every client-router page load"
```

---

### Task 4: Browser verification (playwright-cli)

**Files:** none modified — verification only.

**Interfaces:**
- Consumes: everything above, running in a dev server.

- [x] **Step 1: Start the dev server on a fresh port**

Run (background): `cd site && yarn dev --port 4331`
Then verify it serves (the background task may report failure yet still serve):
`curl -s -o /dev/null -w '%{http_code}' http://localhost:4331/` → expected `200`.

- [x] **Step 2: Verify the header node truly persists**

With playwright-cli: open `http://localhost:4331/`, then evaluate
`document.querySelector('header').__probe = 'alive'`. Click the "Openness" nav link, wait for the URL to be `/openness/`, then evaluate `document.querySelector('header').__probe`.
Expected: `'alive'` — the same DOM node survived the navigation. (An expando property cannot survive a re-render; it only survives if the node was moved, not rebuilt.)

- [x] **Step 3: Verify `aria-current` follows the page**

On `/openness/` evaluate `document.querySelector('header nav a[aria-current="page"]').textContent`.
Expected: `'Openness'` (was `'Rankings'` before the swap).

- [x] **Step 4: Verify `data-top` after a swap**

Still on `/openness/` (freshly navigated, unscrolled) evaluate `document.documentElement.hasAttribute('data-top')`.
Expected: `true`. Then scroll (`window.scrollTo(0, 600)`) and re-evaluate → `false`.

- [x] **Step 5: Verify table interactivity after navigating away and back**

From `/openness/`, click "Rankings" in the nav. On `/`, click the "Passport" / name column header of `#rankings` and evaluate that `#rankings th[aria-sort]` exists; type `portugal` into `#filter` and confirm visible rows shrink (e.g. evaluate `[...document.querySelectorAll('#rankings tbody tr:not([hidden])')].length` is small and > 0).
Expected: sorting sets `aria-sort`, filtering hides rows — the re-init on `astro:page-load` worked.

- [x] **Step 6: Stop only the server this task started**

Kill the specific background dev-server task started in Step 1 (never other terminals/tasks).

- [x] **Step 7: Run the full static gate**

Run: `yarn typecheck-all`
Expected: both root `tsc` and `astro check` exit 0.
