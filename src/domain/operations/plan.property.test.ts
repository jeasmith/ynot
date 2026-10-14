// Property 11 (design): applying an existing tag is a no-op. Also checks Properties 10 and 12 for
// generated budgets: nothing over-length is planned, and split-only members are never written.
import fc from 'fast-check';
import { describe, expect, it } from 'vite-plus/test';
import { poolTagArb, transactionMapArb } from '../../../test/arbitraries.ts';
import { tagIdentity } from '../grammar/identity.ts';
import { parseMemo } from '../grammar/parseMemo.ts';
import { fits } from '../memo/rewrite.ts';
import type { DomainState, Transaction, TransactionId } from '../model.ts';
import { buildTagIndex } from '../tags/tagIndex.ts';
import { planApply, planDelete, planRemove, planRename } from './plan.ts';

const stateOf = (transactions: Map<TransactionId, Transaction>): DomainState => ({
  transactions,
  accounts: new Map(),
  categories: new Map(),
  index: buildTagIndex(transactions, parseMemo),
});

const spellingsIn = (t: Transaction) =>
  [t.memo, ...t.subtransactions.map((s) => s.memo)].flatMap((m) =>
    parseMemo(m).tokens.map((token) => token.spelling),
  );

describe('Property 11: applying an existing tag is a no-op', () => {
  it('excludes every transaction that already carries the identity, in any spelling', () => {
    fc.assert(
      fc.property(
        transactionMapArb({ minTransactions: 1 }),
        fc.nat(),
        fc.boolean(),
        (txs, pick, upper) => {
          const state = stateOf(txs);
          const tagged = [...txs.values()].filter((t) => spellingsIn(t).length > 0);
          fc.pre(tagged.length > 0);
          const target = tagged[pick % tagged.length]!;
          const spellings = spellingsIn(target);
          const spelling = spellings[pick % spellings.length]!;
          const variant =
            upper && tagIdentity(spelling.toUpperCase()) === tagIdentity(spelling)
              ? spelling.toUpperCase()
              : spelling;

          const plan = planApply(state, [...txs.keys()], variant);
          const identity = tagIdentity(variant);
          for (const t of txs.values()) {
            if (!state.index.membership.get(t.id)?.has(identity)) continue;
            expect(plan.changes.some((c) => c.transactionId === t.id)).toBe(false);
            expect(plan.exclusions).toContainEqual({
              reason: 'alreadyTagged',
              transactionId: t.id,
            });
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe('Properties 10 and 12 on generated budgets', () => {
  it('plans only memos that fit, and never a split-only member', () => {
    fc.assert(
      fc.property(transactionMapArb(), poolTagArb, poolTagArb, (txs, tag, other) => {
        const state = stateOf(txs);
        const identity = tagIdentity(tag);
        const entry = state.index.byIdentity.get(identity);
        const plans = [
          planApply(state, [...txs.keys()], tag),
          planRemove(state, [...txs.keys()], identity),
          planDelete(state, identity),
          ...(tagIdentity(other) === identity ? [] : [planRename(state, identity, other)]),
        ];
        for (const plan of plans) {
          for (const c of plan.changes) {
            expect(fits(c.after)).toBe(true);
            if (plan.kind !== 'apply')
              expect(entry?.splitOnlyMembers.has(c.transactionId)).toBe(false);
          }
          if (plan.kind === 'delete' || plan.kind === 'rename' || plan.kind === 'merge') {
            expect(plan.unreachableSplitOccurrences).toBe(entry?.splitOccurrenceCount ?? 0);
          }
        }
      }),
      { numRuns: 300 },
    );
  });
});
