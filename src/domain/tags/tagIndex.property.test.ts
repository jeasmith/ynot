// Properties 4-7 (design: Correctness Properties) for buildTagIndex.
import fc from 'fast-check';
import { describe, expect, it } from 'vite-plus/test';
import { transactionMapArb, transactionSetArb } from '../../../test/arbitraries.ts';
import type { TagIdentity } from '../grammar/identity.ts';
import { parseMemo } from '../grammar/parseMemo.ts';
import type { Transaction, TransactionId } from '../model.ts';
import { buildTagIndex, compareCodePoints, type TagIndex } from './tagIndex.ts';

const toMap = (txs: readonly Transaction[]) => new Map(txs.map((t) => [t.id, t]));
const index = (txs: readonly Transaction[]): TagIndex => buildTagIndex(toMap(txs), parseMemo);

const identitiesOf = (memo: string | null): Set<TagIdentity> =>
  new Set(parseMemo(memo).tokens.map((t) => t.identity));

/** A readable projection of everything a Tag Total is made of. */
function summarize(i: TagIndex) {
  return [...i.byIdentity.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([identity, e]) => ({
      identity,
      total: e.total,
      members: e.members.map((m) => [m.transactionId, m.source, m.contribution]),
    }));
}

describe('Property 4: Canonical Spelling ignores input order', () => {
  it('is identical for any permutation of insertion order', () => {
    fc.assert(
      fc.property(
        transactionSetArb({ maxTransactions: 10 }).chain((txs) =>
          fc.record({
            txs: fc.constant(txs),
            shuffled: fc.shuffledSubarray(txs, { minLength: txs.length, maxLength: txs.length }),
          }),
        ),
        ({ txs, shuffled }) => {
          const a = index(txs);
          const b = index(shuffled);
          const spell = (i: TagIndex) =>
            [...i.byIdentity.entries()]
              .map(([id, e]) => [id, e.canonicalSpelling] as const)
              .sort(([x], [y]) => (x < y ? -1 : 1));
          expect(spell(b)).toEqual(spell(a));
          expect(summarize(b)).toEqual(summarize(a));
        },
      ),
    );
  });

  it('chooses by distinct-transaction count, then earliest date, then code points', () => {
    fc.assert(
      fc.property(transactionMapArb({ maxTransactions: 10 }), (map) => {
        for (const entry of buildTagIndex(map, parseMemo).byIdentity.values()) {
          const chosen = entry.spellings.get(entry.canonicalSpelling)!;
          expect(chosen).toBeDefined();
          for (const [spelling, other] of entry.spellings) {
            if (spelling === entry.canonicalSpelling) continue;
            const better =
              other.transactionCount > chosen.transactionCount ||
              (other.transactionCount === chosen.transactionCount &&
                (other.earliestDate < chosen.earliestDate ||
                  (other.earliestDate === chosen.earliestDate &&
                    compareCodePoints(spelling, entry.canonicalSpelling) < 0)));
            expect(better).toBe(false);
          }
        }
      }),
    );
  });
});

describe('Property 5: membership is a set', () => {
  it('duplicating an existing tag occurrence changes no membership, total or count', () => {
    fc.assert(
      fc.property(
        transactionSetArb({ minTransactions: 1, maxTransactions: 6 }).chain((txs) =>
          fc.record({
            txs: fc.constant(txs),
            at: fc.integer({ min: 0, max: txs.length - 1 }),
            line: fc.integer({ min: -1, max: 3 }), // -1: the parent memo; otherwise a split line
            which: fc.nat(),
          }),
        ),
        ({ txs, at, line, which }) => {
          const target = txs[at]!;
          const sub = line >= 0 ? target.subtransactions[line] : undefined;
          const memo = line < 0 ? target.memo : (sub?.memo ?? null);
          const tokens = parseMemo(memo).tokens;
          fc.pre(tokens.length > 0 && (line < 0 || sub !== undefined));
          const token = tokens[which % tokens.length]!;
          const duplicated = `${memo} #${token.raw}`;
          const changed = txs.map((t, i): Transaction => {
            if (i !== at) return t;
            if (line < 0) return { ...t, memo: duplicated };
            return {
              ...t,
              subtransactions: t.subtransactions.map((s, k) =>
                k === line ? { ...s, memo: duplicated } : s,
              ),
            };
          });
          const before = index(txs);
          const after = index(changed);
          expect(after.membership).toEqual(before.membership);
          expect(summarize(after)).toEqual(summarize(before));
        },
      ),
    );
  });
});

/** An independent oracle for Contributions, written straight from Req 10.3. */
function expectedContribution(tx: Transaction, identity: TagIdentity): number | null {
  if (identitiesOf(tx.memo).has(identity)) return tx.amount;
  const lines = tx.subtransactions.filter((s) => identitiesOf(s.memo).has(identity));
  return lines.length === 0 ? null : lines.reduce((sum, s) => sum + s.amount, 0);
}

describe('Property 6: Contributions and total composition', () => {
  it('composes net = outflow + inflow, with signs and member counts', () => {
    fc.assert(
      fc.property(transactionMapArb({ maxTransactions: 10 }), (map) => {
        for (const entry of buildTagIndex(map, parseMemo).byIdentity.values()) {
          const { total } = entry;
          expect(total.netMilliunits).toBe(total.outflowMilliunits + total.inflowMilliunits);
          expect(total.outflowMilliunits).toBeLessThanOrEqual(0);
          expect(total.inflowMilliunits).toBeGreaterThanOrEqual(0);
          expect(total.memberCount).toBe(entry.members.length);
          expect(total.memberCount).toBe(entry.parentMembers.size + entry.splitOnlyMembers.size);
          const contributions = entry.members.flatMap((m) =>
            m.contributingAmounts.map((c) => c.amount),
          );
          expect(total.outflowMilliunits).toBe(
            contributions.filter((a) => a < 0).reduce((s, a) => s + a, 0),
          );
          expect(total.inflowMilliunits).toBe(
            contributions.filter((a) => a > 0).reduce((s, a) => s + a, 0),
          );
        }
      }),
    );
  });

  it('gives each member the parent amount, or the sum of its tagged split lines', () => {
    fc.assert(
      fc.property(transactionMapArb({ maxTransactions: 10 }), (map) => {
        const built = buildTagIndex(map, parseMemo);
        const seen = new Map<TagIdentity, Set<TransactionId>>();
        for (const entry of built.byIdentity.values()) {
          seen.set(entry.identity, new Set(entry.members.map((m) => m.transactionId)));
          for (const member of entry.members) {
            const tx = map.get(member.transactionId)!;
            expect(member.contribution).toBe(expectedContribution(tx, entry.identity));
            expect(member.contribution).toBe(
              member.contributingAmounts.reduce((s, c) => s + c.amount, 0),
            );
            expect(member.source).toBe(
              identitiesOf(tx.memo).has(entry.identity) ? 'parent' : 'splits',
            );
            // Each tagged split line contributes once.
            const ids = member.contributingAmounts.map((c) => c.subtransactionId);
            expect(new Set(ids).size).toBe(ids.length);
          }
        }
        // Exactly the transactions carrying the identity anywhere are members (no more, no fewer).
        for (const tx of map.values()) {
          const carried = new Set([
            ...identitiesOf(tx.memo),
            ...tx.subtransactions.flatMap((s) => [...identitiesOf(s.memo)]),
          ]);
          expect(built.membership.get(tx.id) ?? new Set()).toEqual(carried);
          for (const identity of carried) expect(seen.get(identity)!.has(tx.id)).toBe(true);
        }
      }),
    );
  });

  it('is unchanged by any scope or filter field: account, category, status, payee, approval', () => {
    fc.assert(
      fc.property(
        transactionSetArb({ maxTransactions: 10 }),
        fc.constantFrom<Transaction['cleared'][]>('cleared', 'uncleared', 'reconciled'),
        fc.boolean(),
        (txs, cleared, approved) => {
          const moved = txs.map((t): Transaction => ({
            ...t,
            accountId: 'some-other-account' as Transaction['accountId'],
            categoryId: null,
            payeeName: 'Someone Else',
            cleared,
            approved,
          }));
          expect(summarize(index(moved))).toEqual(summarize(index(txs)));
        },
      ),
    );
  });
});

describe('Property 7: transfer pairs are named, never assumed to cancel', () => {
  it('lists exactly the member pairs linked through a parent or subtransaction transfer ID', () => {
    fc.assert(
      fc.property(transactionSetArb({ maxTransactions: 10 }), (txs) => {
        const map = toMap(txs);
        const parentOf = new Map<string, TransactionId>();
        for (const t of txs) {
          parentOf.set(t.id, t.id);
          for (const s of t.subtransactions) parentOf.set(s.id, t.id);
        }
        const linksTo = (from: Transaction, to: Transaction): boolean =>
          [
            from.transferTransactionId,
            ...from.subtransactions.map((s) => s.transferTransactionId),
          ].some((ref) => ref !== null && parentOf.get(ref) === to.id);

        for (const entry of buildTagIndex(map, parseMemo).byIdentity.values()) {
          const ids = entry.members.map((m) => m.transactionId);
          const expected = new Set<string>();
          for (const a of ids) {
            for (const b of ids) {
              if (a === b) continue;
              if (linksTo(map.get(a)!, map.get(b)!) || linksTo(map.get(b)!, map.get(a)!)) {
                expected.add(JSON.stringify([a, b].sort()));
              }
            }
          }
          const listed = entry.total.transferPairs.map((p) => JSON.stringify([p.a, p.b].sort()));
          expect(new Set(listed)).toEqual(expected);
          expect(listed).toHaveLength(expected.size); // each pair once

          // Named, never netted away: the net is the plain sum of contributions.
          expect(entry.total.netMilliunits).toBe(
            entry.members.reduce((sum, m) => sum + m.contribution, 0),
          );
        }
      }),
    );
  });

  it('finds pairs often enough to matter (generator sanity)', () => {
    let withPairs = 0;
    fc.assert(
      fc.property(transactionSetArb({ maxTransactions: 10 }), (txs) => {
        // Tag every transaction so any transfer link is between two members.
        const tagged = txs.map((t): Transaction => ({ ...t, memo: '#all' }));
        if (
          (index(tagged).byIdentity.get('all' as TagIdentity)?.total.transferPairs.length ?? 0) > 0
        ) {
          withPairs += 1;
        }
      }),
      { numRuns: 300 },
    );
    expect(withPairs).toBeGreaterThan(0);
  });
});
