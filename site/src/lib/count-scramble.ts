// The Matrix decode for the headline's counting verb: each letter arrives as
// a digit flickering through random numbers, and locks into its true glyph
// the moment its drift-in settles — so the word literally assembles out of
// counting. The CSS animation-delay/duration stay the one source of
// choreography: this reads them back, which is what keeps the ink wipe's
// compressed stagger working here with nothing extra.
const digit = () => String(Math.floor(Math.random() * 10));

export function initCountScramble(selector = '.hero .count-letters i'): void {
  const glyphs = Array.from(document.querySelectorAll<HTMLElement>(selector));
  if (glyphs.length === 0) return;
  // Reduced motion keeps the word whole — the CSS gates the drift the same way.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  for (const el of glyphs) {
    const final = el.textContent ?? '';
    const style = getComputedStyle(el);
    const delay = parseFloat(style.animationDelay) || 0;
    const duration = parseFloat(style.animationDuration) || 0;
    // No drift to ride along with (animation off for any reason): leave the
    // letter printed rather than flickering against a static line.
    if (duration === 0) continue;

    // page-load can arrive well after render — the drift runs on the CSS
    // clock from first paint, this code only from the event. Sync to the
    // animation's own elapsed time, and never touch a letter that has
    // already landed: flickering it back into digits reads as breaking.
    const elapsed = Number(el.getAnimations()[0]?.currentTime ?? 0);
    const remaining = (delay + duration) * 1000 - elapsed;
    if (remaining <= 0) continue;

    el.textContent = digit();
    const flicker = window.setInterval(() => {
      el.textContent = digit();
    }, 55);
    window.setTimeout(() => {
      window.clearInterval(flicker);
      el.textContent = final;
    }, remaining);
  }
}
