import { describe, expect, it } from 'vite-plus/test';
import { tagIdentity, validateTagText } from './identity.ts';

describe('tagIdentity', () => {
  it('is the NFC form, lowercased', () => {
    expect(tagIdentity('Café')).toBe('café');
    expect(tagIdentity('Home-Repair')).toBe('home-repair');
  });

  it('shares an identity across case variants', () => {
    expect(tagIdentity('Trip')).toBe(tagIdentity('TRIP'));
    expect(tagIdentity('Trip')).toBe(tagIdentity('trip'));
    expect(tagIdentity('Grüße')).toBe(tagIdentity('GRÜßE'));
  });

  it('shares an identity across canonically equivalent forms', () => {
    const composed = 'Caf\u00e9';
    const decomposed = 'Cafe\u0301';
    expect(composed).not.toBe(decomposed);
    expect(tagIdentity(composed)).toBe(tagIdentity(decomposed));
    expect(tagIdentity(composed.toUpperCase())).toBe(tagIdentity(decomposed));
  });

  it('does not apply full case folding: Straße and STRASSE stay distinct', () => {
    expect(tagIdentity('Straße')).not.toBe(tagIdentity('STRASSE'));
  });

  it('does not apply compatibility normalization', () => {
    expect(tagIdentity('ＴＡＸ')).not.toBe(tagIdentity('TAX')); // full-width
    expect(tagIdentity('ﬁle')).not.toBe(tagIdentity('file')); // ligature
    expect(tagIdentity('m²')).not.toBe(tagIdentity('m2')); // superscript
  });

  it('is idempotent on the examples', () => {
    for (const text of ['Café', 'Straße', 'ＴＡＸ', 'HOME_REPAIR', '家計']) {
      expect(tagIdentity(tagIdentity(text))).toBe(tagIdentity(text));
    }
  });
});

describe('validateTagText', () => {
  it('accepts ordinary tags, with or without a leading #', () => {
    for (const text of ['Household', 'Home_Repair', 'Cornwall-2026', 'Café', '家計', 'Y2026']) {
      expect(validateTagText(text)).toEqual({ ok: true, spelling: text });
      expect(validateTagText(`#${text}`)).toEqual({ ok: true, spelling: text });
    }
  });

  it('keeps the spelling exactly as entered, without normalizing', () => {
    const decomposed = 'Cafe\u0301';
    expect(validateTagText(decomposed)).toEqual({ ok: true, spelling: decomposed });
  });

  it('keeps dashes, connectors and inner punctuation', () => {
    for (const text of ['Home-', 'Home_', 'a.b', "tag's", 'a#b', 'a\\b']) {
      expect(validateTagText(text)).toEqual({ ok: true, spelling: text });
    }
  });

  it('rejects empty text', () => {
    expect(validateTagText('')).toEqual({ ok: false, reason: 'empty' });
    expect(validateTagText('#')).toEqual({ ok: false, reason: 'empty' });
  });

  it('rejects text made only of decimal digits', () => {
    for (const text of ['3', '1234', '٣', '３']) {
      expect(validateTagText(text)).toEqual({ ok: false, reason: 'digitsOnly' });
      expect(validateTagText(`#${text}`)).toEqual({ ok: false, reason: 'digitsOnly' });
    }
    expect(validateTagText('Ⅻ')).toEqual({ ok: true, spelling: 'Ⅻ' });
    expect(validateTagText('3a')).toEqual({ ok: true, spelling: '3a' });
  });

  it('rejects whitespace anywhere, including at the ends', () => {
    for (const text of ['two words', ' Tag', 'Tag ', 'a\tb', 'a\u00a0b', 'a\u3000b', 'a\nb', ' ']) {
      expect(validateTagText(text)).toEqual({ ok: false, reason: 'whitespace' });
    }
  });

  it('rejects trailing punctuation that the parser would trim off', () => {
    for (const text of [
      'Tag.',
      'Tag,',
      'Tag!',
      'Tag)',
      'Tag"',
      "Tag'",
      '家計。',
      'Household”',
      '3.',
    ]) {
      expect(validateTagText(text)).toEqual({ ok: false, reason: 'trailingPunctuation' });
    }
    expect(validateTagText('.')).toEqual({ ok: false, reason: 'trailingPunctuation' });
  });

  it('rejects a second leading marker', () => {
    expect(validateTagText('##Household')).toEqual({ ok: false, reason: 'marker' });
    expect(validateTagText('## x')).toEqual({ ok: false, reason: 'marker' });
  });
});
