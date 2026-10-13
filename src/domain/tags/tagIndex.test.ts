import { describe, expect, it } from 'vite-plus/test';
import { tagIdentity } from '../grammar/identity.ts';
import { parseMemo } from '../grammar/parseMemo.ts';
import type { AccountId, IsoDate, SubTransaction, Transaction, TransactionId } from '../model.ts';
import { buildTagIndex, compareCodePoints, type TagIndex } from './tagIndex.ts';

const tid = (id: string) => id as TransactionId;

function sub(
  id: string,
  amount: number,
  memo: string | null,
  extra: Partial<SubTransaction> = {},
): SubTransaction {
  return {
    id,
    amount,
    memo,
    categoryId: null,
    payeeName: null,
    transferTransactionId: null,
    ...extra,
  };
}

function tx(
  id: string,
  amount: number,
  memo: string | null,
  extra: Partial<Transaction> & { date?: IsoDate } = {},
): Transaction {
  return {
    id: tid(id),
    date: '2026-01-01',
    amount,
    memo,
    cleared: 'cleared',
    approved: true,
    accountId: 'acct-1' as AccountId,
    payeeName: null,
    categoryId: null,
    transferTransactionId: null,
    subtransactions: [],
    ...extra,
  };
}

const build = (...txs: Transaction[]): TagIndex =>
  buildTagIndex(new Map(txs.map((t) => [t.id, t])), parseMemo);

const entry = (index: TagIndex, tag: string) => {
  const e = index.byIdentity.get(tagIdentity(tag));
  if (e === undefined) throw new Error(`no entry for ${tag}`);
  return e;
};

describe('buildTagIndex: restaurant example (amounts in milliunits)', () => {
  // £120 bill: £30 own share and three per-person lines, then Alice repays £25.
  const bill = tx('bill', -120_000, null, {
    subtransactions: [
      sub('bill-own', -30_000, null),
      sub('bill-alice', -25_000, '#owed-alice'),
      sub('bill-bob', -35_000, '#owed-bob'),
      sub('bill-carol', -30_000, '#owed-carol'),
    ],
  });
  const repayment = tx('repay', 25_000, '#owed-alice', { date: '2026-01-05' });
  const index = build(bill, repayment);

  it('nets #owed-alice to zero once repaid, with its composition legible', () => {
    const alice = entry(index, 'owed-alice').total;
    expect(alice.netMilliunits).toBe(0);
    expect(alice.outflowMilliunits).toBe(-25_000);
    expect(alice.inflowMilliunits).toBe(25_000);
    expect(alice.memberCount).toBe(2);
  });

  it('leaves the others negative by exactly their share', () => {
    expect(entry(index, 'owed-bob').total).toMatchObject({
      netMilliunits: -35_000,
      outflowMilliunits: -35_000,
      inflowMilliunits: 0,
      memberCount: 1,
    });
    expect(entry(index, 'owed-carol').total).toMatchObject({
      netMilliunits: -30_000,
      outflowMilliunits: -30_000,
      inflowMilliunits: 0,
      memberCount: 1,
    });
  });

  it('contributes the tagged split line, never the whole bill, and marks it read-only', () => {
    const bob = entry(index, 'owed-bob');
    expect(bob.members).toEqual([
      {
        transactionId: tid('bill'),
        source: 'splits',
        contributingAmounts: [{ subtransactionId: 'bill-bob', amount: -35_000 }],
        contribution: -35_000,
      },
    ]);
    expect(bob.splitOnlyMembers).toEqual(new Set([tid('bill')]));
    expect(bob.parentMembers.size).toBe(0);
    expect(bob.splitOccurrenceCount).toBe(1);
  });

  it('treats the untagged own share as contributing to nothing', () => {
    expect(index.byIdentity.size).toBe(3);
    expect(index.membership.get(tid('bill'))).toEqual(
      new Set([tagIdentity('owed-alice'), tagIdentity('owed-bob'), tagIdentity('owed-carol')]),
    );
  });
});

describe('buildTagIndex: overrides and repeats', () => {
  it('lets a parent-memo tag override split tags: full parent amount, once', () => {
    const t = tx('a', -100_000, '#trip', {
      subtransactions: [sub('a1', -40_000, '#trip'), sub('a2', -60_000, '#TRIP')],
    });
    const e = entry(build(t), 'trip');
    expect(e.members).toHaveLength(1);
    expect(e.members[0]).toMatchObject({
      source: 'parent',
      contributingAmounts: [{ subtransactionId: null, amount: -100_000 }],
      contribution: -100_000,
    });
    expect(e.total.netMilliunits).toBe(-100_000);
    expect(e.parentMembers).toEqual(new Set([tid('a')]));
    expect(e.splitOnlyMembers.size).toBe(0);
    expect(e.splitOccurrenceCount).toBe(2);
  });

  it('counts a split line carrying a tag twice once', () => {
    const t = tx('a', -50_000, null, {
      subtransactions: [sub('a1', -20_000, '#x and #X and #x'), sub('a2', -30_000, null)],
    });
    const e = entry(build(t), 'x');
    expect(e.members[0]!.contributingAmounts).toEqual([
      { subtransactionId: 'a1', amount: -20_000 },
    ]);
    expect(e.total.netMilliunits).toBe(-20_000);
    expect(e.total.memberCount).toBe(1);
  });

  it('sums several tagged split lines of one transaction as one member', () => {
    const t = tx('a', -50_000, null, {
      subtransactions: [sub('a1', -20_000, '#x'), sub('a2', 5_000, '#x'), sub('a3', -35_000, null)],
    });
    const e = entry(build(t), 'x');
    expect(e.members).toHaveLength(1);
    expect(e.members[0]!.contribution).toBe(-15_000);
    expect(e.total).toMatchObject({
      netMilliunits: -15_000,
      outflowMilliunits: -20_000,
      inflowMilliunits: 5_000,
      memberCount: 1,
    });
  });

  it('repeating a tag in a parent memo does not change membership or totals', () => {
    const once = build(tx('a', -10_000, 'lunch #x'));
    const thrice = build(tx('a', -10_000, '#x lunch #X #x'));
    expect(entry(thrice, 'x').total).toEqual(entry(once, 'x').total);
    expect(entry(thrice, 'x').members).toEqual(entry(once, 'x').members);
    expect(thrice.membership).toEqual(once.membership);
  });
});

describe('buildTagIndex: transfers', () => {
  it('names a pair when both sides of a transfer are tagged, without netting them away', () => {
    const out = tx('out', -50_000, '#savings', { transferTransactionId: 'in' });
    const inn = tx('in', 50_000, '#savings', {
      transferTransactionId: 'out',
      accountId: 'acct-2' as AccountId,
    });
    const e = entry(build(out, inn), 'savings');
    expect(e.total.transferPairs).toEqual([{ a: tid('in'), b: tid('out') }]);
    expect(e.total.netMilliunits).toBe(0);
    expect(e.total.memberCount).toBe(2);
  });

  it('does not pair when only one side is a member', () => {
    const out = tx('out', -50_000, '#savings', { transferTransactionId: 'in' });
    const inn = tx('in', 50_000, 'no tag', { transferTransactionId: 'out' });
    expect(entry(build(out, inn), 'savings').total.transferPairs).toEqual([]);
  });

  it('pairs through a transfer reference on a split line, in either direction', () => {
    const split = tx('split', -100_000, '#t', {
      subtransactions: [
        sub('split-1', -60_000, null),
        sub('split-2', -40_000, null, { transferTransactionId: 'other' }),
      ],
    });
    // The other side points at the split line's ID, not the parent's.
    const other = tx('other', 40_000, '#t', { transferTransactionId: 'split-2' });
    const e = entry(build(split, other), 't');
    expect(e.total.transferPairs).toEqual([{ a: tid('other'), b: tid('split') }]);
    // Parent-memo tag on a split with a transfer line nets to the remainder, not zero.
    expect(e.total.netMilliunits).toBe(-60_000);
  });

  it('a tagged split line that is itself a transfer offsets its linked side exactly', () => {
    const split = tx('split', -100_000, null, {
      subtransactions: [
        sub('split-1', -60_000, null),
        sub('split-2', -40_000, '#t', { transferTransactionId: 'other' }),
      ],
    });
    const other = tx('other', 40_000, '#t', { transferTransactionId: 'split-2' });
    const e = entry(build(split, other), 't');
    expect(e.total.transferPairs).toEqual([{ a: tid('other'), b: tid('split') }]);
    expect(e.total.netMilliunits).toBe(0);
  });

  it('lists each pair once even when both sides reference each other', () => {
    const a = tx('a', -1_000, '#t', { transferTransactionId: 'b' });
    const b = tx('b', 1_000, '#t', { transferTransactionId: 'a' });
    expect(entry(build(a, b), 't').total.transferPairs).toHaveLength(1);
  });
});

describe('buildTagIndex: inclusion', () => {
  it('includes closed accounts and unapproved transactions', () => {
    const closed = tx('c', -1_000, '#x', { accountId: 'closed-acct' as AccountId });
    const unapproved = tx('u', -2_000, '#x', { approved: false, cleared: 'uncleared' });
    const e = entry(build(closed, unapproved), 'x');
    expect(e.total.memberCount).toBe(2);
    expect(e.total.netMilliunits).toBe(-3_000);
  });

  it('never sees deleted subtransactions: the model holds non-deleted lines only', () => {
    // mapTransaction drops deleted lines before the index sees them; here the surviving model is
    // a transaction whose only tagged line is gone, so the tag has no entry at all.
    const t = tx('a', -10_000, null, { subtransactions: [sub('a1', -10_000, null)] });
    expect(build(t).byIdentity.size).toBe(0);
    expect(build(t).membership.size).toBe(0);
  });

  it('is empty for an empty map and for untagged memos', () => {
    expect(build().byIdentity.size).toBe(0);
    expect(build(tx('a', -1, null), tx('b', -1, 'plain C:\\#temp')).byIdentity.size).toBe(0);
  });
});

describe('buildTagIndex: Canonical Spelling (Property 4)', () => {
  it('prefers the spelling on the most distinct transactions', () => {
    const e = entry(
      build(
        tx('a', -1, '#Home-Repair', { date: '2026-03-01' }),
        tx('b', -1, '#home-repair', { date: '2026-02-01' }),
        tx('c', -1, '#home-repair', { date: '2026-02-02' }),
      ),
      'home-repair',
    );
    expect(e.canonicalSpelling).toBe('home-repair');
    expect(e.spellings.get('home-repair')).toEqual({
      transactionCount: 2,
      earliestDate: '2026-02-01',
    });
    expect(e.spellings.get('Home-Repair')).toEqual({
      transactionCount: 1,
      earliestDate: '2026-03-01',
    });
  });

  it('counts a spelling at most once per transaction across parent and split memos', () => {
    // 'Tax' appears three times on one transaction; 'tax' on two transactions.
    const e = entry(
      build(
        tx('a', -3, '#Tax #Tax', {
          subtransactions: [sub('a1', -1, '#Tax'), sub('a2', -2, '#Tax')],
        }),
        tx('b', -1, '#tax', { date: '2026-02-01' }),
        tx('c', -1, '#tax', { date: '2026-02-02' }),
      ),
      'tax',
    );
    expect(e.spellings.get('Tax')!.transactionCount).toBe(1);
    expect(e.canonicalSpelling).toBe('tax');
  });

  it('breaks count ties by earliest date', () => {
    const e = entry(
      build(
        tx('a', -1, '#Trip', { date: '2026-05-01' }),
        tx('b', -1, '#trip', { date: '2026-04-01' }),
      ),
      'trip',
    );
    expect(e.canonicalSpelling).toBe('trip');
  });

  it('breaks remaining ties by lowest code-point order', () => {
    const e = entry(
      build(
        tx('a', -1, '#trip', { date: '2026-04-01' }),
        tx('b', -1, '#Trip', { date: '2026-04-01' }),
      ),
      'trip',
    );
    // 'T' (U+0054) sorts before 't' (U+0074).
    expect(e.canonicalSpelling).toBe('Trip');
  });

  it('compares by code point, not UTF-16 unit', () => {
    // U+FF21 < U+1D49C by code point, but the surrogate D835 sorts before FF21 by UTF-16 unit.
    expect(compareCodePoints('\uFF21', '\u{1D49C}')).toBeLessThan(0);
    expect(compareCodePoints('\u{1D49C}', '\uFF21')).toBeGreaterThan(0);
    expect(compareCodePoints('Ab', 'aB')).toBeLessThan(0);
    expect(compareCodePoints('a', 'a')).toBe(0);
    expect(compareCodePoints('a', 'ab')).toBeLessThan(0);
    const e = entry(
      build(tx('a', -1, '#Ab', { date: '2026-04-01' }), tx('b', -1, '#aB', { date: '2026-04-01' })),
      'ab',
    );
    expect(e.canonicalSpelling).toBe('Ab');
  });

  it('is independent of insertion order for a worked tie', () => {
    const txs = [
      tx('a', -1, '#Trip', { date: '2026-04-01' }),
      tx('b', -1, '#trip', { date: '2026-04-01' }),
      tx('c', -1, '#TRIP', { date: '2026-04-01' }),
    ];
    const forward = entry(build(...txs), 'trip').canonicalSpelling;
    const backward = entry(build(...[...txs].reverse()), 'trip').canonicalSpelling;
    expect(forward).toBe(backward);
    expect(forward).toBe('TRIP');
  });

  it('uses the NFC spelling as written', () => {
    const e = entry(build(tx('a', -1, '#Cafe\u0301')), 'café');
    expect(e.canonicalSpelling).toBe('Caf\u00E9');
  });
});

describe('buildTagIndex: parent and split-only membership', () => {
  it('counts split occurrences across both kinds of member', () => {
    const e = entry(
      build(
        tx('a', -10, '#x', { subtransactions: [sub('a1', -5, '#x'), sub('a2', -5, null)] }),
        tx('b', -20, null, { subtransactions: [sub('b1', -10, '#X'), sub('b2', -10, '#x')] }),
      ),
      'x',
    );
    expect(e.parentMembers).toEqual(new Set([tid('a')]));
    expect(e.splitOnlyMembers).toEqual(new Set([tid('b')]));
    expect(e.splitOccurrenceCount).toBe(3);
    expect(e.total.netMilliunits).toBe(-10 + -20);
  });
});
