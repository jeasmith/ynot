// The Register: scope, filters, rows and counts (design: `src/domain/register/register.ts`;
// Req 5.1-5.12). A pure view over the session's transactions; it never shortens history.
import type { TagIdentity } from '../grammar/identity.ts';
import { parseMemo } from '../grammar/parseMemo.ts';
import type {
  Account,
  AccountId,
  Category,
  CategoryGroupId,
  CategoryId,
  Transaction,
  TransactionId,
} from '../model.ts';
import { compareCodePoints, type TagIndex } from '../tags/tagIndex.ts';

export type RegisterScope = { kind: 'account'; accountId: AccountId } | { kind: 'all' };

export type ClearedStatus = Transaction['cleared'];

export interface RegisterFilters {
  readonly search: string;
  readonly categoryIds: ReadonlySet<CategoryId>;
  readonly categoryGroupIds: ReadonlySet<CategoryGroupId>;
  readonly statuses: ReadonlySet<ClearedStatus>;
  readonly tag: TagIdentity | null;
}

export const NO_FILTERS: RegisterFilters = {
  search: '',
  categoryIds: new Set(),
  categoryGroupIds: new Set(),
  statuses: new Set(),
  tag: null,
};

export interface RegisterRow {
  readonly transaction: Transaction;
  /** The transaction's account; the UI shows it in All accounts (Req 5.12). */
  readonly accountName: string | null;
}

export interface RegisterView {
  /** Date descending, then ID; the complete history of the scope (Req 5.2). */
  readonly rows: readonly RegisterRow[];
  readonly matchingCount: number;
  /** Every transaction in the scope, so an empty match never reads as an empty history (Req 5.10). */
  readonly totalCount: number;
  /** Within the scope, after the non-tag filters, so each count equals the rows its facet shows. */
  readonly tagFacetCounts: ReadonlyMap<TagIdentity, number>;
  /** Matching and total per account navigation entry, with the current filters (Req 5.9). */
  readonly scopeCounts: ReadonlyMap<'all' | AccountId, { matching: number; total: number }>;
}

export interface RegisterInput {
  readonly transactions: ReadonlyMap<TransactionId, Transaction>;
  readonly accounts: ReadonlyMap<AccountId, Account>;
  readonly categories: ReadonlyMap<CategoryId, Category>;
  readonly index: TagIndex;
  readonly scope: RegisterScope;
  readonly filters: RegisterFilters;
}

const inScope = (scope: RegisterScope, t: Transaction) =>
  scope.kind === 'all' || t.accountId === scope.accountId;

/** The categories a transaction is filed under: the parent's and every split line's. */
function categoryIdsOf(t: Transaction): CategoryId[] {
  const ids: CategoryId[] = [];
  if (t.categoryId !== null) ids.push(t.categoryId);
  for (const s of t.subtransactions) if (s.categoryId !== null) ids.push(s.categoryId);
  return ids;
}

/** NFC, lowercased text that search matches: payee, account, category, group and prose memo text. */
function searchText(
  t: Transaction,
  accounts: ReadonlyMap<AccountId, Account>,
  categories: ReadonlyMap<CategoryId, Category>,
): string {
  const parts: string[] = [];
  const add = (s: string | null | undefined) => {
    if (s) parts.push(s);
  };
  add(t.payeeName);
  add(accounts.get(t.accountId)?.name);
  for (const id of categoryIdsOf(t)) {
    const c = categories.get(id);
    add(c?.name);
    add(c?.groupName);
  }
  add(parseMemo(t.memo).prose);
  for (const s of t.subtransactions) {
    add(s.payeeName);
    add(parseMemo(s.memo).prose);
  }
  return parts.join('\n').normalize('NFC').toLowerCase();
}

export function buildRegister(input: RegisterInput): RegisterView {
  const { transactions, accounts, categories, index, scope, filters } = input;
  const query = filters.search.trim().normalize('NFC').toLowerCase();

  /** Every filter except the tag facet. */
  const passesNonTag = (t: Transaction): boolean => {
    if (filters.statuses.size > 0 && !filters.statuses.has(t.cleared)) return false;
    if (filters.categoryIds.size > 0 || filters.categoryGroupIds.size > 0) {
      const ids = categoryIdsOf(t);
      if (filters.categoryIds.size > 0 && !ids.some((id) => filters.categoryIds.has(id))) {
        return false;
      }
      if (
        filters.categoryGroupIds.size > 0 &&
        !ids.some((id) => {
          const group = categories.get(id)?.groupId;
          return group !== undefined && filters.categoryGroupIds.has(group);
        })
      ) {
        return false;
      }
    }
    if (query !== '' && !searchText(t, accounts, categories).includes(query)) return false;
    return true;
  };
  const tagsOf = (t: Transaction) => index.membership.get(t.id);

  const rows: RegisterRow[] = [];
  let totalCount = 0;
  const tagFacetCounts = new Map<TagIdentity, number>();
  const scopeCounts = new Map<'all' | AccountId, { matching: number; total: number }>();
  const bump = (key: 'all' | AccountId, matching: boolean) => {
    const c = scopeCounts.get(key) ?? { matching: 0, total: 0 };
    scopeCounts.set(key, { matching: c.matching + (matching ? 1 : 0), total: c.total + 1 });
  };
  scopeCounts.set('all', { matching: 0, total: 0 });
  for (const id of accounts.keys()) scopeCounts.set(id, { matching: 0, total: 0 });

  for (const t of transactions.values()) {
    const nonTag = passesNonTag(t);
    const tags = tagsOf(t);
    const matches = nonTag && (filters.tag === null || (tags?.has(filters.tag) ?? false));
    bump('all', matches);
    bump(t.accountId, matches);

    if (!inScope(scope, t)) continue;
    totalCount += 1;
    if (nonTag && tags) {
      for (const identity of tags)
        tagFacetCounts.set(identity, (tagFacetCounts.get(identity) ?? 0) + 1);
    }
    if (matches)
      rows.push({ transaction: t, accountName: accounts.get(t.accountId)?.name ?? null });
  }

  rows.sort(
    (a, b) =>
      compareCodePoints(b.transaction.date, a.transaction.date) ||
      compareCodePoints(a.transaction.id, b.transaction.id),
  );
  return { rows, matchingCount: rows.length, totalCount, tagFacetCounts, scopeCounts };
}
