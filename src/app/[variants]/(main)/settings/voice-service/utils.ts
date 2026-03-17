export interface WordToken {
  isWord: boolean;
  text: string;
  wordIndex?: number;
}

const WORD_REGEX = /[\p{L}\p{N}]+/gu;

export const splitTextToTokens = (text: string): WordToken[] => {
  if (!text) return [];

  const tokens: WordToken[] = [];
  let wordIndex = 0;
  let lastIndex = 0;

  for (const match of text.matchAll(WORD_REGEX)) {
    const index = match.index ?? 0;

    if (index > lastIndex) {
      tokens.push({ isWord: false, text: text.slice(lastIndex, index) });
    }

    tokens.push({ isWord: true, text: match[0], wordIndex });
    wordIndex += 1;
    lastIndex = index + match[0].length;
  }

  if (lastIndex < text.length) {
    tokens.push({ isWord: false, text: text.slice(lastIndex) });
  }

  return tokens;
};

export const countWords = (tokens: WordToken[]): number =>
  tokens.reduce((count, token) => (token.isWord ? count + 1 : count), 0);

export const getCurrentWordIndex = (
  currentTime: number,
  duration: number,
  totalWords: number,
): number => {
  if (totalWords <= 0) return -1;
  if (!Number.isFinite(duration) || duration <= 0) return -1;

  const ratio = Math.min(1, Math.max(0, currentTime / duration));
  return Math.min(totalWords - 1, Math.floor(ratio * totalWords));
};

export const getRevealedTokens = (
  tokens: WordToken[],
  currentWordIndex: number,
): WordToken[] => {
  if (currentWordIndex < 0) return [];

  const result: WordToken[] = [];
  for (const token of tokens) {
    if (token.isWord && (token.wordIndex ?? 0) > currentWordIndex) break;
    result.push(token);
  }

  return result;
};
