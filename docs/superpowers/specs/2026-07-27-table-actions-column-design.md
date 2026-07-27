# Table actions column: share and compare

Date: 2026-07-27

## Problem

The passport ranking on the front page and the destination weights table on
`/destinations` list 199 rows each and offer one affordance apiece: follow the
country's name to its page. A reader who wants to hand someone a result, or to
hold two countries against each other, has no way to do either from the table.

The site has no comparison feature at all today — no `/compare` route, no
selection state, no share or clipboard code anywhere. This design adds both.

## Scope

Both tables gain an actions column carrying two actions: **share** the country,
and **compare** it against a second one. A new `/compare` page renders the pair.

## The column

Each table gains a trailing, non-sortable header:

```html
<th scope="col"><span class="sr-only">Actions</span></th>
```

Every row gains a matching cell holding two borderless icon buttons — share
(`↗`) and compare (`⇄`) — always visible rather than hover-revealed, so touch
users reach them too. Muted at rest, inked on hover and focus. Each button
carries its own accessible name (`aria-label="Share South Korea"`) and
`data-iso3` / `data-name` attributes, so the behavior never parses the row's
rendered text back out.

They are `<button>` elements, not links: neither action navigates on click.
The cell takes a fixed width so the column does not jitter as rows sort. On
`/destinations` the row is already seven columns wide inside `.table-scroll`;
the actions cell sits at the far right and scrolls with the rest.

Pills and chrome labels stay retired — the buttons are bare glyphs.

## Share

`src/lib/share.ts` holds a pure text builder plus thin DOM glue.

```ts
shareText({ name, kind, rank, score, tied, url }): string
```

- passport: `South Korea ranks #1 on the Pyatkov Index with 94.4 — <url>`
- destination: `Japan is the 2nd-heaviest destination on the Pyatkov Index — <url>`
- a tied rank reads `ranks joint #4`, matching the table's `=` mark

The builder is unit-tested; the glue is DOM verification. The glue calls
`navigator.share({ text })` when present, falls back to
`navigator.clipboard.writeText`, and if both fail selects the text in a hidden
input so the reader can copy by hand. Success shows a brief inline confirmation
beside the button and announces it through a polite live region.

URLs are built from `import.meta.env.BASE_URL` via the existing `absUrl` in
`lib/seo.ts`, so the `/pyatkov-index/` base path is honored.

## Compare: picking

`src/lib/compare-pick.ts` is the state machine, written as pure functions:

```ts
pick(state, iso3) -> { state, target?: string }   // target = URL to navigate to
cancel(state)     -> state
```

Picking the same country twice, cancelling, and the second pick are decided
there and tested without a DOM.

The glue delegates from `tbody`, so sorting (which re-appends the same `<tr>`
elements) and filtering (which hides them) both leave a pick intact. The picked
row's compare button takes `aria-pressed="true"` and the row takes a marked
style. A bar docks at the bottom of the card — "🇰🇷 Comparing South Korea — pick
a second passport" with a cancel `✕`. Focus moves to the bar on the first pick;
Escape cancels.

## Compare: the page

199 countries yield 19,701 pairs per kind, so prerendering every pair is out
(~39,400 static pages). One page, `src/pages/compare.astro`, reads the pair from
the query string:

```
/compare/?kind=passport&a=kor&b=jpn
/compare/?kind=destination&a=usa&b=deu
```

The URL stays shareable and bookmarkable; only two pages are built.

**Payload.** The frontmatter emits a compact snapshot into a single JSON script
tag: the 199×199 access matrix encoded one character per cell (~41KB, against
775KB for `matrix.json` raw), plus per-country name, iso2, score, rank,
`equalScore`, `equalRank` and tier counts, for both passports and destinations.

**Rendering.** `src/lib/compare-view.ts` turns `(payload, kind, a, b)` into a
view model — headline pair, access-mix rows, equal-weight line, and the
differing-destinations list sorted by weight. That is where the tests live; the
`.astro` file only paints the model.

**Passports** compare on score, rank, access mix, equal-weight score, and which
destinations one opens more easily than the other.

**Destinations** compare on openness score, rank, admitted-passport mix, and
which passports one admits more easily — the same view model reading the matrix
down the other axis.

## Error handling

Decided in the pure layer, painted as a plain message:

- `a` or `b` missing, or naming an unknown country
- `a === b`
- `kind` absent or not one of `passport` / `destination`

Without JavaScript the page shows a short note pointing back to the two country
pages, rather than an empty shell.

## Testing

Unit tests (vitest) cover `shareText`, `compare-pick`, the matrix encoding
round-trip, and `compare-view` — including every error case above and the tie
wording. Browser verification covers the button wiring, the docked bar's
survival across sort and filter, and the clipboard fallback path.

## Files

| File | Change |
| --- | --- |
| `src/lib/share.ts` | new — share text builder + glue |
| `src/lib/compare-pick.ts` | new — pick state machine |
| `src/lib/compare-view.ts` | new — pair view model |
| `src/lib/compare-payload.ts` | new — build-time matrix encoding |
| `src/pages/compare.astro` | new — the compare page |
| `src/pages/index.astro` | actions column on the passport table |
| `src/pages/destinations.astro` | actions column on the weights table |
| `src/styles/global.css` | column, button, marked row, docked bar |
