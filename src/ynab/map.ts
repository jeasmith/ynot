import type {
  Account,
  AccountId,
  Category,
  CategoryGroupId,
  CategoryId,
  SubTransaction,
  Transaction,
  TransactionId,
} from '../domain/model.ts';
import type {
  Account as WireAccount,
  CategoryGroupWithCategories,
  SubTransaction as WireSubTransaction,
  TransactionDetail,
} from './client.ts';

/** An empty memo is `null`, so every memo comparison downstream is exact (`===`). */
const memoOf = (memo: string | null | undefined): string | null =>
  memo === undefined || memo === null || memo === '' ? null : memo;

const mapSubTransaction = (s: WireSubTransaction): SubTransaction => ({
  id: s.id,
  amount: s.amount,
  memo: memoOf(s.memo),
  categoryId: (s.category_id ?? null) as CategoryId | null,
  payeeName: s.payee_name ?? null,
  transferTransactionId: s.transfer_transaction_id ?? null,
});

/** Maps a wire transaction to the domain model. Deleted subtransactions are dropped. */
export function mapTransaction(t: TransactionDetail): Transaction {
  return {
    id: t.id as TransactionId,
    date: t.date,
    amount: t.amount,
    memo: memoOf(t.memo),
    cleared: t.cleared,
    approved: t.approved,
    accountId: t.account_id as AccountId,
    payeeName: t.payee_name ?? null,
    categoryId: (t.category_id ?? null) as CategoryId | null,
    transferTransactionId: t.transfer_transaction_id ?? null,
    subtransactions: t.subtransactions.filter((s) => !s.deleted).map(mapSubTransaction),
  };
}

/** Deleted accounts are hidden; closed accounts are kept. */
export function mapAccounts(accounts: readonly WireAccount[]): Map<AccountId, Account> {
  const result = new Map<AccountId, Account>();
  for (const a of accounts) {
    if (a.deleted) continue;
    const id = a.id as AccountId;
    result.set(id, { id, name: a.name, onBudget: a.on_budget, closed: a.closed });
  }
  return result;
}

/** Flattens category groups. Deleted groups and deleted categories are skipped. */
export function mapCategories(
  groups: readonly CategoryGroupWithCategories[],
): Map<CategoryId, Category> {
  const result = new Map<CategoryId, Category>();
  for (const group of groups) {
    if (group.deleted) continue;
    for (const c of group.categories) {
      if (c.deleted) continue;
      const id = c.id as CategoryId;
      result.set(id, {
        id,
        name: c.name,
        groupId: group.id as CategoryGroupId,
        groupName: group.name,
      });
    }
  }
  return result;
}
