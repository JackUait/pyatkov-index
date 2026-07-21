import type { DestinationWeight, RawSignals } from './types.ts';

export function logMinMaxNormalize(values: Map<string, number>): Map<string, number> {
  const logs = new Map([...values].map(([k, v]) => [k, Math.log(v)]));
  const nums = [...logs.values()];
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const range = max - min;
  return new Map([...logs].map(([k, v]) => [k, range === 0 ? 1 : (v - min) / range]));
}

const LOG_SIGNALS = ['gdp', 'arrivals', 'migrants'] as const;

export function computeWeights(signals: Map<string, RawSignals>, names: Map<string, string>): DestinationWeight[] {
  const normalizedBySignal = new Map<string, Map<string, number>>();
  for (const key of LOG_SIGNALS) {
    const present = new Map<string, number>();
    for (const [iso3, s] of signals) if (s[key] !== null) present.set(iso3, s[key]!);
    normalizedBySignal.set(key, logMinMaxNormalize(present));
  }

  const out: DestinationWeight[] = [];
  for (const [iso3, s] of signals) {
    const normalized: RawSignals = {
      gdp: normalizedBySignal.get('gdp')!.get(iso3) ?? null,
      arrivals: normalizedBySignal.get('arrivals')!.get(iso3) ?? null,
      migrants: normalizedBySignal.get('migrants')!.get(iso3) ?? null,
      hdi: s.hdi, // already 0..1
    };
    const available = Object.values(normalized).filter((v): v is number => v !== null);
    out.push({
      iso3,
      name: names.get(iso3) ?? iso3,
      weight: available.reduce((a, b) => a + b, 0) / available.length,
      signals: s,
      normalized,
      signalsUsed: available.length,
    });
  }
  return out.sort((a, b) => b.weight - a.weight);
}
