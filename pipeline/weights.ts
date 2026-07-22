import type { DestinationWeight, RawSignals } from './types.ts';

/**
 * Population z-score normalization (divide by N, not N-1).
 *
 * With `log: true` the values are logged first (for the heavy-tailed magnitude
 * signals gdp/arrivals/migrants) and non-positive values throw loudly, matching
 * the old log-normalizer's guard. With `log: false` the values are used raw
 * (HDI, which is already a bounded index and must NOT be logged — M2).
 *
 * A zero-variance pool (single value, or all equal) yields 0 for every entry,
 * so such a signal contributes neutrally to the composite instead of NaN.
 */
export function zScoreNormalize(values: Map<string, number>, opts: { log: boolean }): Map<string, number> {
  if (opts.log) {
    for (const [k, v] of values) {
      if (v <= 0) throw new Error(`zScoreNormalize: non-positive value for ${k}: ${v}`);
    }
  }
  const xs = new Map([...values].map(([k, v]) => [k, opts.log ? Math.log(v) : v]));
  const nums = [...xs.values()];
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  const variance = nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length; // population sd
  const sd = Math.sqrt(variance);
  return new Map([...xs].map(([k, v]) => [k, sd === 0 ? 0 : (v - mean) / sd]));
}

// Signals normalized on a log scale (heavy-tailed magnitudes); HDI is normalized raw.
const LOG_SIGNALS = ['gdp', 'arrivals', 'migrants'] as const;

// Count-vs-quality temperature dial: one composite-sd of quality is worth exp(BETA)
// (~3.49x) more destination value. Fixed data-independent constant; the README thesis
// holds for all BETA >= ~1.03, and 1.25 clears it with headroom while keeping the
// smallest dynamic range of the candidate formulas.
const BETA = 1.25;

export function computeWeights(signals: Map<string, RawSignals>, names: Map<string, string>): DestinationWeight[] {
  // Normalize all FOUR signals to one common z-scale (M2). Each normalization runs
  // only over destinations that actually HAVE that signal, so a missing signal is
  // simply omitted from the composite mean and never lands off-scale.
  const normalizedBySignal = new Map<string, Map<string, number>>();
  for (const key of LOG_SIGNALS) {
    const present = new Map<string, number>();
    for (const [iso3, s] of signals) if (s[key] !== null) present.set(iso3, s[key]!);
    normalizedBySignal.set(key, zScoreNormalize(present, { log: true }));
  }
  const hdiPresent = new Map<string, number>();
  for (const [iso3, s] of signals) if (s.hdi !== null) hdiPresent.set(iso3, s.hdi);
  normalizedBySignal.set('hdi', zScoreNormalize(hdiPresent, { log: false }));

  const out: DestinationWeight[] = [];
  for (const [iso3, s] of signals) {
    const normalized: RawSignals = {
      gdp: normalizedBySignal.get('gdp')!.get(iso3) ?? null,
      arrivals: normalizedBySignal.get('arrivals')!.get(iso3) ?? null,
      migrants: normalizedBySignal.get('migrants')!.get(iso3) ?? null,
      hdi: normalizedBySignal.get('hdi')!.get(iso3) ?? null,
    };
    const available = Object.values(normalized).filter((v): v is number => v !== null);
    if (available.length === 0) {
      throw new Error(`computeWeights: country ${iso3} has zero available signals`);
    }
    // Composite = arithmetic mean of available z-scores; weight = tempered exponential.
    const composite = available.reduce((a, b) => a + b, 0) / available.length;
    out.push({
      iso3,
      name: names.get(iso3) ?? iso3,
      weight: Math.exp(BETA * composite),
      signals: s,
      normalized,
      signalsUsed: available.length,
    });
  }
  return out.sort((a, b) => b.weight - a.weight);
}
