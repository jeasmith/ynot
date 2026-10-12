// Builders for YNAB wire objects in tests. Each fills the fields the generated schema requires
// with neutral defaults, so a test states only the fields it cares about.
import type {
  Account,
  Category,
  CategoryGroupWithCategories,
  SubTransaction,
  TransactionDetail,
} from '../src/ynab/client.ts';

export function wireSub(
  over: Partial<SubTransaction> & Pick<SubTransaction, 'id'>,
): SubTransaction {
  return {
    transaction_id: 't1',
    amount: -1_000,
    memo: null,
    deleted: false,
    ...over,
  };
}

export function wireTransaction(
  over: Partial<TransactionDetail> & Pick<TransactionDetail, 'id'>,
): TransactionDetail {
  return {
    date: '2024-01-01',
    amount: -1_000,
    memo: null,
    cleared: 'cleared',
    approved: true,
    account_id: 'a1',
    account_name: over.account_id ?? 'a1',
    deleted: false,
    subtransactions: [],
    ...over,
  };
}

export function wireAccount(over: Partial<Account> & Pick<Account, 'id'>): Account {
  return {
    name: over.id,
    type: 'checking',
    on_budget: true,
    closed: false,
    balance: 0,
    cleared_balance: 0,
    uncleared_balance: 0,
    transfer_payee_id: null,
    deleted: false,
    ...over,
  };
}

export function wireCategory(
  over: Partial<Category> & Pick<Category, 'id' | 'category_group_id'>,
): Category {
  return {
    name: over.id,
    hidden: false,
    internal: false,
    budgeted: 0,
    activity: 0,
    balance: 0,
    goal_needs_whole_amount: null,
    deleted: false,
    ...over,
  };
}

export function wireCategoryGroup(
  over: Partial<CategoryGroupWithCategories> & Pick<CategoryGroupWithCategories, 'id'>,
): CategoryGroupWithCategories {
  return {
    name: over.id,
    hidden: false,
    internal: false,
    deleted: false,
    categories: [],
    ...over,
  };
}
