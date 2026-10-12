import { describe, expect, it } from 'vite-plus/test';
import { tagIdentity } from './identity.ts';
import { parseMemo } from './parseMemo.ts';

const raws = (memo: string | null): string[] => parseMemo(memo).tokens.map((t) => t.raw);

describe('parseMemo: recognized tags (ADR 0004 examples)', () => {
  it.each([
    ['#Café', ['Café']],
    ['#Grüße', ['Grüße']],
    ['#Home_Repair', ['Home_Repair']],
    ['#Cornwall-2026', ['Cornwall-2026']],
    ['Paint,#Home-Repair', ['Home-Repair']],
    ['(#Tax', ['Tax']],
    ['Weekly shop #Household.', ['Household']],
    ['#家計。', ['家計']],
    ['#Household”', ['Household']],
    ['#買い物」', ['買い物']],
    ['#Home-', ['Home-']],
    ['#Home_', ['Home_']],
    ['#Ⅻ', ['Ⅻ']],
    ['#3a', ['3a']],
    ['#3-', ['3-']],
    ['#-', ['-']],
    ['#a.b', ['a.b']],
    ['#a#b', ['a#b']],
    ['#tag!?.', ['tag']],
    ['#tag).', ['tag']],
    ['#"quoted"', ['"quoted']],
    ["#tag's", ["tag's"]],
    ['#Y2026', ['Y2026']],
    ['Flat #3 #Rent', ['Rent']],
    ['#a #b #c', ['a', 'b', 'c']],
    ['a\\b #t', ['t']],
  ])('%j reads as %j', (memo, expected) => {
    expect(raws(memo)).toEqual(expected);
  });
});

describe('parseMemo: prose, not tags', () => {
  it.each([
    'catalogue#kitchen',
    'C#',
    '#',
    '#3.',
    '#٣',
    '#٣٣',
    '#３',
    'Flat #3',
    'Invoice #1234',
    'Table #7',
    '# tag',
    '#.',
    '#!',
    'é#tag',
    'e\u0301#tag',
    '中#tag',
    '\\#tag',
    'C:\\#temp',
    '𝒜#tag',
    '𝟘#tag',
    'x9#tag',
  ])('%j has no tags', (memo) => {
    expect(raws(memo)).toEqual([]);
  });

  it('derives no tags from null or empty memos', () => {
    expect(parseMemo(null)).toEqual({ tokens: [], prose: '' });
    expect(parseMemo('')).toEqual({ tokens: [], prose: '' });
  });
});

describe('parseMemo: the # start rule', () => {
  it('treats precomposed and decomposed é before # identically', () => {
    expect(raws('\u00e9#tag')).toEqual(raws('e\u0301#tag'));
    expect(raws('\u00e9#tag')).toEqual([]);
  });

  it('judges a combining mark by its base character', () => {
    expect(raws(' \u0301#tag')).toEqual(['tag']); // base is a space
    expect(raws('\\\u0301#tag')).toEqual([]); // base is a backslash
    expect(raws('9\u0301#tag')).toEqual([]); // base is a digit
  });

  it('treats a mark with no base as the memo start', () => {
    expect(raws('\u0301#tag')).toEqual(['tag']);
    expect(raws('\u0301\u0308#tag')).toEqual(['tag']);
  });

  it('accepts symbols, emoji and punctuation before the marker', () => {
    expect(raws('😀#tag')).toEqual(['tag']);
    expect(raws('a-#tag')).toEqual(['tag']);
    expect(raws('a_#tag')).toEqual(['tag']);
    expect(raws('«#tag')).toEqual(['tag']);
  });

  it('keeps other backslashes untouched', () => {
    expect(raws('C:\\temp #tag')).toEqual(['tag']);
    expect(parseMemo('C:\\temp #tag').prose).toBe('C:\\temp');
  });

  it('lets a # after a # start a tag when the first one cannot', () => {
    expect(raws('a##b')).toEqual(['b']);
    expect(raws('\\##b')).toEqual(['b']);
  });
});

describe('parseMemo: token boundaries', () => {
  it('ends a tag at any White_Space code point', () => {
    for (const ws of [
      '\t',
      '\n',
      '\r',
      '\u0085',
      '\u00a0',
      '\u1680',
      '\u2003',
      '\u2028',
      '\u202f',
      '\u3000',
    ]) {
      expect(raws(`#a${ws}b`)).toEqual(['a']);
    }
  });

  it('does not end a tag at non-White_Space invisibles', () => {
    expect(raws('#a\u200bb')).toEqual(['a\u200bb']);
    expect(raws('#a\ufeffb')).toEqual(['a\ufeffb']);
  });

  it('reports UTF-16 indices that include the extra markers', () => {
    const [token] = parseMemo('x ##Tag.').tokens;
    expect(token).toBeDefined();
    expect(token!.markerStart).toBe(2);
    expect(token!.textStart).toBe(4);
    expect(token!.textEnd).toBe(7);
    expect(token!.raw).toBe('Tag');
  });

  it('counts astral characters as two UTF-16 units', () => {
    const [token] = parseMemo('😀 #tag').tokens;
    expect(token!.markerStart).toBe(3);
    expect(token!.textStart).toBe(4);
    expect(token!.textEnd).toBe(7);
  });

  it('reads a doubled marker as the single tag', () => {
    const [token] = parseMemo('##Household').tokens;
    expect(token!.raw).toBe('Household');
    expect(token!.markerStart).toBe(0);
    expect(token!.textStart).toBe(2);
  });

  it('carries the raw text, its NFC spelling and its identity', () => {
    const [token] = parseMemo('#Cafe\u0301').tokens;
    expect(token!.raw).toBe('Cafe\u0301');
    expect(token!.spelling).toBe('Caf\u00e9');
    expect(token!.identity).toBe(tagIdentity('Café'));
    expect(token!.identity).toBe('caf\u00e9');
  });

  it('shares an identity between case variants but keeps both spellings', () => {
    const [a, b] = parseMemo('#Household #household').tokens;
    expect(a!.identity).toBe(b!.identity);
    expect(a!.spelling).not.toBe(b!.spelling);
  });

  it('returns every repeat of a tag, in order', () => {
    expect(raws('#a #b #a')).toEqual(['a', 'b', 'a']);
  });
});

describe('parseMemo: prose', () => {
  it.each([
    ['#a b', 'b'],
    ['b #a', 'b'],
    ['x #a y', 'x y'],
    ['x  #a  y', 'x   y'],
    ['x\n#a y', 'x\ny'],
    ['x #a\ny', 'x\ny'],
    ['x\n#a\ny', 'x\ny'],
    ['#a #b', ''],
    ['#a #b c', 'c'],
    ['shop #Tag · Club', 'shop · Club'],
    ['Weekly shop #Household.', 'Weekly shop .'],
    ['(#Tax)', '()'],
    ['#Tag', ''],
    ['plain words', 'plain words'],
  ])('%j shows as %j', (memo, prose) => {
    expect(parseMemo(memo).prose).toBe(prose);
  });

  it('shows an escaped hash as a plain hash', () => {
    expect(parseMemo('\\#hash').prose).toBe('#hash');
    expect(parseMemo('C:\\#temp #tag').prose).toBe('C:#temp');
  });
});
