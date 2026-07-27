import { CREDIT, categorize } from './ingest.ts';
import type { VisaOverride } from './overrides.ts';

/**
 * The changelog, derived from the override ledger.
 *
 * Every correction in data/visa-overrides.json is a real policy event with a date and a
 * primary source, so the site can report what changed and why without inventing a single
 * word of news. One decree that hits 38 passports is one event, not 38 rows.
 */
export type Party = { iso3: string; name: string; iso2: string };

export type UpdateEvent = {
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
  direction: 'opened' | 'closed' | 'unchanged';
  note: string;
};

export type PassportUpdate = {
  iso3: string;
  name: string;
  iso2: string;
  gained: Party[];
  lost: Party[];
  scoreDelta: number;
  rankDelta: number;
};

export type Updates = {
  events: UpdateEvent[];
  passports: PassportUpdate[];
  totals: {
    cells: number;
    events: number;
    opened: number;
    closed: number;
    destinations: number;
    passports: number;
  };
};

type Mover = { iso3: string; scoreDelta: number; rankDelta: number };

const creditOf = (cell: string): number => {
  const cat = categorize(cell);
  return cat === 'self' ? 1 : CREDIT[cat];
};

export function buildUpdates(
  overrides: VisaOverride[],
  ctx: { names: Map<string, string>; iso2: Map<string, string>; movers: Mover[] },
): Updates {
  const party = (iso3: string): Party => ({
    iso3,
    name: ctx.names.get(iso3) ?? iso3,
    iso2: ctx.iso2.get(iso3) ?? '',
  });

  // One event per (destination, change, date, source): the grain at which a policy was
  // actually decided. Splitting on `from`/`to` keeps Ghana's e-visa and eTA cohorts apart,
  // which matters because they are different news about the same day.
  const grouped = new Map<string, UpdateEvent>();
  for (const o of overrides) {
    const key = [o.destination, o.from, o.to, o.effective, o.source].join('|');
    let event = grouped.get(key);
    if (!event) {
      const creditFrom = creditOf(o.from);
      const creditTo = creditOf(o.to);
      event = {
        id: `${o.destination}-${o.effective}-${grouped.size}`.toLowerCase(),
        effective: o.effective,
        ...(o.sunset ? { sunset: o.sunset } : {}),
        source: o.source,
        destination: party(o.destination),
        passports: [],
        from: o.from,
        to: o.to,
        creditFrom,
        creditTo,
        direction: creditTo > creditFrom ? 'opened' : creditTo < creditFrom ? 'closed' : 'unchanged',
        note: o.note,
      };
      grouped.set(key, event);
    }
    event.passports.push(party(o.origin));
  }

  const events = [...grouped.values()].sort(
    (a, b) => b.effective.localeCompare(a.effective) || b.passports.length - a.passports.length,
  );

  // The passport-side reading of the same ledger: what each passport won and lost.
  const moverOf = new Map(ctx.movers.map((m) => [m.iso3, m]));
  const byPassport = new Map<string, PassportUpdate>();
  for (const e of events) {
    for (const p of e.passports) {
      let row = byPassport.get(p.iso3);
      if (!row) {
        const m = moverOf.get(p.iso3);
        row = {
          ...p,
          gained: [],
          lost: [],
          scoreDelta: m?.scoreDelta ?? 0,
          rankDelta: m?.rankDelta ?? 0,
        };
        byPassport.set(p.iso3, row);
      }
      if (e.direction === 'opened') row.gained.push(e.destination);
      else if (e.direction === 'closed') row.lost.push(e.destination);
    }
  }

  const passports = [...byPassport.values()].sort(
    (a, b) =>
      Math.abs(b.scoreDelta) - Math.abs(a.scoreDelta) ||
      b.gained.length + b.lost.length - (a.gained.length + a.lost.length) ||
      a.iso3.localeCompare(b.iso3),
  );

  return {
    events,
    passports,
    totals: {
      cells: overrides.length,
      events: events.length,
      opened: events.filter((e) => e.direction === 'opened').length,
      closed: events.filter((e) => e.direction === 'closed').length,
      destinations: new Set(overrides.map((o) => o.destination)).size,
      passports: byPassport.size,
    },
  };
}
