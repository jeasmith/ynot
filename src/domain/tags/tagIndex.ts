// Tag Index: membership, Contributions, Canonical Spelling, Tag Totals and transfer pairs.
// Pure functions over plain data (design: `src/domain/tags/tagIndex.ts`; ADR 0005 and its
// 2026-10-11 amendment for split-line Contributions).
import type { TagIdentity } from '../grammar/identity.ts';
import type { ParsedMemo } from '../grammar/parseMemo.ts';
import type { IsoDate, Transaction, TransactionId } from '../model.ts';

export interface TagIndex {
  readonly byIdentity: ReadonlyMap<TagIdentity, TagEntry>;
  /** Transaction ID → identities it is a member of. */
  readonly membership: ReadonlyMap<TransactionId, ReadonlySet<TagIdentity>>;
}

export interface TagEntry {
  readonly identity: TagIdentity;
  readonly canonicalSpelling: string;
  /** Spelling → distinct Transactions carrying it (parent or split) and the earliest date among them. */
  readonly spellings: ReadonlyMap<string, { transactionCount: number; earliestDate: IsoDate }>;
  readonly members: readonly Member[];
  readonly parentMembers: ReadonlySet<TransactionId>; // writable
  readonly splitOnlyMembers: ReadonlySet<TransactionId>; // read-only
  readonly splitOccurrenceCount: number; // occurrences in split memos (unreachable by writes)
  readonly total: TagTotal;
}

export interface Member {
  readonly transactionId: TransactionId;
  readonly source: 'parent' | 'splits';
  /** Contributing amounts: [parent amount], or the amount of each tagged split line. */
  readonly contributingAmounts: readonly { subtransactionId: string | null; amount: number }[];
  readonly contribution: number; // sum of contributingAmounts
}

export interface TagTotal {
  readonly netMilliunits: number;
  readonly outflowMilliunits: number; // sum of negative contributing amounts, <= 0
  readonly inflowMilliunits: number; // sum of positive contributing amounts, >= 0
  readonly memberCount: number;
  readonly transferPairs: readonly TransferPair[];
}

export interface TransferPair {
  readonly a: TransactionId;
  readonly b: TransactionId;
}

/** Code-point order (not UTF-16 unit order), so astral characters sort by scalar value. */
export function compareCodePoints(x: string, y: string): number {
  const xs = Array.from(x);
  const ys = Array.from(y);
  const n = Math.min(xs.length, ys.length);
  for (let i = 0; i < n; i++) {
    const cx = xs[i]!.codePointAt(0)!;
    const cy = ys[i]!.codePointAt(0)!;
    if (cx !== cy) return cx < cy ? -1 : 1;
  }
  return xs.length - ys.length;
}

/** Everything gathered for one identity while walking the transactions. */
interface Draft {
  /** Spelling → transaction IDs carrying it, and the earliest date among them. */
  readonly spellings: Map<string, { ids: Set<TransactionId>; earliestDate: IsoDate }>;
  /** Per member transaction: does the parent memo carry it, and which split lines do. */
  readonly byTransaction: Map<TransactionId, { inParent: boolean; splitLines: Set<string> }>;
  splitOccurrences: number;
}

export function buildTagIndex(
  transactions: ReadonlyMap<TransactionId, Transaction>,
  parse: (memo: string | null) => ParsedMemo,
): TagIndex {
  const drafts = new Map<TagIdentity, Draft>();

  const draftFor = (identity: TagIdentity): Draft => {
    let draft = drafts.get(identity);
    if (draft === undefined) {
      draft = { spellings: new Map(), byTransaction: new Map(), splitOccurrences: 0 };
      drafts.set(identity, draft);
    }
    return draft;
  };

  const noteSpelling = (draft: Draft, spelling: string, tx: Transaction): void => {
    const seen = draft.spellings.get(spelling);
    if (seen === undefined) {
      draft.spellings.set(spelling, { ids: new Set([tx.id]), earliestDate: tx.date });
    } else {
      seen.ids.add(tx.id);
      if (tx.date < seen.earliestDate) seen.earliestDate = tx.date;
    }
  };

  const memberFor = (draft: Draft, id: TransactionId) => {
    let member = draft.byTransaction.get(id);
    if (member === undefined) {
      member = { inParent: false, splitLines: new Set() };
      draft.byTransaction.set(id, member);
    }
    return member;
  };

  for (const tx of transactions.values()) {
    for (const token of parse(tx.memo).tokens) {
      const draft = draftFor(token.identity);
      noteSpelling(draft, token.spelling, tx);
      memberFor(draft, tx.id).inParent = true;
    }
    for (const sub of tx.subtransactions) {
      for (const token of parse(sub.memo).tokens) {
        const draft = draftFor(token.identity);
        noteSpelling(draft, token.spelling, tx);
        memberFor(draft, tx.id).splitLines.add(sub.id);
        draft.splitOccurrences += 1;
      }
    }
  }

  // Parent and subtransaction IDs both resolve to their parent transaction.
  const parentOf = new Map<string, TransactionId>();
  for (const tx of transactions.values()) {
    parentOf.set(tx.id, tx.id);
    for (const sub of tx.subtransactions) parentOf.set(sub.id, tx.id);
  }
  /** Parent transactions reached by transfer references on a transaction or any of its splits. */
  const transferTargets = (tx: Transaction): Set<TransactionId> => {
    const targets = new Set<TransactionId>();
    const refs = [
      tx.transferTransactionId,
      ...tx.subtransactions.map((s) => s.transferTransactionId),
    ];
    for (const ref of refs) {
      if (ref === null) continue;
      const target = parentOf.get(ref);
      if (target !== undefined && target !== tx.id) targets.add(target);
    }
    return targets;
  };

  const byIdentity = new Map<TagIdentity, TagEntry>();
  const membership = new Map<TransactionId, Set<TagIdentity>>();

  for (const [identity, draft] of drafts) {
    const members: Member[] = [];
    const parentMembers = new Set<TransactionId>();
    const splitOnlyMembers = new Set<TransactionId>();

    for (const [id, found] of draft.byTransaction) {
      const tx = transactions.get(id)!;
      let set = membership.get(id);
      if (set === undefined) membership.set(id, (set = new Set()));
      set.add(identity);

      if (found.inParent) {
        parentMembers.add(id);
        const contributingAmounts = [{ subtransactionId: null, amount: tx.amount }];
        members.push({
          transactionId: id,
          source: 'parent',
          contributingAmounts,
          contribution: tx.amount,
        });
      } else {
        splitOnlyMembers.add(id);
        const contributingAmounts = tx.subtransactions
          .filter((sub) => found.splitLines.has(sub.id))
          .map((sub) => ({ subtransactionId: sub.id as string | null, amount: sub.amount }));
        members.push({
          transactionId: id,
          source: 'splits',
          contributingAmounts,
          contribution: contributingAmounts.reduce((sum, c) => sum + c.amount, 0),
        });
      }
    }

    let outflow = 0;
    let inflow = 0;
    for (const member of members) {
      for (const { amount } of member.contributingAmounts) {
        if (amount < 0) outflow += amount;
        else if (amount > 0) inflow += amount;
      }
    }

    const memberIds = new Set(members.map((m) => m.transactionId));
    const transferPairs: TransferPair[] = [];
    const seenPairs = new Set<string>();
    for (const id of memberIds) {
      for (const other of transferTargets(transactions.get(id)!)) {
        if (!memberIds.has(other)) continue;
        const [a, b] = compareCodePoints(id, other) < 0 ? [id, other] : [other, id];
        const key = JSON.stringify([a, b]);
        if (seenPairs.has(key)) continue;
        seenPairs.add(key);
        transferPairs.push({ a, b });
      }
    }
    transferPairs.sort((p, q) => compareCodePoints(p.a, q.a) || compareCodePoints(p.b, q.b));

    const spellings = new Map<string, { transactionCount: number; earliestDate: IsoDate }>();
    for (const [spelling, { ids, earliestDate }] of draft.spellings) {
      spellings.set(spelling, { transactionCount: ids.size, earliestDate });
    }
    const canonicalSpelling = [...spellings.entries()].sort(
      ([sa, a], [sb, b]) =>
        b.transactionCount - a.transactionCount ||
        compareCodePoints(a.earliestDate, b.earliestDate) ||
        compareCodePoints(sa, sb),
    )[0]![0];

    members.sort((a, b) => compareCodePoints(a.transactionId, b.transactionId));

    byIdentity.set(identity, {
      identity,
      canonicalSpelling,
      spellings,
      members,
      parentMembers,
      splitOnlyMembers,
      splitOccurrenceCount: draft.splitOccurrences,
      total: {
        netMilliunits: outflow + inflow,
        outflowMilliunits: outflow,
        inflowMilliunits: inflow,
        memberCount: members.length,
        transferPairs,
      },
    });
  }

  return { byIdentity, membership };
}
