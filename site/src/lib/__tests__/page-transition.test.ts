import { describe, expect, it } from 'vitest';
import { moveFor, routePath, stampFor, transitionKey } from '../page-transition.ts';

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

describe('moveFor', () => {
  it('wipes rightward toward a higher nav index', () => {
    expect(moveFor('/', '/openness/')).toBe('right');
    expect(moveFor('/openness/', '/methodology/')).toBe('right');
  });

  it('wipes leftward toward a lower nav index', () => {
    expect(moveFor('/methodology/', '/')).toBe('left');
    expect(moveFor('/destinations/', '/openness/')).toBe('left');
  });

  it('steps down into a country page from anywhere', () => {
    expect(moveFor('/', '/passport/kor/')).toBe('down');
    expect(moveFor('/openness/', '/destination/jpn/')).toBe('down');
    expect(moveFor('/passport/kor/', '/destination/jpn/')).toBe('down');
  });

  it('steps up out of a country page to any top-level page', () => {
    expect(moveFor('/passport/kor/', '/')).toBe('up');
    expect(moveFor('/destination/jpn/', '/methodology/')).toBe('up');
  });

  it('reads a fresh entrance as forward', () => {
    expect(moveFor('/nowhere/', '/destinations/')).toBe('right');
  });

  it('fades when the destination has no argument, or nothing moved', () => {
    expect(moveFor('/', '/404/')).toBe('plain');
    expect(moveFor('/openness/', '/openness/')).toBe('plain');
  });

  it('resolves under a deploy base', () => {
    expect(moveFor('/pyatkov-index/', '/pyatkov-index/openness/', '/pyatkov-index/')).toBe('right');
    expect(moveFor('/pyatkov-index/methodology/', '/pyatkov-index/', '/pyatkov-index/')).toBe('left');
  });
});

describe('stampFor', () => {
  it('carries the destination key, the reading, and the move', () => {
    expect(stampFor('/', '/openness/', 'forward')).toEqual({ to: 'doors', nav: 'forward', move: 'right' });
  });

  it('reads a popstate as back without changing the move', () => {
    expect(stampFor('/', '/passport/prt/', 'back')).toEqual({ to: 'country', nav: 'back', move: 'down' });
  });

  it('treats any direction that is not back as forward', () => {
    expect(stampFor('/', '/openness/', '').nav).toBe('forward');
    expect(stampFor('/', '/openness/', 'unknown').nav).toBe('forward');
  });

  it('still lets the destination govern the arrival key on back', () => {
    // Direction never changes what the page IS — the arrival-sync layer keys
    // off the destination whichever way you got there.
    expect(stampFor('/', '/methodology/', 'back').to).toBe('rule');
  });

  it('resolves under a deploy base', () => {
    const s = stampFor('/pyatkov-index/', '/pyatkov-index/destinations/', 'forward', '/pyatkov-index/');
    expect(s).toEqual({ to: 'scale', nav: 'forward', move: 'right' });
  });
});
