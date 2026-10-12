// Tag Identity and tag text validation (design: Decision 4; ADR 0004 and its 2026-10-11 amendment).
export type TagIdentity = string & { readonly __brand: 'TagIdentity' };

/** NFC, then the default Unicode lowercase mapping. Locale-independent (Decision 4). */
export function tagIdentity(text: string): TagIdentity {
  return text.normalize('NFC').toLowerCase() as TagIdentity;
}

// These three classes are the same ones parseMemo uses to bound a token. They are repeated here
// rather than imported so identity.ts has no dependency on the parser (which depends on this
// file for `tagIdentity`). identity.property.test.ts checks that the two never disagree.
const HAS_WHITE_SPACE = /\p{White_Space}/u;
const ENDS_WITH_TRIMMABLE_PUNCTUATION = /[\p{Po}\p{Pe}\p{Pf}]$/u;
const ONLY_DECIMAL_DIGITS = /^\p{Nd}+$/u;

export type TagTextRejection =
  | 'empty'
  | 'digitsOnly'
  | 'whitespace'
  | 'trailingPunctuation'
  | 'marker';

/**
 * Validates user-entered tag text for apply/rename: exactly one token, whole string, no trimming.
 *
 * One leading `#` is accepted and dropped. The returned spelling is the rest of the text exactly
 * as entered, so writing `#${spelling}` into a memo reads back as that spelling and nothing else.
 */
export function validateTagText(
  text: string,
): { ok: true; spelling: string } | { ok: false; reason: TagTextRejection } {
  const spelling = text.startsWith('#') ? text.slice(1) : text;
  if (spelling === '') return { ok: false, reason: 'empty' };
  // A second leading '#' would be read back as an extra marker, not as part of the tag text.
  // Checked before whitespace so '##' and '## x' are both reported as a marker problem.
  if (HAS_WHITE_SPACE.test(spelling)) return { ok: false, reason: 'whitespace' };
  if (spelling.startsWith('#')) return { ok: false, reason: 'marker' };
  // Trimming precedes the digit test, so '3.' is reported as punctuation and never as a number.
  if (ENDS_WITH_TRIMMABLE_PUNCTUATION.test(spelling)) {
    return { ok: false, reason: 'trailingPunctuation' };
  }
  if (ONLY_DECIMAL_DIGITS.test(spelling)) return { ok: false, reason: 'digitsOnly' };
  return { ok: true, spelling };
}
