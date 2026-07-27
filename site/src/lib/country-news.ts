import { withArticle } from './format.ts';
import { effectLabel, isCorrection } from './updates-copy.ts';

/** One country's slice of the changelog.
 *
 *  The updates page tells the ledger whole, in the voice of the index. A country page has
 *  one subject already — this passport, this border — so it asks the ledger only what it
 *  says about that subject, and each line is written from that side of the change. */

type Party = { iso3: string; name: string; iso2: string };

/** Structurally typed rather than imported from the pipeline: the pages read this off
 *  updates.json, whose inferred types widen `direction` to string. */
export type NewsEvent = {
  id: string;
  effective: string;
  sunset?: string;
  source: string;
  destination: Party;
  passports: Party[];
  from: string;
  to: string;
  creditFrom: number;
  creditTo: number;
  direction: string;
  note: string;
};

export type Standing = {
  iso3: string;
  gained: Party[];
  lost: Party[];
  scoreDelta: number;
  rankDelta: number;
};

type Ledger<E extends NewsEvent, S extends Standing> = { events: E[]; passports: S[] };

/** What the ledger holds about one passport: the events it was named in, and — only if the
 *  corrections actually moved it — the row saying by how much. The feed arrives newest
 *  first, and a filter keeps that order, so the section needs no sort of its own. */
export function passportNews<E extends NewsEvent, S extends Standing>(
  updates: Ledger<E, S>,
  iso3: string,
): { events: E[]; standing: S | null } {
  return {
    events: updates.events.filter((e) => e.passports.some((p) => p.iso3 === iso3)),
    standing: updates.passports.find((p) => p.iso3 === iso3) ?? null,
  };
}

/** What the ledger holds about one border. A country appears in the feed on both sides —
 *  Azerbaijan decides three of these events and is named in none — and only the events it
 *  decided are news about entering it. */
export function destinationNews<E extends NewsEvent, S extends Standing>(
  updates: Ledger<E, S>,
  iso3: string,
): E[] {
  return updates.events.filter((e) => e.destination.iso3 === iso3);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "1 Jul 2026". The changelog groups by month and so can set a bare day; a country's log
 *  is a handful of ungrouped rows, so each carries its own year. Parsed off the ISO string,
 *  not through Date, which would shift the day backwards west of UTC. */
export function stampLabel(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${Number(day)} ${MONTHS[Number(month) - 1]} ${year}`;
}

const VERB: Record<string, string> = { opened: 'opened', closed: 'closed', unchanged: 'reclassified' };

const verb = (direction: string) => VERB[direction] ?? VERB.unchanged;

/** On a passport page the holder is the given, so the destination acts: "Togo opened".
 *  What it opened to is the tier shift beside the line. */
export function passportLine(event: Pick<NewsEvent, 'destination' | 'direction' | 'note'>): string {
  const actor = withArticle(event.destination.iso3, event.destination.name);
  if (isCorrection(event.note)) return `${actor}: our cell corrected`;
  return `${actor} ${verb(event.direction)}`;
}

/** On a destination page the border is the given, so the line starts at the verb. A cohort
 *  is counted there — "opened to 38 passports" — but a single passport is left to the row
 *  beneath, which already names it under its flag. */
export function destinationLine(event: Pick<NewsEvent, 'passports' | 'direction' | 'note'>): string {
  const one = event.passports.length === 1;
  if (isCorrection(event.note)) {
    return one ? 'our cell corrected' : `${event.passports.length} cells corrected`;
  }
  if (one) return verb(event.direction);
  const who = `${event.passports.length} passports`;
  return event.direction === 'unchanged' ? `${verb(event.direction)} ${who}` : `${verb(event.direction)} to ${who}`;
}

type Vintage = { baselineVintage: string; verifiedAsOf: string };

/** The section's opening sentence, built here rather than in the template: the counts have
 *  to agree with the verb, the article and the tense, and a page that says "1corrections
 *  has" reads as generated. Both pages say the same thing about the baseline first, so a
 *  reader who lands on an empty section learns why it is empty. */
export function passportLede(
  vintage: Vintage,
  news: { events: unknown[]; standing: Standing | null },
): string {
  const from = `The upstream matrix stopped moving on ${stampLabel(vintage.baselineVintage)}`;
  const n = news.events.length;
  if (n === 0) {
    return `Nothing. ${from} and no cell for this passport has needed correcting since — every door above is the baseline’s, re-checked to ${stampLabel(vintage.verifiedAsOf)}.`;
  }
  const one = n === 1;
  const count = one ? 'One correction has' : `${n} corrections have`;
  const sourced = one ? 're-sourced' : 'each re-sourced';
  const moved = news.standing && news.standing.scoreDelta !== 0 ? news.standing : null;
  const worth = moved
    ? `, and ${one ? 'it is' : 'together they are'} worth ${effectLabel(moved.scoreDelta, moved.rankDelta)}`
    : ` — ${one ? 'it did not move its score' : 'none of them moved its score'}`;
  return `${from}. ${count} touched this passport since, ${sourced} from the government that decided it${worth}.`;
}

/** The same sentence from the border's side, counting cells rather than points: a
 *  destination's openness moves with every cell, so the count is the consequence. */
export function destinationLede<E extends NewsEvent>(
  vintage: Vintage,
  events: E[],
  theName: string,
): string {
  const from = `The upstream matrix stopped moving on ${stampLabel(vintage.baselineVintage)}`;
  if (events.length === 0) {
    return `Nothing. ${from} and no cell for ${theName} has needed correcting since — the table above is the baseline’s, re-checked to ${stampLabel(vintage.verifiedAsOf)}.`;
  }
  const one = events.length === 1;
  const policies = one ? 'one policy' : `${events.length} policies`;
  const cells = events.reduce((a, e) => a + e.passports.length, 0);
  const sourced = one ? 're-sourced' : 'each re-sourced';
  return `${from}. Since then ${policies} decided here moved ${cells} ${cells === 1 ? 'cell' : 'cells'} of the table above, ${sourced} from the government that decided it.`;
}
