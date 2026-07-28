/** The passport spread's figure: the score drawn as 100 point-squares.
 *
 *  One square is one point — one hundredth of the weighted world — earned
 *  squares marigold, the locked remainder a quiet wash. Cells are emitted in
 *  DOM order (rows top-down) while the pour index `i` runs bottom-left →
 *  top-right, so the earned mass sits on the floor of the grid and the load
 *  stagger builds it upward, gray ceiling last.
 *
 *  The split follows the DISPLAYED score (fmt = toFixed(1)), not the raw
 *  float: a page saying "94.0" must not draw a 0.97 sliver its own headline
 *  numeral denies. */
export type HundredCell = { kind: 'gold' | 'part' | 'lock'; i: number; part?: number };

const SIDE = 10;

/** A single door's points as a short run of the same squares: `full` whole
 *  point-squares plus, when the displayed tenth is nonzero, one waterline
 *  square filled to `part`. Split from the DISPLAYED value (fmt = toFixed(1))
 *  for the same reason as the grid: the run beside "4.3 points" must draw
 *  exactly four and three tenths, whatever the raw float says. */
export function pointRun(points: number): { full: number; part: number } {
  const tenth = Math.max(0, Math.round(points * 10) / 10);
  const full = Math.floor(tenth);
  const part = Math.round((tenth - full) * 10) / 10;
  return { full, part };
}

export function hundredCells(score: number): HundredCell[] {
  const tenth = Math.min(100, Math.max(0, Math.round(score * 10) / 10));
  const gold = Math.floor(tenth);
  const part = Math.round((tenth - gold) * 10) / 10;
  const cells: HundredCell[] = [];
  for (let row = 0; row < SIDE; row++) {
    for (let col = 0; col < SIDE; col++) {
      const i = (SIDE - 1 - row) * SIDE + col;
      if (i < gold) cells.push({ kind: 'gold', i });
      else if (i === gold && part > 0) cells.push({ kind: 'part', i, part });
      else cells.push({ kind: 'lock', i });
    }
  }
  return cells;
}
