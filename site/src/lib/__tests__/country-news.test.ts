import { describe, it, expect } from 'vitest';
import {
  destinationLine,
  destinationNews,
  passportLine,
  passportNews,
  stampLabel,
  passportLede,
  destinationLede,
  type NewsEvent,
  type Standing,
} from '../country-news.ts';

const AZE = { iso3: 'AZE', name: 'Azerbaijan', iso2: 'AZ' };
const TGO = { iso3: 'TGO', name: 'Togo', iso2: 'TG' };
const SGP = { iso3: 'SGP', name: 'Singapore', iso2: 'SG' };
const JPN = { iso3: 'JPN', name: 'Japan', iso2: 'JP' };
const KOR = { iso3: 'KOR', name: 'Korea, Rep.', iso2: 'KR' };
const SSD = { iso3: 'SSD', name: 'South Sudan', iso2: 'SS' };
const GBR = { iso3: 'GBR', name: 'United Kingdom', iso2: 'GB' };

const event = (over: Record<string, unknown> = {}) => ({
  id: 'e1',
  effective: '2026-07-01',
  source: 'https://mfa.gov.az/en/category/visa/visa-free-countries',
  destination: AZE,
  passports: [JPN],
  from: 'visa on arrival',
  to: '30',
  creditFrom: 1,
  creditTo: 1,
  direction: 'unchanged',
  note: 'IMPACT NONE (1.0->1.0).',
  ...over,
});

const ledger = (over: { events?: NewsEvent[]; passports?: Standing[] } = {}) => ({
  baselineVintage: '2026-02-17',
  verifiedAsOf: '2026-07-27',
  events: [],
  passports: [],
  ...over,
});

describe('passportNews', () => {
  it('keeps only the events this passport was actually named in', () => {
    const mine = event({ id: 'mine', passports: [JPN, KOR] });
    const theirs = event({ id: 'theirs', passports: [GBR] });
    const news = passportNews(ledger({ events: [mine, theirs] }), 'JPN');
    expect(news.events.map((e) => e.id)).toEqual(['mine']);
  });

  it('holds the feed order, which is newest first', () => {
    const july = event({ id: 'july', effective: '2026-07-01' });
    const may = event({ id: 'may', effective: '2026-05-26' });
    const news = passportNews(ledger({ events: [july, may] }), 'JPN');
    expect(news.events.map((e) => e.id)).toEqual(['july', 'may']);
  });

  it('carries the passport-side standing row so the page can say what it cost', () => {
    const standing = { ...JPN, gained: [], lost: [AZE], scoreDelta: -1.4, rankDelta: -2 };
    const news = passportNews(ledger({ events: [event()], passports: [standing] }), 'JPN');
    expect(news.standing).toEqual(standing);
  });

  it('reports no standing row for a passport the ledger never moved', () => {
    const news = passportNews(ledger({ events: [event()] }), 'JPN');
    expect(news.standing).toBeNull();
  });

  it('returns nothing at all for a passport outside the ledger', () => {
    const news = passportNews(ledger({ events: [event()] }), 'FRA');
    expect(news.events).toEqual([]);
    expect(news.standing).toBeNull();
  });
});

describe('destinationNews', () => {
  it('keeps only the events decided at this border', () => {
    const here = event({ id: 'here', destination: AZE });
    const elsewhere = event({ id: 'elsewhere', destination: TGO });
    expect(destinationNews(ledger({ events: [here, elsewhere] }), 'AZE').map((e) => e.id)).toEqual(['here']);
  });

  it('does not answer a destination for events where it was only the passport', () => {
    const asPassport = event({ destination: TGO, passports: [AZE] });
    expect(destinationNews(ledger({ events: [asPassport] }), 'AZE')).toEqual([]);
  });
});

describe('passportLine', () => {
  it('makes the destination the actor, since the passport is the page', () => {
    expect(passportLine(event({ destination: TGO, direction: 'opened' }))).toBe('Togo opened');
    expect(passportLine(event({ destination: TGO, direction: 'closed' }))).toBe('Togo closed');
    expect(passportLine(event({ destination: TGO, direction: 'unchanged' }))).toBe('Togo reclassified');
  });

  // Lower-case "the", as the changelog's own headlines set it: these lines sit in a row of
  // a ledger, not at the head of a sentence.
  it('takes the article with the names that need one', () => {
    const usa = { iso3: 'USA', name: 'United States', iso2: 'US' };
    expect(passportLine(event({ destination: usa, direction: 'closed' }))).toBe('the United States closed');
  });

  it('will not call a stale-cell fix a decision anyone took', () => {
    const line = passportLine(
      event({ destination: SGP, direction: 'closed', note: 'BOUNDARY 1.0->0.2. NOT A POLICY CHANGE — stale upstream cell.' }),
    );
    expect(line).toBe('Singapore: our cell corrected');
  });
});

describe('destinationLine', () => {
  // A single passport is named once, by the flag beside the row — repeating it in the line
  // above would print the country twice in two inches.
  it('counts several passports and leaves one to the row that names it', () => {
    expect(destinationLine(event({ passports: [JPN], direction: 'opened' }))).toBe('opened');
    expect(destinationLine(event({ passports: [JPN], direction: 'closed' }))).toBe('closed');
    expect(destinationLine(event({ passports: [JPN], direction: 'unchanged' }))).toBe('reclassified');
    expect(destinationLine(event({ passports: [JPN, KOR], direction: 'closed' }))).toBe('closed to 2 passports');
    expect(destinationLine(event({ passports: [JPN, KOR], direction: 'unchanged' }))).toBe('reclassified 2 passports');
  });

  it('will not call a stale-cell fix a decision anyone took', () => {
    const note = 'BOUNDARY 1.0->0.2. NOT A POLICY CHANGE — stale upstream cell.';
    expect(destinationLine(event({ passports: [SSD], direction: 'closed', note }))).toBe('our cell corrected');
    expect(destinationLine(event({ passports: [SSD, JPN], direction: 'closed', note }))).toBe('2 cells corrected');
  });
});

describe('stampLabel', () => {
  // The changelog groups by month and can drop the year; a country's log is a handful of
  // rows with no grouping at all, so every row carries its own year.
  it('stamps the day, month and year off the ISO string', () => {
    expect(stampLabel('2026-07-01')).toBe('1 Jul 2026');
    expect(stampLabel('2026-11-26')).toBe('26 Nov 2026');
  });

  it('does not shift the date for readers west of UTC', () => {
    expect(stampLabel('2026-01-01')).toBe('1 Jan 2026');
  });
});

describe('passportLede', () => {
  const one = event({ id: 'a' });
  const two = event({ id: 'b' });

  it('counts the corrections and says what they were worth', () => {
    const standing = { ...JPN, gained: [], lost: [AZE], scoreDelta: -3.23, rankDelta: -6 };
    expect(passportLede(ledger(), { events: [one, two], standing })).toBe(
      'The upstream matrix stopped moving on 17 Feb 2026. 2 corrections have touched this passport since, ' +
        'each re-sourced from the government that decided it, and together they are worth −3.23 points, down 6 places.',
    );
  });

  it('sets a single correction in the singular throughout', () => {
    const standing = { ...JPN, gained: [AZE], lost: [], scoreDelta: 0.06, rankDelta: 0 };
    expect(passportLede(ledger(), { events: [one], standing })).toBe(
      'The upstream matrix stopped moving on 17 Feb 2026. One correction has touched this passport since, ' +
        're-sourced from the government that decided it, and it is worth +0.06 points, same place.',
    );
  });

  it('says outright when the corrections cost the passport nothing', () => {
    const standing = { ...JPN, gained: [], lost: [], scoreDelta: 0, rankDelta: 0 };
    expect(passportLede(ledger(), { events: [one, two], standing })).toContain('none of them moved its score.');
    expect(passportLede(ledger(), { events: [one], standing: null })).toContain('it did not move its score.');
  });

  it('reads as well empty as full, which is how most passports read', () => {
    expect(passportLede(ledger(), { events: [], standing: null })).toBe(
      'Nothing. The upstream matrix stopped moving on 17 Feb 2026 and no cell for this passport has needed ' +
        'correcting since — every door above is the baseline’s, re-checked to 27 Jul 2026.',
    );
  });
});

describe('destinationLede', () => {
  it('counts the policies decided here and the cells they moved', () => {
    const decree = event({ passports: [JPN, KOR, GBR] });
    expect(destinationLede(ledger(), [decree], 'Togo')).toBe(
      'The upstream matrix stopped moving on 17 Feb 2026. Since then one policy decided here moved 3 cells of ' +
        'the table above, re-sourced from the government that decided it.',
    );
  });

  it('sets several policies in the plural', () => {
    const decree = event({ passports: [JPN] });
    expect(destinationLede(ledger(), [decree, decree], 'Ghana')).toContain(
      '2 policies decided here moved 2 cells of the table above, each re-sourced',
    );
  });

  it('names the border when there is nothing to report', () => {
    expect(destinationLede(ledger(), [], 'France')).toBe(
      'Nothing. The upstream matrix stopped moving on 17 Feb 2026 and no cell for France has needed correcting ' +
        'since — the table above is the baseline’s, re-checked to 27 Jul 2026.',
    );
  });
});
