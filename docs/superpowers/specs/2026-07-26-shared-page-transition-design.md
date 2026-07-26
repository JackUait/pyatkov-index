# One shared page transition

The contextual-transitions design gave every page its own arrival — ink drawn,
doors opened, the scale tipped, a rule pulled down. Each gesture was true to
its page, and together they read as four different sites. This design retires
the instruments in favor of one shared gesture, and moves the context into the
one place it survives unification: direction.

The site keeps a single transition — the front page's ink wipe — and the wipe
travels toward the page you are going to. The nav's peach block already slides
that way; now the page underneath moves with it, and chrome and argument tell
one spatial story.

This supersedes the gesture layer of
`2026-07-25-contextual-page-transitions-design.md`. Everything else in that
design — the stamp mechanism, the named masthead and nav regions, the drawer
exception, the arrival-sync layer, the guardrails — carries over unchanged.

## Goals

- One gesture between top-level pages, in two directions: the wipe sweeps
  toward the destination's place in the nav order.
- Hierarchy keeps its own move: stepping into a country page steps down,
  leaving one steps up.
- Each page keeps its own arrival choreography, re-anchored to the gesture as
  today — and the waves follow the edge, whichever side it enters from.
- Nothing regresses for reduced motion, non-native browsers, or JavaScript off.

## Non-goals

- No per-page gesture form survives. The doors mask, the scale's pans, and the
  ruled edge retire, along with `@property --vt-edge`.
- The country drawer, the masthead, and the nav-ink morph are untouched.

## Mechanism

### The move

`src/lib/page-transition.ts` gains a second resolver beside `transitionKey`:

```ts
export type MoveKey = 'right' | 'left' | 'down' | 'up' | 'plain';
moveFor(fromPathname, toPathname, base): MoveKey
```

The nav order is `['/', '/openness', '/destinations', '/methodology']` —
Rankings 0, Openness 1, Destinations 2, Methodology 3.

| from → to                        | move    |
| -------------------------------- | ------- |
| top-level → higher index         | `right` |
| top-level → lower index          | `left`  |
| anything → country page          | `down`  |
| country page → top-level         | `up`    |
| country page → country page      | `down`  |
| same page, or either end unknown | `plain` |
| unknown → top-level              | `right` |

An unknown origin entering a top-level page wipes rightward — a fresh
entrance reads forward. Both resolvers reuse `routePath`, so the base handling
cannot diverge.

### The stamp

`initPageTransition` stamps `data-move` on `<html>` beside `data-to` and
`data-nav`, from the event's `from` and `to` URLs on `astro:before-preparation`,
re-written on `astro:after-swap` like the others. `data-to` keeps being stamped
exactly as today: the arrival-sync CSS and `arrival.ts` key the page's own
choreography off it. Only the root gesture rules move to `[data-move]`.

`data-nav` survives for one case: `down` with `data-nav="back"` plays the
step reversed, as the country pair does today.

## The moves

### right / left — the ink is drawn

**520ms**, `cubic-bezier(0.2, 0.7, 0.3, 1)` — the front page's wipe, now the
site's. Both snapshots clipped on the same curve with a 2px gap riding the
seam as a saffron hairline; the old page never fades, it is carved. `left` is
the same pair mirrored: the edge enters from the right and travels leftward.

The group background stays saffron in both directions — the hairline is the
same wet edge whichever way the nib moves.

### down / up — the hierarchy step

**380ms**, unchanged in form: forward steps the new page in from
`scale(0.985) translateY(8px)` while the old recedes; `up` (breadcrumb or back
out of a country page — a move the instrument era never modeled and played as
a full instrument arrival) runs the pair reversed. `down` under
`data-nav="back"` reverses too, as today.

### plain

**200ms** cross-fade for the 404 and anything unresolved.

## The waves follow the edge

`arrival.ts` waves the openness wall by measured position against the
viewport, always left to right. Under a `left` move that wave would run
against its own gesture, so `runWave` reads `data-move`: for a
viewport-framed wave under `left`, each element's position is measured from
the right edge instead (`innerWidth - rect.right`), and the wave rides the
edge whichever way it travels. The pure helpers (`sweepDelay`, `waveDelays`)
are untouched — the mirror happens in the coordinates, not the math.

Self-framed pours — the destinations floor, which pours in ranking order,
heaviest first — ignore direction. Their order is the data's order, not the
gesture's.

`SWEEP.doors` drops from 0.56 to 0.52 to match the shared duration.

The ribbon's ink-sweep pickup on the front page keeps its retimed delay; every
top-level arrival at Rankings is a `left` move (it is index 0), so the delay
is tuned against the leftward edge in the browser, not assumed.

## Testing

`moveFor` is pure and extends `src/lib/__tests__/page-transition.test.ts`,
written first: every adjacent and non-adjacent nav pair both ways, into and
out of country pages, country to country, same-page, unknown paths on either
end, base-prefixed paths, and the stamp's `down`+`back` reversal. The
coordinate mirror in `arrival.ts` is covered by the existing `waveDelays`
tests' invariants and verified in the browser, where the wave's direction is
visible.

## Guardrails

All of the prior design's guardrails hold: reduced motion drops every name and
animation, the overlap rule (carve, don't smear), viewport-relative wipes,
no-JS full loads, and the drawer's squeezed masthead giving up its names. The
one-page-solid-at-every-x property of the carve is now site-wide by
construction, since every top-level move IS the carve.

## Files

| File                                        | Change                                              |
| ------------------------------------------- | --------------------------------------------------- |
| `src/lib/page-transition.ts`                | `MoveKey`, `moveFor`, stamp `data-move`             |
| `src/lib/__tests__/page-transition.test.ts` | `moveFor` cases, written first                      |
| `src/lib/arrival.ts`                        | mirror viewport-framed waves under `left`; SWEEP    |
| `src/styles/global.css`                     | gesture rules re-keyed to `[data-move]`; doors/scale/rule/`--vt-edge` removed; mirrored ink pair added |
