import { describe, expect, it } from 'vitest';
import { absUrl, pageId, ID, SITE_ORIGIN } from '../seo.ts';

describe('absUrl', () => {
  it('resolves a base-qualified pathname against the canonical origin', () => {
    expect(absUrl('/pyatkov-index/passport/usa/')).toBe(
      'https://jackuait.github.io/pyatkov-index/passport/usa/',
    );
  });

  it('is idempotent on an already-absolute URL', () => {
    const abs = 'https://jackuait.github.io/pyatkov-index/og/usa.png';
    expect(absUrl(abs)).toBe(abs);
    expect(absUrl(absUrl(abs))).toBe(abs);
  });

  it('passes an off-origin absolute URL through unchanged', () => {
    expect(absUrl('http://example.com/x.png')).toBe('http://example.com/x.png');
  });

  it('never prepends the base a second time', () => {
    expect(absUrl('/pyatkov-index/openness/')).not.toContain('/pyatkov-index/pyatkov-index/');
  });

  it('resolves the bare root', () => {
    expect(absUrl('/')).toBe(`${SITE_ORIGIN}/`);
  });
});

describe('pageId', () => {
  it('appends the hash exactly once', () => {
    expect(pageId('/pyatkov-index/', 'ranking')).toBe('https://jackuait.github.io/pyatkov-index/#ranking');
  });

  it('builds distinct ids per page for the same hash', () => {
    expect(pageId('/pyatkov-index/passport/usa/', 'country')).not.toBe(
      pageId('/pyatkov-index/passport/deu/', 'country'),
    );
  });
});

describe('ID', () => {
  // Asserted against literals, not against absUrl(BASE_URL): computing the expectation
  // the same way seo.ts does made the test pass for any base handling at all, including
  // one that dropped or doubled the base segment.
  it('anchors the site-wide nodes on the site root', () => {
    expect(ID.website).toBe('https://jackuait.github.io/#website');
    expect(ID.creator).toBe('https://jackuait.github.io/#creator');
  });

  // The Dataset node is defined on the methodology page and nowhere else, so its @id
  // fragment has to name that page. Anchored on the root it advertised the dataset as
  // described on the homepage, and disagreed with the node's own `url`.
  it('anchors the dataset on the page that defines it', () => {
    expect(ID.dataset).toBe('https://jackuait.github.io/methodology/#dataset');
  });

  it('carries the base exactly once', () => {
    for (const id of Object.values(ID)) {
      expect(id.startsWith(`${SITE_ORIGIN}${import.meta.env.BASE_URL}`)).toBe(true);
      expect(id).not.toContain('//#');
    }
  });
});
