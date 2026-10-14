// The hashtag grammar (design: "src/domain/grammar/parseMemo.ts"; ADR 0004).
import { tagIdentity, type TagIdentity } from './identity.ts';

export interface TagToken {
  /** Index (UTF-16) of the first `#`, including extra markers. */
  readonly markerStart: number;
  /** Index just after the last consecutive `#` marker. */
  readonly textStart: number;
  /** Index just after the tag text, after trailing punctuation is trimmed. */
  readonly textEnd: number;
  /** Tag text as written, without markers. */
  readonly raw: string;
  /** NFC form of `raw`; the unit of spelling comparison. */
  readonly spelling: string;
  readonly identity: TagIdentity;
}

export interface ParsedMemo {
  readonly tokens: readonly TagToken[];
  /** Memo text with tag spans removed by the gap rule and `\#` shown as `#`. Display only. */
  readonly prose: string;
}

const LETTER_OR_DIGIT = /^[\p{L}\p{N}]$/u;
const COMBINING_MARK = /^\p{M}$/u;
const FIRST_WHITE_SPACE = /\p{White_Space}/u;
const TRAILING_PUNCTUATION_RUN = /[\p{Po}\p{Pe}\p{Pf}]+$/u;
const ONLY_DECIMAL_DIGITS = /^\p{Nd}+$/u;
const LEADING_WHITE_SPACE = /^\p{White_Space}+/u;
const TRAILING_WHITE_SPACE = /\p{White_Space}+$/u;
const LINE_BREAK = /^[\n\r\v\f\u0085\p{Zl}\p{Zp}]$/u;

const NO_TAGS: ParsedMemo = { tokens: [], prose: '' };

/** Reads the tags in a memo. `null` and `""` have none (Req 7.1-7.9). */
export function parseMemo(memo: string | null): ParsedMemo {
  if (memo === null || memo === '') return NO_TAGS;

  const tokens: TagToken[] = [];
  // Whether the base character before the current position blocks a `#`: a backslash, a letter,
  // a digit, or a `#` that was itself blocked. Combining marks are skipped so they are judged by their base character; a mark
  // with no base leaves this false, which is the same as the memo start.
  let blocked = false;
  let i = 0;
  while (i < memo.length) {
    const ch = String.fromCodePoint(memo.codePointAt(i)!);
    if (ch === '#' && !blocked) {
      const token = readToken(memo, i);
      if (token.token) tokens.push(token.token);
      // Whatever the run held, it is spent: a `#` inside it is part of that run.
      i = token.runEnd;
      continue;
    }
    // A `#` that could not start a tag passes that on to a `#` right after it, so
    // `catalogue##kitchen` and `\\##tag` stay prose.
    if (!COMBINING_MARK.test(ch)) {
      blocked = ch === '\\' || LETTER_OR_DIGIT.test(ch) || (ch === '#' && blocked);
    }
    i += ch.length;
  }

  if (tokens.length === 0) {
    return { tokens, prose: memo.replaceAll('\\#', '#') };
  }
  return { tokens, prose: proseOf(memo, tokens) };
}

/** Steps 2-5 of the grammar for a candidate `#` at `markerStart`. */
function readToken(memo: string, markerStart: number): { token: TagToken | null; runEnd: number } {
  let textStart = markerStart + 1;
  while (memo[textStart] === '#') textStart++;

  const rest = memo.slice(textStart);
  const wsAt = rest.search(FIRST_WHITE_SPACE);
  const run = wsAt === -1 ? rest : rest.slice(0, wsAt);
  const runEnd = textStart + run.length;

  const raw = run.replace(TRAILING_PUNCTUATION_RUN, '');
  if (raw === '' || ONLY_DECIMAL_DIGITS.test(raw)) return { token: null, runEnd };

  const spelling = raw.normalize('NFC');
  return {
    token: {
      markerStart,
      textStart,
      textEnd: textStart + raw.length,
      raw,
      spelling,
      identity: tagIdentity(spelling),
    },
    runEnd,
  };
}

/** Removes every token span by the gap rule, then shows each `\#` as `#`. */
function proseOf(memo: string, tokens: readonly TagToken[]): string {
  let text = memo;
  for (let k = tokens.length - 1; k >= 0; k--) {
    const { markerStart, textEnd } = tokens[k]!;
    text = removeSpan(text, markerStart, textEnd);
  }
  return text.replaceAll('\\#', '#');
}

/**
 * Removes `[start, end)` and at most one adjacent whitespace code point (the gap rule, shared by
 * prose display and `src/domain/memo/rewrite.ts`). Working right to left keeps the indices of the
 * tokens still to be removed valid. Trimmed trailing punctuation is not part of the span, so it
 * stays where it was: `end #Tax.` becomes `end .`. The design keeps that rather than guess whether
 * the punctuation belonged to the tag or to the sentence (Req 12.4).
 */
export function removeSpan(text: string, start: number, end: number): string {
  const left = TRAILING_WHITE_SPACE.exec(text.slice(0, start))?.[0] ?? '';
  const right = LEADING_WHITE_SPACE.exec(text.slice(end))?.[0] ?? '';
  const lastOfLeft = left === '' ? '' : Array.from(left).at(-1)!;
  const firstOfRight = right === '' ? '' : Array.from(right)[0]!;

  let dropLeft = 0; // UTF-16 units of whitespace to drop before the span
  let dropRight = 0; // ... and after it
  if (start === 0) {
    if (right !== '') dropRight = firstOfRight.length;
  } else if (end === text.length) {
    if (left !== '') dropLeft = lastOfLeft.length;
  } else if (left !== '' && right !== '') {
    if (LINE_BREAK.test(lastOfLeft) && !LINE_BREAK.test(firstOfRight)) {
      dropRight = firstOfRight.length;
    } else {
      dropLeft = lastOfLeft.length;
    }
  }
  return text.slice(0, start - dropLeft) + text.slice(end + dropRight);
}
