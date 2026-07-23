import type { AccessCategory, VisaMatrix } from './types.ts';

export const CREDIT: Record<AccessCategory, number> = {
  // GRADED ladder: what counts is whether entry is decided AT THE BORDER or requires
  // permission BEFORE departure. Visa-on-arrival/eTA needs nothing to board, so it is
  // worth as much as visa-free. An eVisa is an application that can be refused and must
  // clear before you fly, so it counts as only a fraction of open access — a 0.2
  // multiplier — well short of the 1.0 a border decision earns but above a full visa.
  'visa-free': 1.0,
  'visa-on-arrival': 1.0,
  'e-visa': 0.2,
  'visa-required': 0,
};

export function categorize(cell: string): AccessCategory | 'self' {
  const v = cell.trim().toLowerCase();
  if (v === '-1' || v === '-') return 'self';
  if (/^\d+$/.test(v) || v === 'visa free') return 'visa-free';
  if (v === 'visa on arrival' || v === 'eta') return 'visa-on-arrival';
  if (v === 'e-visa') return 'e-visa';
  if (v === 'visa required' || v === 'no admission' || v === 'covid ban') return 'visa-required';
  throw new Error(`unknown visa matrix value: "${cell}"`);
}

export function parseVisaMatrix(csv: string): VisaMatrix {
  const lines = csv.trim().split(/\r?\n/);
  const destinations = lines[0].split(',').slice(1).map((c) => c.trim());
  const access = new Map<string, Map<string, AccessCategory>>();
  const countries: string[] = [];

  for (const line of lines.slice(1)) {
    const cells = line.split(',').map((c) => c.trim());
    if (cells.length !== destinations.length + 1) {
      throw new Error(`row for "${cells[0]}" has ${cells.length - 1} cells, expected ${destinations.length}`);
    }
    const passport = cells[0];
    countries.push(passport);
    const row = new Map<string, AccessCategory>();
    destinations.forEach((dest, i) => {
      const cat = categorize(cells[i + 1]);
      if (cat !== 'self') row.set(dest, cat);
    });
    access.set(passport, row);
  }
  return { countries, access };
}
