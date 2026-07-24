/* The wall of doors reads the openness table three ways. Each threshold is
 * phrased against what the site actually prints (scores round to one
 * decimal), so a door the table shows as 100.0 is never excluded from
 * "open to practically everyone" by a hidden 99.98. */

/** How many destinations clear the half-the-world line. Strictly above: the
 *  caption says "more than half", so an exact 50.0 may not be counted. */
export function openToHalfCount(scores: number[]): number {
  return scores.filter((s) => s > 50).length;
}

/** How many destinations the site displays at 100.0 — doors open to
 *  practically everyone. */
export function openToAllCount(scores: number[]): number {
  return scores.filter((s) => s >= 99.95).length;
}

/** How many destinations the site displays at 0.0 — doors open to no one. */
export function openToNoneCount(scores: number[]): number {
  return scores.filter((s) => s < 0.05).length;
}
