import fc from 'fast-check';
import { describe, expect, it } from 'vite-plus/test';
import {
  memoArb,
  nullableMemoArb,
  taggedMemoArb,
  transactionArb,
  transactionSetArb,
  WHITE_SPACE_CODE_POINTS,
} from './arbitraries.ts';

describe('memo arbitraries', () => {
  it('cover whitespace, hashes, backslashes, combining marks and astral characters', () => {
    const seen = fc.sample(memoArb, 2000).join('');
    expect(seen).toContain('#');
    expect(seen).toContain('\\');
    expect(seen).toMatch(/\p{M}/u);
    expect(seen).toMatch(/\p{Nd}/u);
    expect(seen).toMatch(/[\u{10000}-\u{10FFFF}]/u);
    expect(WHITE_SPACE_CODE_POINTS.some((ws) => seen.includes(ws))).toBe(true);
  });

  it('never produce an empty raw memo', () => {
    fc.assert(fc.property(nullableMemoArb, (memo) => memo === null || memo !== ''));
  });

  it('tagged memos list the tags they contain', () => {
    fc.assert(
      fc.property(taggedMemoArb, ({ memo, tags }) => {
        expect(memo.split('#').length - 1).toBe(tags.length);
      }),
    );
  });
});

describe('transaction arbitraries', () => {
  it('produce unique IDs and split lines that sum to the parent amount', () => {
    fc.assert(
      fc.property(transactionSetArb(), (txs) => {
        const ids = new Set<string>();
        for (const tx of txs) {
          expect(ids.has(tx.id)).toBe(false);
          ids.add(tx.id);
          for (const sub of tx.subtransactions) {
            expect(ids.has(sub.id)).toBe(false);
            ids.add(sub.id);
          }
          if (tx.subtransactions.length > 0) {
            expect(tx.subtransactions.length).toBeGreaterThanOrEqual(2);
            expect(tx.subtransactions.reduce((sum, s) => sum + s.amount, 0)).toBe(tx.amount);
            expect(tx.transferTransactionId).toBeNull();
          }
          expect(tx.memo).not.toBe('');
          for (const sub of tx.subtransactions) expect(sub.memo).not.toBe('');
        }
      }),
    );
  });

  it('link transfers in both directions, between different transactions', () => {
    fc.assert(
      fc.property(transactionSetArb({ maxTransactions: 10 }), (txs) => {
        const parentOf = new Map<string, string>();
        const link = new Map<string, string>();
        for (const tx of txs) {
          parentOf.set(tx.id, tx.id);
          if (tx.transferTransactionId) link.set(tx.id, tx.transferTransactionId);
          for (const sub of tx.subtransactions) {
            parentOf.set(sub.id, tx.id);
            if (sub.transferTransactionId) link.set(sub.id, sub.transferTransactionId);
          }
        }
        for (const [from, to] of link) {
          expect(link.get(to)).toBe(from);
          expect(parentOf.get(to)).toBeDefined();
          expect(parentOf.get(to)).not.toBe(parentOf.get(from));
        }
      }),
    );
  });

  it('generate splits, tagged split lines and transfers often enough to matter', () => {
    const txs = fc.sample(transactionSetArb({ maxTransactions: 10 }), 300).flat();
    expect(txs.some((tx) => tx.subtransactions.length > 0)).toBe(true);
    expect(txs.some((tx) => tx.subtransactions.some((s) => s.memo?.includes('#')))).toBe(true);
    expect(txs.some((tx) => tx.transferTransactionId !== null)).toBe(true);
    expect(txs.some((tx) => tx.subtransactions.some((s) => s.transferTransactionId !== null))).toBe(
      true,
    );
  });

  it('produce a single transaction on request', () => {
    fc.assert(fc.property(transactionArb, (tx) => typeof tx.id === 'string'));
  });
});
