import type { TagIndex } from './tags/tagIndex.ts';

export type TransactionId = string & { readonly __brand: 'TransactionId' };
export type AccountId = string & { readonly __brand: 'AccountId' };
export type CategoryId = string & { readonly __brand: 'CategoryId' };
export type CategoryGroupId = string & { readonly __brand: 'CategoryGroupId' };
export type IsoDate = string; // YYYY-MM-DD

export interface Transaction {
  readonly id: TransactionId;
  readonly date: IsoDate;
  readonly amount: number; // milliunits, signed
  readonly memo: string | null; // raw, never ''
  readonly cleared: 'uncleared' | 'cleared' | 'reconciled';
  readonly approved: boolean;
  readonly accountId: AccountId;
  readonly payeeName: string | null;
  readonly categoryId: CategoryId | null;
  readonly transferTransactionId: string | null;
  readonly subtransactions: readonly SubTransaction[]; // non-deleted only
}

export interface SubTransaction {
  readonly id: string;
  readonly amount: number; // milliunits, signed
  readonly memo: string | null; // raw, never ''
  readonly categoryId: CategoryId | null;
  readonly payeeName: string | null;
  readonly transferTransactionId: string | null;
}

export interface Account {
  readonly id: AccountId;
  readonly name: string;
  readonly onBudget: boolean;
  readonly closed: boolean;
}

export interface Category {
  readonly id: CategoryId;
  readonly name: string;
  readonly groupId: CategoryGroupId;
  readonly groupName: string;
}

export interface DomainState {
  readonly transactions: ReadonlyMap<TransactionId, Transaction>;
  readonly accounts: ReadonlyMap<AccountId, Account>;
  readonly categories: ReadonlyMap<CategoryId, Category>;
  readonly index: TagIndex;
}
