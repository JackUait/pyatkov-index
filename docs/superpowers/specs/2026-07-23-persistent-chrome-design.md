# Persistent chrome across page navigations — design

**Date:** 2026-07-23
**Goal:** the elements that repeat on every page — the sticky header (brand mark + nav) and the footer — should persist across navigations instead of being torn down and re-rendered on every page load.

## Problem

The site is a plain Astro MPA. Every navigation is a full document load: the header and footer are destroyed and rebuilt, the nav repaints, scroll-derived state (`data-top`) is recomputed from scratch, and the whole page flashes. The chrome is identical on every page, so all of that work is waste — and visible waste, since the bar and footer visibly re-render.

## Approaches considered

1. **Astro `ClientRouter` + `transition:persist` (chosen).** Astro's client router intercepts same-origin navigations, fetches the next page, and swaps the document in place. Elements marked `transition:persist` are *moved* into the new document — the same DOM nodes, listeners and all. This is true persistence, framework-supported, and already shipped in the installed Astro 7.
2. **Native cross-document view transitions (CSS `@view-transition`).** Zero JS, but the chrome is still destroyed and rebuilt each navigation — only a visual snapshot crossfades. Fails the actual goal (persist, not "hide the re-render").
3. **Hand-rolled fetch-and-morph router.** Reinvents approach 1 with more code and more risk.

## Design

### Layout (`site/src/layouts/Base.astro`)

- Add `<ClientRouter />` (from `astro:transitions`) to `<head>`.
- Mark `<header transition:persist="header">` and `<footer transition:persist="footer">`. Explicit names keep matching stable regardless of DOM position.
- The server still renders `aria-current` for the initial load; a client updater takes over on swaps (below).

### Current-page nav state (`site/src/lib/nav-current.ts`, new)

The persisted header keeps its old DOM on navigation, so the server-rendered `aria-current` goes stale. A small module owns the logic:

- `normalizePath(p)` — pure; trailing-slash-insensitive comparison form. Base.astro's frontmatter imports it too, so server and client agree by construction (replaces the inline `norm`).
- `initNavCurrent()` — glue; on `astro:after-swap`, toggles `aria-current="page"` on each `header nav a` by comparing `normalizePath(link.pathname)` to `normalizePath(location.pathname)`.

### Nav elevation (`site/src/lib/nav-elevation.ts`)

The swap replaces `<html>`'s attributes with the incoming static ones, which never include the JS-set `data-top`. `initNavElevation()` additionally re-runs its `update()` on `astro:after-swap`, which fires before the next paint — no flash of a wrongly-elevated bar at the top of the new page. The existing `window` scroll listener survives swaps untouched (it lives on `window`, which is never swapped). The inline first-paint script in `<head>` is unchanged: it still covers full document loads, and inline scripts don't re-run on swaps.

### Per-page scripts (rankings, openness, destination tables; hero ribbon tip)

Hoisted module scripts execute once per browser session under the client router, so a direct `initSortableTable(...)` call goes dead after the first client-side navigation away and back. Each page script wraps its init calls in `document.addEventListener('astro:page-load', ...)`, which fires on the initial load and after every swap, after new scripts are loaded. The existing element guards (`if (!table) return`) already make each initializer a no-op on pages that lack its elements, so overlapping listeners from previously-visited pages are safe — including the shared `#filter`/`#no-results` ids, which are only reached after the page-specific table id matches.

### Animation

Astro's default ~180ms crossfade on swapped content stands (within DESIGN.md's 200ms-ease motion budget); persisted elements never animate. No custom `transition:animate` directives.

## Testing

- **Unit (TDD, node env, repo pattern):** `nav-current.test.ts` drives `normalizePath` — written first, red, then implemented. DOM glue stays out of unit tests, matching the documented convention in `table-ui.ts`.
- **Browser (playwright-cli):** tag the header node with a JS expando, navigate, and assert the same node survived; check `aria-current` follows the page; check `data-top` is set at the top of a swapped-in page; check table sort/filter still works after navigating away and back.
- **Static:** `astro check` on the site; root `yarn typecheck`.

## Out of scope

Prefetching, per-element content transitions (e.g. flag morphs), and any change to the hero headline animation's replay behavior.
