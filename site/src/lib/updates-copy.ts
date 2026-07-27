import { displayName, withArticle } from './format.ts';

/** The changelog's voice. Every sentence on the updates page is generated from the
 *  override ledger here, so no card can ever say something the data does not. */

type Party = { iso3: string; name: string; iso2: string };
type Direction = 'opened' | 'closed' | 'unchanged';

/** What a matrix cell means to the person holding the passport. */
export function accessPhrase(cell: string): string {
  if (/^\d+$/.test(cell)) {
    const days = Number(cell);
    return `visa-free for ${days} ${days === 1 ? 'day' : 'days'}`;
  }
  switch (cell) {
    case 'visa free':
      return 'visa-free';
    case 'visa on arrival':
      return 'a visa on arrival';
    case 'eta':
      return 'a travel authorisation';
    case 'e-visa':
      return 'an eVisa';
    case 'no admission':
      return 'no admission at all';
    default:
      return 'a visa';
  }
}

/** The swatch class the rest of the site already uses for this tier, so the changelog
 *  inherits the key rather than inventing a second colour language. eTA sits with visa on
 *  arrival because that is how the index credits it: no adjudication before you fly. */
export function tierClass(cell: string): string {
  if (/^\d+$/.test(cell) || cell === 'visa free') return 'tier-visa-free';
  if (cell === 'visa on arrival' || cell === 'eta') return 'tier-visa-on-arrival';
  if (cell === 'e-visa') return 'tier-e-visa';
  return 'tier-visa-required';
}

const VERB: Record<Direction, string> = {
  opened: 'opened to',
  closed: 'closed to',
  unchanged: 'reclassified',
};

/** "Togo opened to 38 passports" — the destination acts, the passports are counted.
 *  A single passport is named instead of counted: "1 passport" is the template tell. */
/** Some rows fix a cell upstream got wrong rather than record a decision anyone took.
 *  Saying "Singapore closed to South Sudan" of one of those would invent an event. */
export function isCorrection(note: string): boolean {
  return /NOT A POLICY CHANGE/i.test(note);
}

export function headline(event: {
  destination: Party;
  passports: Party[];
  /** Widened to string: the page reads this off imported JSON, which types it so. */
  direction: string;
  note?: string;
}): string {
  const actor = withArticle(event.destination.iso3, event.destination.name);
  const one = event.passports.length === 1;
  const who = one
    ? withArticle(event.passports[0].iso3, event.passports[0].name)
    : `${event.passports.length} passports`;
  if (event.note && isCorrection(event.note)) {
    return one
      ? `${actor}: our ${who} cell corrected`
      : `${actor}: ${event.passports.length} cells corrected`;
  }
  return `${actor} ${VERB[event.direction as Direction] ?? VERB.unchanged} ${who}`;
}

/** What one passport's corrections did to its standing. A true minus sign, not a hyphen —
 *  the rest of the site sets deltas the same way. */
export function effectLabel(scoreDelta: number, rankDelta: number): string {
  if (scoreDelta === 0 && rankDelta === 0) return 'no change to its score';
  const score = `${scoreDelta > 0 ? '+' : '−'}${Math.abs(scoreDelta)} points`;
  const rank =
    rankDelta === 0
      ? 'same place'
      : `${rankDelta > 0 ? 'up' : 'down'} ${Math.abs(rankDelta)} place${Math.abs(rankDelta) === 1 ? '' : 's'}`;
  return `${score}, ${rank}`;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** "May 2026" — the ledger's month rule, parsed off the ISO string rather than through
 *  Date, which would shift the month backwards for anyone west of UTC. */
export function monthLabel(iso: string): string {
  const [year, month] = iso.split('-');
  return `${MONTHS[Number(month) - 1]} ${year}`;
}

/** The day within a month group: "26 May". */
export function dayLabel(iso: string): string {
  const [, month, day] = iso.split('-');
  return `${Number(day)} ${MONTHS[Number(month) - 1].slice(0, 3)}`;
}

/** Notes are written for the ledger, where the audience is whoever maintains the dataset.
 *  The card has its own room for the impact and the sunset, and a reader has no reason to
 *  care which of our agents found what — so those come out, and the substance stays. */
export function noteForCard(note: string): string {
  return note
    // "BOUNDARY 0.2->1.0." / "IMPACT NONE (1.0->1.0)." — the shift row says this in colour.
    // The credit pair carries its own decimal points, so this cannot stop at the first ".".
    .replace(/^\s*(?:BOUNDARY|IMPACT NONE)[^A-Za-z]*[\d.]+\s*->\s*[\d.]+\)?\.\s*/i, '')
    // "SUNSET 2027-07-01." / "SUNSET: expires ... — re-check in January." — its own line.
    .replace(/\s*SUNSET\b[^.]*\.?\s*$/i, '')
    // Provenance about our own process rather than about the policy.
    .replace(/\s*(SOURCE UPGRADED|SOURCE NORMALISED)\b[^.]*\.\s*/gi, ' ')
    .replace(/\s*[^.]*\bsource url\b[^.]*\.\s*/gi, ' ')
    .replace(/\s*[^.]*\bverifiers?\b[^.]*\.\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The source's publisher, for a link that says where it goes. */
export function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export { displayName };
