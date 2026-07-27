import { describe, expect, it } from 'vitest';
import { normalizePath, sectionHref } from '../nav-current.ts';

describe('normalizePath', () => {
  it('keeps the root as a bare slash', () => {
    expect(normalizePath('/')).toBe('/');
  });

  it('strips a trailing slash so /openness/ and /openness compare equal', () => {
    expect(normalizePath('/openness/')).toBe('/openness');
  });

  it('collapses repeated trailing slashes', () => {
    expect(normalizePath('/openness///')).toBe('/openness');
  });

  it('leaves an already-bare path alone', () => {
    expect(normalizePath('/openness')).toBe('/openness');
  });

  it('normalizes an empty path to the root', () => {
    expect(normalizePath('')).toBe('/');
  });
});

describe('sectionHref', () => {
  it('files a passport page under the ranking', () => {
    expect(sectionHref('/passport/BDI/', '/')).toBe('/');
  });

  it('files a destination page under who gets in', () => {
    expect(sectionHref('/destination/BDI/', '/')).toBe('/openness/');
  });

  it('carries the base into the section it names', () => {
    expect(sectionHref('/pyatkov-index/destination/BDI/', '/pyatkov-index/')).toBe(
      '/pyatkov-index/openness/',
    );
    expect(sectionHref('/pyatkov-index/passport/BDI/', '/pyatkov-index/')).toBe('/pyatkov-index/');
  });

  it('leaves a top-level page unclaimed — its own link is already current', () => {
    expect(sectionHref('/openness/', '/')).toBeNull();
    expect(sectionHref('/', '/')).toBeNull();
    expect(sectionHref('/pyatkov-index/', '/pyatkov-index/')).toBeNull();
  });

  it('claims nothing for a path outside the base or an unknown branch', () => {
    expect(sectionHref('/elsewhere/passport/BDI/', '/pyatkov-index/')).toBeNull();
    expect(sectionHref('/nope/BDI/', '/')).toBeNull();
  });

  it('reads a bare pathname without a trailing slash', () => {
    expect(sectionHref('/destination/BDI', '/')).toBe('/openness/');
  });
});
