// Property 1 (design): tokens are never truncated. Also covers the structural half of Property 2
// (the start rule) and a generative round trip against validateTagText.
import fc from 'fast-check';
import { describe, expect, it } from 'vite-plus/test';
import {
  memoArb,
  proseWordArb,
  taggedMemoArb,
  tagTextArb,
  WHITE_SPACE_CODE_POINTS,
} from '../../../test/arbitraries.ts';
import { tagIdentity, validateTagText } from './identity.ts';
import { parseMemo } from './parseMemo.ts';

const WHITE_SPACE = /^\p{White_Space}$/u;
const TRAILING = /^[\p{Po}\p{Pe}\p{Pf}]$/u;
const ALL_DECIMAL_DIGITS = /^\p{Nd}+$/u;
const LETTER_OR_DIGIT = /^[\p{L}\p{N}]$/u;
const MARK = /^\p{M}$/u;

/** End of the whitespace-delimited run that starts at `from`. */
function runEnd(memo: string, from: number): number {
  let i = from;
  while (i < memo.length) {
    const cp = memo.codePointAt(i)!;
    const ch = String.fromCodePoint(cp);
    if (WHITE_SPACE.test(ch)) return i;
    i += ch.length;
  }
  return memo.length;
}

/** The code point immediately before UTF-16 index `i`, or null at the start. */
function before(memo: string, i: number): { ch: string; at: number } | null {
  if (i === 0) return null;
  const low = memo.charCodeAt(i - 1);
  const isPair = low >= 0xdc00 && low <= 0xdfff && i >= 2;
  const at = isPair ? i - 2 : i - 1;
  return { ch: String.fromCodePoint(memo.codePointAt(at)!), at };
}

describe('Property 1: tokens are never truncated', () => {
  it('spans from its markers to a whitespace boundary or the memo end, less trailing Po/Pe/Pf', () => {
    fc.assert(
      fc.property(memoArb, (memo) => {
        for (const token of parseMemo(memo).tokens) {
          // Markers: one or more '#', ending where the text starts.
          expect(memo[token.markerStart]).toBe('#');
          expect(token.textStart).toBeGreaterThan(token.markerStart);
          expect(memo.slice(token.markerStart, token.textStart)).toMatch(/^#+$/);

          // The text is the run to the next whitespace, less the trimmed tail.
          const end = runEnd(memo, token.textStart);
          expect(token.textEnd).toBeLessThanOrEqual(end);
          const tail = memo.slice(token.textEnd, end);
          for (const cp of tail) expect(cp).toMatch(TRAILING);

          expect(token.raw).toBe(memo.slice(token.textStart, token.textEnd));

          // The text holds no whitespace, is not empty and is not all decimal digits.
          for (const cp of token.raw) expect(cp).not.toMatch(WHITE_SPACE);
          expect(token.raw).not.toBe('');
          expect(token.raw).not.toMatch(ALL_DECIMAL_DIGITS);

          // The trim stopped at the right place: the last kept code point is not trimmable.
          const last = Array.from(token.raw).at(-1)!;
          expect(last).not.toMatch(TRAILING);
        }
      }),
      { numRuns: 2000 },
    );
  });

  it('returns tokens in order, without overlap', () => {
    fc.assert(
      fc.property(memoArb, (memo) => {
        const { tokens } = parseMemo(memo);
        for (let i = 1; i < tokens.length; i++) {
          expect(tokens[i]!.markerStart).toBeGreaterThanOrEqual(tokens[i - 1]!.textEnd);
        }
      }),
    );
  });

  it('reads a tag back in whole, whatever surrounds it', () => {
    fc.assert(
      fc.property(
        proseWordArb,
        tagTextArb,
        fc.constantFrom(...WHITE_SPACE_CODE_POINTS),
        (word, text, ws) => {
          fc.pre(validateTagText(text).ok);
          const memo = `${word}${ws}#${text}${ws}${word}`;
          expect(parseMemo(memo).tokens.map((t) => t.raw)).toEqual([text]);
        },
      ),
    );
  });

  it('never throws and always yields consistent identities', () => {
    fc.assert(
      fc.property(
        fc.oneof(memoArb, fc.string({ unit: 'binary', maxLength: 30 }), fc.constant(null)),
        (memo) => {
          const parsed = parseMemo(memo);
          for (const token of parsed.tokens) {
            expect(token.spelling).toBe(token.raw.normalize('NFC'));
            expect(token.identity).toBe(tagIdentity(token.raw));
          }
          expect(parsed.prose).toBeTypeOf('string');
        },
      ),
    );
  });
});

describe('Property 2 (structural half): the start rule', () => {
  it('never starts a token at a # preceded by a backslash, a letter or a digit', () => {
    fc.assert(
      fc.property(memoArb, (memo) => {
        for (const token of parseMemo(memo).tokens) {
          let prev = before(memo, token.markerStart);
          // A combining mark is judged by the base character it modifies.
          while (prev && MARK.test(prev.ch)) prev = before(memo, prev.at);
          if (prev === null) continue;
          expect(prev.ch).not.toBe('\\');
          expect(prev.ch).not.toMatch(LETTER_OR_DIGIT);
        }
      }),
      { numRuns: 2000 },
    );
  });

  it('is unchanged by composing or decomposing the memo (canonical equivalence)', () => {
    fc.assert(
      fc.property(memoArb, (memo) => {
        // Only the *positions* differ between forms, so compare spellings and identities.
        const summary = (m: string) =>
          parseMemo(m).tokens.map((t) => [t.spelling.normalize('NFC'), t.identity]);
        expect(summary(memo.normalize('NFD'))).toEqual(summary(memo.normalize('NFC')));
      }),
      { numRuns: 1000 },
    );
  });

  it('finds every tag that was written, in order', () => {
    fc.assert(
      fc.property(taggedMemoArb, ({ memo, tags }) => {
        expect(parseMemo(memo).tokens.map((t) => t.raw)).toEqual(tags);
      }),
    );
  });

  it('derives prose that contains no tag text', () => {
    fc.assert(
      fc.property(taggedMemoArb, ({ memo, tags }) => {
        const { prose } = parseMemo(memo);
        for (const tag of tags) expect(prose).not.toContain(`#${tag}`);
      }),
    );
  });
});
