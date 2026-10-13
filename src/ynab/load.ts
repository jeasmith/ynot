import type {
  Account,
  AccountId,
  Category,
  CategoryId,
  IsoDate,
  Transaction,
  TransactionId,
} from '../domain/model.ts';
import type { CurrencyFormat, PlanSummary, RequestOptions, YnabClient } from './client.ts';
import { mapAccounts, mapCategories, mapTransaction } from './map.ts';

/** Used only if YNAB returns a plan with no `first_month`, so the whole history is still read. */
const FALLBACK_HISTORY_START: IsoDate = '1970-01-01';

export interface LoadedBudget {
  readonly plan: {
    readonly id: string;
    readonly name: string;
    readonly firstMonth: IsoDate;
    readonly currencyFormat: CurrencyFormat | null;
  };
  readonly accounts: Map<AccountId, Account>;
  readonly categories: Map<CategoryId, Category>;
  readonly transactions: Map<TransactionId, Transaction>;
  readonly knowledge: {
    readonly transactions: number;
    readonly accounts: number;
    readonly categories: number;
  };
}

/**
 * The initial load of a Budget Session (design: session lifecycle step 2). Accounts, categories
 * and the full transaction history (from the plan's first month) are requested in parallel; the
 * result is all or nothing, so no partial vocabulary or totals can be shown (Req 3.6).
 */
export async function loadBudget(
  client: YnabClient,
  plan: PlanSummary,
  opts?: RequestOptions,
): Promise<LoadedBudget> {
  const firstMonth = plan.first_month ?? FALLBACK_HISTORY_START;
  const [accounts, categories, transactions] = await Promise.all([
    client.getAccounts(plan.id, {}, opts),
    client.getCategories(plan.id, {}, opts),
    client.getTransactions(plan.id, { sinceDate: firstMonth }, opts),
  ]);

  const byId = new Map<TransactionId, Transaction>();
  for (const wire of transactions.items) {
    if (wire.deleted) continue;
    const t = mapTransaction(wire);
    byId.set(t.id, t);
  }

  return {
    plan: {
      id: plan.id,
      name: plan.name,
      firstMonth,
      currencyFormat: plan.currency_format ?? null,
    },
    accounts: mapAccounts(accounts.items),
    categories: mapCategories(categories.items),
    transactions: byId,
    knowledge: {
      transactions: transactions.serverKnowledge,
      accounts: accounts.serverKnowledge,
      categories: categories.serverKnowledge,
    },
  };
}
