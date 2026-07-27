// matrix.json is 199 x 199 tier names — 775KB of "visa-free" repeated. The
// compare page needs all of it (either country can be either side), but only
// four values ever appear, so each cell travels as one character: ~40KB, small
// enough to inline in the page rather than fetch.
import { TIERS, type Tier } from './credit.ts';

/** Tier index -> code. Position in TIERS is the code, so the two can't drift. */
const CODES = '0123';
/** Any cell the matrix doesn't rate, or rates with a name we don't know. */
const UNRATED = '.';

/** One row of the access matrix, encoded against a fixed destination order. */
export function encodeAccessRow(order: string[], row: Record<string, string>): string {
  return order
    .map((iso3) => {
      const i = (TIERS as readonly string[]).indexOf(row[iso3]);
      return i === -1 ? UNRATED : CODES[i];
    })
    .join('');
}

/** The tier at a position in an encoded row, or null where nothing is rated. */
export function tierAt(encoded: string, index: number): Tier | null {
  const i = CODES.indexOf(encoded[index] ?? UNRATED);
  return i === -1 ? null : TIERS[i];
}
