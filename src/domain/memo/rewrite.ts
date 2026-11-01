// Memo rewriting (design: `src/domain/memo/rewrite.ts`; Req 12.2-12.6, 13.2-13.3, 13.8).
//
// Every function works on the raw memo, touches only tag spans and processes tokens right to left,
// so the indices of tokens still to be visited stay valid. None of them checks the memo limit:
// planning calls `fits` and excludes what does not fit, never truncating (Req 12.7).
import { tagIdentity, type TagIdentity } from '../grammar/identity.ts';
import { parseMemo, removeSpan, type TagToken } from '../grammar/parseMemo.ts';

export const MEMO_LIMIT_CODE_POINTS = 500;

/** Code points, the unit YNAB's memo limit counts (Req 12.6). */
export function codePointLength(memo: string | null): number {
  return memo === null ? 0 : Array.from(memo).length;
}

export function fits(memo: string | null): boolean {
  return codePointLength(memo) <= MEMO_LIMIT_CODE_POINTS;
}

/** An empty rewrite result is `null`, never `""`. */
const orNull = (memo: string): string | null => (memo === '' ? null : memo);

/**
 * Appends `#spelling` with one separating space, reordering nothing; an empty memo becomes the tag
 * alone (Req 12.2). `spelling` must already be valid (`validateTagText`). Callers check membership
 * first: applying a tag the memo already carries is a no-op decided by planning (Req 12.3).
 */
export function applyTag(memo: string | null, spelling: string): string {
  return memo === null || memo === '' ? `#${spelling}` : `${memo} #${spelling}`;
}

const tokensOf = (memo: string | null, identity: TagIdentity): TagToken[] =>
  parseMemo(memo).tokens.filter((t) => t.identity === identity);

/**
 * Removes every token of `identity` by the gap rule. Trimmed trailing punctuation stays, so
 * `shop #Tag · Club` becomes `shop · Club` (Req 12.4).
 */
export function removeIdentity(memo: string | null, identity: TagIdentity): string | null {
  if (memo === null) return null;
  let text = memo;
  const tokens = tokensOf(memo, identity);
  for (let k = tokens.length - 1; k >= 0; k--) {
    const { markerStart, textEnd } = tokens[k]!;
    text = removeSpan(text, markerStart, textEnd);
  }
  return orNull(text);
}

/**
 * Replaces the text of each token of `from` with `toSpelling`, keeping its markers and trimmed
 * punctuation. When the memo already carries a distinct target identity, the `from` tokens are
 * removed instead, so a merge never creates a repeat (Req 13.2-13.3).
 */
export function renameIdentity(
  memo: string | null,
  from: TagIdentity,
  toSpelling: string,
): string | null {
  if (memo === null) return null;
  const toIdentity = tagIdentity(toSpelling);
  const parsed = parseMemo(memo).tokens;
  if (toIdentity !== from && parsed.some((t) => t.identity === toIdentity)) {
    return removeIdentity(memo, from);
  }
  let text = memo;
  const tokens = parsed.filter((t) => t.identity === from);
  for (let k = tokens.length - 1; k >= 0; k--) {
    const { textStart, textEnd } = tokens[k]!;
    text = text.slice(0, textStart) + toSpelling + text.slice(textEnd);
  }
  return orNull(text);
}
