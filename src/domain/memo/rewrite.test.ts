import { describe, expect, it } from 'vite-plus/test';
import { tagIdentity } from '../grammar/identity.ts';
import {
  applyTag,
  fits,
  MEMO_LIMIT_CODE_POINTS,
  removeIdentity,
  renameIdentity,
} from './rewrite.ts';

const id = tagIdentity;

describe('applyTag', () => {
  it('makes an empty memo the tag alone', () => {
    expect(applyTag(null, 'Tax')).toBe('#Tax');
    expect(applyTag('', 'Tax')).toBe('#Tax');
  });

  it('appends with one space and reorders nothing', () => {
    expect(applyTag('Weekly shop #Household', 'Tax')).toBe('Weekly shop #Household #Tax');
    expect(applyTag('ends with space ', 'Tax')).toBe('ends with space  #Tax');
  });
});

describe('removeIdentity', () => {
  it('keeps the punctuation around a removed tag (the · regression)', () => {
    expect(removeIdentity('shop #Tag · Club', id('tag'))).toBe('shop · Club');
    expect(removeIdentity('paid (#Tax) today', id('tax'))).toBe('paid () today');
    // Whitespace on one side only: the gap rule drops nothing extra.
    expect(removeIdentity('end #Tax.', id('tax'))).toBe('end .');
  });

  it('closes the gap at the start, end and middle', () => {
    expect(removeIdentity('#Tax weekly shop', id('tax'))).toBe('weekly shop');
    expect(removeIdentity('weekly shop #Tax', id('tax'))).toBe('weekly shop');
    expect(removeIdentity('weekly #Tax shop', id('tax'))).toBe('weekly shop');
  });

  it('prefers to keep a line break', () => {
    expect(removeIdentity('first line\n#Tax second', id('tax'))).toBe('first line\nsecond');
    expect(removeIdentity('first #Tax\nsecond', id('tax'))).toBe('first\nsecond');
  });

  it('removes every occurrence and every case variant, leaving other tags and escapes', () => {
    expect(removeIdentity('#tax a \\#tax #TAX b #Other', id('tax'))).toBe('a \\#tax b #Other');
  });

  it('returns null, never an empty string, when nothing is left', () => {
    expect(removeIdentity('#Tax', id('tax'))).toBeNull();
    expect(removeIdentity('#Tax #tax', id('tax'))).toBeNull();
    expect(removeIdentity(null, id('tax'))).toBeNull();
  });

  it('leaves a memo without the tag untouched', () => {
    expect(removeIdentity('no tags here', id('tax'))).toBe('no tags here');
  });
});

describe('renameIdentity', () => {
  it('replaces the text and keeps extra markers and trailing punctuation', () => {
    expect(renameIdentity('a ##HomeRepair, b', id('homerepair'), 'Home-Repair')).toBe(
      'a ##Home-Repair, b',
    );
    expect(renameIdentity('#tax and #TAX', id('tax'), 'Taxes')).toBe('#Taxes and #Taxes');
  });

  it('removes the source instead when the memo already has the target (merge)', () => {
    expect(renameIdentity('#HomeRepair fix #Home-Repair', id('homerepair'), 'Home-Repair')).toBe(
      'fix #Home-Repair',
    );
  });

  it('leaves a memo without the source untouched', () => {
    expect(renameIdentity('#Other', id('tax'), 'Taxes')).toBe('#Other');
    expect(renameIdentity(null, id('tax'), 'Taxes')).toBeNull();
  });
});

describe('fits', () => {
  it('counts code points against the 500 limit', () => {
    expect(fits(null)).toBe(true);
    expect(fits('a'.repeat(MEMO_LIMIT_CODE_POINTS))).toBe(true);
    expect(fits('a'.repeat(MEMO_LIMIT_CODE_POINTS + 1))).toBe(false);
    // 500 astral characters are 1000 UTF-16 units but still fit.
    expect(fits('😀'.repeat(MEMO_LIMIT_CODE_POINTS))).toBe(true);
  });

  it('leaves over-length handling to planning: rewrites never truncate', () => {
    const long = 'a'.repeat(MEMO_LIMIT_CODE_POINTS);
    const after = applyTag(long, 'Tax');
    expect(after.startsWith(long)).toBe(true);
    expect(fits(after)).toBe(false);
  });
});
