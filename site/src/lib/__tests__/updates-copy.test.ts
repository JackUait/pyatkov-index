import { describe, it, expect } from 'vitest';
import { accessPhrase, tierClass, headline, monthLabel, effectLabel, noteForCard } from '../updates-copy.ts';

describe('accessPhrase', () => {
  it('says what the traveller actually does, not what the cell literally holds', () => {
    expect(accessPhrase('90')).toBe('visa-free for 90 days');
    expect(accessPhrase('30')).toBe('visa-free for 30 days');
    expect(accessPhrase('visa free')).toBe('visa-free');
    expect(accessPhrase('visa on arrival')).toBe('a visa on arrival');
    expect(accessPhrase('eta')).toBe('a travel authorisation');
    expect(accessPhrase('e-visa')).toBe('an eVisa');
    expect(accessPhrase('visa required')).toBe('a visa');
    expect(accessPhrase('no admission')).toBe('no admission at all');
  });

  it('reads a one-day count as a day, not "1 days"', () => {
    expect(accessPhrase('1')).toBe('visa-free for 1 day');
  });
});

describe('tierClass', () => {
  it('maps a cell onto the swatch its tier already owns sitewide', () => {
    expect(tierClass('90')).toBe('tier-visa-free');
    expect(tierClass('visa free')).toBe('tier-visa-free');
    expect(tierClass('visa on arrival')).toBe('tier-visa-on-arrival');
    expect(tierClass('eta')).toBe('tier-visa-on-arrival');
    expect(tierClass('e-visa')).toBe('tier-e-visa');
    expect(tierClass('visa required')).toBe('tier-visa-required');
    expect(tierClass('no admission')).toBe('tier-visa-required');
  });
});

const ev = (p: Partial<Parameters<typeof headline>[0]> = {}) => ({
  destination: { iso3: 'TGO', name: 'Togo', iso2: 'TG' },
  passports: [{ iso3: 'KEN', name: 'Kenya', iso2: 'KE' }],
  from: 'e-visa',
  to: '30',
  direction: 'opened' as const,
  ...p,
});

describe('headline', () => {
  it('names the destination as the actor and counts who it moved', () => {
    const h = headline(ev({ passports: Array.from({ length: 38 }, (_, i) => ({ iso3: `X${i}`, name: 'x', iso2: '' })) }));
    expect(h).toBe('Togo opened to 38 passports');
  });

  it('names the single passport instead of counting to one', () => {
    expect(headline(ev())).toBe('Togo opened to Kenya');
  });

  it('says closed when access was withdrawn', () => {
    expect(headline(ev({ destination: { iso3: 'GBR', name: 'United Kingdom', iso2: 'GB' }, direction: 'closed' })))
      .toBe('the United Kingdom closed to Kenya');
  });

  it('calls a same-credit correction a reclassification, since nothing opened or shut', () => {
    expect(headline(ev({ direction: 'unchanged' })))
      .toBe('Togo reclassified Kenya');
  });
});

describe('effectLabel', () => {
  it('states the score movement with its sign, and says plainly when there is none', () => {
    expect(effectLabel(2.1, 6)).toBe('+2.1 points, up 6 places');
    expect(effectLabel(-3.23, -5)).toBe('−3.23 points, down 5 places');
    expect(effectLabel(0, 0)).toBe('no change to its score');
  });

  it('handles a score move that did not shift the rank', () => {
    expect(effectLabel(0.42, 0)).toBe('+0.42 points, same place');
  });
});

describe('monthLabel', () => {
  it('groups the ledger by month in the site\'s date voice', () => {
    expect(monthLabel('2026-05-26')).toBe('May 2026');
    expect(monthLabel('2026-01-01')).toBe('January 2026');
  });
});

describe('noteForCard', () => {
  it('drops the impact prefix, which the shift row already shows', () => {
    expect(noteForCard('BOUNDARY 0.2->1.0. All-African 30-day visa waiver, Cabinet decree.'))
      .toBe('All-African 30-day visa waiver, Cabinet decree.');
    expect(noteForCard('IMPACT NONE (1.0->1.0). Group IV entry 7: Republic of Korea.'))
      .toBe('Group IV entry 7: Republic of Korea.');
  });

  it('drops the sunset sentence, which the card prints as its own line', () => {
    expect(noteForCard('Ordinary passports, 30 days. SUNSET: expires 2026-12-31 — re-check in January.'))
      .toBe('Ordinary passports, 30 days.');
    expect(noteForCard('Group IV entry 6, identical terms. SUNSET 2027-07-01.'))
      .toBe('Group IV entry 6, identical terms.');
  });

  it('drops our own audit vocabulary, which is about us and not about the policy', () => {
    expect(noteForCard('PRC MFA spokesperson, 30 days. SOURCE UPGRADED: the proposal cited report.az, a news agency; the KOR->AZE verifier found Japan at Group IV entry 6.'))
      .toBe('PRC MFA spokesperson, 30 days.');
    expect(noteForCard('Same annex, item 50 (Mexico). PDF was downloaded and text-extracted by the verifier.'))
      .toBe('Same annex, item 50 (Mexico).');
  });

  it('keeps a caveat that is about the evidence rather than about our process', () => {
    const n = 'Azerbaijani MFA Group II: Maldives, 90 days. DATE UNVERIFIED: the MFA page carries no commencement date.';
    expect(noteForCard(n)).toBe(n);
  });

  it('leaves an already-clean note exactly as written', () => {
    expect(noteForCard('Same annex, item 21 (Costa Rica).')).toBe('Same annex, item 21 (Costa Rica).');
  });
});

describe('corrections are not dressed up as policy changes', () => {
  const stale = "NOT A POLICY CHANGE — this corrects a stale upstream cell. SSD was the lone outlier at '30'.";

  it('says the cell was corrected, and does not claim the destination acted', () => {
    const h = headline({ ...ev({ destination: { iso3: 'SGP', name: 'Singapore', iso2: 'SG' }, direction: 'closed' }), note: stale });
    expect(h).toBe('Singapore: our Kenya cell corrected');
    expect(h).not.toMatch(/closed/);
  });

  it('counts the cells when a correction covers several passports', () => {
    const many = Array.from({ length: 3 }, (_, i) => ({ iso3: `X${i}`, name: 'x', iso2: '' }));
    expect(headline({ ...ev({ direction: 'closed', passports: many }), note: stale })).toBe('Togo: 3 cells corrected');
  });

  it('still lets a real policy change speak as one', () => {
    expect(headline({ ...ev(), note: 'All-African 30-day waiver, Cabinet decree.' })).toBe('Togo opened to Kenya');
  });

  it('strips the URL-normalisation housekeeping too', () => {
    expect(noteForCard('Same S.I. Source URL normalised. KNA->GBR correctly left untouched.'))
      .toBe('Same S.I. KNA->GBR correctly left untouched.');
  });
});
