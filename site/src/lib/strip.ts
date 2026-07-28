/** The anatomy strip: the passport spread's hundred, unrolled.
 *
 *  The hero draws the score as a 10×10 field of point-squares; this strip lays
 *  the same 100 points in one line and inks each by the tier whose span covers
 *  it — the earning tiers end to end at their reconciled points, the locked
 *  remainder closing the line. One tick is one point. A boundary falling
 *  inside a tick splits it: the tick carries every span crossing it, each with
 *  the fraction (0–1] where it ends, so the page can paint a hard-stop cut —
 *  the hc-part waterline turned on its side.
 *
 *  The last laid span is stretched to close at exactly 100: the caller drops
 *  spans below the displayed precision, and rounding drift must pool in the
 *  tail rather than leave unpainted ticks. Slivers under EPS of a tick are
 *  dropped the same way a 94.0 page draws no 0.97 square — nothing thinner
 *  than the eye's own precision. */
export type StripSpan = { tier: string; points: number };
export type StripTick = { i: number; spans: { tier: string; to: number }[] };

const EPS = 0.02;

export function stripTicks(spans: StripSpan[]): StripTick[] {
  const laid: { tier: string; end: number }[] = [];
  let edge = 0;
  for (const s of spans) {
    if (s.points <= 0) continue;
    edge = Math.min(100, edge + s.points);
    laid.push({ tier: s.tier, end: edge });
  }
  if (laid.length === 0) return [];
  laid[laid.length - 1].end = 100;

  const ticks: StripTick[] = [];
  for (let i = 0; i < 100; i++) {
    const cuts: StripTick['spans'] = [];
    let prev = i;
    for (const s of laid) {
      // Contributes less than a visible sliver past the last cut: skip it —
      // this covers both spans wholly before the tick and float-noise tails.
      if (s.end - prev < EPS) continue;
      cuts.push({ tier: s.tier, to: Math.min(s.end, i + 1) - i });
      prev = Math.min(s.end, i + 1);
      if (prev >= i + 1 - EPS) break;
    }
    // The final cut closes the tick exactly, so gradients never leak an
    // unpainted right edge.
    cuts[cuts.length - 1].to = 1;
    ticks.push({ i, spans: cuts });
  }
  return ticks;
}
