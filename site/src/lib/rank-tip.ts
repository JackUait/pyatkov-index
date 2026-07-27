// Pointer steering for the door ledgers' row tips. Each row's .rank-tip is
// server-rendered and CSS owns its reveal (the :hover delay); this only slides
// the tip along the pointer, ribbon-tip's grammar: centered on the cursor,
// clamped to the row so it never spills past the column. tipX is unit-tested;
// initRankTip is DOM glue verified in the browser.

/** Tip center within the row: the pointer's x, held back from either edge —
 *  or the row's middle when the tip outgrows the row entirely. */
export function tipX(pointerX: number, rowWidth: number, tipWidth: number): number {
  const half = tipWidth / 2;
  if (tipWidth >= rowWidth) return rowWidth / 2;
  return Math.min(Math.max(pointerX, half), rowWidth - half);
}

/** The beat a cold row waits before its tip surfaces — long enough to read as
 *  deliberate, so a pointer merely crossing the ledger on its way somewhere
 *  else never raises one. Every row after it opens instantly (see stepWarmth).
 *  This restates the CSS reveal delay, which warmth is measured against: the
 *  two must move together. */
export const TIP_DELAY_MS = 800;

/** How long warmth outlives the pointer once it's off the rows — enough to
 *  cross the gutter between the two ledgers, or the gap a blank row leaves,
 *  without paying the beat again; short enough that coming back to the page
 *  later starts cold. */
export const TIP_GRACE_MS = 400;

export type Warmth = { row: Element | null; since: number; leftAt: number | null; warm: boolean };

export const coldWarmth = (): Warmth => ({ row: null, since: 0, leftAt: null, warm: false });

/** Walking the ledgers shouldn't re-pay the waiting beat on every row: once a
 *  tip is actually out, the next row's takes over at once, however fast the
 *  walk. So the rows run warm from the moment the pointer has held one row for
 *  the reveal delay — a sweep passing through faster than that never warms
 *  them, which is what keeps a fast pass from strobing. The held time is read
 *  at the move away as well as in place, because a pointer resting on a row to
 *  read its tip emits no events at all while it rests; for the same reason the
 *  grace counts only time spent off the rows, so a long read never cools them.
 *  Warmth is one state across both ledgers — the gutter between the columns is
 *  a gap to cross, not a reason to start over. */
export function stepWarmth(
  w: Warmth,
  row: Element | null,
  time: number,
  delayMs: number,
  graceMs: number,
): Warmth {
  const held = w.row !== null && time - w.since >= delayMs;
  if (!row) return { row: null, since: w.since, leftAt: w.leftAt ?? time, warm: w.warm || held };
  if (w.leftAt !== null && time - w.leftAt > graceMs) return { row, since: time, leftAt: null, warm: false };
  const since = row === w.row ? w.since : time;
  return { row, since, leftAt: null, warm: w.warm || held };
}

export function initRankTip(opts: { root?: ParentNode } = {}): void {
  const root = opts.root ?? document;
  const lists = [...root.querySelectorAll<HTMLElement>('.rank-list')].filter((l) => !l.dataset.tipSteered);
  if (lists.length === 0) return;
  // One warmth for the spread, marked on every ledger: the two columns are one
  // walk, so crossing from the open page to the locked one keeps the takeover.
  let warmth = coldWarmth();
  const mark = () => {
    for (const l of lists) l.classList.toggle('is-warm', warmth.warm);
  };
  for (const list of lists) {
    list.dataset.tipSteered = 'true';
    list.addEventListener('pointermove', (e) => {
      const row = (e.target as Element | null)?.closest<HTMLElement>('li');
      const tip = row?.querySelector<HTMLElement>('.rank-tip');
      warmth = stepWarmth(warmth, tip ? (row ?? null) : null, e.timeStamp, TIP_DELAY_MS, TIP_GRACE_MS);
      mark();
      if (!row || !tip) return;
      const bounds = row.getBoundingClientRect();
      row.style.setProperty('--tip-x', `${tipX(e.clientX - bounds.left, bounds.width, tip.offsetWidth)}px`);
    });
    list.addEventListener('pointerleave', (e) => {
      warmth = stepWarmth(warmth, null, e.timeStamp, TIP_DELAY_MS, TIP_GRACE_MS);
      mark();
    });
  }
}
