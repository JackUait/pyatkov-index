import { describe, expect, it } from 'vitest';
import { flagMarkup } from '../flag.ts';

describe('flagMarkup', () => {
  it('renders an inline svg for a known ISO-3166 alpha-2 code', () => {
    const svg = flagMarkup('US');
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('viewBox');
  });

  it('is case-insensitive', () => {
    expect(flagMarkup('us')).toBe(flagMarkup('US'));
  });

  it('draws the four cards the package omits, rather than falling back', () => {
    // MO, TW, KN and XK are in our data but absent from react-svg-country-flags.
    const blank = flagMarkup('ZZ');
    for (const drawn of ['MO', 'TW', 'KN', 'XK']) {
      expect(flagMarkup(drawn)).not.toBe(blank);
    }
  });

  it('draws each of the four in the field colour of the real flag', () => {
    expect(flagMarkup('MO')).toContain('#00785E'); // Macao green
    expect(flagMarkup('TW')).toContain('#000095'); // ROC canton blue
    expect(flagMarkup('KN')).toContain('#FCD116'); // Kittitian yellow
    expect(flagMarkup('XK')).toContain('#244AA5'); // Kosovo blue
  });

  it('still falls back to the neutral card for anything genuinely unknown', () => {
    const svg = flagMarkup('ZZ');
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toBe(flagMarkup('Q1'));
  });

  it('runs the hand-drawn cards through the same normalisation as the package', () => {
    for (const drawn of ['MO', 'TW', 'KN', 'XK']) {
      const svg = flagMarkup(drawn, 'flag');
      expect(/<svg[^>]*\swidth=/.test(svg)).toBe(false);
      expect(/<svg[^>]*\sheight=/.test(svg)).toBe(false);
      expect(svg).toContain('viewBox="0 0 21 15"');
      expect(svg).toContain('class="flag"');
      expect(svg).toMatch(/^<svg\b[^>]*\saria-hidden="true"/);
      for (const [, ref] of svg.matchAll(/url\(#([^)]+)\)/g)) {
        expect(svg).toContain(`id="${ref}"`);
      }
    }
  });

  it('distinguishes different countries', () => {
    expect(flagMarkup('US')).not.toBe(flagMarkup('FR'));
  });

  it('carries the class name through to the svg element', () => {
    expect(flagMarkup('FR', 'flag flag-lg')).toContain('class="flag flag-lg"');
  });

  it('strips the hardcoded width/height so CSS controls the size', () => {
    const svg = flagMarkup('FR');
    expect(/<svg[^>]*\swidth=/.test(svg)).toBe(false);
    expect(/<svg[^>]*\sheight=/.test(svg)).toBe(false);
  });

  it('hides the card from assistive tech, since the country name always follows', () => {
    for (const code of ['FR', 'XK']) {
      expect(flagMarkup(code)).toMatch(/^<svg\b[^>]*\saria-hidden="true"/);
      expect(flagMarkup(code)).toMatch(/^<svg\b[^>]*\sfocusable="false"/);
    }
  });

  it('gives the fallback a viewBox and a class, which the package omits', () => {
    const svg = flagMarkup('XK', 'flag');
    expect(svg).toContain('viewBox="0 0 21 15"');
    expect(svg).toContain('class="flag"');
  });

  it('namespaces internal ids so they cannot collide with page anchors', () => {
    // The fallback card ships id="a" verbatim, which would shadow any <a id="a">.
    expect(flagMarkup('XK')).not.toMatch(/\sid="a"/);
    const fr = flagMarkup('FR');
    for (const id of fr.match(/\sid="([^"]+)"/g) ?? []) {
      expect(id).toContain('id="flag-');
    }
    // Every mask/clip reference still resolves to an id that exists in the card.
    for (const [, ref] of fr.matchAll(/url\(#([^)]+)\)/g)) {
      expect(fr).toContain(`id="${ref}"`);
    }
  });
});
