# The Pyatkov Index

A weighted passport index. Classic passport rankings count destinations: visa-free
access to a micronation of 10,000 people is worth exactly as much as visa-free access
to the United States. That flattening is the thing this project rejects. The Pyatkov
Index weights every destination by how valuable access to it actually is, so weak
destinations fade toward zero and strong destinations dominate the score. A passport
that opens Germany, Japan, and the United States should outrank one that opens fifty
small islands, and here it does.

Each destination earns a weight from four public signals: GDP, international arrivals,
HDI, and international migrant stock. Every passport is then scored 0-100 by the share of
the reachable world's total destination *value* it can reach, with partial credit for
softer access tiers (visa on arrival, eVisa). "The world" here means the 199 sovereign-state
and SAR destinations in the upstream matrix; dependent territories with their own visa
regimes (Puerto Rico, Gibraltar, the Faroes, and ~17 others) are out of scope, inherited
from the upstream dataset, so the "share of the world's value" is measured over that
denominator rather than every visa-issuing entity on earth. The signature output is the **Δ vs count**
column: how far each passport rises or falls versus its **Count rank** — a naive ranking that treats
every destination as worth one, i.e. a plain "how many places can you go" count. That delta is the whole
argument of the index made visible in a single number.

## The score

Each destination `d` gets a weight from up to four public signals:

- **GDP** (World Bank, current US$) - log-scaled, then z-scored
- **International tourism, number of arrivals** (World Bank / UN Tourism, series
  `ST.INT.ARVL`) - log-scaled, then z-scored. This series counts arrivals of non-resident
  visitors and mixes overnight tourists with same-day visitors, with definitions varying
  by country; it is a proxy for how much the world travels to a destination, not a pure
  tourist count.
- **HDI** (UNDP Human Development Report) - z-scored on its natural scale (not logged)
- **International migrant stock, total** (World Bank, series `SM.POP.TOTL`) - log-scaled,
  then z-scored

Every signal is put on one common scale — a population **z-score** (how many standard
deviations above or below the destination average it sits), computed only over the
destinations that actually report that signal. GDP, arrivals, and migrant stock are logged
first because they span several orders of magnitude — GDP alone spans about six orders of
magnitude (roughly 5.7), from Tuvalu to the United States — so without logs only the US
and China would count. A destination's composite `Z` is the mean of whichever z-scores it
has; a missing signal (microstates often lack some) is simply left out of the mean and
never imputed off-scale.

The weight is then a tempered exponential of that composite:

```
weight(d) = exp(1.25 × Z(d))
```

The exponential is what lets destination *quality* genuinely dominate *count*: one
composite standard deviation of extra value is worth about `exp(1.25) ≈ 3.5×` more weight,
so weak destinations fade toward zero and a handful of strong ones dominate — while the
mapping stays smooth and strictly monotonic in `Z`. On the shipped weights, access to
Germany, Japan, and the United States alone outweighs access to the fifty weakest
destinations by about 1.9×, which is exactly the claim in the opening paragraph made true
on the numbers.

Access to each destination earns graded credit:

| Access tier | Credit |
| --- | --- |
| Visa-free / freedom of movement | 1.0 |
| Visa on arrival / eTA | 0.8 |
| eVisa | 0.5 |
| Visa required / no admission | 0 |

The passport score is the credit-weighted share of reachable destination value:

```
score = 100 × Σ credit(passport, d) × weight(d) / Σ weight(d)
```

where **both** sums run over every destination **including the passport's own country**,
which every passport admits visa-free (credit 1.0). A country's own destination value
therefore accrues to its own score: large, high-value home economies rank higher than they
would if their own weight were discarded — the United States, as the single most valuable
destination, gains the most. Because numerator and denominator cover the same full pool, a
passport with full visa-free access still scores exactly 100, and the number reads as
"percent of the world's destination value this passport can reach." The **Count rank**
used for the Δ column applies the same graded credits over that same full set of
destinations but sets every `weight(d) = 1` — a plain destination count — so the weighted
score and its count-based baseline are directly comparable.

## The openness rating

The same machinery runs backwards. A passport score asks how much of the world's destination
value a passport opens; an **openness** score asks how much of the world's *people* a
destination lets in:

```
openness(d) = 100 × Σ credit(p, d) × population(p) / Σ population(p)
```

Both sums run over all 199 passports **including the destination's own**, which always admits
its own citizens at full credit — the same self-inclusion the passport score uses, so a
destination open to every passport scores exactly 100 and the number reads as a plain
percentage. Credits are the same graded tiers. Population is the World Bank series
`SP.POP.TOTL`, latest available per country, used *only* as this denominator: it is not a
destination-weight signal, and adding it moved no passport score.

Alongside it sits the naive reading — every passport counted as one, regardless of how many
people hold it — and the gap between the two is the argument again, pointed the other way. A
destination open to fifty small countries but closed to India and China is not open. The
biggest population-weighting fall is **Nicaragua**: count rank #42, openness rank #105
(Δ −63).

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
  openness.ts          Computes the destination openness rating (the index inverted)
  build.ts             Orchestrates the above, runs sanity checks, writes JSON
  __tests__/           Vitest unit tests for the pipeline
site/                Astro static site
  src/data/            Generated JSON consumed by the pages (built by the pipeline)
  src/pages/           Rankings (/), passport detail, openness, destination detail,
                       destinations, methodology
  src/layouts/         Base layout
  src/styles/          global.css (the design system)
.github/workflows/   GitHub Pages deploy workflow
```

## Building the index

The flow is three steps: fetch raw data, run the pipeline, build the site.

```bash
yarn install
yarn fetch-data                    # download fresh source snapshots into data/raw/
yarn pipeline                      # parse + score, write JSON into site/src/data/
cd site && yarn install && yarn build   # static build into site/dist/
```

`yarn pipeline` prints a summary (top 5 passports, biggest risers and fallers) and
runs sanity checks that fail the build rather than publish nonsense. `yarn typecheck`
type-checks the pipeline (root `tsconfig.json` includes only `pipeline/`), and the Astro
site is type-checked separately with `cd site && yarn typecheck` (which runs `astro
check`); `yarn typecheck-all` from the repo root runs both. `yarn test` (Vitest) runs the
pipeline unit tests, and `yarn serve` (from the repo root) serves the built site locally.

### Refreshing data snapshots

`data/raw/` is committed so the site is reproducible without network access. To pull the
latest figures, re-run `yarn fetch-data` (it overwrites the raw snapshots in place), then
re-run `yarn pipeline` to regenerate the JSON, then rebuild the site. `yarn fetch-data`
downloads, from live sources:

- the **visa matrix** from the maintained
  [`imorte/passport-index-data`](https://github.com/imorte/passport-index-data) dataset
  (the successor to the archived `ilyankou/passport-index-dataset`);
- **GDP** (`NY.GDP.MKTP.CD`) and **migrant stock** (`SM.POP.TOTL`) from the World Bank API
  at each country's latest available year;
- **international arrivals** (`ST.INT.ARVL`) from the World Bank API over a fixed
  pre-COVID window (`date=2017:2019`), from which the pipeline picks one year per country,
  preferring 2019, then 2018, then 2017 — this avoids the COVID-collapsed 2020/2021 values;
- **HDI** from the UNDP **Human Development Report 2025** composite-indices CSV (its latest
  column is `hdi_2023`), which is Latin-1 encoded and decoded accordingly.

Because those four signals carry different observation years, the generated
`rankings.json` records a `builtAt` date (honestly, the date the pipeline last ran — not a
data vintage) plus a per-signal `vintages` block (series id, selection rule, and the
observation year each signal actually used). The site's methodology page renders that block
so every published number discloses its own vintage instead of one misleading snapshot date.

### Manual overrides

A few passport-issuing entities are missing from one or more automated sources, so
`data/raw/manual-overrides.json` supplies hand-researched values for the specific fields
that are absent — never for fields the pipeline can already fetch. Values are keyed by
ISO3 code:

```json
{
  "TWN": {
    "name": "Taiwan",
    "iso2": "TW",
    "gdp": 801500000000,
    "arrivals": 6487000,
    "hdi": 0.925,
    "migrants": 841627,
    "source": "GDP: IMF World Economic Outlook (Oct 2025), 2024 nominal current US$; HDI: DGBAS 2022; migrants: NIA foreign residents (ARC holders), year-end Dec 2023; ..."
  }
}
```

**Taiwan** is not in the World Bank or UNDP series at all, so all four of its signals are
supplied (GDP from the IMF WEO, HDI from DGBAS's national calculation, arrivals from the
Taiwan Tourism Administration, and foreign-resident stock from the National Immigration
Agency). **North Korea** is only partly missing: the override provides its GDP (Bank of
Korea nominal estimate) and a pre-pandemic arrivals estimate, while its **international
migrant stock is pulled automatically from the World Bank** (`SM.POP.TOTL`, 50,439 for
2024); no HDI is supplied because UNDP does not publish a composite HDI for North Korea.
**Vatican City** has no national-accounts GDP, so its GDP field carries an explicitly
labeled **proxy** — the Holy See's consolidated operating income — rather than a measured
figure.

Each override carries a `source` string documenting where every figure came from, its
year, and its basis (all GDP figures are nominal, current US$, to match the World Bank
pool). The pipeline merges these into the country name/iso2 map and treats the numeric
fields as signal values; any field left out (for example North Korea's migrant stock,
which the World Bank already provides, or its HDI, which no one computes) simply falls
through to the automated source or is dropped from that passport's signal average. The
build fails loudly if any destination ends up with zero available signals, or if the visa
matrix contains a country with no name in either the automated sources or the overrides,
so nothing is ever silently dropped.

## Deployment

`.github/workflows/deploy.yml` builds and publishes the site to GitHub Pages on every
push to `main`. It runs the tests, runs the pipeline, builds the site with the
repository name as the base path, and deploys the `site/dist/` artifact. Enable Pages
for the repository (Settings → Pages → Source: GitHub Actions) before the first run.

## Data sources and licenses

This project is only possible because of open data. Credit and thanks to:

- **[passport-index-data](https://github.com/imorte/passport-index-data)** — the
  visa/travel-access matrix (PassportIndex.org data), the maintained successor to Ilya
  Ilyankou's archived [`passport-index-dataset`](https://github.com/ilyankou/passport-index-dataset).
  Licensed **MIT**.
- **[World Bank Open Data](https://data.worldbank.org/)** - GDP, international tourism
  (number of arrivals), and international migrant stock indicators. Licensed **CC BY 4.0**.
- **[UNDP Human Development Reports](https://hdr.undp.org/)** - the Human Development
  Index, from the **Human Development Report 2025** composite-indices release. UNDP open data.

Manual-override figures cite their individual sources (IMF, national statistics offices,
Bank of Korea, the Holy See) inline in `data/raw/manual-overrides.json`. All raw data and
code live in this repo; the entire index is reproducible with one command.
