// Picking two countries out of a 199-row table is a two-step interaction with
// three ways to end: a second pick, the same pick again, or a cancel. All three
// are decided here, so the table glue only has to paint what comes back.
import type { CompareKind } from './share.ts';

export interface PickState {
  /** The country held while the table waits for a second, upper-cased ISO3. */
  first: string | null;
}

export const EMPTY_PICK: PickState = { first: null };

export interface PickResult {
  state: PickState;
  /** Both codes in pick order once the pair is complete, else null. */
  pair: [string, string] | null;
}

export function pick(state: PickState, iso3: string): PickResult {
  const code = iso3.toUpperCase();
  if (state.first === null) return { state: { first: code }, pair: null };
  // Clicking the held country again takes the pick back — the only way to undo
  // from the row itself, and the reason a same-code pick is not an error.
  if (state.first === code) return { state: EMPTY_PICK, pair: null };
  return { state: EMPTY_PICK, pair: [state.first, code] };
}

export function cancel(_state: PickState): PickState {
  return EMPTY_PICK;
}

/** The compare page's address for a pair. `base` is import.meta.env.BASE_URL,
 *  which always ends in a slash, so the path is a plain concatenation. */
export function compareUrl(base: string, kind: CompareKind, a: string, b: string): string {
  return `${base}compare/?kind=${kind}&a=${a.toLowerCase()}&b=${b.toLowerCase()}`;
}
