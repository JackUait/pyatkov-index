import { describe, expect, it } from 'vitest';
import {
  countryPath,
  createPrefetcher,
  createScrollPin,
  isPlainLeftClick,
  parseMs,
  shouldPrefetch,
} from '../country-drawer.ts';

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

describe('parseMs', () => {
  it('reads the units a computed CSS duration comes back in', () => {
    expect(parseMs('240ms', 999)).toBe(240);
    expect(parseMs('0.24s', 999)).toBe(240);
    expect(parseMs('  240ms  ', 999)).toBe(240);
  });

  it('falls back when the token is missing or unreadable, so timing never lands on NaN', () => {
    expect(parseMs('', 240)).toBe(240);
    expect(parseMs('fast', 240)).toBe(240);
    expect(parseMs('240', 240)).toBe(240);
  });
});

describe('shouldPrefetch', () => {
  it('prefetches when the browser tells us nothing about the connection', () => {
    expect(shouldPrefetch(undefined)).toBe(true);
    expect(shouldPrefetch({})).toBe(true);
  });

  it('respects Data Saver — a speculative page is exactly what that setting forbids', () => {
    expect(shouldPrefetch({ saveData: true })).toBe(false);
    expect(shouldPrefetch({ saveData: true, effectiveType: '4g' })).toBe(false);
  });

  it('holds off on the slow connections, where the guess costs more than it saves', () => {
    expect(shouldPrefetch({ effectiveType: 'slow-2g' })).toBe(false);
    expect(shouldPrefetch({ effectiveType: '2g' })).toBe(false);
    expect(shouldPrefetch({ effectiveType: '3g' })).toBe(true);
    expect(shouldPrefetch({ effectiveType: '4g' })).toBe(true);
  });
});

describe('createPrefetcher', () => {
  it('warms a url once, however many times the pointer crosses the row', () => {
    const asked: string[] = [];
    const prefetch = createPrefetcher((url) => asked.push(url));
    prefetch('/passport/usa/');
    prefetch('/passport/usa/');
    prefetch('/passport/usa/');
    expect(asked).toEqual(['/passport/usa/']);
  });

  it('keeps each url on its own, so a second row still warms', () => {
    const asked: string[] = [];
    const prefetch = createPrefetcher((url) => asked.push(url));
    prefetch('/passport/usa/');
    prefetch('/destination/fra/');
    prefetch('/passport/usa/');
    expect(asked).toEqual(['/passport/usa/', '/destination/fra/']);
  });
});

describe('createScrollPin', () => {
  /** A stand-in page: the anchor sits at `top`, and scrolling by `dy` lifts it
   *  by the same amount, exactly as the viewport does. */
  function fakePage(top: number) {
    const page = {
      top,
      scrolled: 0,
      scrollBy(dy: number) {
        page.top -= dy;
        page.scrolled += dy;
      },
    };
    return page;
  }

  it('leaves the page alone while the anchor has not drifted', () => {
    const page = fakePage(120);
    const pin = createScrollPin(
      () => page.top,
      (dy) => page.scrollBy(dy),
    );
    pin();
    pin();
    expect(page.scrolled).toBe(0);
    expect(page.top).toBe(120);
  });

  it('holds the anchor still across a reflow that keeps growing', () => {
    const page = fakePage(120);
    const pin = createScrollPin(
      () => page.top,
      (dy) => page.scrollBy(dy),
    );
    // Each frame of the transition pushes the anchor further down the page.
    for (const growth of [8, 14, 9, 3]) {
      page.top += growth;
      pin();
      expect(page.top).toBe(120);
    }
    expect(page.scrolled).toBe(34);
  });

  it('corrects upward drift too, so closing the drawer holds the same line', () => {
    const page = fakePage(200);
    const pin = createScrollPin(
      () => page.top,
      (dy) => page.scrollBy(dy),
    );
    page.top -= 40;
    pin();
    expect(page.top).toBe(200);
    expect(page.scrolled).toBe(-40);
  });

  it('pins to where the anchor stood when the pin was made, not to each frame', () => {
    const page = fakePage(90);
    const pin = createScrollPin(
      () => page.top,
      (dy) => page.scrollBy(dy),
    );
    page.top += 25;
    pin();
    // A frame the browser could not fully correct must not become the new target.
    page.top += 25;
    pin();
    expect(page.top).toBe(90);
  });
});
