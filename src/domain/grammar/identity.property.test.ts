// Property 3 (design): identity is invariant under canonical equivalence and case.
import fc from 'fast-check';
import { describe, expect, it } from 'vite-plus/test';
import { anyTextArb, memoArb, tagTextArb } from '../../../test/arbitraries.ts';
import { tagIdentity, validateTagText } from './identity.ts';
import { parseMemo } from './parseMemo.ts';

describe('Property 3: Tag Identity', () => {
  it('is the same for t and its NFD form', () => {
    fc.assert(
      fc.property(anyTextArb, (t) => {
        expect(tagIdentity(t.normalize('NFD'))).toBe(tagIdentity(t));
      }),
    );
  });

  it('is the same for t and its NFC form', () => {
    fc.assert(
      fc.property(anyTextArb, (t) => {
        expect(tagIdentity(t.normalize('NFC'))).toBe(tagIdentity(t));
      }),
    );
  });

  it('is the same for t and t.toLowerCase()', () => {
    fc.assert(
      fc.property(anyTextArb, (t) => {
        expect(tagIdentity(t.toLowerCase())).toBe(tagIdentity(t));
      }),
    );
  });

  it('is the same for t and t.toUpperCase() whenever uppercasing loses no case information', () => {
    fc.assert(
      fc.property(anyTextArb, (t) => {
        const upper = t.toUpperCase();
        // Uppercasing is lossy for ß, final sigma and the like. Only compare where it round-trips.
        fc.pre(upper.toLowerCase() === t.toLowerCase());
        expect(tagIdentity(upper)).toBe(tagIdentity(t));
      }),
    );
  });

  it('is idempotent', () => {
    fc.assert(
      fc.property(anyTextArb, (t) => {
        expect(tagIdentity(tagIdentity(t))).toBe(tagIdentity(t));
      }),
    );
  });

  it('keeps full-width letters distinct from their ASCII counterparts (no NFKC)', () => {
    const asciiLetters = fc.string({
      unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split('')),
      minLength: 1,
      maxLength: 10,
    });
    fc.assert(
      fc.property(asciiLetters, (ascii) => {
        const exact = Array.from(ascii)
          .map((c) =>
            c >= 'a'
              ? String.fromCodePoint(c.codePointAt(0)! - 0x61 + 0xff41)
              : String.fromCodePoint(c.codePointAt(0)! - 0x41 + 0xff21),
          )
          .join('');
        expect(exact.normalize('NFKC')).toBe(ascii);
        expect(tagIdentity(exact)).not.toBe(tagIdentity(ascii));
      }),
    );
  });

  it('is stable when lowercasing leaves a string outside NFC', () => {
    const upper = '\u03AB\u0300'; // Ϋ + grave
    const lower = upper.toLowerCase(); // U+03CB U+0300, canonically equal to U+1FE2
    expect(tagIdentity(lower)).toBe(tagIdentity(upper));
    expect(tagIdentity(tagIdentity(upper))).toBe(tagIdentity(upper));
  });

  it('keeps Straße and STRASSE distinct', () => {
    expect(tagIdentity('Straße')).not.toBe(tagIdentity('STRASSE'));
    expect(tagIdentity('Straße')).toBe(tagIdentity('STRAßE'));
  });
});

describe('validateTagText agrees with parseMemo', () => {
  /** What the parser reads back when the text is written as `#text`. */
  const readsBackWhole = (text: string): boolean => {
    const memo = `#${text}`;
    const { tokens } = parseMemo(memo);
    return tokens.length === 1 && tokens[0]!.raw === text && tokens[0]!.textEnd === memo.length;
  };

  it('accepts exactly the texts that read back as one whole token', () => {
    fc.assert(
      fc.property(fc.oneof(memoArb, tagTextArb), (text) => {
        const stripped = text.startsWith('#') ? text.slice(1) : text;
        const result = validateTagText(text);
        expect(result.ok).toBe(readsBackWhole(stripped));
        if (result.ok) expect(result.spelling).toBe(stripped);
      }),
      { numRuns: 1000 },
    );
  });

  it('gives the same answer with or without one leading #', () => {
    fc.assert(
      fc.property(memoArb, (text) => {
        if (text.startsWith('#')) return;
        expect(validateTagText(`#${text}`)).toEqual(validateTagText(text));
      }),
    );
  });
});
