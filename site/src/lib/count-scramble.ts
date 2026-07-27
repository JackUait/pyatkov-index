// The Matrix decode for the headline's counting verb: each letter arrives as
// a digit flickering through random numbers, and locks into its true glyph
// the moment its drift-in settles — so the word literally assembles out of
// counting. The CSS animation-delay/duration stay the one source of
// choreography: this reads them back.
//
// The drift's clock starts when the letters first resolve style; this
// module's clock starts at astro:page-load, which can lag by whole seconds.
// Racing them landed the letters plain whenever the event came late, so the
// race is gone: the hero's entrance waits, paused behind data-count-hold, at
// its from-frame — stamped before first paint by Base.astro's head script on
// cold loads, and re-stamped at astro:after-swap (initCountHold) before the
// swapped-in DOM can render, because Astro's swap copies the incoming <html>
// attributes and would drop a standing hold. Releasing the attribute here
// starts the CSS clock and the flicker timers on the same tick, so the
// decode always plays in full, on every path to the page.
const HOLD = 'data-count-hold';

// Every hold carries a safety release: a page whose scripts never arrive
// (or a swap to a page that never runs this module) must not keep the word
// invisible forever. Each new hold cancels the previous timer — a stale one
// firing into a fresh hold would strip it mid-wait. The cold-load timer is
// the head script's; it parks its id on window so it can be cancelled here.
let safety: number | undefined;
const clearSafety = () => {
  window.clearTimeout(safety);
  window.clearTimeout((window as { __countHoldSafety?: number }).__countHoldSafety);
};

const releaseHold = () => {
  clearSafety();
  document.documentElement.removeAttribute(HOLD);
};

const armHold = () => {
  clearSafety();
  document.documentElement.toggleAttribute(HOLD, true);
  safety = window.setTimeout(releaseHold, 3000);
};

/** Re-arm the hold for every swapped-in page. The CSS scopes the hold to the
 *  hero that counts, so on every other page the attribute pauses nothing and
 *  the safety timer quietly clears it. */
export function initCountHold(): void {
  document.addEventListener('astro:after-swap', armHold);
}

const digit = () => String(Math.floor(Math.random() * 10));

export function initCountScramble(selector = '.hero .count-letters i'): void {
  const glyphs = Array.from(document.querySelectorAll<HTMLElement>(selector));
  if (glyphs.length === 0) {
    releaseHold();
    return;
  }
  // Reduced motion keeps the word whole — the CSS gates the drift the same way.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    releaseHold();
    return;
  }

  for (const el of glyphs) {
    const final = el.textContent ?? '';
    const style = getComputedStyle(el);
    const delay = parseFloat(style.animationDelay) || 0;
    const duration = parseFloat(style.animationDuration) || 0;
    // No drift to ride along with (animation off for any reason): leave the
    // letter printed rather than flickering against a static line.
    if (duration === 0) continue;

    // Belt over the hold's braces: if anything let the drift start early,
    // rewinding to zero puts it back on the clock the timers below use.
    const anim = el.getAnimations()[0];
    if (anim) anim.currentTime = 0;

    el.textContent = digit();
    const flicker = window.setInterval(() => {
      el.textContent = digit();
    }, 55);
    window.setTimeout(() => {
      window.clearInterval(flicker);
      el.textContent = final;
    }, (delay + duration) * 1000);
  }
  releaseHold();
}
