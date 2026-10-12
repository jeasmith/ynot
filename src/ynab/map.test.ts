import { describe, expect, it } from 'vite-plus/test';
import type { Account, CategoryGroupWithCategories, TransactionDetail } from './client.ts';
import { mapAccounts, mapCategories, mapTransaction } from './map.ts';

function wire(over: Partial<TransactionDetail> = {}): TransactionDetail {
  return {
    id: 't1',
    date: '2024-02-03',
    amount: -12_340,
    memo: 'Weekly shop #Household',
    cleared: 'cleared',
    approved: true,
    flag_color: 'red',
    account_id: 'a1',
    account_name: 'Current',
    payee_id: 'pp',
    payee_name: 'Tesco',
    category_id: 'c1',
    category_name: 'Groceries',
    transfer_account_id: null,
    transfer_transaction_id: null,
    deleted: false,
    subtransactions: [],
    ...over,
  };
}

describe('mapTransaction', () => {
  it('maps wire fields to the domain model', () => {
    const t = mapTransaction(wire());
    expect(t).toEqual({
      id: 't1',
      date: '2024-02-03',
      amount: -12_340,
      memo: 'Weekly shop #Household',
      cleared: 'cleared',
      approved: true,
      accountId: 'a1',
      payeeName: 'Tesco',
      categoryId: 'c1',
      transferTransactionId: null,
      subtransactions: [],
    });
  });

  it('maps an empty memo to null so memo comparisons are exact', () => {
    expect(mapTransaction(wire({ memo: '' })).memo).toBeNull();
    expect(mapTransaction(wire({ memo: null })).memo).toBeNull();
    expect(mapTransaction(wire({ memo: undefined })).memo).toBeNull();
    expect(mapTransaction(wire({ memo: ' ' })).memo).toBe(' ');
  });

  it('keeps the memo byte-for-byte otherwise', () => {
    const memo = 'Café \\#x  · #tag\n';
    expect(mapTransaction(wire({ memo })).memo).toBe(memo);
  });

  it('maps missing optional fields to null', () => {
    const t = mapTransaction(
      wire({ payee_name: undefined, category_id: undefined, transfer_transaction_id: undefined }),
    );
    expect([t.payeeName, t.categoryId, t.transferTransactionId]).toEqual([null, null, null]);
  });

  it('carries the transfer transaction id', () => {
    expect(mapTransaction(wire({ transfer_transaction_id: 'other' })).transferTransactionId).toBe(
      'other',
    );
  });

  it('maps subtransactions and drops deleted ones', () => {
    const t = mapTransaction(
      wire({
        subtransactions: [
          {
            id: 's1',
            transaction_id: 't1',
            amount: -5_000,
            memo: '#owed-alice',
            payee_name: 'Alice',
            category_id: 'c2',
            transfer_transaction_id: 'x',
            deleted: false,
          },
          { id: 's2', amount: -7_340, memo: '', deleted: false },
          { id: 's3', amount: -100, memo: '#gone', deleted: true },
        ],
      }),
    );
    expect(t.subtransactions).toEqual([
      {
        id: 's1',
        amount: -5_000,
        memo: '#owed-alice',
        categoryId: 'c2',
        payeeName: 'Alice',
        transferTransactionId: 'x',
      },
      {
        id: 's2',
        amount: -7_340,
        memo: null,
        categoryId: null,
        payeeName: null,
        transferTransactionId: null,
      },
    ]);
  });
});

describe('mapAccounts', () => {
  const accounts: Account[] = [
    { id: 'a1', name: 'Current', on_budget: true, closed: false, deleted: false },
    { id: 'a2', name: 'Old', on_budget: false, closed: true, deleted: false },
    { id: 'a3', name: 'Removed', on_budget: true, closed: false, deleted: true },
  ];

  it('hides deleted accounts and keeps closed ones', () => {
    const map = mapAccounts(accounts);
    expect([...map.keys()]).toEqual(['a1', 'a2']);
    expect(map.get('a2' as never)).toEqual({
      id: 'a2',
      name: 'Old',
      onBudget: false,
      closed: true,
    });
  });
});

describe('mapCategories', () => {
  const groups: CategoryGroupWithCategories[] = [
    {
      id: 'g1',
      name: 'Bills',
      deleted: false,
      categories: [
        { id: 'c1', category_group_id: 'g1', name: 'Rent', deleted: false },
        { id: 'c2', category_group_id: 'g1', name: 'Old bill', deleted: true },
      ],
    },
    {
      id: 'g2',
      name: 'Gone',
      deleted: true,
      categories: [{ id: 'c3', category_group_id: 'g2', name: 'X', deleted: false }],
    },
  ];

  it('flattens groups, with the group name, and skips deleted groups and categories', () => {
    const map = mapCategories(groups);
    expect([...map.keys()]).toEqual(['c1']);
    expect(map.get('c1' as never)).toEqual({
      id: 'c1',
      name: 'Rent',
      groupId: 'g1',
      groupName: 'Bills',
    });
  });
});
