// ---------------------------------------------------------------------------
// Search over the passport page's "Every destination" map. Each chip carries
// its searchable blob — format.ts's searchIndex(): lowercased names, ISO codes
// and aliases, so "turkey" finds Türkiye — in a data-search attribute stamped
// at build time. The pure helpers below are unit-tested; initDestSearch is DOM
// glue verified in the browser, and re-run by the country drawer against its
// own copy of the page (page scripts arrive inert there).
// ---------------------------------------------------------------------------

/** Which blobs a query keeps visible. Empty/whitespace queries keep them all. */
export function queryMatches(blobs: string[], query: string): boolean[] {
  const q = query.trim().toLowerCase();
  if (q === '') return blobs.map(() => true);
  return blobs.map((b) => b.includes(q));
}

/** The group-header count under a filter: "3 of 114" while narrowed, else "114". */
export function countLabel(shown: number, total: number, filtering: boolean): string {
  return filtering && shown < total ? `${shown} of ${total}` : `${total}`;
}

export function initDestSearch(opts: { root?: ParentNode } = {}): void {
  const root = opts.root ?? document;
  const input = root.querySelector<HTMLInputElement>('#dest-search');
  const map = root.querySelector<HTMLElement>('.dest-map');
  if (!input || !map || input.dataset.bound) return;
  input.dataset.bound = '1';

  const groups = [...map.querySelectorAll<HTMLElement>('.dest-group')].map((el) => ({
    el,
    chips: [...el.querySelectorAll<HTMLLIElement>('.dest-flow li')],
    count: el.querySelector<HTMLElement>('.count'),
  }));
  const empty = map.querySelector<HTMLElement>('.dest-empty');

  const apply = () => {
    const filtering = input.value.trim() !== '';
    let anyShown = false;
    for (const g of groups) {
      const vis = queryMatches(g.chips.map((li) => li.dataset.search ?? ''), input.value);
      g.chips.forEach((li, i) => { li.hidden = !vis[i]; });
      const shown = vis.filter(Boolean).length;
      if (g.count) g.count.textContent = countLabel(shown, g.chips.length, filtering);
      g.el.hidden = shown === 0;
      anyShown ||= shown > 0;
    }
    if (empty) empty.hidden = anyShown;
  };
  input.addEventListener('input', apply);
}
