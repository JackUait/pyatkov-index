/* The weigh-in reads the weights table the way the pipeline wrote it:
 * weight = exp(1.25 × Z), Z the mean of the destination's available signal
 * z-scores. Everything here is phrased against that formula so the page's
 * captions and cell inks can never drift from the numbers they describe. */

/** What one standard deviation above the world average multiplies a weight by. */
export const SIGMA_MULTIPLIER = Math.exp(1.25);

/** How many destinations sit above the unit weight — the perfectly average
 *  destination weighs exactly 1 by construction, so this is the count of the
 *  above-average world. Strictly above: 1.0 IS the average. */
export function aboveUnitCount(weights: number[]): number {
  return weights.filter((w) => w > 1).length;
}

/** How many of the lightest destinations it takes, together, to outweigh the
 *  heaviest one. Zero when the rest of the table can never tip it. */
export function counterweightCount(weights: number[]): number {
  if (weights.length < 2) return 0;
  const ascending = [...weights].sort((a, b) => a - b);
  const heaviest = ascending[ascending.length - 1];
  let sum = 0;
  for (let i = 0; i < ascending.length - 1; i++) {
    sum += ascending[i];
    if (sum >= heaviest) return i + 1;
  }
  return 0;
}

/** The weight formula run backwards: the mean z-score a weight implies. */
export function impliedZ(weight: number): number {
  return Math.log(weight) / 1.25;
}

// The tint ramp caps at three sigma — the table's own extremes sit just inside
// it — and the two directions are deliberately unequal: marigold (the weight
// color) shouts up to a 92% mix, the below-average wash whispers up to 14%,
// the ribbon tail's gray. Both mix toward the white card the cells sit on.
const TINT_CAP_SIGMA = 3;
const MARIGOLD_MAX_PCT = 92;
const WASH_MAX_PCT = 14;

/** The ink a z-score cell wears: a marigold mix above the world average, a
 *  quiet ink wash below, null where there is nothing to say — a missing
 *  signal, or a mix that rounds to 0%. */
export function zTint(z: number | null): string | null {
  if (z === null) return null;
  const depth = Math.min(Math.abs(z) / TINT_CAP_SIGMA, 1);
  const pct = Math.round(depth * (z > 0 ? MARIGOLD_MAX_PCT : WASH_MAX_PCT));
  if (pct === 0) return null;
  const hue = z > 0 ? 'marigold' : 'ink';
  return `color-mix(in srgb, var(--color-${hue}) ${pct}%, var(--color-white))`;
}
