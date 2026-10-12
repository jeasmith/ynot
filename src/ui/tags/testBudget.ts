// Test fixture: a BudgetSessionSnapshot built with the real parser, Tag Index and markers.
import { tagIdentity, type TagIdentity } from '../../domain/grammar/identity.ts';
import { parseMemo } from '../../domain/grammar/parseMemo.ts';
import type {
  Account,
  AccountId,
  SubTransaction,
  Transaction,
  TransactionId,
} from '../../domain/model.ts';
import { deriveMarkers } from '../../domain/tags/markers.ts';
import { buildTagIndex } from '../../domain/tags/tagIndex.ts';
import type { BudgetSessionSnapshot } from '../../session/store.ts';
import type { CurrencyFormat } from '../../ynab/client.ts';

export const GBP: CurrencyFormat = {
  iso_code: 'GBP',
  example_format: '123,456.78',
  decimal_digits: 2,
  decimal_separator: '.',
  symbol_first: true,
  group_separator: ',',
  currency_symbol: '£',
  display_symbol: true,
};

export const tid = (id: string) => id as TransactionId;
export const aid = (id: string) => id as AccountId;

export function sub(
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

export function tx(
  id: string,
  amount: number,
  memo: string | null,
  extra: Partial<Transaction> = {},
): Transaction {
  return {
    id: tid(id),
    date: '2026-01-01',
    amount,
    memo,
    cleared: 'cleared',
    approved: true,
    accountId: aid('acct-1'),
    payeeName: null,
    categoryId: null,
    transferTransactionId: null,
    subtransactions: [],
    ...extra,
  };
}

const accounts: Account[] = [
  { id: aid('acct-1'), name: 'Current', onBudget: true, closed: false },
  { id: aid('acct-2'), name: 'Savings', onBudget: true, closed: false },
];

export function makeBudget(
  transactions: Transaction[],
  overrides: Partial<BudgetSessionSnapshot> = {},
): BudgetSessionSnapshot {
  const txMap = new Map(transactions.map((t) => [t.id, t]));
  const index = buildTagIndex(txMap, parseMemo);
  return {
    plan: { id: 'plan-1', name: 'Test plan', firstMonth: '2026-01-01', currencyFormat: GBP },
    knowledge: { transactions: 1, accounts: 1, categories: 1 },
    domain: {
      transactions: txMap,
      accounts: new Map(accounts.map((a) => [a.id, a])),
      categories: new Map(),
      index,
    },
    markers: deriveMarkers(index),
    openTag: null,
    refreshHealth: 'ok',
    lastUpdatedAt: null,
    refreshing: false,
    ...overrides,
  };
}

export const identityOf = (tag: string): TagIdentity => tagIdentity(tag);
