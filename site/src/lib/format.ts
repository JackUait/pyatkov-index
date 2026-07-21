export function flagEmoji(iso2: string): string {
  return [...iso2.toUpperCase()].map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65)).join('');
}

export function fmt(n: number): string {
  return n.toFixed(1);
}

export function deltaLabel(d: number): string {
  if (d === 0) return '=';
  return d > 0 ? `+${d}` : `−${Math.abs(d)}`;
}
