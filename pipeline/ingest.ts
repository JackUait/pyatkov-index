import type { AccessCategory, VisaMatrix } from './types.ts';

export const CREDIT: Record<AccessCategory, number> = {
  'visa-free': 1.0,
  'visa-on-arrival': 0.8,
  'e-visa': 0.5,
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
