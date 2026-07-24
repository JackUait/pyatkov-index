# Contextual Page Transitions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every page navigation arrive with a gesture that belongs to the page being navigated *to* — the front page's ink stroke, openness's door leaves, destinations' tipping scale, methodology's ruled line — instead of one generic cross-fade.

**Architecture:** A client module stamps the incoming route's transition key onto `<html data-to="...">` before the swap. A single CSS block in `global.css`, keyed on that attribute, declares five animations on `::view-transition-old(root)` / `::view-transition-new(root)`. Only the sticky `<header>` and the nav's current-page peach block are lifted out of the root snapshot with their own `view-transition-name`s, so the masthead holds still and its highlight morphs between nav items.

**Tech Stack:** Astro 7 (`ClientRouter`, already enabled in `src/layouts/Base.astro`), plain CSS view transitions, Vitest 4 for the pure logic.

**Spec:** `docs/superpowers/specs/2026-07-25-contextual-page-transitions-design.md`

## Global Constraints

- **Repo layout.** The Astro site lives in `site/`. Client modules live in `site/src/lib/`, their tests in `site/src/lib/__tests__/`. All commands below run from the repo root, `/Users/jackuait/pyatkov-index`.
- **Test scoping.** Per the repo's rules, run only the test file you just wrote — `yarn test site/src/lib/__tests__/page-transition.test.ts` — never the whole suite. The one exception is the final task, which runs `yarn verify` as a release gate.
- **TDD.** Every task with logic writes the failing test first, watches it fail, then implements.
- **Branch.** Work commits straight to `main`. No feature branch. Do not push — pushing `main` deploys to GitHub Pages.
- **Base path.** `astro.config.mjs` sets `base: process.env.BASE_PATH ?? '/'`. It is `/` in dev and `/pyatkov-index/` in CI, so every route comparison must be base-aware. Use `import.meta.env.BASE_URL` at the call site and pass it in — never hardcode.
- **Motion gating.** The site's convention is that motion does not exist under `prefers-reduced-motion: reduce` rather than being shortened. Every animation added here lives inside `@media (prefers-reduced-motion: no-preference)`.
- **Durations, verbatim from the spec.** ink 520ms · doors 560ms · scale 600ms · rule 640ms · country 380ms · plain 200ms.
- **Style.** `global.css` comments explain *why* a rule exists in the voice of the surrounding file (see the notes on `header`, `.ribbon`, `main > *`). Match that density and tone. No new dependencies.

## File Structure

| File | Responsibility |
| --- | --- |
| `site/src/lib/page-transition.ts` | **new.** Pure route→key resolver, pure stamp resolver, and the thin `ClientRouter` event wiring. The only place that knows a route maps to a gesture. |
| `site/src/lib/__tests__/page-transition.test.ts` | **new.** Covers the two pure functions exhaustively. |
| `site/src/layouts/Base.astro` | **modify.** Call `initPageTransition` alongside the other three initializers. |
| `site/src/styles/global.css` | **modify.** Two edits: promote the nav's current-page block to a named pseudo-element, and add one contextual-transitions section holding the five gestures. |

Naming lives in `page-transition.ts`; painting lives in `global.css`. No page file gains transition CSS.

---

### Task 1: The route→key resolver

**Files:**
- Create: `site/src/lib/page-transition.ts`
- Test: `site/src/lib/__tests__/page-transition.test.ts`

**Interfaces:**
- Consumes: `normalizePath(pathname: string): string` from `site/src/lib/nav-current.ts` — trailing-slash-insensitive, returns `'/'` for the root or an empty string.
- Produces:
  - `type TransitionKey = 'ink' | 'doors' | 'scale' | 'rule' | 'country' | 'plain'`
  - `routePath(pathname: string, base?: string): string`
  - `transitionKey(pathname: string, base?: string): TransitionKey`

- [ ] **Step 1: Write the failing test**

Create `site/src/lib/__tests__/page-transition.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { routePath, transitionKey } from '../page-transition.ts';

describe('routePath', () => {
  it('passes a root-based path through unchanged', () => {
    expect(routePath('/openness/')).toBe('/openness');
  });

  it('strips the deploy base so CI paths resolve like dev ones', () => {
    expect(routePath('/pyatkov-index/openness/', '/pyatkov-index/')).toBe('/openness');
  });

  it('maps the base itself to the root', () => {
    expect(routePath('/pyatkov-index/', '/pyatkov-index/')).toBe('/');
  });

  it('leaves a path that does not sit under the base alone', () => {
    expect(routePath('/elsewhere/', '/pyatkov-index/')).toBe('/elsewhere');
  });

  it('does not mistake a sibling prefix for the base', () => {
    expect(routePath('/pyatkov-index-old/openness', '/pyatkov-index/')).toBe('/pyatkov-index-old/openness');
  });
});

describe('transitionKey', () => {
  it('gives the front page the ink stroke', () => {
    expect(transitionKey('/')).toBe('ink');
  });

  it('gives openness the door leaves', () => {
    expect(transitionKey('/openness/')).toBe('doors');
  });

  it('gives destinations the tipping scale', () => {
    expect(transitionKey('/destinations/')).toBe('scale');
  });

  it('gives methodology the ruled line', () => {
    expect(transitionKey('/methodology/')).toBe('rule');
  });

  it('gives passport pages the hierarchy move', () => {
    expect(transitionKey('/passport/prt/')).toBe('country');
  });

  it('gives destination pages the hierarchy move', () => {
    expect(transitionKey('/destination/jpn/')).toBe('country');
  });

  it('does not confuse the destinations index with a destination page', () => {
    expect(transitionKey('/destinations')).toBe('scale');
    expect(transitionKey('/destination/jpn')).toBe('country');
  });

  it('is trailing-slash-insensitive', () => {
    expect(transitionKey('/openness')).toBe(transitionKey('/openness/'));
  });

  it('resolves under a deploy base', () => {
    expect(transitionKey('/pyatkov-index/methodology/', '/pyatkov-index/')).toBe('rule');
    expect(transitionKey('/pyatkov-index/', '/pyatkov-index/')).toBe('ink');
  });

  it('falls back to plain for anything with no argument of its own', () => {
    expect(transitionKey('/404/')).toBe('plain');
    expect(transitionKey('/nowhere/at/all')).toBe('plain');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test site/src/lib/__tests__/page-transition.test.ts`

Expected: FAIL — `Failed to resolve import "../page-transition.ts"`.

- [ ] **Step 3: Write the minimal implementation**

Create `site/src/lib/page-transition.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn test site/src/lib/__tests__/page-transition.test.ts`

Expected: PASS, 15 tests.

- [ ] **Step 5: Commit**

```bash
git add site/src/lib/page-transition.ts site/src/lib/__tests__/page-transition.test.ts
git commit -m "feat(site): resolve a page's arrival gesture from the route it goes to"
```

---

### Task 2: The stamp, and its lifecycle

**Files:**
- Modify: `site/src/lib/page-transition.ts`
- Modify: `site/src/lib/__tests__/page-transition.test.ts`
- Modify: `site/src/layouts/Base.astro:235-242` (the client script block)

**Interfaces:**
- Consumes: `transitionKey` from Task 1.
- Produces:
  - `stampFor(pathname: string, direction: string, base?: string): { to: TransitionKey; nav: 'forward' | 'back' }`
  - `initPageTransition(base?: string): void`

**Why the lifecycle is shaped this way.** Astro's `ClientRouter` copies the incoming document's `<html>` attributes over the current element during the swap, which strips `data-nav` — no server render carries it. So the stamp is written twice: at `astro:before-preparation` (needed by Astro's non-native fallback path, where the outgoing animation runs *before* the swap) and again at `astro:after-swap` (which fires inside the update callback, before the browser captures the new state). It is cleared when the transition's `finished` promise resolves, so the ribbon retiming added in Task 5 cannot outlive its transition.

- [ ] **Step 1: Write the failing test**

Append to `site/src/lib/__tests__/page-transition.test.ts`:

```ts
describe('stampFor', () => {
  it('carries the destination key and a forward reading', () => {
    expect(stampFor('/openness/', 'forward')).toEqual({ to: 'doors', nav: 'forward' });
  });

  it('reads a popstate as back', () => {
    expect(stampFor('/passport/prt/', 'back')).toEqual({ to: 'country', nav: 'back' });
  });

  it('treats any direction that is not back as forward', () => {
    expect(stampFor('/', '').nav).toBe('forward');
    expect(stampFor('/', 'unknown').nav).toBe('forward');
  });

  it('still lets the destination govern on a back navigation', () => {
    // Direction only reverses the country gesture; every other page keeps its
    // own instrument no matter which way you arrived.
    expect(stampFor('/methodology/', 'back').to).toBe('rule');
  });

  it('resolves under a deploy base', () => {
    expect(stampFor('/pyatkov-index/destinations/', 'forward', '/pyatkov-index/').to).toBe('scale');
  });
});
```

Update the import at the top of the file to `import { routePath, stampFor, transitionKey } from '../page-transition.ts';`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test site/src/lib/__tests__/page-transition.test.ts`

Expected: FAIL — `stampFor is not a function`.

- [ ] **Step 3: Write the minimal implementation**

Append to `site/src/lib/page-transition.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn test site/src/lib/__tests__/page-transition.test.ts`

Expected: PASS, 20 tests.

- [ ] **Step 5: Wire it into the layout**

In `site/src/layouts/Base.astro`, replace the client script block at the bottom of `<body>`:

```astro
    <script>
      import { initNavElevation } from '../lib/nav-elevation.ts';
      import { initNavCurrent } from '../lib/nav-current.ts';
      import { initCountryDrawer } from '../lib/country-drawer.ts';
      import { initPageTransition } from '../lib/page-transition.ts';
      initNavElevation();
      initNavCurrent();
      initCountryDrawer();
      initPageTransition(import.meta.env.BASE_URL);
    </script>
```

- [ ] **Step 6: Verify the stamp lands in a real browser**

Start the dev server if it is not already up (`astro dev` daemonizes and is a singleton — check first):

```bash
curl -sI http://localhost:4321/ >/dev/null 2>&1 || (cd site && yarn serve &)
```

Then use the `playwright-cli` skill with a named session (never the shared `default`), e.g. `-s=transitions`. Open `http://localhost:4321/`, click the **Openness** nav link, and confirm during the swap that `document.documentElement.dataset.to === 'doors'`, then that it is gone once the page settles. Nothing should look different yet — no gesture CSS exists.

- [ ] **Step 7: Typecheck and commit**

```bash
yarn typecheck-all
git add site/src/lib/page-transition.ts site/src/lib/__tests__/page-transition.test.ts site/src/layouts/Base.astro
git commit -m "feat(site): stamp the incoming page's gesture on the root before every swap"
```

---

### Task 3: The nav block travels

**Files:**
- Modify: `site/src/styles/global.css` — the `header nav a[aria-current='page']` rules, in the global-nav section

**Interfaces:**
- Consumes: nothing from earlier tasks. `initNavCurrent` in `site/src/lib/nav-current.ts` already re-derives `aria-current` on `astro:after-swap`, which fires inside the view transition's update callback — so the new highlight is in place before the browser captures the new state, and the morph needs no JavaScript change.
- Produces: a `nav-ink` view-transition name, and a `masthead` name on `<header>`, both consumed by Task 4.

**Why a pseudo-element.** `view-transition-name` names an element, and the peach is currently just a `background` on the `<a>` — naming the `<a>` would drag its text into the morph. Moving the peach to an absolutely-positioned `::before` at `z-index: -1` gives the highlight its own box to morph, while the link text stays put. `<header>` is `position: sticky; z-index: 20`, so it is already a stacking context: a negative-z child paints above the header's own white background and below the link's inline text, which is exactly the layering the current rule produces.

- [ ] **Step 1: Replace the current-page rules**

In `site/src/styles/global.css`, replace:

```css
/* The current page is a highlighted word: the hero's peach block, reused as
   the active state so the nav quotes the headline device. */
header nav a[aria-current='page'] {
  color: var(--ink-95);
  background: var(--color-peach);
}
header nav a[aria-current='page']:hover {
  background: color-mix(in srgb, var(--color-peach) 94%, var(--color-ink));
}
```

with:

```css
/* The current page is a highlighted word: the hero's peach block, reused as
   the active state so the nav quotes the headline device. The block lives on a
   pseudo-element rather than the link's own background so it can carry a
   view-transition-name: only one nav item is current at a time, so the old and
   new snapshots always pair and the highlight slides along the masthead toward
   the page you are going to. The header is already a stacking context (sticky,
   z-index 20), so the negative-z block paints over the bar's white fill and
   under the link's own text. */
header nav a { position: relative; }
header nav a[aria-current='page'] { color: var(--ink-95); }
header nav a[aria-current='page']::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: var(--radius-btn);
  background: var(--color-peach);
}
header nav a[aria-current='page']:hover::before {
  background: color-mix(in srgb, var(--color-peach) 94%, var(--color-ink));
}
/* The bar itself is lifted out of the root snapshot so the five gestures below
   sweep the argument and never the masthead. */
@media (prefers-reduced-motion: no-preference) {
  header { view-transition-name: masthead; }
  header nav a[aria-current='page']::before { view-transition-name: nav-ink; }
}
```

Note the `header nav a:hover` rule immediately above still sets `background: rgba(0, 0, 0, 0.05)` on the link itself — leave it. Hover tint on the link, peach block on the pseudo-element; they stack correctly.

- [ ] **Step 2: Verify the highlight is unchanged at rest, and morphs on navigation**

With the dev server up, use `playwright-cli` (session `-s=transitions`) to screenshot the header on `/` and on `/openness/`. The peach block must sit exactly where it does today — same size, same 8px radius, text on top and fully legible. Then navigate between two nav items and confirm the block slides from one to the other rather than cross-fading.

Compare against the pre-change appearance if anything looks off: `git stash` the file, screenshot, `git stash pop`.

- [ ] **Step 3: Commit**

```bash
git add site/src/styles/global.css
git commit -m "feat(site): the nav's peach block slides to the page you are going to"
```

---

### Task 4: The five gestures

**Files:**
- Modify: `site/src/styles/global.css` — append one section at the end of the file.

**Interfaces:**
- Consumes: `<html data-to>` / `<html data-nav>` from Task 2; the `masthead` name from Task 3.
- Produces: nothing further tasks import.

**Why `root` and not `main`.** A named element's snapshot is sized to its border box. Naming `<main>` would mean capturing a texture holding all 199 doors or all 199 columns, most of it below the fold. The `root` snapshot is viewport-sized however long the page is, so every gesture below is declared on `::view-transition-old(root)` / `::view-transition-new(root)` and `<main>` stays unnamed.

**Why `mix-blend-mode: normal`.** The UA stylesheet gives both snapshots `mix-blend-mode: plus-lighter` so the default cross-fade doesn't dip through gray. Every gesture here paints one page over the other opaquely, so the blend has to be turned off or the overlap blows out to white.

- [ ] **Step 1: Append the transition section**

Add at the end of `site/src/styles/global.css`:

```css
/* ---- Contextual page transitions ----
   Every page here owns an instrument, and the arrival is that instrument: the
   front page's strip of ink, openness's wall of doors, the destinations scale,
   the derivation ruled down the page. lib/page-transition.ts stamps the page
   being navigated TO onto <html data-to>, so these rules are always chosen by
   where you are going, never by where you were.

   The gestures ride ::view-transition-*(root) — viewport-sized however long the
   page is — while the masthead is lifted out under its own name (see the nav
   rules above). Each pair turns off the UA's plus-lighter blend: these paint one
   page over another, and additive overlap would blow out to white. */

/* The registered property the doors mask interpolates. Its initial value is the
   END of the sweep on purpose: where @property is unsupported the var() is
   invalid at computed-value time, mask-image falls back to its initial `none`,
   and the page arrives unmasked. The failure mode is a plain fade, never a
   blank screen. */
@property --vt-edge {
  syntax: '<percentage>';
  inherits: false;
  initial-value: 116%;
}

@media (prefers-reduced-motion: no-preference) {
  /* plain — the 404 has no argument, so it gets no instrument. */
  :root[data-to='plain']::view-transition-old(root),
  :root[data-to='plain']::view-transition-new(root) {
    animation-duration: 200ms;
  }

  /* ink — the strip is drawn left to right. The old page does not move or
     scale: ink covers paper. The drop-shadow rides the clip edge as the wet
     edge of the nib, and is drawn off before the sweep clears the right margin
     so it never leaves a line down the viewport. */
  :root[data-to='ink']::view-transition-old(root),
  :root[data-to='ink']::view-transition-new(root) {
    mix-blend-mode: normal;
  }
  :root[data-to='ink']::view-transition-old(root) {
    animation: vt-hold 520ms linear both;
  }
  :root[data-to='ink']::view-transition-new(root) {
    animation: vt-ink 520ms cubic-bezier(0.2, 0.7, 0.3, 1) both;
  }
  @keyframes vt-ink {
    from {
      clip-path: inset(0 100% 0 0);
      filter: drop-shadow(2px 0 0 var(--color-saffron));
    }
    88% {
      filter: drop-shadow(2px 0 0 var(--color-saffron));
    }
    to {
      clip-path: inset(0 0 0 0);
      filter: drop-shadow(2px 0 0 transparent);
    }
  }
  /* The ribbon's own ink-sweep is delayed 0.15s on a cold load, where nothing
     precedes it. On an ink arrival the page wipe reaches the strip first, so
     the sweep is held until the edge gets there and the two read as one stroke
     continued at a smaller scale. */
  :root[data-to='ink'] .ribbon {
    animation-delay: 0.22s;
  }

  /* doors — eight leaves opening left to right, tuned to the wall's own
     0.25s + i × 3ms door stagger so the leaves and the 199 doors are one motion
     at two scales. The second gradient cuts the sweep into leaves with hairline
     jambs; the slivers it leaves behind at the end of the sweep vanish with the
     pseudo-element itself. */
  :root[data-to='doors']::view-transition-old(root),
  :root[data-to='doors']::view-transition-new(root) {
    mix-blend-mode: normal;
  }
  :root[data-to='doors']::view-transition-old(root) {
    animation: vt-fade-out 560ms cubic-bezier(0.2, 0.7, 0.3, 1) both;
  }
  :root[data-to='doors']::view-transition-new(root) {
    animation: vt-doors 560ms cubic-bezier(0.2, 0.7, 0.3, 1) both;
    mask-image:
      linear-gradient(90deg, #000 var(--vt-edge), transparent calc(var(--vt-edge) + 16%)),
      repeating-linear-gradient(90deg, #000 0 calc(12.5% - 1px), transparent calc(12.5% - 1px) 12.5%);
    mask-composite: intersect;
  }
  @keyframes vt-doors {
    from { --vt-edge: -16%; }
    to { --vt-edge: 116%; }
  }

  /* scale — two pans of one balance: the old page rises and lightens while the
     new one drops in and lands. The settle after the landing is land-jolt's
     profile, its beats and its damping, restated at page scale because
     land-jolt's amplitudes are in em and would be sub-pixel on a whole page. */
  :root[data-to='scale']::view-transition-old(root) {
    animation: vt-lift 600ms cubic-bezier(0.4, 0, 0.6, 1) both;
  }
  :root[data-to='scale']::view-transition-new(root) {
    animation: vt-drop 600ms both;
  }
  @keyframes vt-lift {
    to { transform: translateY(-3%); opacity: 0; }
  }
  @keyframes vt-drop {
    0% { transform: translateY(-4%); opacity: 0; animation-timing-function: cubic-bezier(0.4, 0, 0.35, 1); }
    40% { transform: translateY(0); opacity: 1; }
    50% { transform: translateY(8px); }
    63% { transform: translateY(-2.3px); }
    68% { transform: translateY(2px); }
    77% { transform: translateY(-0.7px); }
    100% { transform: translateY(0); }
  }

  /* rule — the derivation is ruled in top-down, the leading edge a hairline of
     ink. Near-linear on purpose: a ruled line has no ease. The slowest of the
     five, because it is the page that asks you to read. */
  :root[data-to='rule']::view-transition-old(root),
  :root[data-to='rule']::view-transition-new(root) {
    mix-blend-mode: normal;
  }
  :root[data-to='rule']::view-transition-old(root) {
    animation: vt-hold 640ms linear both;
  }
  :root[data-to='rule']::view-transition-new(root) {
    animation: vt-rule 640ms cubic-bezier(0.15, 0, 0.25, 1) both;
  }
  @keyframes vt-rule {
    from {
      clip-path: inset(0 0 100% 0);
      filter: drop-shadow(0 2px 0 var(--ink-95));
    }
    88% {
      filter: drop-shadow(0 2px 0 var(--ink-95));
    }
    to {
      clip-path: inset(0 0 0 0);
      filter: drop-shadow(0 2px 0 transparent);
    }
  }

  /* country — a hierarchy move, not an instrument. Forward steps in a level;
     back, read off the popstate, runs the same pair reversed. Fast, because
     these pages are lookups. */
  :root[data-to='country']::view-transition-old(root) {
    animation: vt-recede 380ms cubic-bezier(0.2, 0.7, 0.3, 1) both;
  }
  :root[data-to='country']::view-transition-new(root) {
    animation: vt-advance 380ms cubic-bezier(0.2, 0.7, 0.3, 1) both;
  }
  :root[data-to='country'][data-nav='back']::view-transition-old(root) {
    animation-name: vt-advance-out;
  }
  :root[data-to='country'][data-nav='back']::view-transition-new(root) {
    animation-name: vt-recede-in;
  }
  @keyframes vt-recede {
    to { transform: scale(1.01); opacity: 0; }
  }
  @keyframes vt-advance {
    from { transform: scale(0.985) translateY(8px); opacity: 0; }
  }
  @keyframes vt-advance-out {
    to { transform: scale(0.985) translateY(8px); opacity: 0; }
  }
  @keyframes vt-recede-in {
    from { transform: scale(1.01); opacity: 0; }
  }

  /* Shared: a snapshot that holds its ground while the other paints over it,
     and a plain fade for the page a door closes on. */
  @keyframes vt-hold {
    to { opacity: 1; }
  }
  @keyframes vt-fade-out {
    to { opacity: 0; }
  }
}

/* Motion off: the gestures do not exist, and the UA's own cross-fade is
   dropped with them — the same treatment every other animation on this site
   gets under reduce. */
@media (prefers-reduced-motion: reduce) {
  ::view-transition-old(root),
  ::view-transition-new(root) {
    animation: none;
    mix-blend-mode: normal;
  }
}
```

- [ ] **Step 2: Watch each of the five arrivals**

With the dev server up and `playwright-cli` on session `-s=transitions`, walk every gesture and confirm it reads as intended:

| Navigate | Expect |
| --- | --- |
| Openness → Rankings | Left-to-right wipe, saffron edge; the old page holds still; the ribbon's own sweep picks up as the edge crosses it |
| Rankings → Openness | Eight leaves opening left to right; the wall's doors continue the motion |
| Rankings → Destinations | Old page lifts, new drops and settles; no visible bounce on the masthead |
| Rankings → Methodology | Steady top-down reveal with a hairline edge |
| Openness → a destination page ("Open full page" in the drawer, or a direct link) | A quick step inward |
| Browser back from that country page | The same step, reversed |
| Any nav click | The masthead never moves; the peach block slides |

Screenshot mid-transition where a still tells you something. Fix timing or amplitude here, not later.

- [ ] **Step 3: Check the failure modes**

- **Reduced motion.** Emulate `prefers-reduced-motion: reduce` and navigate between all four top-level pages. Every swap must be instant, with no wipe, no fade, no dip through white.
- **Doors cost.** With the page open on the wall of 199 doors, record a performance trace across one Rankings → Openness navigation. If frames drop, delete the `mask-image` / `mask-composite` / `vt-doors` block for `[data-to='doors']` and point its `::view-transition-new(root)` at `vt-ink` instead — a plain left-to-right wipe still reads as a door opening. Say so in the commit message if you do.
- **Blend.** Watch for any flash of white where the two pages overlap. That is a missing `mix-blend-mode: normal`.

- [ ] **Step 4: Commit**

```bash
git add site/src/styles/global.css
git commit -m "feat(site): each page arrives as its own instrument — ink drawn, doors opened, the scale tipped, the rule pulled down"
```

---

### Task 5: Full verification

**Files:** none changed unless verification turns something up.

- [ ] **Step 1: Build and check the production output**

```bash
yarn verify
```

Expected: typecheck, all 246+ tests, the pipeline, and the drift check all pass.

- [ ] **Step 2: Confirm the built site behaves under a deploy base**

```bash
cd site && BASE_PATH=/pyatkov-index/ yarn build && yarn preview
```

Open `http://localhost:4321/pyatkov-index/` with `playwright-cli` and navigate between all four top-level pages. Every gesture must be the same as in dev — this is what proves `routePath`'s base handling is right in the environment CI actually deploys to. Stop the preview server when done.

- [ ] **Step 3: Confirm no-JavaScript navigation is untouched**

With JavaScript disabled, navigate the four nav links. Each must be a plain full page load with today's load choreography intact and no missing highlight in the masthead.

- [ ] **Step 4: Commit anything the verification changed**

If Steps 1–3 turned up nothing, there is nothing to commit and the work is done. Do not push — pushing `main` deploys to Pages, which is the user's call.
