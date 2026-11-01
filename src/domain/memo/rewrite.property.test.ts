// Properties 8 and 9 (design): apply then remove is the identity, and rewrites touch only tag spans.
import fc from 'fast-check';
import { describe, expect, it } from 'vite-plus/test';
import {
  memoArb,
  nullableMemoArb,
  poolTagArb,
  taggedMemoArb,
  tagTextArb,
} from '../../../test/arbitraries.ts';
import { tagIdentity, validateTagText } from '../grammar/identity.ts';
import { parseMemo } from '../grammar/parseMemo.ts';
import { applyTag, removeIdentity, renameIdentity } from './rewrite.ts';

const WHITE_SPACE = /^\p{White_Space}$/u;

/** A spelling `validateTagText` accepts. */
const validSpellingArb = fc.oneof(poolTagArb, tagTextArb).filter((t) => validateTagText(t).ok);

/** Memos that often carry pool tags, and sometimes anything at all. */
const anyMemoArb = fc.oneof(
  taggedMemoArb.map(({ memo }) => memo),
  memoArb,
);

const tokenSummary = (memo: string | null) =>
  parseMemo(memo).tokens.map((t) => ({ spelling: t.spelling, identity: t.identity }));

/**
 * Whether `result` is `kept` with only whitespace code points dropped, at most `limit` of them.
 */
function dropsOnlyWhitespace(kept: string, result: string, limit: number): boolean {
  const k = Array.from(kept);
  const r = Array.from(result);
  let j = 0;
  let dropped = 0;
  for (const ch of k) {
    if (j < r.length && r[j] === ch) {
      j++;
    } else if (WHITE_SPACE.test(ch)) {
      dropped++;
    } else {
      return false;
    }
  }
  return j === r.length && dropped <= limit;
}

describe('Property 8: apply then remove is the identity', () => {
  it('removes exactly what apply added and nothing else', () => {
    fc.assert(
      fc.property(nullableMemoArb, validSpellingArb, (memo, spelling) => {
        const identity = tagIdentity(spelling);
        fc.pre(!parseMemo(memo).tokens.some((t) => t.identity === identity));

        const applied = applyTag(memo, spelling);
        expect(removeIdentity(applied, identity)).toBe(memo);
        expect(tokenSummary(applied)).toEqual([
          ...tokenSummary(memo),
          { spelling: spelling.normalize('NFC'), identity },
        ]);
      }),
      { numRuns: 500 },
    );
  });
});

describe('Property 9: rewrites touch only tag spans', () => {
  it('remove drops the spans and at most one whitespace code point per span', () => {
    fc.assert(
      fc.property(anyMemoArb, poolTagArb, (memo, tag) => {
        const identity = tagIdentity(tag);
        const tokens = parseMemo(memo).tokens;
        const removed = tokens.filter((t) => t.identity === identity);

        let kept = memo;
        for (let k = removed.length - 1; k >= 0; k--) {
          const t = removed[k]!;
          kept = kept.slice(0, t.markerStart) + kept.slice(t.textEnd);
        }
        const result = removeIdentity(memo === '' ? null : memo, identity) ?? '';
        expect(dropsOnlyWhitespace(kept, result, removed.length)).toBe(true);
        // Every other token, and every escape, reads back unchanged and in order.
        expect(tokenSummary(result)).toEqual(
          tokens
            .filter((t) => t.identity !== identity)
            .map((t) => ({
              spelling: t.spelling,
              identity: t.identity,
            })),
        );
        expect(result.split('\\#').length).toBe(memo.split('\\#').length);
      }),
      { numRuns: 500 },
    );
  });

  it('rename replaces only tag text, and a merge only removes', () => {
    fc.assert(
      fc.property(anyMemoArb, poolTagArb, validSpellingArb, (memo, tag, toSpelling) => {
        const from = tagIdentity(tag);
        const to = tagIdentity(toSpelling);
        fc.pre(from !== to);
        const tokens = parseMemo(memo).tokens;
        const result = renameIdentity(memo === '' ? null : memo, from, toSpelling) ?? '';

        if (tokens.some((t) => t.identity === to)) {
          expect(result).toBe(removeIdentity(memo === '' ? null : memo, from) ?? '');
          return;
        }
        let expected = memo;
        const renamed = tokens.filter((t) => t.identity === from);
        for (let k = renamed.length - 1; k >= 0; k--) {
          const t = renamed[k]!;
          expected = expected.slice(0, t.textStart) + toSpelling + expected.slice(t.textEnd);
        }
        expect(result).toBe(expected);
        expect(tokenSummary(result)).toEqual(
          tokens.map((t) =>
            t.identity === from
              ? { spelling: toSpelling.normalize('NFC'), identity: to }
              : { spelling: t.spelling, identity: t.identity },
          ),
        );
      }),
      { numRuns: 500 },
    );
  });
});
