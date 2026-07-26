# Shared Page Transition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the four per-page root gestures with one direction-aware ink wipe; hierarchy keeps its depth step, now in both directions.

**Architecture:** A new pure resolver `moveFor(from, to)` maps a navigation to `right | left | down | up | plain` by nav order and hierarchy; `initPageTransition` stamps it as `data-move` beside the existing `data-to`/`data-nav`. The root gesture CSS re-keys from `[data-to]` to `[data-move]`; `data-to` survives untouched for the arrival-sync layer. `arrival.ts` mirrors viewport-framed waves under a `left` move.

**Tech Stack:** Astro 7 ClientRouter view transitions, vitest, Motion (lazy).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-26-shared-page-transition-design.md`.
- Nav order: `['/', '/openness', '/destinations', '/methodology']`.
- Durations: wipe 520ms `cubic-bezier(0.2, 0.7, 0.3, 1)`; step 380ms; plain 200ms.
- All gesture CSS stays inside `@media (prefers-reduced-motion: no-preference)`.
- TDD; run only the touched test file; commit per task; never push (deploys).

---

### Task 1: The move resolver

**Files:**
- Modify: `site/src/lib/page-transition.ts`
- Test: `site/src/lib/__tests__/page-transition.test.ts`

**Interfaces:**
- Produces: `export type MoveKey = 'right' | 'left' | 'down' | 'up' | 'plain'`; `export function moveFor(fromPathname: string, toPathname: string, base = '/'): MoveKey`.

- [ ] **Step 1: Write the failing tests** — append to the test file:

```ts
describe('moveFor', () => {
  it('wipes rightward toward a higher nav index', () => {
    expect(moveFor('/', '/openness/')).toBe('right');
    expect(moveFor('/openness/', '/methodology/')).toBe('right');
  });

  it('wipes leftward toward a lower nav index', () => {
    expect(moveFor('/methodology/', '/')).toBe('left');
    expect(moveFor('/destinations/', '/openness/')).toBe('left');
  });

  it('steps down into a country page from anywhere', () => {
    expect(moveFor('/', '/passport/kor/')).toBe('down');
    expect(moveFor('/openness/', '/destination/jpn/')).toBe('down');
    expect(moveFor('/passport/kor/', '/destination/jpn/')).toBe('down');
  });

  it('steps up out of a country page to any top-level page', () => {
    expect(moveFor('/passport/kor/', '/')).toBe('up');
    expect(moveFor('/destination/jpn/', '/methodology/')).toBe('up');
  });

  it('reads a fresh entrance as forward', () => {
    expect(moveFor('/nowhere/', '/destinations/')).toBe('right');
  });

  it('fades when the destination has no argument, or nothing moved', () => {
    expect(moveFor('/', '/404/')).toBe('plain');
    expect(moveFor('/openness/', '/openness/')).toBe('plain');
  });

  it('resolves under a deploy base', () => {
    expect(moveFor('/pyatkov-index/', '/pyatkov-index/openness/', '/pyatkov-index/')).toBe('right');
    expect(moveFor('/pyatkov-index/methodology/', '/pyatkov-index/', '/pyatkov-index/')).toBe('left');
  });
});
```

- [ ] **Step 2: Run to verify failure** — `cd site && yarn vitest run src/lib/__tests__/page-transition.test.ts` — expected: FAIL, `moveFor` not exported.

- [ ] **Step 3: Implement** in `page-transition.ts`:

```ts
export type MoveKey = 'right' | 'left' | 'down' | 'up' | 'plain';

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
```

- [ ] **Step 4: Run to verify pass** — same command, all green.
- [ ] **Step 5: Commit** — `feat(site): resolve every navigation to the direction it moves`.

---

### Task 2: Stamp data-move

**Files:**
- Modify: `site/src/lib/page-transition.ts` (`stampFor`, `initPageTransition`)
- Test: `site/src/lib/__tests__/page-transition.test.ts` (revise `stampFor` block)

**Interfaces:**
- Consumes: `moveFor` from Task 1.
- Produces: `stampFor(fromPathname: string, toPathname: string, direction: string, base = '/'): { to: TransitionKey; nav: 'forward' | 'back'; move: MoveKey }`.

- [ ] **Step 1: Revise the `stampFor` tests to the new shape** (replace the existing describe block):

```ts
describe('stampFor', () => {
  it('carries the destination key, the reading, and the move', () => {
    expect(stampFor('/', '/openness/', 'forward')).toEqual({ to: 'doors', nav: 'forward', move: 'right' });
  });

  it('reads a popstate as back without changing the move', () => {
    expect(stampFor('/', '/passport/prt/', 'back')).toEqual({ to: 'country', nav: 'back', move: 'down' });
  });

  it('treats any direction that is not back as forward', () => {
    expect(stampFor('/', '/openness/', '').nav).toBe('forward');
    expect(stampFor('/', '/openness/', 'unknown').nav).toBe('forward');
  });

  it('still lets the destination govern the arrival key on back', () => {
    expect(stampFor('/', '/methodology/', 'back').to).toBe('rule');
  });

  it('resolves under a deploy base', () => {
    const s = stampFor('/pyatkov-index/', '/pyatkov-index/destinations/', 'forward', '/pyatkov-index/');
    expect(s).toEqual({ to: 'scale', nav: 'forward', move: 'right' });
  });
});
```

- [ ] **Step 2: Run to verify failure** — old signature, FAIL.
- [ ] **Step 3: Implement** — extend `stampFor` and the listener:

```ts
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
```

In `initPageTransition`, the listener reads the origin off the event with the
live URL as fallback, and `write()` also sets `root.dataset.move = stamp.move`:

```ts
const e = event as Event & { from?: URL; to: URL; direction: string };
stamp = stampFor(e.from?.pathname ?? location.pathname, e.to.pathname, e.direction, base);
```

Initial stamp state gains `move: 'plain' as MoveKey`.

- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** — `feat(site): stamp the move beside the destination on every swap`.

---

### Task 3: Re-key the gestures to the move

**Files:**
- Modify: `site/src/styles/global.css` (the `---- Contextual page transitions ----` block only; arrival-sync and reduce blocks untouched)

- [ ] **Step 1: Replace the gesture rules.** Remove: `@property --vt-edge` and its comment, the doors block (`vt-doors`, masks), the scale block (`vt-lift`, `vt-drop`, `z-index`), the rule block (`vt-rule`, `vt-rule-under`, its group background). Keep and re-key:

```css
  /* plain — the 404 has no argument; nothing moved, nothing draws. */
  :root[data-move='plain']::view-transition-old(root),
  :root[data-move='plain']::view-transition-new(root) {
    animation-duration: 200ms;
  }

  /* right / left — the ink is drawn toward the page you are going to. ... */
  :root[data-move='right']::view-transition-old(root),
  :root[data-move='right']::view-transition-new(root),
  :root[data-move='left']::view-transition-old(root),
  :root[data-move='left']::view-transition-new(root) {
    mix-blend-mode: normal;
  }
  :root[data-move='right']::view-transition-group(root),
  :root[data-move='left']::view-transition-group(root) {
    background: var(--color-saffron);
  }
  :root[data-move='right']::view-transition-old(root) {
    animation: vt-ink-under 520ms cubic-bezier(0.2, 0.7, 0.3, 1) both;
  }
  :root[data-move='right']::view-transition-new(root) {
    animation: vt-ink 520ms cubic-bezier(0.2, 0.7, 0.3, 1) both;
  }
  :root[data-move='left']::view-transition-old(root) {
    animation: vt-ink-under-l 520ms cubic-bezier(0.2, 0.7, 0.3, 1) both;
  }
  :root[data-move='left']::view-transition-new(root) {
    animation: vt-ink-l 520ms cubic-bezier(0.2, 0.7, 0.3, 1) both;
  }
  @keyframes vt-ink-l {
    from { clip-path: inset(0 0 0 100%); }
    to { clip-path: inset(0 0 0 0); }
  }
  @keyframes vt-ink-under-l {
    from { clip-path: inset(0 2px 0 0); }
    to { clip-path: inset(0 calc(100% + 2px) 0 0); }
  }
```

The country pair re-keys `[data-to='country']` → `[data-move='down']`, its
back variant `[data-move='down'][data-nav='back']`, and gains:

```css
  :root[data-move='up']::view-transition-old(root) {
    animation: vt-advance-out 380ms cubic-bezier(0.2, 0.7, 0.3, 1) both;
  }
  :root[data-move='up']::view-transition-new(root) {
    animation: vt-recede-in 380ms cubic-bezier(0.2, 0.7, 0.3, 1) both;
  }
```

The `[data-to='ink'] .ribbon` retime survives as is (tuned in Task 5).

- [ ] **Step 2: Build** — `cd site && BASE_PATH=/pyatkov-index/ yarn build` — clean.
- [ ] **Step 3: Commit** — `feat(site): one wipe, drawn toward where you are going`.

---

### Task 4: The waves follow the edge

**Files:**
- Modify: `site/src/lib/arrival.ts` (`SWEEP`, `runWave`)

**Interfaces:**
- Consumes: `data-move` on `<html>` from Task 2.

- [ ] **Step 1: Mirror viewport-framed coordinates under a left move**, in `runWave` (the pure helpers stay untouched):

```ts
  const mirrored = frame === 'viewport' && document.documentElement.dataset.move === 'left';
  const delays = waveDelays(
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return mirrored ? window.innerWidth - r.right : r.left;
    }),
    span,
    frame === 'viewport' ? { left: 0, right: window.innerWidth } : undefined,
  );
```

And `SWEEP` becomes `{ doors: 0.52, scale: 0.6 }` to match the shared 520ms.

- [ ] **Step 2: Run the arrival tests** — `yarn vitest run src/lib/__tests__/arrival.test.ts` (if present; else typecheck via build) — green.
- [ ] **Step 3: Commit** — `feat(site): the wall waves from whichever side the edge enters`.

---

### Task 5: Browser verification

**Files:** none unless findings; fixes fold into this task.

- [ ] **Step 1:** `BASE_PATH=/pyatkov-index/ yarn build && BASE_PATH=/pyatkov-index/ yarn preview --port 4400`; playwright-cli session `-s=transitions`.
- [ ] **Step 2:** For each: rankings→methodology (`right`), methodology→rankings (`left`), destinations→openness (`left`, doors wave from the right), openness→destinations (`right`), rankings→passport (`down`), passport→rankings via breadcrumb (`up`), browser back into the passport page (`down` reversed): sample `getAnimations()` on `viewTransition.ready` for the expected `vt-*` names, and stretch `animation-duration` 10× via injected style for composition screenshots where the read matters (left wipe seam, wave direction).
- [ ] **Step 3:** Reduced motion: emulate, navigate all pairs, assert zero pseudo-element animations.
- [ ] **Step 4:** Tune the `[data-to='ink'] .ribbon` delay against the leftward edge by eye; adjust only if the pickup reads broken.
- [ ] **Step 5:** Commit anything changed — `fix(site): tune the shared wipe against the pages it arrives at`.

---

### Task 6: Full verification and the fold-back

- [ ] **Step 1:** `yarn verify` from the repo root — typecheck, all tests, pipeline, drift.
- [ ] **Step 2:** Fold any findings back into the spec; commit docs.
- [ ] **Step 3:** Do not push — pushing `main` deploys.
