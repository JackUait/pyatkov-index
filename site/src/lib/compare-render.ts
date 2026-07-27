// ---------------------------------------------------------------------------
// Painting for the compare page. The page ships one inlined snapshot and reads
// the pair out of its own query string, so this runs in the browser; every
// decision it paints comes from compare-view.ts, which is tested.
// ---------------------------------------------------------------------------
import { buildComparison, parseCompareQuery } from './compare-view.ts';
import type { ComparePayload, Comparison, Difference, Side } from './compare-view.ts';
import { LABEL } from './credit.ts';
import { flagEmoji, fmt } from './format.ts';
import type { CompareKind } from './share.ts';

const WHY: Record<string, string> = {
  missing: 'This link is missing one of the two countries to compare.',
  unknown: 'One of those codes is not a country in the index.',
  same: 'That is one country twice — pick two different ones.',
  kind: 'This page compares passports or destinations, nothing else.',
};

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** The two sides' headline: flag, name, rank, and the number each is ranked on.
 *  A passport's rank is its weighted score's, so the score is worth printing
 *  beside it; a destination's headline number is its openness. */
function head(side: Side, kind: CompareKind, base: string, lean: 'a' | 'b'): HTMLElement {
  const box = el('div', `vs-side vs-${lean}`);
  const link = el('a', 'vs-name');
  link.href = `${base}${kind}/${side.iso3.toLowerCase()}/`;
  link.append(el('span', 'vs-flag', flagEmoji(side.iso2)), el('span', undefined, side.name));
  const score = el('p', 'vs-score', fmt(side.score));
  const meta = el('p', 'vs-meta');
  meta.append(
    el('span', undefined, `#${side.rank}`),
    el('span', 'vs-equal', `#${side.equalRank} unweighted`),
  );
  box.append(link, score, meta);
  return box;
}

/** One row per tier, each a bar split about a centre line: the two sides read
 *  as one shape rather than two stacks the eye has to add up. */
function mixChart(c: Comparison, kind: CompareKind): HTMLElement {
  const box = el('section', 'vs-mix');
  box.append(
    el('h2', undefined, kind === 'passport' ? 'How each one travels' : 'Who each one admits'),
  );
  const peak = Math.max(1, ...c.mix.map((m) => Math.max(m.a, m.b)));
  for (const row of c.mix) {
    const line = el('div', 'mix-row');
    const left = el('div', 'mix-bar mix-left');
    left.append(el('i', undefined), el('b', undefined, String(row.a)));
    (left.firstChild as HTMLElement).style.setProperty('--fill', `${(row.a / peak) * 100}%`);
    const right = el('div', 'mix-bar mix-right');
    right.append(el('i', undefined), el('b', undefined, String(row.b)));
    (right.firstChild as HTMLElement).style.setProperty('--fill', `${(row.b / peak) * 100}%`);
    line.append(left, el('span', 'mix-label', row.label), right);
    box.append(line);
  }
  return box;
}

function differenceList(
  title: string,
  rows: Difference[],
  empty: string,
  base: string,
  kind: CompareKind,
): HTMLElement {
  const box = el('section', 'vs-edge');
  box.append(el('h3', undefined, title));
  if (rows.length === 0) {
    box.append(el('p', 'vs-empty', empty));
    return box;
  }
  // A difference list runs to the hundreds; the page shows the heaviest and
  // says plainly how many it is not showing rather than trailing off.
  const SHOWN = 12;
  const list = el('ul', 'edge-list');
  for (const d of rows.slice(0, SHOWN)) {
    const item = el('li');
    const link = el('a');
    // The lists name the other axis: comparing passports they are destinations,
    // comparing destinations they are the passports being let in.
    link.href = `${base}${kind === 'passport' ? 'destination' : 'passport'}/${d.iso3.toLowerCase()}/`;
    link.append(el('span', 'vs-flag', flagEmoji(d.iso2)), el('span', undefined, d.name));
    const tiers = el('span', 'edge-tiers');
    tiers.append(
      el('span', undefined, d.aTier ? LABEL[d.aTier] : 'not rated'),
      // "vs", not an arrow: the two tiers are a standing contrast, and an
      // arrow between them reads as a change from one to the other.
      el('span', 'edge-vs', 'vs'),
      el('span', undefined, d.bTier ? LABEL[d.bTier] : 'not rated'),
    );
    item.append(link, tiers);
    list.append(item);
  }
  box.append(list);
  if (rows.length > SHOWN) {
    box.append(el('p', 'vs-more', `and ${rows.length - SHOWN} more`));
  }
  return box;
}

/** Paint the pair named by `search` into `root`, or say why it can't be. */
export function renderComparison(root: HTMLElement, payload: ComparePayload, search: string, base: string): void {
  const q = parseCompareQuery(search);
  const c = 'error' in q ? q : buildComparison(payload, q);
  root.replaceChildren();

  if ('error' in c) {
    const box = el('section', 'vs-problem');
    box.append(el('h1', undefined, 'Nothing to compare'), el('p', undefined, WHY[c.error]));
    const back = el('a', 'vs-back');
    back.href = base;
    back.textContent = 'Back to the ranking';
    box.append(back);
    root.append(box);
    document.title = 'Compare - Pyatkov Index';
    return;
  }

  const noun = c.kind === 'passport' ? 'passports' : 'destinations';
  document.title = `${c.a.name} vs ${c.b.name} - Pyatkov Index`;

  const spread = el('section', 'vs-head');
  spread.append(
    el('p', 'vs-kicker', `Two ${noun}, side by side`),
    head(c.a, c.kind, base, 'a'),
    el('span', 'vs-mark', 'vs'),
    head(c.b, c.kind, base, 'b'),
  );
  root.append(spread, mixChart(c, c.kind));

  const edges = el('div', 'vs-edges');
  const [an, bn] = [c.a.article, c.b.article];
  if (c.kind === 'passport') {
    edges.append(
      differenceList(`Where ${an} goes more freely`, c.aOnly, `Nowhere ${bn} doesn't.`, base, c.kind),
      differenceList(`Where ${bn} goes more freely`, c.bOnly, `Nowhere ${an} doesn't.`, base, c.kind),
    );
  } else {
    edges.append(
      differenceList(`Who ${an} admits more freely`, c.aOnly, `No one ${bn} doesn't.`, base, c.kind),
      differenceList(`Who ${bn} admits more freely`, c.bOnly, `No one ${an} doesn't.`, base, c.kind),
    );
  }
  root.append(edges);
}
