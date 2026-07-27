// The ribbon's ramps, two inks under the logotype's law: the heavy half runs
// warm, the tail runs neutral, and the boundary between them is a step, not a
// fade. Each half is a sequential ramp, light to dark, so a slat's shade
// restates the weight its width already draws. Stops are interpolated in
// oklab, where a straight line between them keeps perceived lightness moving
// one way. Computed at build time so every slat ships a plain hex, no runtime
// color math and no color-mix() support question.
export const RIBBON_FAINT = '#f5e7c9';
export const RIBBON_MID = '#ffb110';
// Darkening marigold in place lands in chocolate: hue held at ~66° with the
// chroma sagging reads as mud next to the ramp's own body. The deep stop
// instead bends toward orange (OKLCH ~52°) and keeps its chroma up, so the
// line from marigold passes through saffron and burnt orange on its way
// down — the heavy end burns instead of browning, and the white label on the
// extreme slat keeps a 6.5:1 contrast.
export const RIBBON_DEEP = '#964700';
export const PAPER = '#f6f5f4';
// The tail's grays keep the ink-wash luminance skeleton (black at ~36% and
// ~14% over paper) but tip warm: a whisper of the amber hue (OKLCH C≈0.012,
// H≈80°) folded into every band, because a dead-neutral gray sitting on warm
// paper next to amber goes cold and dirty — greige, not concrete. The strip
// spends its neutral half on 166 slats, so the range stays wider and the
// floor darker than the 16px mark's own four washes — the palest band still
// has to hold its ground against the paper, not dissolve into it. Both stops
// stay lighter than the deep amber, so the boundary steps down out of the
// warm half rather than up into a second dark block.
export const TAIL_DEEP = '#a19c95';
export const TAIL_FAINT = '#d7d3cb';
// The tail is quantized rather than faded: 166 slats spread across a smooth
// ramp move by a fraction of a value each, which reads as one gray wash with a
// gradient over it. Six bands is the logotype's grammar at the strip's scale —
// each holds ~28 destinations and a visible step separates it from its
// neighbours, so the decay is legible as a decay.
export const TAIL_STEPS = 6;
// Where marigold sits on the strength axis: past halfway, so the heavy head
// runs marigold-to-amber while the long tail thins out through the wash.
const MID_AT = 0.55;

const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const delin = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

// Björn Ottosson's oklab, both directions, straight from the reference matrices.
const hexToOklab = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  const r = lin(((n >> 16) & 255) / 255);
  const g = lin(((n >> 8) & 255) / 255);
  const b = lin((n & 255) / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
};

const oklabToHex = ([L, a, b]: [number, number, number]): string => {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const channel = (v: number) => {
    const srgb = delin(Math.min(1, Math.max(0, v)));
    return Math.round(srgb * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return (
    '#' +
    channel(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s) +
    channel(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s) +
    channel(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)
  );
};

const FAINT_LAB = hexToOklab(RIBBON_FAINT);
const MID_LAB = hexToOklab(RIBBON_MID);
const DEEP_LAB = hexToOklab(RIBBON_DEEP);
const TAIL_FAINT_LAB = hexToOklab(TAIL_FAINT);
const TAIL_DEEP_LAB = hexToOklab(TAIL_DEEP);

const mix = (
  from: [number, number, number],
  to: [number, number, number],
  t: number,
): [number, number, number] => [
  from[0] + (to[0] - from[0]) * t,
  from[1] + (to[1] - from[1]) * t,
  from[2] + (to[2] - from[2]) * t,
];

/** Shade for a destination at strength t in [0, 1]: 0 is the lightest wash,
 *  1 the deepest amber. Out-of-range strengths clamp to the nearest stop. */
export const weightShade = (t: number): string => {
  const c = Math.min(1, Math.max(0, t));
  return oklabToHex(
    c <= MID_AT ? mix(FAINT_LAB, MID_LAB, c / MID_AT) : mix(MID_LAB, DEEP_LAB, (c - MID_AT) / (1 - MID_AT)),
  );
};

/** Shade for a tail destination at strength t in [0, 1], on the neutral ramp:
 *  0 is the palest band, 1 the deepest gray. Strength snaps to one of
 *  TAIL_STEPS bands. Out-of-range strengths clamp to the nearest stop. */
export const tailShade = (t: number): string => {
  const c = Math.min(1, Math.max(0, t));
  const band = Math.round(c * (TAIL_STEPS - 1)) / (TAIL_STEPS - 1);
  return oklabToHex(mix(TAIL_FAINT_LAB, TAIL_DEEP_LAB, band));
};
