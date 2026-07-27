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

export function initRankTip(opts: { root?: ParentNode } = {}): void {
  const root = opts.root ?? document;
  for (const list of root.querySelectorAll<HTMLElement>('.rank-list')) {
    if (list.dataset.tipSteered) continue;
    list.dataset.tipSteered = 'true';
    list.addEventListener('pointermove', (e) => {
      const row = (e.target as Element | null)?.closest<HTMLElement>('li');
      const tip = row?.querySelector<HTMLElement>('.rank-tip');
      if (!row || !tip) return;
      const bounds = row.getBoundingClientRect();
      row.style.setProperty('--tip-x', `${tipX(e.clientX - bounds.left, bounds.width, tip.offsetWidth)}px`);
    });
  }
}
