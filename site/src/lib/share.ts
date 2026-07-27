// The sentence a shared row carries. Kept apart from the button that fires it
// so the wording is testable and the glue below stays about transport only.
import { fmt } from './format.ts';

export type CompareKind = 'passport' | 'destination';

export interface ShareSubject {
  kind: CompareKind;
  /** Display name, already resolved through displayName. */
  name: string;
  rank: number;
  score: number;
  /** True when other rows share this rank — the table marks those with "=". */
  tied?: boolean;
  url: string;
}

/** English ordinal. The teens are the exception: 11th, not 11st. */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  const suffix = ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${suffix}`;
}

/** One line naming what the row says, ready for a share sheet or the clipboard.
 *
 *  The two kinds are ranked by different things and say so: a passport's rank is
 *  its score's, and the score is worth printing; a destination's rank in the
 *  table is its weight's, and its score is a different measure entirely
 *  (openness), so quoting it here would read as the thing being ranked. */
export function shareText(s: ShareSubject): string {
  // The name opens the sentence, so the fourteen countries whose name carries a
  // definite article need it capitalised. They arrive in withArticle's
  // mid-sentence form, which is the form the pick bar wants.
  const subject = s.name.replace(/^the /, 'The ');
  if (s.kind === 'destination') {
    const place = s.rank === 1 ? 'the heaviest' : `the ${ordinal(s.rank)}-heaviest`;
    return `${subject} is ${place} destination on the Pyatkov Index — ${s.url}`;
  }
  const place = s.tied ? `joint #${s.rank}` : `#${s.rank}`;
  return `${subject} ranks ${place} on the Pyatkov Index with ${fmt(s.score)} — ${s.url}`;
}

/** Which way to hand the line off.
 *
 *  The share sheet is the right move on a phone and the wrong one on a desktop:
 *  Chrome and Edge on macOS and Windows both expose navigator.share, where it
 *  raises an OS panel over the page to do what a silent clipboard copy does
 *  better. Coarse pointer is the honest test of "this is a device with a share
 *  sheet worth raising". */
export function prefersShareSheet(hasShareSheet: boolean, coarsePointer: boolean): boolean {
  return hasShareSheet && coarsePointer;
}
