// Pointer tooltip for the hero weight ribbon. The tail segments render at
// two or three pixels wide, so per-segment title attributes are unusable;
// one shared tooltip follows the pointer and mirrors each segment's
// server-rendered data-tip text instead. Every value shown here is also
// available in the destinations table, so the tooltip never gates data.
export function initRibbonTip(opts: { figure: string; ribbon: string; tip: string }): void {
  const figure = document.querySelector<HTMLElement>(opts.figure);
  const ribbon = document.querySelector<HTMLElement>(opts.ribbon);
  const tip = document.querySelector<HTMLElement>(opts.tip);
  if (!figure || !ribbon || !tip) return;

  const hide = () => {
    tip.hidden = true;
  };

  const show = (e: PointerEvent) => {
    const seg = (e.target as Element | null)?.closest<HTMLElement>('[data-tip]');
    if (!seg?.dataset.tip) {
      hide();
      return;
    }
    tip.textContent = seg.dataset.tip;
    tip.hidden = false;
    // Anchored just above the strip, horizontally clamped to the figure so
    // the tooltip never spills past the page column at either extreme.
    const bounds = figure.getBoundingClientRect();
    const half = tip.offsetWidth / 2;
    const x = Math.min(Math.max(e.clientX - bounds.left, half), bounds.width - half);
    tip.style.left = `${x}px`;
    tip.style.top = `${ribbon.offsetTop - 8}px`;
  };

  ribbon.addEventListener('pointermove', show);
  ribbon.addEventListener('pointerleave', hide);
}
