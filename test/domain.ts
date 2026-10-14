// Builders for domain objects in tests. Each fills neutral defaults, so a test states only the
// fields it cares about.
import { parseMemo } from '../src/domain/grammar/parseMemo.ts';
import type {
  Account,
  AccountId,
  Category,
  CategoryGroupId,
  CategoryId,
  DomainState,
  SubTransaction,
  Transaction,
  TransactionId,
} from '../src/domain/model.ts';
import { buildTagIndex } from '../src/domain/tags/tagIndex.ts';

export const tid = (id: string) => id as TransactionId;
export const aid = (id: string) => id as AccountId;
export const cid = (id: string) => id as CategoryId;
export const gid = (id: string) => id as CategoryGroupId;

export function sub(
  id: string,
  memo: string | null,
  extra: Partial<SubTransaction> = {},
): SubTransaction {
  return {
    id,
    amount: -1_000,
    memo,
    categoryId: null,
    payeeName: null,
    transferTransactionId: null,
    ...extra,
  };
}

export function tx(id: string, memo: string | null, extra: Partial<Transaction> = {}): Transaction {
  return {
    id: tid(id),
    date: '2026-01-01',
    amount: -1_000,
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

export function account(id: string, name = id): Account {
  return { id: aid(id), name, onBudget: true, closed: false };
}

export function category(id: string, name: string, groupId: string, groupName: string): Category {
  return { id: cid(id), name, groupId: gid(groupId), groupName };
}

export function domainState(
  transactions: readonly Transaction[],
  options: { accounts?: readonly Account[]; categories?: readonly Category[] } = {},
): DomainState {
  const byId = new Map(transactions.map((t) => [t.id, t]));
  return {
    transactions: byId,
    accounts: new Map((options.accounts ?? [account('acct-1')]).map((a) => [a.id, a])),
    categories: new Map((options.categories ?? []).map((c) => [c.id, c])),
    index: buildTagIndex(byId, parseMemo),
  };
}
