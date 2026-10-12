// Property 19 examples: near-duplicate detection is exactly the dash/underscore rule.
import { describe, expect, it } from 'vite-plus/test';
import { tagIdentity } from '../grammar/identity.ts';
import { parseMemo } from '../grammar/parseMemo.ts';
import type { AccountId, SubTransaction, Transaction, TransactionId } from '../model.ts';
import { deriveMarkers, nearDuplicateKey } from './markers.ts';
import { buildTagIndex, type TagIndex } from './tagIndex.ts';

function tx(id: string, memo: string | null, subs: SubTransaction[] = []): Transaction {
  return {
    id: id as TransactionId,
    date: '2026-01-01',
    amount: -1_000,
    memo,
    cleared: 'cleared',
    approved: true,
    accountId: 'acct-1' as AccountId,
    payeeName: null,
    categoryId: null,
    transferTransactionId: null,
    subtransactions: subs,
  };
}

function sub(id: string, memo: string | null): SubTransaction {
  return { id, amount: -500, memo, categoryId: null, payeeName: null, transferTransactionId: null };
}

const indexOf = (...txs: Transaction[]): TagIndex =>
  buildTagIndex(new Map(txs.map((t) => [t.id, t])), parseMemo);

const id = tagIdentity;

describe('nearDuplicateKey', () => {
  it('removes only literal hyphens and underscores', () => {
    expect(nearDuplicateKey(id('Home-Repair'))).toBe('homerepair');
    expect(nearDuplicateKey(id('home_repair'))).toBe('homerepair');
    expect(nearDuplicateKey(id('a-_-b__'))).toBe('ab');
    // Other dashes, accents and punctuation are preserved.
    expect(nearDuplicateKey(id('a\u2013b'))).toBe('a\u2013b');
    expect(nearDuplicateKey(id('caf\u00E9'))).toBe('caf\u00E9');
    expect(nearDuplicateKey(id('a.b'))).toBe('a.b');
  });
});

describe('deriveMarkers: near-duplicates', () => {
  it('flags #Home-Repair / #Home_Repair / #HomeRepair as three pairs', () => {
    const markers = deriveMarkers(
      indexOf(tx('a', '#Home-Repair'), tx('b', '#Home_Repair'), tx('c', '#HomeRepair')),
    );
    const hyphen = id('Home-Repair');
    const underscore = id('Home_Repair');
    const plain = id('HomeRepair');
    expect(markers.get(hyphen)!.nearDuplicateOf).toEqual([plain, underscore].sort());
    expect(markers.get(underscore)!.nearDuplicateOf).toEqual([plain, hyphen].sort());
    expect(markers.get(plain)!.nearDuplicateOf).toEqual([hyphen, underscore].sort());
    // Three identities in one group make three pairs: each sees the other two.
    const pairs = [...markers.values()].reduce((n, m) => n + m.nearDuplicateOf.length, 0) / 2;
    expect(pairs).toBe(3);
  });

  it('does not flag #Tax / #Taxi or #Grocries / #Groceries', () => {
    const markers = deriveMarkers(
      indexOf(tx('a', '#Tax'), tx('b', '#Taxi'), tx('c', '#Grocries'), tx('d', '#Groceries')),
    );
    for (const m of markers.values()) expect(m.nearDuplicateOf).toEqual([]);
  });

  it('lists nearDuplicateOf sorted by code point', () => {
    const markers = deriveMarkers(indexOf(tx('a', '#a_b'), tx('b', '#ab'), tx('c', '#a-b')));
    expect(markers.get(id('ab'))!.nearDuplicateOf).toEqual([id('a-b'), id('a_b')]);
  });

  it('does not group identities whose key is empty', () => {
    const markers = deriveMarkers(indexOf(tx('a', '#-'), tx('b', '#_'), tx('c', '#--')));
    for (const m of markers.values()) expect(m.nearDuplicateOf).toEqual([]);
  });

  it('keeps accents and other punctuation distinct', () => {
    const markers = deriveMarkers(
      indexOf(tx('a', '#cafe'), tx('b', '#caf\u00E9'), tx('c', '#a.b'), tx('d', '#ab')),
    );
    for (const m of markers.values()) expect(m.nearDuplicateOf).toEqual([]);
  });

  it('treats case variants as one identity, not as a pair', () => {
    const markers = deriveMarkers(indexOf(tx('a', '#Home-Repair'), tx('b', '#HOME-REPAIR')));
    expect(markers.size).toBe(1);
    expect(markers.get(id('home-repair'))!.nearDuplicateOf).toEqual([]);
  });

  it('includes tags found only in split memos', () => {
    const markers = deriveMarkers(
      indexOf(tx('a', null, [sub('a1', '#Home-Repair')]), tx('b', '#HomeRepair')),
    );
    expect(markers.get(id('home-repair'))!.nearDuplicateOf).toEqual([id('homerepair')]);
    expect(markers.get(id('homerepair'))!.nearDuplicateOf).toEqual([id('home-repair')]);
  });
});

describe('deriveMarkers: single use', () => {
  it('flags a tag with exactly one member', () => {
    const markers = deriveMarkers(
      indexOf(
        tx('a', '#once #twice'),
        tx('b', '#twice'),
        tx('c', '#thrice'),
        tx('d', '#thrice'),
        tx('e', '#thrice'),
      ),
    );
    expect(markers.get(id('once'))!.singleUse).toBe(true);
    expect(markers.get(id('twice'))!.singleUse).toBe(false);
    expect(markers.get(id('thrice'))!.singleUse).toBe(false);
  });

  it('counts members, not occurrences', () => {
    const markers = deriveMarkers(indexOf(tx('a', '#x #x', [sub('a1', '#x'), sub('a2', '#X')])));
    expect(markers.get(id('x'))!.singleUse).toBe(true);
  });

  it('flags a split-only tag with one member', () => {
    const markers = deriveMarkers(indexOf(tx('a', null, [sub('a1', '#only')])));
    expect(markers.get(id('only'))!.singleUse).toBe(true);
  });
});

describe('deriveMarkers: advisory only', () => {
  it('has one entry per identity and changes no totals, membership or identities', () => {
    const index = indexOf(tx('a', '#Home-Repair'), tx('b', '#HomeRepair #x'));
    const before = JSON.stringify(
      [...index.byIdentity.entries()].map(([k, e]) => [k, e.total, e.members]),
    );
    const membershipBefore = [...index.membership.entries()].map(([k, v]) => [k, [...v]]);
    const markers = deriveMarkers(index);
    expect([...markers.keys()].sort()).toEqual([...index.byIdentity.keys()].sort());
    expect(
      JSON.stringify([...index.byIdentity.entries()].map(([k, e]) => [k, e.total, e.members])),
    ).toBe(before);
    expect([...index.membership.entries()].map(([k, v]) => [k, [...v]])).toEqual(membershipBefore);
  });

  it('is empty for an empty index', () => {
    expect(deriveMarkers(indexOf()).size).toBe(0);
  });
});
