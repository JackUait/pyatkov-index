import { describe, expect, it } from 'vitest';
import { ordinal, prefersShareSheet, shareText } from '../share.ts';

describe('ordinal', () => {
  it('names the small ordinals', () => {
    expect(ordinal(1)).toBe('1st');
    expect(ordinal(2)).toBe('2nd');
    expect(ordinal(3)).toBe('3rd');
    expect(ordinal(4)).toBe('4th');
  });

  it('keeps the teens on -th, where the last digit would lie', () => {
    expect(ordinal(11)).toBe('11th');
    expect(ordinal(12)).toBe('12th');
    expect(ordinal(13)).toBe('13th');
  });

  it('resumes the pattern past the teens', () => {
    expect(ordinal(21)).toBe('21st');
    expect(ordinal(22)).toBe('22nd');
    expect(ordinal(23)).toBe('23rd');
    expect(ordinal(111)).toBe('111th');
    expect(ordinal(121)).toBe('121st');
  });
});

describe('shareText for a passport', () => {
  const kor = {
    kind: 'passport' as const,
    name: 'South Korea',
    rank: 1,
    score: 94.37105397932747,
    url: 'https://jackuait.github.io/pyatkov-index/passport/kor/',
  };

  it('states the rank, the score and the link', () => {
    expect(shareText(kor)).toBe(
      'South Korea ranks #1 on the Pyatkov Index with 94.4 — https://jackuait.github.io/pyatkov-index/passport/kor/',
    );
  });

  it('prints the score the way the table does, to one decimal', () => {
    expect(shareText({ ...kor, score: 92.15 })).toContain('with 92.2');
  });

  it('capitalises an article that opens the sentence', () => {
    expect(shareText({ ...kor, name: 'the Netherlands' })).toMatch(/^The Netherlands ranks #1/);
  });

  it('says "joint" for a shared rank, matching the table\'s = mark', () => {
    expect(shareText({ ...kor, name: 'Belgium', rank: 4, score: 92.1, tied: true })).toBe(
      'Belgium ranks joint #4 on the Pyatkov Index with 92.1 — https://jackuait.github.io/pyatkov-index/passport/kor/',
    );
  });
});

describe('shareText for a destination', () => {
  const jpn = {
    kind: 'destination' as const,
    name: 'Japan',
    rank: 2,
    score: 0,
    url: 'https://jackuait.github.io/pyatkov-index/destination/jpn/',
  };

  it('ranks the destination by weight, not by score', () => {
    expect(shareText(jpn)).toBe(
      'Japan is the 2nd-heaviest destination on the Pyatkov Index — https://jackuait.github.io/pyatkov-index/destination/jpn/',
    );
  });

  it('capitalises an article that opens the sentence', () => {
    expect(shareText({ ...jpn, name: 'the United States', rank: 1 })).toMatch(
      /^The United States is the heaviest destination/,
    );
  });

  it('calls the top destination the heaviest, not the 1st-heaviest', () => {
    expect(shareText({ ...jpn, name: 'United States', rank: 1 })).toContain(
      'United States is the heaviest destination on the Pyatkov Index',
    );
  });
});

describe('prefersShareSheet', () => {
  it('uses the share sheet on a touch device that has one', () => {
    expect(prefersShareSheet(true, true)).toBe(true);
  });

  it('copies instead on a pointer device, where the OS sheet is heavier than the clipboard', () => {
    expect(prefersShareSheet(true, false)).toBe(false);
  });

  it('copies when there is no share sheet at all', () => {
    expect(prefersShareSheet(false, true)).toBe(false);
    expect(prefersShareSheet(false, false)).toBe(false);
  });
});
