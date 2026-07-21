# The Pyatkov Index

A weighted passport index. Classic passport rankings count destinations: visa-free
access to a micronation of 10,000 people is worth exactly as much as visa-free access
to the United States. That flattening is the thing this project rejects. The Pyatkov
Index weights every destination by how valuable access to it actually is, so weak
destinations fade toward zero and strong destinations dominate the score. A passport
that opens Germany, Japan, and the United States should outrank one that opens fifty
small islands, and here it does.

Each destination earns a weight from four public signals: GDP, international tourist
arrivals, HDI, and international migrant stock. Every passport is then scored 0-100 by
the share of the world's total destination *value* it can reach, with partial credit
for softer access tiers (visa on arrival, eVisa). The signature output is the **Δ
column**: how far each passport rises or falls versus a naive equal-weight ranking that
treats every country as worth one. That delta is the whole argument of the index made
visible in a single number.

## The score

Each destination `d` gets a weight from up to four normalized signals:

```
weight(d) = mean of the available normalized signals for d
```

- **GDP** (World Bank, current US$) - log-scaled, min-max normalized to 0-1
- **International tourist arrivals** (UNWTO via World Bank) - log-scaled, normalized
- **HDI** (UNDP) - already 0-1, used directly
- **International migrant stock** (via World Bank) - log-scaled, normalized

Log scaling matters: GDP spans five orders of magnitude, and without it only the US and
China would count. Missing signals are simply skipped (microstates often lack some), so
the weight is the mean of whatever exists.

Access to each destination earns graded credit:

| Access tier | Credit |
| --- | --- |
| Visa-free / freedom of movement | 1.0 |
| Visa on arrival / eTA | 0.8 |
| eVisa | 0.5 |
| Visa required / no admission | 0 |

The passport score is the credit-weighted share of total destination value:

```
score = 100 × Σ credit(passport, d) × weight(d) / Σ weight(d)
```

where the numerator is summed over every destination except the passport's own country,
while the denominator `Σ weight(d)` is summed over every destination, including it. It reads
as "percent of the world's destination value this passport can reach." The **equal-weight**
ranking used for the Δ column applies the same graded credits but sets every `weight(d) = 1`.

## Repo layout

```
data/raw/            Raw fetched snapshots (World Bank JSON, HDI CSV, visa matrix CSV)
  manual-overrides.json   Hand-researched values for sources that omit some countries
pipeline/            The build pipeline (TypeScript, run with tsx)
  fetch.ts             Downloads raw source snapshots into data/raw/
  ingest.ts            Parses the visa matrix
  signals.ts           Parses World Bank / HDI, applies overrides
  weights.ts           Computes normalized destination weights
  scores.ts            Computes passport scores, ranks, and deltas
  build.ts             Orchestrates the above, runs sanity checks, writes JSON
  __tests__/           Vitest unit tests for the pipeline
site/                Astro static site
  src/data/            Generated JSON consumed by the pages (built by the pipeline)
  src/pages/           Rankings (/), passport detail, destinations, methodology
  src/layouts/         Base layout
  src/styles/          global.css (the design system)
.github/workflows/   GitHub Pages deploy workflow
```

## Building the index

The flow is three steps: fetch raw data, run the pipeline, build the site.

```bash
npm install
npm run fetch-data                 # download fresh source snapshots into data/raw/
npm run pipeline                   # parse + score, write JSON into site/src/data/
cd site && npm install && npm run build   # static build into site/dist/
```

`npm run pipeline` prints a summary (top 5 passports, biggest risers and fallers) and
runs sanity checks that fail the build rather than publish nonsense. `npm run typecheck`
type-checks the whole repo, and `npm test` (Vitest) runs the pipeline unit tests.

### Refreshing data snapshots

`data/raw/` is committed so the site is reproducible without network access. To pull the
latest figures, re-run `npm run fetch-data` (it overwrites the raw snapshots in place),
then re-run `npm run pipeline` to regenerate the JSON, then rebuild the site. The
generated `rankings.json` records a `generatedAt` date so every snapshot is dated.

### Manual overrides

Some destinations are absent from the automated sources (Taiwan, North Korea, and
Vatican City are not in the standard World Bank / UNDP series). `data/raw/manual-overrides.json`
supplies hand-researched values for them, keyed by ISO3 code:

```json
{
  "TWN": {
    "name": "Taiwan",
    "iso2": "TW",
    "gdp": 756590000000,
    "arrivals": 6487000,
    "hdi": 0.926,
    "migrants": 936000,
    "source": "GDP: IMF WEO 2023; arrivals: Taiwan Tourism Administration 2023; ..."
  }
}
```

Each override carries a `source` string documenting where every figure came from. The
pipeline merges these into the country name/iso2 map and treats the numeric fields as
signal values; any field left out (e.g. HDI for North Korea, which UNDP does not
compute) is simply skipped, exactly like a missing automated signal. The build fails
loudly if the visa matrix contains a country with no name in either the automated
sources or the overrides, so new destinations can never be silently dropped.

## Deployment

`.github/workflows/deploy.yml` builds and publishes the site to GitHub Pages on every
push to `master`. It runs the tests, runs the pipeline, builds the site with the
repository name as the base path, and deploys the `site/dist/` artifact. Enable Pages
for the repository (Settings → Pages → Source: GitHub Actions) before the first run.

## Data sources and licenses

This project is only possible because of open data. Credit and thanks to:

- **[passport-index-dataset](https://github.com/ilyankou/passport-index-dataset)** by
  Ilya Ilyankou - the visa/travel-access matrix (PassportIndex.org data). Licensed
  **MIT**.
- **[World Bank Open Data](https://data.worldbank.org/)** - GDP, international tourist
  arrivals, and international migrant stock indicators. Licensed **CC BY 4.0**.
- **[UNDP Human Development Reports](https://hdr.undp.org/)** - the Human Development
  Index. UNDP open data.

Manual-override figures cite their individual sources (IMF, national statistics offices,
Bank of Korea) inline in `data/raw/manual-overrides.json`. All raw data and code live in
this repo; the entire index is reproducible with one command.
