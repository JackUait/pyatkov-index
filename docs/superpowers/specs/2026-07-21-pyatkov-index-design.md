# Pyatkov Index — Design

**Date:** 2026-07-21
**Status:** Approved (methodology, pipeline, and site sections approved in brainstorming)

## What this is

A passport index where destination countries are *not* equal. Classic indexes (Henley
et al.) count every visa-free destination as 1 point, so access to a micronation counts
the same as access to the United States. The Pyatkov Index gives every destination its
own weight based on how valuable access to it actually is. Weak destinations fade to
near-zero influence; strong destinations dominate the score.

**Deliverable:** a public static website with the full weighted ranking, per-passport
pages, a destinations weight table, and a methodology page.

## Scoring methodology

### Destination weights

Each of the ~199 destinations gets a composite weight from four signals:

| Signal | Source | Transform |
|---|---|---|
| GDP (current US$) | World Bank | log, then min–max normalize to 0–1 |
| International tourist arrivals | UNWTO via World Bank | log, then min–max normalize to 0–1 |
| HDI | UNDP | already 0–1, used directly |
| International migrant stock (absolute) | UN DESA | log, then min–max normalize to 0–1 |

- Log scaling is required because GDP, arrivals, and migrant stock are heavy-tailed
  (5+ orders of magnitude); without it only the US and China would carry weight.
- **Composite weight = arithmetic mean of the available normalized signals.**
- Missing signals (common for microstates) are handled by averaging over the signals
  that exist; each destination's record flags which signals were present.
- No hard cutoff and no tiers: weak destinations are filtered out *naturally* by
  carrying near-zero weight.

### Access credit

From the passport-index visa matrix, per (passport, destination) pair:

| Access type | Credit |
|---|---|
| Visa-free / freedom of movement | 1.0 |
| Visa on arrival / eTA | 0.8 |
| eVisa | 0.5 |
| Visa required / no admission | 0.0 |

A passport's own country is excluded from its score.

### Passport score

```
raw(p)   = Σ over destinations d≠p of  credit(p, d) × weight(d)
score(p) = 100 × raw(p) / Σ over all d of weight(d)
```

Scale: 0–100. Reads as "percent of the world's total destination value this passport
can reach." A hypothetical passport with visa-free access everywhere scores 100.

The site also computes each passport's **equal-weight rank** (every destination = 1,
same graded credits) to display the Δ column — how many places weighting moves each
passport.

## Data & pipeline

Single repo, TypeScript throughout.

```
data/raw/          committed snapshots: passport-index-matrix.csv, gdp.csv,
                   arrivals.csv, hdi.csv, migrant-stock.csv
pipeline/
  ├─ ingest.ts     parse raw CSVs, reconcile country names → ISO3
  ├─ weights.ts    normalize signals, compute composite weights
  ├─ scores.ts     apply access credits × weights, rank passports
  └─ build.ts      orchestrates, emits site/src/data/*.json
site/              static frontend (Vite + TypeScript)
```

Key decisions:

- **Raw data is committed**, not fetched at build time. Builds are reproducible and
  never break on a moved URL. Refreshing snapshots is a documented manual step.
  Primary visa-matrix source: the open `ilyankou/passport-index-dataset`
  (PassportIndex.org data).
- **Country reconciliation:** all five datasets map to ISO3 codes through one explicit
  alias table. The pipeline **fails the build loudly** on any unmatched country name —
  never silently drops a row.
- **Outputs:**
  - `rankings.json` — every passport: score, rank, equal-weight rank, Δ, counts per
    access type
  - `weights.json` — every destination: composite weight + the four raw/normalized
    signal values (full transparency)
  - `matrix.json` — per-passport destination access lists for passport pages

### Testing

The pipeline is pure functions (normalize, weight, score), each developed test-first
(TDD) against small synthetic fixtures — e.g. four fake countries with known GDPs,
asserting exact expected weights and scores. No runtime error handling is needed on
the site; all validation happens in the pipeline at build time.

## The site

Static, pre-rendered HTML for all pages (SEO-friendly), Vite + TypeScript, no heavy
framework. Deployable to GitHub Pages.

1. **Home / rankings** — full sortable table with client-side search: rank, flag,
   country, Pyatkov score, and the signature **Δ vs equal-weight rank** column showing
   how weighting moves each passport.
2. **Passport page** (`/passport/XYZ`) — score breakdown: highest-weight destinations
   reachable, most valuable destinations *not* reachable, contribution per access tier.
3. **Destinations page** — every destination's composite weight and signal values.
4. **Methodology page** — formula, sources, snapshot dates in plain language.

Visual design gets dedicated attention during implementation (frontend design skill):
a dense, clear data product — not a generic table dump.

## Out of scope (v1)

- Live re-weighting by visitors (the "interactive explorer" mode) — the static
  architecture keeps this cheap to add later.
- Automated data refresh from source APIs.
- Historical trends / score over time.
