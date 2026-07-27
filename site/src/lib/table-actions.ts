// ---------------------------------------------------------------------------
// The actions column's behavior. Two buttons per row: hand this country to
// someone, or hold it against a second one.
//
// Row contract: each button carries data-act ("share" | "compare") plus the
// row's data-iso3 / data-iso2 / data-name / data-rank / data-score / data-href
// and, for a shared rank, data-tied. Reading the values off the button rather
// than parsing the rendered cells keeps the wording rules in share.ts, where
// they are tested.
//
// The decisions live in share.ts and compare-pick.ts; everything here is
// transport and paint.
// ---------------------------------------------------------------------------
import { prefersShareSheet, shareText, type CompareKind } from './share.ts';
import { EMPTY_PICK, cancel, compareUrl, pick, type PickState } from './compare-pick.ts';
import { flagEmoji } from './format.ts';
import { absUrl } from './seo.ts';

export interface TableActionsOptions {
  /** Selector for the table carrying the actions column. */
  table: string;
  /** Selector for the surface the pick bar docks to. */
  card: string;
  kind: CompareKind;
  /** Scope for the selectors, for the drawer's injected copies. */
  root?: ParentNode;
}

const NOUN: Record<CompareKind, string> = { passport: 'passport', destination: 'destination' };

/** Put the line somewhere the reader can use it: the share sheet where one is
 *  worth raising, otherwise the clipboard. If the clipboard is refused too — an
 *  insecure context, or a permission denied — an input holds the text
 *  pre-selected so the reader can copy it by hand. Returns what happened, for
 *  the confirmation. */
async function handOff(text: string, near: HTMLElement): Promise<'shared' | 'copied' | 'manual'> {
  if (prefersShareSheet(!!navigator.share, matchMedia('(pointer: coarse)').matches)) {
    try {
      await navigator.share({ text });
      return 'shared';
    } catch (e) {
      // A cancelled share sheet is the reader's decision, not a failure to fall
      // back from — anything else drops through to the clipboard.
      if ((e as DOMException)?.name === 'AbortError') return 'shared';
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    const field = document.createElement('input');
    field.className = 'share-fallback';
    field.value = text;
    field.setAttribute('aria-label', 'Copy this link');
    near.after(field);
    field.select();
    field.addEventListener('blur', () => field.remove(), { once: true });
    return 'manual';
  }
}

export function initTableActions(opts: TableActionsOptions): void {
  const scope = opts.root ?? document;
  const table = scope.querySelector(opts.table) as HTMLTableElement | null;
  const card = scope.querySelector(opts.card) as HTMLElement | null;
  if (!table || !card) return;
  const tbody = table.querySelector('tbody');
  if (!tbody) return;

  // One live region for both actions, so a confirmation is announced without
  // the button's own name being re-read. Its own class, not the pages' scoped
  // .sr-only: a node built here carries no scope attribute to match on.
  const status = document.createElement('p');
  status.className = 'action-status';
  status.setAttribute('role', 'status');
  card.append(status);

  const bar = document.createElement('div');
  bar.className = 'pick-bar';
  bar.hidden = true;
  bar.tabIndex = -1;
  card.append(bar);

  let state: PickState = EMPTY_PICK;

  const buttonsFor = (iso3: string) =>
    [...tbody.querySelectorAll<HTMLButtonElement>(`button[data-act="compare"][data-iso3="${iso3}"]`)];

  const paint = () => {
    for (const b of tbody.querySelectorAll<HTMLButtonElement>('button[data-act="compare"]')) {
      const held = state.first !== null && b.dataset.iso3 === state.first;
      b.setAttribute('aria-pressed', String(held));
      b.closest('tr')?.classList.toggle('is-picked', held);
    }
    if (state.first === null) {
      bar.hidden = true;
      bar.replaceChildren();
      return;
    }
    const held = buttonsFor(state.first)[0];
    const name = held?.dataset.name ?? state.first;
    const flag = held?.dataset.iso2 ? `${flagEmoji(held.dataset.iso2)} ` : '';
    bar.replaceChildren();
    const said = document.createElement('span');
    const strong = document.createElement('b');
    strong.textContent = name;
    said.append(`${flag}Comparing `, strong, ` — pick a second ${NOUN[opts.kind]}`);
    const stop = document.createElement('button');
    stop.type = 'button';
    stop.className = 'pick-cancel';
    stop.setAttribute('aria-label', 'Cancel the comparison');
    stop.textContent = '✕';
    stop.addEventListener('click', () => {
      state = cancel(state);
      paint();
    });
    bar.append(said, stop);
    bar.hidden = false;
    bar.focus();
  };

  tbody.addEventListener('click', (e) => {
    const button = (e.target as HTMLElement).closest('button[data-act]') as HTMLButtonElement | null;
    if (!button || !tbody.contains(button)) return;
    // The row's name link is stretched across the whole row; a button inside it
    // must not also follow that link.
    e.preventDefault();
    e.stopPropagation();
    const iso3 = button.dataset.iso3!;

    if (button.dataset.act === 'compare') {
      const result = pick(state, iso3);
      state = result.state;
      if (result.pair) {
        location.href = compareUrl(
          import.meta.env.BASE_URL,
          opts.kind,
          result.pair[0],
          result.pair[1],
        );
        return;
      }
      paint();
      return;
    }

    const text = shareText({
      kind: opts.kind,
      name: button.dataset.name!,
      rank: Number(button.dataset.rank),
      score: Number(button.dataset.score),
      tied: button.dataset.tied === 'true',
      url: absUrl(button.dataset.href!),
    });
    handOff(text, button).then((how) => {
      if (how === 'manual') {
        status.textContent = 'Copying is blocked here — the link is selected, press Copy.';
        return;
      }
      status.textContent = how === 'shared' ? 'Shared.' : 'Link copied.';
      button.classList.add('did-share');
      setTimeout(() => button.classList.remove('did-share'), 1400);
    });
  });

  // Escape cancels from anywhere in the card — the bar takes focus on the first
  // pick, but the reader may have tabbed back into the table to find the second.
  card.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || state.first === null) return;
    state = cancel(state);
    paint();
  });
}
