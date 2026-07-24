# Contextual page transitions

Every page of the index owns an instrument: the front page lays a ribbon of ink,
openness raises a wall of doors, destinations weighs columns on a floor,
methodology rules a derivation down the page. Today all four arrive the same
way — Astro's default root cross-fade — and only then does each page play its
own choreography.

This design makes the arrival itself belong to the page being arrived at. The
destination page's instrument performs the transition, and the page's existing
load choreography continues out of it rather than starting fresh behind it.

## Goals

- The gesture is chosen by the page navigated **to**, never by the page left.
- The gesture and the destination's own load animation read as one motion at two
  scales, not two animations stacked.
- The masthead never moves. Only the argument changes.
- Nothing regresses for reduced motion, for browsers without view transitions,
  or for readers with JavaScript off.

## Non-goals

- Country pages get a hierarchy move, not an instrument. They are lookups.
- The country drawer is untouched. It already intercepts passport and
  destination links; this design governs the navigations that survive it —
  "Open full page", breadcrumbs, browser back, and no-JS.
- The existing per-page load choreography is not trimmed. It replays in full,
  by request.

## Mechanism

### The key

`src/lib/page-transition.ts` exposes a pure resolver:

| pathname                  | key       |
| ------------------------- | --------- |
| `/` (base root)           | `ink`     |
| `/openness/`              | `doors`   |
| `/destinations/`          | `scale`   |
| `/methodology/`           | `rule`    |
| `/passport/*`             | `country` |
| `/destination/*`          | `country` |
| anything else             | `plain`   |

Matching is trailing-slash-insensitive and base-aware, reusing `normalizePath`
from `lib/nav-current.ts` so the two modules can never disagree about what a
path is.

### The stamp

`initPageTransition()` listens on `astro:before-preparation`, reads the
**incoming** URL and the event's `direction`, and sets on `<html>`:

- `data-to="<key>"`
- `data-nav="forward" | "back"`

Both are re-stamped on `astro:after-swap`, because Astro copies the incoming
document's `<html>` attributes over the current ones during the swap and would
otherwise strip `data-nav`, which no server render carries. `after-swap` fires
inside the update callback, before the browser captures the new state, so the
re-stamp lands in time.

Neither is ever cleared. Every navigation overwrites both, and the gesture rules
only match `::view-transition-*` pseudo-elements, which exist solely during a
transition — a stamp left standing paints nothing.

It has to stay for the one rule that outlives the transition: `data-to` also
retimes the ribbon's own 0.9s ink-sweep on an `ink` arrival. Clearing the
attribute when the transition finishes at 520ms would drop that override with
the sweep still running, and the changed delay would snap the strip's fill
forward. A cold load carries no stamp, so the ribbon keeps the timing the load
choreography was tuned against.

Stamping ahead of the swap, rather than letting the incoming page's stylesheet
arrive and take over, is what makes the destination govern the gesture in *both*
paths: native `document.startViewTransition` and Astro's fallback, where the
old-phase animation would otherwise still be running under the outgoing page's
styles.

All transition CSS keys off `[data-to]` on the root element, so a single block
in `global.css` holds every gesture and no page file carries transition CSS.

### The named regions

Only two elements are named. The persisted masthead takes
`view-transition-name: masthead`, which lifts it out of the root snapshot so it
holds still through every swap. The current nav item's peach block takes
`nav-ink` (see below).

The masthead selector must be `body > header`, not `header`. A
`view-transition-name` has to be unique per document, and the passport page
heads each of its four destination groups with a `<header>`; a bare selector
names all five the same thing, and the browser answers a duplicate name by
aborting the entire transition — so leaving a passport page would not animate
at all.

Everything else — `<main>`, the footer, the paper background — stays in `root`,
and the five gestures are declared on `::view-transition-old(root)` and
`::view-transition-new(root)`.

Naming `<main>` instead would size its snapshot to `main`'s border box: on
openness and destinations that is a texture holding 199 doors or 199 columns,
most of it below the fold. The `root` snapshot is sized to the viewport no
matter how long the page is, so routing the gestures through `root` is both
simpler and strictly cheaper.

### Testing

`transitionKey` and the stamp/clear pair are pure and get
`src/lib/__tests__/page-transition.test.ts`, written first, in the shape of the
existing `nav-current.test.ts`. Cases: each route to its key, trailing-slash
insensitivity, base-prefixed paths, a sibling path that merely shares the base's
prefix, unknown paths to `plain`, and that direction reverses only the country
gesture while every other page keeps its instrument whichever way you arrived.

The listener wiring itself is not unit-tested — it is three `addEventListener`
calls over pure functions that are. It is verified in the browser instead.

## The five arrivals

### Rankings — the ink is drawn

`ink`, **520ms**, `cubic-bezier(0.2, 0.7, 0.3, 1)`.

The new page is revealed by a left-to-right wipe, `clip-path: inset(0 100% 0 0)`
to `inset(0 0 0 0)`, its leading edge carrying a saffron hairline — the wet edge
of the nib. The old page does not move or scale; ink covers paper.

The hairline is drawn by clipping *both* snapshots on the same curve with a 2px
gap between them, so the group's own fill shows through the gap and rides the
edge. A filter on the new snapshot cannot do it: `clip-path` is applied after
`filter`, so a drop-shadow at the clip edge is clipped away with everything
else. Methodology's ruled edge is drawn the same way, in ink rather than
saffron.

The wipe runs on `.ribbon`'s own curve — `ink-sweep` is a left-to-right
`background-size` fill on the same easing — and the ribbon's 0.15s delay is
retimed so its sweep picks up where the page wipe's edge crosses it. One stroke
continued at a smaller scale, not two strokes on one page. The rank table's
row-by-row `ink-sweep` continues behind it.

### Openness — the leaves open

`doors`, **560ms**.

The new page is revealed through an animated mask: a wipe intersected with eight
vertical bands separated by hairline jambs, so the advancing edge opens one leaf
at a time across the viewport. Its traversal rate is tuned to the wall's own
`calc(0.25s + var(--i) * 3ms)` door stagger, making the eight leaves and the 199
doors one motion at two scales. The old page fades beneath — paper behind a
door.

The wipe's soft zone is exactly one leaf wide. Any wider and the gradient spans
two leaves at once, and the sweep stops reading as doors at all.

The mask needs an `@property`-registered percentage to interpolate. Where that
is unsupported, `@supports` falls the gesture back to the plain left-to-right
wipe, which still reads as a door opening.

### Destinations — the scale tips

`scale`, **600ms**.

Two pans of one balance. The old page rises and lightens (`translateY(-3%)`,
fading); the new page drops in from `translateY(-4%)` and lands with a short
overshoot settle. The settle is `land-jolt`'s profile — its 16/38/46/62% beats,
the same damped bounce — restated at page scale, because `land-jolt`'s
amplitudes are in `em` and would be sub-pixel on `main`. The front page's
dropped pill and this page's landing are then visibly the same physics. The
columns' `door-open` stagger takes over from the landing.

### Methodology — it is ruled in

`rule`, **640ms**, near-linear.

A top-down reveal, `clip-path: inset(0 0 100% 0)` to `inset(0 0 0 0)`, the
leading edge a 1px ink hairline drawn at a constant rate — a ruled line has no
ease. The old page holds and fades. The numbered spine pours as it already does.

At 640ms this is the slowest of the five, deliberately: it is the page that asks
you to read.

### Country pages — one level down

`country`, **380ms**.

A hierarchy move, not an instrument. Forward: the new page steps in from
`scale(0.985)` and `translateY(8px)` while the old recedes to `scale(1.01)` and
fades. Back — breadcrumb, or `data-nav="back"` from a popstate — runs the pair
reversed. Fast, because these are lookups.

### Everything else

`plain`, **200ms** cross-fade. The 404 has no argument, so it gets no
instrument.

## The nav block travels

The peach `aria-current` highlight in the persisted masthead takes a
`view-transition-name`, so it morphs from the old nav item to the new one and
the highlight slides toward where you are going before the page paints.

`initNavCurrent` already updates `aria-current` on `astro:after-swap`, which
fires inside the view transition's update callback — the new state is therefore
set before the browser captures it, and the morph needs no further wiring.

Only one nav item carries the highlight at a time, so old and new snapshots
always pair. Navigating to a page with no nav item (a country page, the 404)
leaves no new snapshot; the highlight fades rather than morphing, which is the
correct reading — you have left the four top-level pages.

## Guardrails

**Reduced motion.** Under `prefers-reduced-motion: reduce`, every named region
drops to `view-transition-name: none` and the swap is instant. This matches how
the rest of the site gates motion: the animation simply does not exist rather
than being shortened.

**Snapshot cost.** Routing the gestures through `root` bounds every snapshot to
the viewport, which is what keeps the 199-door wall and the 199-column floor
affordable. Measured on the production build: median frame 9ms for doors against
8ms for the maskless gestures, and the occasional long frame belongs to the page
swap rather than the mask — ink, which composites nothing, has the worst single
frame of the three. The mask stays.

**Overlap.** Every gesture that fades one page into another must also set
`mix-blend-mode: normal`, and must clear the outgoing page early — a third of
the duration at most. The UA's `plus-lighter` default is built for its own
cross-fade and blows the overlap out to white; and two pages held at half
opacity for long are two pages you cannot read.

**Mask support.** The doors mask reads a registered custom property. Where
`@property` is unsupported the `var()` is invalid at computed-value time, so
`mask-image` resolves to its initial `none` and the page simply arrives
unmasked — the failure is a plain fade, never a blank screen.

**Scroll.** All wipes are viewport-relative, so arriving mid-page with restored
scroll still reads correctly — the gesture describes the viewport, not the
document.

**No JavaScript.** `ClientRouter` does nothing, navigation is a full page load,
and every page keeps the load choreography it has today.

## Files

| File                                        | Change                                            |
| ------------------------------------------- | ------------------------------------------------- |
| `src/lib/page-transition.ts`                | new — key resolver and the stamp/clear listeners  |
| `src/lib/__tests__/page-transition.test.ts` | new — written first                               |
| `src/layouts/Base.astro`                    | region names on main/header/footer; module init   |
| `src/styles/global.css`                     | one block: the five gestures, keyed on `[data-to]` |
