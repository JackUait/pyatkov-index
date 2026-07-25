// The arrival choreographer.
//
// The page-level gestures live in global.css, on ::view-transition-*(root) —
// pseudo-elements, which no animation library can reach. What a library buys
// here is the thing CSS provably cannot do: wave a wall of 199 doors in step
// with a sweep that crosses the viewport, when the number of columns depends on
// the viewport width and no element knows its own position.
//
// So the delays are measured, not counted. Each door opens as the sweep reaches
// the x it actually occupies, at any breakpoint, however the grid wrapped.
//
// This runs only on a navigation — a cold load carries no data-to, and the CSS
// choreography owns that case untouched.

// Motion is loaded lazily, and that is the whole reason it is affordable here.
//
// It weighs ~21kB gzipped against a first-party bundle of 2.5kB, and this site
// preloads three font faces to protect its first paint. But none of this runs
// on a first paint: a wave only ever plays on a navigation. So the module is
// warmed on idle, after the page is interactive, and the critical path never
// carries a byte of it.
//
// motion/mini would have been a tenth of the size, but it exports animate and
// nothing else — no spring generator anywhere in the bundle — and spring
// physics is the one thing here that native easing cannot express. Without it
// the library would be paying 21kB for syntax over element.animate().
//
// Until it resolves, the CSS choreography stays in charge: the rules that hand
// the wall over to this file are gated on [data-wave], which is set below and
// only once the module is actually in hand.
type Motion = typeof import('./motion-anim.ts');

let motion: Motion | null = null;

/** Where an element at `x` falls in a left-to-right sweep, in seconds. */
export function sweepDelay(x: number, left: number, right: number, span: number): number {
  if (right <= left) return 0;
  const t = (x - left) / (right - left);
  return Math.min(Math.max(t, 0), 1) * span;
}

/** The same, for a whole wall: positions in, delays out, DOM order preserved.
 *
 *  `bounds` is the frame the sweep is measured in, and it matters. A wave meant
 *  to ride the page gesture has to be measured against the viewport the gesture
 *  crosses — the wall of doors occupies only the right third of the screen, so
 *  normalising to the wall's own extent would spread its wave over the full
 *  span while the mask crossed that third in a fraction of it, and the mask
 *  would outrun the wall. A wave that answers to nothing but itself, like the
 *  destinations floor pouring left to right, is measured against its own edges.
 */
export function waveDelays(
  xs: number[],
  span: number,
  bounds?: { left: number; right: number },
): number[] {
  if (xs.length === 0) return [];
  const left = bounds?.left ?? Math.min(...xs);
  const right = bounds?.right ?? Math.max(...xs);
  return xs.map((x) => sweepDelay(x, left, right, span));
}

/** Sweep length per gesture, matching the CSS gesture of the same name. */
const SWEEP = { doors: 0.56, scale: 0.6 } as const;

type Wave = {
  /** Elements the sweep passes over. */
  selector: string;
  /** How long the sweep takes to cross the viewport. */
  span: number;
  /** How long one element takes once the sweep reaches it. */
  fill: number;
  /** Whether the element also lifts in, as the wall's doors do and the
   *  destinations floor's columns — which only ever pour — do not. */
  lift: boolean;
  /** 'viewport' rides the page gesture and must share its frame; 'self' is a
   *  pour that answers to nothing but its own left and right edges. */
  frame: 'viewport' | 'self';
};

const WAVES: Record<string, Wave> = {
  doors: { selector: '.doors-wall .door', span: SWEEP.doors, fill: 0.42, lift: true, frame: 'viewport' },
  scale: { selector: '.weigh-chart .wcol', span: SWEEP.scale, fill: 0.4, lift: false, frame: 'self' },
};

function runWave({ selector, span, fill, lift, frame }: Wave, { animate, spring }: Motion): void {
  const els = Array.from(document.querySelectorAll<HTMLElement>(selector));
  if (els.length === 0) return;

  // One layout read for the whole wall, before any write.
  const delays = waveDelays(
    els.map((el) => el.getBoundingClientRect().left),
    span,
    frame === 'viewport' ? { left: 0, right: window.innerWidth } : undefined,
  );
  const delay = (i: number) => delays[i];

  // The pour is eased, never sprung. --open scales the fill to the share the
  // destination actually admits, so an overshoot would draw a number the data
  // does not support — briefly, but this site does not do that.
  animate(els, { '--open': [0, 1] }, { duration: fill, ease: [0.2, 0.7, 0.3, 1], delay });

  // The lift carries no data, so it gets the real spring the hand-written
  // keyframe could only approximate.
  if (lift) {
    animate(
      els,
      { y: [10, 0], opacity: [0, 1] },
      { type: spring, stiffness: 420, damping: 26, mass: 0.7, delay },
    );
  }
}

export function initArrival(): void {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  const warm = () => {
    if (motion || reduced.matches) return;
    import('./motion-anim.ts').then(
      (m) => {
        motion = m;
        flag();
      },
      // A failed fetch is not a broken page: without the flag the CSS
      // choreography simply keeps the job it already had.
      () => {},
    );
  };

  // Astro copies the incoming document's <html> attributes over this one on
  // every swap, and no server render carries this flag — so it is rewritten
  // here, inside the update callback, before the browser captures anything.
  const flag = () => {
    if (motion) document.documentElement.dataset.wave = '';
  };

  const run = () => {
    flag();
    const key = document.documentElement.dataset.to;
    // No stamp means a cold load, and the CSS choreography owns that.
    if (!key || !motion || reduced.matches) return;
    const wave = WAVES[key];
    if (wave) runWave(wave, motion);
  };

  // after-swap, not page-load: it fires inside the view transition's update
  // callback, so the wave starts on the same frame the gesture does.
  // ::view-transition-new(root) renders live, so the wall is seen waving
  // through the wipe rather than behind it.
  document.addEventListener('astro:after-swap', run);

  // After the first paint has had its turn, never during it. Read off window
  // rather than tested with `in`, which narrows window itself to never.
  const idle: typeof window.requestIdleCallback | undefined = window.requestIdleCallback;
  if (idle) idle(warm, { timeout: 2000 });
  else window.setTimeout(warm, 800);
}
