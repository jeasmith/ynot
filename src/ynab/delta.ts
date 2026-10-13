import type { Transaction, TransactionId } from '../domain/model.ts';
import type { TransactionDetail } from './client.ts';
import { mapTransaction } from './map.ts';

/**
 * Merges a transactions delta into the current map: upsert by ID, remove `deleted` transactions.
 * A returned parent replaces the old one wholesale, so its subtransactions become exactly its
 * non-deleted ones. Returns a new map; `current` is never mutated.
 */
export function mergeTransactions(
  current: ReadonlyMap<TransactionId, Transaction>,
  delta: readonly TransactionDetail[],
): Map<TransactionId, Transaction> {
  const next = new Map(current);
  for (const wire of delta) {
    if (wire.deleted) next.delete(wire.id as TransactionId);
    else next.set(wire.id as TransactionId, mapTransaction(wire));
  }
  return next;
}
