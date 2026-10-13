import fc from 'fast-check';
import { describe, expect, it } from 'vite-plus/test';
import { createFakeYnab } from '../../test/fakeYnab.ts';
import { parseMemo } from '../domain/grammar/parseMemo.ts';
import type { Transaction, TransactionId } from '../domain/model.ts';
import { buildTagIndex } from '../domain/tags/tagIndex.ts';
import { createYnabClient, type TransactionDetail } from './client.ts';
import { mergeTransactions } from './delta.ts';
import { loadBudget } from './load.ts';
import { mapTransaction } from './map.ts';
import { wireSub, wireTransaction } from '../../test/wire.ts';

function wire(id: string, over: Partial<TransactionDetail> = {}): TransactionDetail {
  return wireTransaction({ id, ...over });
}

const idOf = (s: string) => s as TransactionId;

function mapOf(...items: TransactionDetail[]): Map<TransactionId, Transaction> {
  return new Map(items.map((t) => [idOf(t.id), mapTransaction(t)]));
}

describe('mergeTransactions', () => {
  it('upserts new and changed transactions', () => {
    const current = mapOf(wire('t1', { memo: 'old' }), wire('t2'));
    const next = mergeTransactions(current, [wire('t1', { memo: 'new' }), wire('t3')]);
    expect([...next.keys()].sort((a, b) => a.localeCompare(b))).toEqual(['t1', 't2', 't3']);
    expect(next.get(idOf('t1'))?.memo).toBe('new');
  });

  it('removes transactions marked deleted, and ignores unknown deleted ones', () => {
    const current = mapOf(wire('t1'), wire('t2'));
    const next = mergeTransactions(current, [
      wire('t1', { deleted: true }),
      wire('nope', { deleted: true }),
    ]);
    expect([...next.keys()]).toEqual(['t2']);
  });

  it('returns a new map and leaves the old one untouched', () => {
    const current = mapOf(wire('t1', { memo: 'old' }));
    const before = new Map(current);
    const next = mergeTransactions(current, [wire('t1', { memo: 'new' }), wire('t2')]);
    expect(next).not.toBe(current);
    expect(current).toEqual(before);
    expect(current.get(idOf('t1'))?.memo).toBe('old');
  });

  it('keeps the unchanged transactions by reference', () => {
    const current = mapOf(wire('t1'), wire('t2'));
    const next = mergeTransactions(current, [wire('t1', { memo: 'x' })]);
    expect(next.get(idOf('t2'))).toBe(current.get(idOf('t2')));
  });

  it('replaces a returned parent’s subtransactions with its non-deleted ones', () => {
    const sub = (id: string, deleted = false, memo: string | null = null) =>
      wireSub({ id, amount: -100, memo, deleted });
    const current = mapOf(wire('t1', { subtransactions: [sub('s1'), sub('s2')] }));
    const next = mergeTransactions(current, [
      wire('t1', { subtransactions: [sub('s1', false, '#a'), sub('s2', true), sub('s3')] }),
    ]);
    expect(next.get(idOf('t1'))?.subtransactions.map((s) => [s.id, s.memo])).toEqual([
      ['s1', '#a'],
      ['s3', null],
    ]);
  });

  it('maps an emptied memo to null', () => {
    const current = mapOf(wire('t1', { memo: 'a' }));
    const next = mergeTransactions(current, [wire('t1', { memo: '' })]);
    expect(next.get(idOf('t1'))?.memo).toBeNull();
  });

  it('is a no-op for an empty delta', () => {
    const current = mapOf(wire('t1'));
    expect(mergeTransactions(current, [])).toEqual(current);
  });
});

// ---------------------------------------------------------------------------------------------
// Property 18: a delta merge equals a fresh read
// ---------------------------------------------------------------------------------------------

const PLAN_ID = 'plan-1';
const FIRST_MONTH = '2020-01-01';

const memoArb = fc.constantFrom<string | null>(
  null,
  '',
  '#a',
  '#A',
  'Weekly shop #Household',
  '#owed-alice #owed-bob',
  'café #café',
  'no tags',
  '\\#escaped',
);

const subLineArb = fc.record({
  amount: fc.integer({ min: -50_000, max: 50_000 }),
  memo: memoArb,
  // a line may point at another transaction as a transfer
  transferTo: fc.option(fc.constantFrom('t0', 't1', 't2'), { nil: undefined }),
});
const splitArb = fc.array(subLineArb, { maxLength: 4 });
const dateArb = fc.constantFrom('2020-01-01', '2021-06-15', '2023-12-31', '2024-02-29');

type Op =
  | { kind: 'edit'; target: number; memo: string | null }
  | { kind: 'delete'; target: number }
  | { kind: 'add'; memo: string | null; amount: number; date: string; split: Line[] }
  | { kind: 'resplit'; target: number; split: Line[] }
  | { kind: 'redate'; target: number; date: string }
  | { kind: 'write'; target: number; memo: string | null }
  | { kind: 'refresh' };
type Line = { amount: number; memo: string | null; transferTo?: string | undefined };

const opArb: fc.Arbitrary<Op> = fc.oneof(
  {
    weight: 4,
    arbitrary: fc.record({ kind: fc.constant('edit' as const), target: fc.nat(30), memo: memoArb }),
  },
  { weight: 3, arbitrary: fc.record({ kind: fc.constant('delete' as const), target: fc.nat(30) }) },
  {
    weight: 3,
    arbitrary: fc.record({
      kind: fc.constant('add' as const),
      memo: memoArb,
      amount: fc.integer({ min: -99_999, max: 99_999 }),
      date: dateArb,
      split: splitArb,
    }),
  },
  {
    weight: 4,
    arbitrary: fc.record({
      kind: fc.constant('resplit' as const),
      target: fc.nat(30),
      split: splitArb,
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant('redate' as const),
      target: fc.nat(30),
      date: dateArb,
    }),
  },
  {
    weight: 2,
    arbitrary: fc.record({
      kind: fc.constant('write' as const),
      target: fc.nat(30),
      memo: memoArb,
    }),
  },
  { weight: 4, arbitrary: fc.constant({ kind: 'refresh' as const }) },
);

const seedArb = fc.array(
  fc.record({
    memo: memoArb,
    amount: fc.integer({ min: -99_999, max: 99_999 }),
    date: dateArb,
    split: splitArb,
    deleted: fc.boolean(),
  }),
  { maxLength: 8 },
);

const scriptArb = fc.record({ seed: seedArb, ops: fc.array(opArb, { maxLength: 25 }) });

const toSubs = (parent: string, lines: readonly Line[]) =>
  lines.map((l, i) => ({
    id: `${parent}-s${i}-${l.amount}`,
    amount: l.amount,
    memo: l.memo,
    transferTransactionId: l.transferTo ?? null,
  }));

/** The Tag Index is a pure function of the transactions. */
const buildIndex = (txs: ReadonlyMap<TransactionId, Transaction>) => buildTagIndex(txs, parseMemo);

describe('Property 18: a delta merge equals a fresh read', () => {
  it('holds for any starting snapshot and sequence of fake-YNAB mutations', async () => {
    await fc.assert(
      fc.asyncProperty(scriptArb, async ({ seed, ops }) => {
        const fake = createFakeYnab({
          plans: [
            {
              id: PLAN_ID,
              firstMonth: FIRST_MONTH,
              accounts: [{ id: 'acc-1' }],
              transactions: seed.map((s, i) => ({
                id: `t${i}`,
                memo: s.memo,
                amount: s.amount,
                date: s.date,
                deleted: s.deleted,
                subtransactions: toSubs(`t${i}`, s.split),
              })),
            },
          ],
        });
        const client = createYnabClient('pat', { fetchImpl: fake.fetchImpl });
        const plan = (await client.listPlans())[0]!;

        const loaded = await loadBudget(client, plan);
        let merged: ReadonlyMap<TransactionId, Transaction> = loaded.transactions;
        let knowledge = loaded.knowledge.transactions;
        let nextId = seed.length;
        const known = () => [...Array(nextId).keys()].map((i) => `t${i}`);
        const live = (n: number) => {
          const ids = known().filter((id) => !fake.getTransaction(PLAN_ID, id)?.deleted);
          return ids.length === 0 ? undefined : ids[n % ids.length];
        };

        const refresh = async () => {
          const delta = await client.getTransactions(PLAN_ID, {
            sinceDate: FIRST_MONTH,
            lastKnowledge: knowledge,
          });
          merged = mergeTransactions(merged, delta.items);
          knowledge = delta.serverKnowledge;
        };

        const check = async () => {
          const fresh = await loadBudget(client, plan);
          expect(merged).toEqual(fresh.transactions);
          // Deleted records never contribute anything.
          for (const id of known()) {
            if (fake.getTransaction(PLAN_ID, id)?.deleted) {
              expect(merged.has(id as TransactionId)).toBe(false);
            }
          }
          const deletedSubs = new Set<string>();
          for (const id of known()) {
            for (const s of fake.getTransaction(PLAN_ID, id)?.subtransactions ?? []) {
              if (s.deleted) deletedSubs.add(`${id}/${s.id}`);
            }
          }
          for (const [id, t] of merged) {
            for (const s of t.subtransactions) expect(deletedSubs.has(`${id}/${s.id}`)).toBe(false);
          }
          // The Tag Index is a pure function of the transactions, so equal maps give equal indexes.
          expect(buildIndex(merged)).toEqual(buildIndex(fresh.transactions));
        };

        for (const op of ops) {
          switch (op.kind) {
            case 'edit': {
              const id = live(op.target);
              if (id) fake.updateTransaction(PLAN_ID, id, { memo: op.memo });
              break;
            }
            case 'delete': {
              const id = live(op.target);
              if (id) fake.deleteTransaction(PLAN_ID, id);
              break;
            }
            case 'add': {
              const id = `t${nextId++}`;
              fake.addTransaction(PLAN_ID, {
                id,
                memo: op.memo,
                amount: op.amount,
                date: op.date,
                subtransactions: toSubs(id, op.split),
              });
              break;
            }
            case 'resplit': {
              const id = live(op.target);
              if (id)
                fake.updateTransaction(PLAN_ID, id, { subtransactions: toSubs(id, op.split) });
              break;
            }
            case 'redate': {
              const id = live(op.target);
              if (id) fake.updateTransaction(PLAN_ID, id, { date: op.date });
              break;
            }
            case 'write': {
              // A write made through the client, as the write engine does. An emptied memo is
              // written as null; the fake echoes whatever it is given.
              const id = live(op.target);
              if (id) {
                const approved = fake.getTransaction(PLAN_ID, id)?.approved ?? true;
                await client.patchTransactions(PLAN_ID, [{ id, memo: op.memo, approved }]);
              }
              break;
            }
            case 'refresh':
              await refresh();
              await check();
              break;
          }
        }
        await refresh();
        await check();
      }),
      { numRuns: 150 },
    );
  });

  it('a removed split line and a deleted transaction are gone after one delta', async () => {
    const fake = createFakeYnab({
      plans: [
        {
          id: PLAN_ID,
          firstMonth: FIRST_MONTH,
          transactions: [
            {
              id: 't0',
              memo: null,
              subtransactions: [
                { id: 's1', amount: -1, memo: '#a' },
                { id: 's2', amount: -2, memo: '#b' },
              ],
            },
            { id: 't1', memo: '#a' },
          ],
        },
      ],
    });
    const client = createYnabClient('pat', { fetchImpl: fake.fetchImpl });
    const plan = (await client.listPlans())[0]!;
    const loaded = await loadBudget(client, plan);
    fake.updateTransaction(PLAN_ID, 't0', {
      subtransactions: [{ id: 's1', amount: -1, memo: '#a' }],
    });
    fake.deleteTransaction(PLAN_ID, 't1');
    const delta = await client.getTransactions(PLAN_ID, {
      sinceDate: FIRST_MONTH,
      lastKnowledge: loaded.knowledge.transactions,
    });
    const merged = mergeTransactions(loaded.transactions, delta.items);
    expect(merged).toEqual((await loadBudget(client, plan)).transactions);
    expect([...merged.keys()]).toEqual(['t0']);
    expect(merged.get('t0' as TransactionId)?.subtransactions.map((s) => s.id)).toEqual(['s1']);
  });
});
