import { describe, it, expect } from 'vitest';
import { buildUpdates } from '../updates.ts';
import type { VisaOverride } from '../overrides.ts';

const names = new Map([
  ['TGO', 'Togo'], ['KEN', 'Kenya'], ['RWA', 'Rwanda'], ['GBR', 'United Kingdom'],
  ['NIC', 'Nicaragua'], ['LCA', 'St Lucia'], ['CHN', 'China'], ['CAN', 'Canada'],
]);
const iso2 = new Map([
  ['TGO', 'TG'], ['KEN', 'KE'], ['RWA', 'RW'], ['GBR', 'GB'],
  ['NIC', 'NI'], ['LCA', 'LC'], ['CHN', 'CN'], ['CAN', 'CA'],
]);

const o = (p: Partial<VisaOverride>): VisaOverride => ({
  origin: 'KEN', destination: 'TGO', from: 'e-visa', to: '30',
  effective: '2026-05-26', source: 'https://voyage.gouv.tg/', note: 'waiver', ...p,
});

const build = (overrides: VisaOverride[]) => buildUpdates(overrides, { names, iso2, movers: [] });

describe('buildUpdates', () => {
  it('folds every passport hit by one policy into a single event', () => {
    // 38 rows of "Togo waives visas for Africans" is one piece of news, not 38.
    const { events } = build([o({ origin: 'KEN' }), o({ origin: 'RWA' })]);
    expect(events).toHaveLength(1);
    expect(events[0].destination.iso3).toBe('TGO');
    expect(events[0].passports.map((p) => p.iso3)).toEqual(['KEN', 'RWA']);
  });

  it('keeps changes to the same destination apart when the change itself differs', () => {
    // Ghana's portal moved some passports to e-visa and others to an eTA on one day.
    // Folding those together would describe a change that happened to nobody.
    const { events } = build([
      o({ destination: 'TGO', to: '30' }),
      o({ destination: 'TGO', to: 'e-visa', origin: 'RWA', from: 'visa required' }),
    ]);
    expect(events).toHaveLength(2);
  });

  it('classifies the direction of travel from the credit each side earns', () => {
    const { events } = build([
      o({ from: 'e-visa', to: '30' }),
      o({ destination: 'GBR', origin: 'NIC', from: 'eta', to: 'visa required' }),
      o({ destination: 'CHN', origin: 'CAN', from: 'visa required', to: 'no admission' }),
    ]);
    const by = Object.fromEntries(events.map((e) => [e.destination.iso3, e]));
    expect(by.TGO.direction).toBe('opened');
    expect(by.GBR.direction).toBe('closed');
    // Both sides score zero: a real correction, but it moves nobody's ranking.
    expect(by.CHN.direction).toBe('unchanged');
    expect(by.CHN.creditFrom).toBe(0);
    expect(by.CHN.creditTo).toBe(0);
  });

  it('orders events newest first, and ties break on the bigger event', () => {
    const { events } = build([
      o({ effective: '2026-01-05', destination: 'GBR', origin: 'NIC' }),
      o({ effective: '2026-06-15', destination: 'CHN', origin: 'CAN' }),
      o({ effective: '2026-06-15', destination: 'TGO', origin: 'KEN' }),
      o({ effective: '2026-06-15', destination: 'TGO', origin: 'RWA' }),
    ]);
    expect(events.map((e) => e.destination.iso3)).toEqual(['TGO', 'CHN', 'GBR']);
  });

  it('resolves names and flags for the destination and every passport', () => {
    const { events } = build([o({ origin: 'KEN' })]);
    expect(events[0].destination).toMatchObject({ iso3: 'TGO', name: 'Togo', iso2: 'TG' });
    expect(events[0].passports[0]).toMatchObject({ iso3: 'KEN', name: 'Kenya', iso2: 'KE' });
  });

  it('carries the source and the effective date through to every card', () => {
    const { events } = build([o({ source: 'https://voyage.gouv.tg/', effective: '2026-05-26' })]);
    expect(events[0].source).toBe('https://voyage.gouv.tg/');
    expect(events[0].effective).toBe('2026-05-26');
  });

  it('surfaces a sunset only when the policy actually carries one', () => {
    const { events } = build([o({ sunset: '2026-12-31' }), o({ destination: 'GBR', origin: 'NIC' })]);
    const by = Object.fromEntries(events.map((e) => [e.destination.iso3, e]));
    expect(by.TGO.sunset).toBe('2026-12-31');
    expect(by.GBR.sunset).toBeUndefined();
  });

  it('summarises each passport ledger-style: what it gained and what it lost', () => {
    const { passports } = build([
      o({ origin: 'NIC', destination: 'TGO', from: 'e-visa', to: '30' }),
      o({ origin: 'NIC', destination: 'GBR', from: 'eta', to: 'visa required' }),
      o({ origin: 'KEN', destination: 'TGO', from: 'e-visa', to: '30' }),
    ]);
    const nic = passports.find((p) => p.iso3 === 'NIC')!;
    expect(nic.gained.map((g) => g.iso3)).toEqual(['TGO']);
    expect(nic.lost.map((g) => g.iso3)).toEqual(['GBR']);
    // Most-affected first, so the page leads with the passport that moved most.
    expect(passports[0].iso3).toBe('NIC');
  });

  it('attaches the score and rank movement the pipeline measured', () => {
    const movers = [{ iso3: 'NIC', scoreDelta: -3.23, rankDelta: -5 }];
    const { passports } = buildUpdates([o({ origin: 'NIC', destination: 'GBR', from: 'eta', to: 'visa required' })], { names, iso2, movers });
    expect(passports[0]).toMatchObject({ iso3: 'NIC', scoreDelta: -3.23, rankDelta: -5 });
  });

  it('reports zero movement rather than nothing when a correction changed no score', () => {
    const { passports } = build([o({ origin: 'CAN', destination: 'CHN', from: 'visa required', to: 'no admission' })]);
    expect(passports[0].scoreDelta).toBe(0);
    expect(passports[0].rankDelta).toBe(0);
  });

  it('counts the ledger for the page to state without recounting it', () => {
    const { totals } = build([
      o({ origin: 'KEN' }), o({ origin: 'RWA' }),
      o({ destination: 'GBR', origin: 'NIC', from: 'eta', to: 'visa required' }),
      o({ destination: 'CHN', origin: 'CAN', from: 'visa required', to: 'no admission' }),
    ]);
    // opened/closed count EVENTS, not cells: the two Togo rows are one opening.
    expect(totals).toMatchObject({ cells: 4, events: 3, opened: 1, closed: 1, destinations: 3, passports: 4 });
  });

  it('is empty, not broken, when nothing has been corrected yet', () => {
    const u = build([]);
    expect(u.events).toEqual([]);
    expect(u.passports).toEqual([]);
    expect(u.totals.cells).toBe(0);
  });
});
