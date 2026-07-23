// Renders public/og-default.png, the fallback social card. The PNG is a
// committed artifact — run `yarn og-card` by hand when the brand changes, not
// on every build.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const W = 1200;
const H = 630;

// The brand ribbon from Base.astro, scaled from its 32x14 viewBox to 480x210:
// one decaying spectrum, heaviest first, warm-to-neutral boundary at 50%.
const RIBBON = [
  { x: 0, w: 6, fill: '#e89d01' },
  { x: 6, w: 4.4, fill: '#ffb110' },
  { x: 10.4, w: 3.2, fill: 'rgba(255, 177, 16, 0.66)' },
  { x: 13.6, w: 2.4, fill: 'rgba(255, 177, 16, 0.38)' },
  { x: 16, w: 5.2, fill: 'rgba(0, 0, 0, 0.2)' },
  { x: 21.2, w: 4.4, fill: 'rgba(0, 0, 0, 0.15)' },
  { x: 25.6, w: 3.6, fill: 'rgba(0, 0, 0, 0.11)' },
  { x: 29.2, w: 2.8, fill: 'rgba(0, 0, 0, 0.08)' },
];

const SCALE = 15; // 32x14 -> 480x210
const RIBBON_X = 96;
const RIBBON_Y = 128;

const slats = RIBBON.map(
  (s) =>
    `<rect x="${(s.x * SCALE).toFixed(2)}" y="0" width="${(s.w * SCALE).toFixed(2)}" height="${14 * SCALE}" fill="${s.fill}" />`,
).join('\n        ');

// Renderers have no webfonts, so the card names the same families the site
// asks for and lets the rasterizer fall back through the generic stacks.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f6f5f4" />
  <g transform="translate(${RIBBON_X} ${RIBBON_Y})">
    <defs><clipPath id="ribbon-clip"><rect width="${32 * SCALE}" height="${14 * SCALE}" rx="${2.5 * SCALE}" /></clipPath></defs>
    <g clip-path="url(#ribbon-clip)">
        ${slats}
    </g>
  </g>
  <text x="${RIBBON_X}" y="440" font-family="Source Serif Pro, Georgia, Times New Roman, serif" font-size="88" font-weight="600" letter-spacing="-2" fill="#000000">The Pyatkov Index</text>
  <text x="${RIBBON_X}" y="512" font-family="Inter, Helvetica, Arial, sans-serif" font-size="27" fill="rgba(0, 0, 0, 0.6)">Most passport rankings count destinations. This one weights each by the</text>
  <text x="${RIBBON_X}" y="550" font-family="Inter, Helvetica, Arial, sans-serif" font-size="27" fill="rgba(0, 0, 0, 0.6)">economy, travel, development, and diaspora behind it.</text>
</svg>
`;

const out = join(dirname(dirname(fileURLToPath(import.meta.url))), 'public', 'og-default.png');
await mkdir(dirname(out), { recursive: true });
await writeFile(out, await sharp(Buffer.from(svg)).png().toBuffer());
console.log(`wrote ${out}`);
