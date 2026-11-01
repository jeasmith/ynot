import { describe, expect, it } from 'vite-plus/test';
import { account, aid, category, cid, domainState, gid, sub, tx } from '../../../test/domain.ts';
import { tagIdentity } from '../grammar/identity.ts';
import { buildRegister, NO_FILTERS, type RegisterFilters, type RegisterScope } from './register.ts';

const accounts = [account('acct-1', 'Current'), account('acct-2', 'Credit card')];
const categories = [
  category('groceries', 'Groceries', 'everyday', 'Everyday'),
  category('fuel', 'Fuel', 'car', 'Car costs'),
];
const state = domainState(
  [
    tx('t1', 'Weekly shop #Household', {
      date: '2026-03-01',
      payeeName: 'Tesco',
      categoryId: cid('groceries'),
    }),
    tx('t2', null, {
      date: '2026-03-02',
      payeeName: 'Shell',
      accountId: aid('acct-2'),
      cleared: 'uncleared',
      subtransactions: [
        sub('s1', 'diesel #car', { categoryId: cid('fuel') }),
        sub('s2', 'snacks #household', { categoryId: cid('groceries') }),
      ],
    }),
    tx('t3', 'Refund', { date: '2024-05-05', payeeName: 'Amazon', cleared: 'reconciled' }),
    tx('t4', '#Car service', { date: '2026-03-02', accountId: aid('acct-2') }),
  ],
  { accounts, categories },
);

const view = (scope: RegisterScope, filters: Partial<RegisterFilters> = {}) =>
  buildRegister({ ...state, scope, filters: { ...NO_FILTERS, ...filters } });
const rowIds = (v: ReturnType<typeof view>) => v.rows.map((r) => r.transaction.id);
const ALL: RegisterScope = { kind: 'all' };
const CURRENT: RegisterScope = { kind: 'account', accountId: aid('acct-1') };

describe('buildRegister', () => {
  it('shows one account, or all accounts with each account name, newest first', () => {
    expect(rowIds(view(CURRENT))).toEqual(['t1', 't3']);
    const all = view(ALL);
    expect(rowIds(all)).toEqual(['t2', 't4', 't1', 't3']);
    expect(all.rows.map((r) => r.accountName)).toEqual([
      'Credit card',
      'Credit card',
      'Current',
      'Current',
    ]);
  });

  it('keeps the complete history with no date cutoff', () => {
    expect(rowIds(view(CURRENT))).toContain('t3');
  });

  it('searches payee, account, category, group and prose memos, including splits', () => {
    expect(rowIds(view(ALL, { search: 'tesco' }))).toEqual(['t1']);
    expect(rowIds(view(ALL, { search: 'CREDIT' }))).toEqual(['t2', 't4']);
    expect(rowIds(view(ALL, { search: 'car costs' }))).toEqual(['t2']);
    expect(rowIds(view(ALL, { search: 'diesel' }))).toEqual(['t2']);
    expect(rowIds(view(ALL, { search: '  weekly ' }))).toEqual(['t1']);
  });

  it('matches search text regardless of Unicode normalisation', () => {
    const cafe = domainState([tx('c', null, { payeeName: 'Caf\u00e9 Nero' })], { accounts });
    const v = buildRegister({
      ...cafe,
      scope: ALL,
      filters: { ...NO_FILTERS, search: 'cafe\u0301' },
    });
    expect(v.rows.map((r) => r.transaction.id)).toEqual(['c']);
  });

  it('filters by category and group through split lines, and by status', () => {
    expect(rowIds(view(ALL, { categoryIds: new Set([cid('fuel')]) }))).toEqual(['t2']);
    expect(rowIds(view(ALL, { categoryGroupIds: new Set([gid('everyday')]) }))).toEqual([
      't2',
      't1',
    ]);
    expect(rowIds(view(ALL, { statuses: new Set(['uncleared', 'reconciled'] as const) }))).toEqual([
      't2',
      't3',
    ]);
  });

  it('gives tag facet counts that equal the rows each facet shows', () => {
    for (const scope of [ALL, CURRENT]) {
      for (const filters of [
        {},
        { search: 'shell' },
        { statuses: new Set(['cleared'] as const) },
      ]) {
        const v = view(scope, filters);
        for (const [tag, count] of v.tagFacetCounts) {
          expect(view(scope, { ...filters, tag }).matchingCount, tag).toBe(count);
        }
      }
    }
    expect(view(ALL).tagFacetCounts).toEqual(
      new Map([
        [tagIdentity('household'), 2],
        [tagIdentity('car'), 2],
      ]),
    );
  });

  it('counts per scope with the current filters', () => {
    const v = view(CURRENT, { tag: tagIdentity('car') });
    expect(v.scopeCounts.get('all')).toEqual({ matching: 2, total: 4 });
    expect(v.scopeCounts.get(aid('acct-1'))).toEqual({ matching: 0, total: 2 });
    expect(v.scopeCounts.get(aid('acct-2'))).toEqual({ matching: 2, total: 2 });
  });

  it('reports an empty match without claiming the history is empty', () => {
    const v = view(CURRENT, { search: 'no such thing' });
    expect(v.rows).toEqual([]);
    expect(v.matchingCount).toBe(0);
    expect(v.totalCount).toBe(2);
  });
});
