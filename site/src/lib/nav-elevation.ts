// The sticky nav owns one of the two allowed elevations (DESIGN.md), but a
// shadowed white bar over an unscrolled page separates the masthead from the
// canvas for no reason. At rest the bar dissolves into the paper; the
// elevation appears only once content actually passes beneath it.

/** Sub-threshold scroll (rubber-banding, anchor rounding) still counts as top.
    Mirrored by the inline first-paint script in Base.astro — keep in sync. */
export const TOP_THRESHOLD = 8;

export function isAtTop(scrollY: number, threshold: number = TOP_THRESHOLD): boolean {
  return scrollY <= threshold;
}

// CSS defaults to the elevated bar, so a failed script degrades to the old
// always-shadowed nav rather than a transparent bar over scrolled content.
// The flag rides on <html>, not the header: the head script in Base.astro
// must be able to set it before the body exists, so the header's first style
// resolution — and first paint — already has the answer.
export function initNavElevation(): void {
  const root = document.documentElement;
  const update = () => root.toggleAttribute('data-top', isAtTop(window.scrollY));
  update();
  window.addEventListener('scroll', update, { passive: true });
}
