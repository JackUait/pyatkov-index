export type AccessCategory = 'visa-free' | 'visa-on-arrival' | 'e-visa' | 'visa-required';

export interface VisaMatrix {
  countries: string[]; // ISO3, in matrix order; same set for passports and destinations
  access: Map<string, Map<string, AccessCategory>>; // access.get(passport).get(destination)
}

export interface RawSignals {
  gdp: number | null;
  arrivals: number | null;
  hdi: number | null;
  migrants: number | null;
}

export interface DestinationWeight {
  iso3: string;
  name: string;
  weight: number; // 0..1
  signals: RawSignals;
  normalized: RawSignals;
  signalsUsed: number; // 1..4
}

export interface PassportRow {
  iso3: string;
  name: string;
  score: number; // 0..100
  rank: number;
  equalScore: number; // 0..100
  equalRank: number;
  delta: number; // equalRank - rank; positive = rises under weighting
  counts: Record<AccessCategory, number>;
}

export interface DestinationOpenness {
  iso3: string;
  name: string;
  score: number; // 0..100 — credit-weighted share of the world's population that can enter
  rank: number;
  equalScore: number; // 0..100 — every passport counts one
  equalRank: number;
  delta: number; // equalRank - rank; positive = population weighting lifts it
  counts: Record<AccessCategory, number>;
  points: Record<AccessCategory, number>; // per-tier contribution; sums to score
}
