// ---------------------------------------------------------------------------
// Shared behavior for the site's data tables (rankings, openness, and the
// per-destination passport list). The pure helpers below are unit-tested; the
// initSortableTable wiring is DOM glue verified in the browser.
//
// Row contract: every <tr> carries data-search (a lowercased match blob) plus
// one data-<key> attribute per sortable column, and every sortable <th> carries
// data-sort="<key>".
// ---------------------------------------------------------------------------

/** Attribute text as its natural sort type: number when it parses cleanly, else string. */
export function sortValue(raw: string | null): number | string {
  if (raw === null) return '';
  const trimmed = raw.trim();
  if (trimmed === '') return '';
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : raw;
}

export function compareValues(a: string | null, b: string | null, asc: boolean): number {
  const [x, y] = [sortValue(a), sortValue(b)];
  const dir = asc ? 1 : -1;
  const raw =
    typeof x === 'number' && typeof y === 'number'
      ? x < y ? -1 : x > y ? 1 : 0
      : String(x).localeCompare(String(y));
  // Return a clean 0 for equality: `0 * -1` is -0, which is a confusing value to
  // hand back from a comparator even though Array.sort treats it as equal.
  return raw === 0 ? 0 : raw * dir;
}

/** Clicking a new column adopts its declared default direction; re-clicking flips. */
export function nextAscending(
  clickedKey: string,
  currentKey: string,
  currentAsc: boolean,
  defaultAsc: Record<string, boolean>,
): boolean {
  if (clickedKey === currentKey) return !currentAsc;
  return defaultAsc[clickedKey.toLowerCase()] ?? true;
}

export interface SortableTableOptions {
  table: string;
  filter?: string;
  noResults?: string;
  initialSort: string;
  defaultAsc: Record<string, boolean>;
  /** Scope for the selectors. The country drawer injects a copy of a page whose
   *  table/filter ids can also exist on the host page, so it passes its own
   *  subtree; page scripts omit it and get the document as before. */
  root?: ParentNode;
}

export function initSortableTable(opts: SortableTableOptions): void {
  const scope = opts.root ?? document;
  const table = scope.querySelector(opts.table);
  if (!table) return;
  const tbody = table.querySelector('tbody')!;
  const rows = [...tbody.querySelectorAll('tr')];

  const input = opts.filter ? (scope.querySelector(opts.filter) as HTMLInputElement | null) : null;
  const noResults = opts.noResults ? scope.querySelector(opts.noResults) : null;

  if (input) {
    input.addEventListener('input', () => {
      // Match the full search blob (display name + iso3/iso2 + aliases), so
      // "Palestine", "Turkey", "South Korea", "kor", etc. all resolve.
      const q = input.value.trim().toLowerCase();
      let visible = 0;
      for (const r of rows) {
        const hide = !(r.dataset.search ?? '').includes(q);
        (r as HTMLElement).hidden = hide;
        if (!hide) visible++;
      }
      if (noResults) (noResults as HTMLElement).hidden = visible > 0;
    });
  }

  const headers = [...table.querySelectorAll('th[data-sort]')] as HTMLElement[];
  let sortKey = opts.initialSort;
  let asc = opts.defaultAsc[opts.initialSort.toLowerCase()] ?? true;

  const sortBy = (key: string, th: HTMLElement) => {
    asc = nextAscending(key, sortKey, asc, opts.defaultAsc);
    sortKey = key;
    const attr = `data-${key.toLowerCase()}`;
    rows
      .sort((a, b) => compareValues(a.getAttribute(attr), b.getAttribute(attr), asc))
      .forEach((r) => tbody.appendChild(r));
    headers.forEach((h) => h.removeAttribute('aria-sort'));
    th.setAttribute('aria-sort', asc ? 'ascending' : 'descending');
  };

  for (const th of headers) {
    th.addEventListener('click', () => sortBy(th.dataset.sort!, th));
    // Keyboard operability: Enter/Space on a focused header does the same thing.
    th.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        th.click();
      }
    });
  }
}
