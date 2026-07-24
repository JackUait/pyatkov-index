import { describe, expect, it } from 'vitest';
import { routePath, transitionKey } from '../page-transition.ts';

describe('routePath', () => {
  it('passes a root-based path through unchanged', () => {
    expect(routePath('/openness/')).toBe('/openness');
  });

  it('strips the deploy base so CI paths resolve like dev ones', () => {
    expect(routePath('/pyatkov-index/openness/', '/pyatkov-index/')).toBe('/openness');
  });

  it('maps the base itself to the root', () => {
    expect(routePath('/pyatkov-index/', '/pyatkov-index/')).toBe('/');
  });

  it('leaves a path that does not sit under the base alone', () => {
    expect(routePath('/elsewhere/', '/pyatkov-index/')).toBe('/elsewhere');
  });

  it('does not mistake a sibling prefix for the base', () => {
    expect(routePath('/pyatkov-index-old/openness', '/pyatkov-index/')).toBe('/pyatkov-index-old/openness');
  });
});

describe('transitionKey', () => {
  it('gives the front page the ink stroke', () => {
    expect(transitionKey('/')).toBe('ink');
  });

  it('gives openness the door leaves', () => {
    expect(transitionKey('/openness/')).toBe('doors');
  });

  it('gives destinations the tipping scale', () => {
    expect(transitionKey('/destinations/')).toBe('scale');
  });

  it('gives methodology the ruled line', () => {
    expect(transitionKey('/methodology/')).toBe('rule');
  });

  it('gives passport pages the hierarchy move', () => {
    expect(transitionKey('/passport/prt/')).toBe('country');
  });

  it('gives destination pages the hierarchy move', () => {
    expect(transitionKey('/destination/jpn/')).toBe('country');
  });

  it('does not confuse the destinations index with a destination page', () => {
    expect(transitionKey('/destinations')).toBe('scale');
    expect(transitionKey('/destination/jpn')).toBe('country');
  });

  it('is trailing-slash-insensitive', () => {
    expect(transitionKey('/openness')).toBe(transitionKey('/openness/'));
  });

  it('resolves under a deploy base', () => {
    expect(transitionKey('/pyatkov-index/methodology/', '/pyatkov-index/')).toBe('rule');
    expect(transitionKey('/pyatkov-index/', '/pyatkov-index/')).toBe('ink');
  });

  it('falls back to plain for anything with no argument of its own', () => {
    expect(transitionKey('/404/')).toBe('plain');
    expect(transitionKey('/nowhere/at/all')).toBe('plain');
  });
});
