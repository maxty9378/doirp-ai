import { describe, expect, it } from 'vitest';

import {
  countWords,
  getCurrentWordIndex,
  getRevealedTokens,
  splitTextToTokens,
} from './utils';

describe('voice-service utils', () => {
  it('splits text into tokens and reveals progressively', () => {
    const tokens = splitTextToTokens('Привет мир');
    expect(countWords(tokens)).toBe(2);

    const revealedFirst = getRevealedTokens(tokens, 0);
    expect(revealedFirst.map((token) => token.text).join('')).toBe('Привет ');

    const revealedAll = getRevealedTokens(tokens, 1);
    expect(revealedAll.map((token) => token.text).join('')).toBe('Привет мир');
  });

  it('computes current word index from playback time', () => {
    expect(getCurrentWordIndex(1, 10, 2)).toBe(0);
    expect(getCurrentWordIndex(9, 10, 2)).toBe(1);
    expect(getCurrentWordIndex(0, 0, 2)).toBe(-1);
  });
});
