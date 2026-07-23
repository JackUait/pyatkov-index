import { describe, expect, it } from 'vitest';
import { countryPath, isPlainLeftClick } from '../country-drawer.ts';

describe('countryPath', () => {
  it('classifies passport and destination pages under a root base', () => {
    expect(countryPath('/passport/usa/', '/')).toBe('passport');
    expect(countryPath('/destination/fra/', '/')).toBe('destination');
  });

  it('accepts the path with or without its trailing slash', () => {
    expect(countryPath('/passport/usa', '/')).toBe('passport');
    expect(countryPath('/destination/fra', '/')).toBe('destination');
  });

  it('classifies pages under a subpath base, and rejects the same path outside it', () => {
    expect(countryPath('/pyatkov-index/passport/usa/', '/pyatkov-index/')).toBe('passport');
    expect(countryPath('/passport/usa/', '/pyatkov-index/')).toBe(null);
  });

  it('rejects every other route', () => {
    expect(countryPath('/', '/')).toBe(null);
    expect(countryPath('/methodology/', '/')).toBe(null);
    expect(countryPath('/openness/', '/')).toBe(null);
    expect(countryPath('/passport/', '/')).toBe(null);
    expect(countryPath('/destination/', '/')).toBe(null);
  });

  it('rejects deeper paths that merely start with a country route', () => {
    expect(countryPath('/passport/usa/extra/', '/')).toBe(null);
  });
});

describe('isPlainLeftClick', () => {
  const plain = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };

  it('accepts an unmodified left click', () => {
    expect(isPlainLeftClick(plain)).toBe(true);
  });

  it('rejects middle clicks and every modifier, so new-tab gestures keep working', () => {
    expect(isPlainLeftClick({ ...plain, button: 1 })).toBe(false);
    expect(isPlainLeftClick({ ...plain, metaKey: true })).toBe(false);
    expect(isPlainLeftClick({ ...plain, ctrlKey: true })).toBe(false);
    expect(isPlainLeftClick({ ...plain, shiftKey: true })).toBe(false);
    expect(isPlainLeftClick({ ...plain, altKey: true })).toBe(false);
  });
});
