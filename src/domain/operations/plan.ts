// Operation planning, the pre-write recheck and undo planning (design:
// `src/domain/operations/plan.ts` and "The undo slot"; Req 9.3-9.5, 12, 13, 16, 17.1-17.3, 19).
//
// Every plan is built from one per-transaction decision, `decide`, so `recheck` can re-plan a
// single re-read transaction exactly as the whole plan was planned.
import { tagIdentity, validateTagText, type TagIdentity } from '../grammar/identity.ts';
import { parseMemo } from '../grammar/parseMemo.ts';
import {
  applyTag,
  codePointLength,
  fits,
  removeIdentity,
  renameIdentity,
} from '../memo/rewrite.ts';
import type { AccountId, DomainState, Transaction, TransactionId } from '../model.ts';
import { compareCodePoints } from '../tags/tagIndex.ts';

export type OperationKind = 'apply' | 'remove' | 'rename' | 'merge' | 'delete' | 'undo';

export interface PlannedChange {
  readonly transactionId: TransactionId;
  readonly accountId: AccountId;
  readonly before: string | null; // raw memo at planning time
  readonly after: string | null;
}

export interface UndoSlot {
  readonly label: string;
  readonly changes: readonly {
    transactionId: TransactionId;
    before: string | null;
    confirmedAfter: string | null;
  }[];
}

/** The structured intent a plan was built from, so it can be re-planned. */
export type PlanRequest =
  | { kind: 'apply'; ids: readonly TransactionId[]; spelling: string }
  | { kind: 'remove'; ids: readonly TransactionId[]; identity: TagIdentity }
  | { kind: 'rename'; from: TagIdentity; toSpelling: string } // yields a rename or merge plan
  | { kind: 'delete'; identity: TagIdentity }
  | { kind: 'undo'; source: UndoSlot };

export type Exclusion =
  | { reason: 'alreadyTagged'; transactionId: TransactionId }
  | { reason: 'splitOnly'; transactionId: TransactionId; splitOccurrences: number }
  | { reason: 'overLength'; transactionId: TransactionId; wouldBe: number }
  | { reason: 'changedSince'; transactionId: TransactionId } // undo: memo no longer equals confirmedAfter
  | { reason: 'noChange'; transactionId: TransactionId };

export interface OperationPlan {
  readonly kind: OperationKind;
  readonly request: PlanRequest;
  readonly label: string; // display only
  readonly changes: readonly PlannedChange[];
  readonly exclusions: readonly Exclusion[];
  readonly unreachableSplitOccurrences: number;
  readonly remainsInVocabularyAfter: boolean; // the old identity survives (in splits or elsewhere)
}

// ---------------------------------------------------------------------------------------------
// Per-transaction decision
// ---------------------------------------------------------------------------------------------

type Decision =
  | { kind: 'change'; after: string | null }
  | { kind: 'exclude'; exclusion: Exclusion }
  /** Not in the operation's reach at all, such as a transaction that does not carry the tag. */
  | { kind: 'none' };

interface Occurrences {
  readonly inParent: boolean;
  readonly inSplits: number; // token occurrences across non-deleted split memos
}

function occurrences(t: Transaction, identity: TagIdentity): Occurrences {
  const count = (memo: string | null) =>
    parseMemo(memo).tokens.filter((token) => token.identity === identity).length;
  return {
    inParent: count(t.memo) > 0,
    inSplits: t.subtransactions.reduce((sum, s) => sum + count(s.memo), 0),
  };
}

/** A rewrite result, or an `overLength` exclusion: nothing is ever truncated (Req 12.7). */
function rewritten(t: Transaction, after: string | null): Decision {
  if (!fits(after)) {
    return {
      kind: 'exclude',
      exclusion: { reason: 'overLength', transactionId: t.id, wouldBe: codePointLength(after) },
    };
  }
  return { kind: 'change', after };
}

/** The resolved form of a request: validated text and derived identities. */
type Resolved =
  | { kind: 'apply'; spelling: string; identity: TagIdentity }
  | { kind: 'remove' | 'delete'; identity: TagIdentity }
  | { kind: 'rename'; from: TagIdentity; toSpelling: string }
  | { kind: 'undo'; byId: ReadonlyMap<TransactionId, UndoSlot['changes'][number]> };

function validSpelling(text: string): string {
  const result = validateTagText(text);
  if (!result.ok) throw new Error(`Invalid tag text: ${result.reason}`);
  return result.spelling;
}

function resolve(request: PlanRequest): Resolved {
  switch (request.kind) {
    case 'apply': {
      const spelling = validSpelling(request.spelling);
      return { kind: 'apply', spelling, identity: tagIdentity(spelling) };
    }
    case 'remove':
      return { kind: 'remove', identity: request.identity };
    case 'delete':
      return { kind: 'delete', identity: request.identity };
    case 'rename': {
      const toSpelling = validSpelling(request.toSpelling);
      if (tagIdentity(toSpelling) === request.from) {
        // Respelling one identity is the deferred spelling-consistency action (Req 13.4, 13.9).
        throw new Error('The new name has the same Tag Identity as the old one');
      }
      return { kind: 'rename', from: request.from, toSpelling };
    }
    case 'undo':
      return {
        kind: 'undo',
        byId: new Map(request.source.changes.map((c) => [c.transactionId, c])),
      };
  }
}

function decide(r: Resolved, t: Transaction): Decision {
  switch (r.kind) {
    case 'apply': {
      const o = occurrences(t, r.identity);
      // Already a member, through the parent or a split: a no-op, never a respelling (Req 12.3).
      if (o.inParent || o.inSplits > 0) {
        return { kind: 'exclude', exclusion: { reason: 'alreadyTagged', transactionId: t.id } };
      }
      return rewritten(t, applyTag(t.memo, r.spelling));
    }
    case 'remove':
    case 'delete':
    case 'rename': {
      const identity = r.kind === 'rename' ? r.from : r.identity;
      const o = occurrences(t, identity);
      if (!o.inParent) {
        if (o.inSplits > 0) {
          // Split memos are never written (Req 9.3, 17.5).
          return {
            kind: 'exclude',
            exclusion: { reason: 'splitOnly', transactionId: t.id, splitOccurrences: o.inSplits },
          };
        }
        return r.kind === 'remove'
          ? { kind: 'exclude', exclusion: { reason: 'noChange', transactionId: t.id } }
          : { kind: 'none' };
      }
      const after =
        r.kind === 'rename'
          ? renameIdentity(t.memo, r.from, r.toSpelling)
          : removeIdentity(t.memo, identity);
      return rewritten(t, after);
    }
    case 'undo': {
      const entry = r.byId.get(t.id);
      if (!entry) return { kind: 'none' };
      // Restore only an exact match of Ynot's confirmed result (Req 19.2-19.3).
      if (t.memo !== entry.confirmedAfter) {
        return { kind: 'exclude', exclusion: { reason: 'changedSince', transactionId: t.id } };
      }
      return { kind: 'change', after: entry.before };
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------------------------

const unique = (ids: readonly TransactionId[]) => [...new Set(ids)];
const byId = (a: { transactionId: TransactionId }, b: { transactionId: TransactionId }) =>
  compareCodePoints(a.transactionId, b.transactionId);

function canonical(state: DomainState, identity: TagIdentity): string {
  return state.index.byIdentity.get(identity)?.canonicalSpelling ?? identity;
}

function build(
  state: DomainState,
  request: PlanRequest,
  candidates: readonly TransactionId[],
  meta: { kind: OperationKind; label: string; identity: TagIdentity | null },
): OperationPlan {
  const r = resolve(request);
  const changes: PlannedChange[] = [];
  const exclusions: Exclusion[] = [];
  let unreachable = 0;
  for (const id of unique(candidates)) {
    const t = state.transactions.get(id);
    if (!t) {
      // Gone since it was chosen. Only undo reports it: its entry can no longer be restored.
      if (r.kind === 'undo') exclusions.push({ reason: 'changedSince', transactionId: id });
      continue;
    }
    if (meta.identity !== null && meta.kind !== 'apply') {
      unreachable += occurrences(t, meta.identity).inSplits;
    }
    const d = decide(r, t);
    if (d.kind === 'change') {
      changes.push({ transactionId: t.id, accountId: t.accountId, before: t.memo, after: d.after });
    } else if (d.kind === 'exclude') {
      exclusions.push(d.exclusion);
    }
  }
  changes.sort(byId);
  exclusions.sort(byId);

  let remains = false;
  if (meta.identity !== null && meta.kind !== 'apply') {
    const changed = new Set(changes.map((c) => c.transactionId));
    const members = state.index.byIdentity.get(meta.identity)?.members ?? [];
    remains = unreachable > 0 || members.some((m) => !changed.has(m.transactionId));
  }
  return {
    kind: meta.kind,
    request,
    label: meta.label,
    changes,
    exclusions,
    unreachableSplitOccurrences: unreachable,
    remainsInVocabularyAfter: remains,
  };
}

/** Every member of `identity`, writable or split-only. */
function membersOf(state: DomainState, identity: TagIdentity): TransactionId[] {
  return (state.index.byIdentity.get(identity)?.members ?? []).map((m) => m.transactionId);
}

/** Requires a valid spelling (`validateTagText`); throws on invalid input. */
export function planApply(
  state: DomainState,
  ids: readonly TransactionId[],
  spelling: string,
): OperationPlan {
  const valid = validSpelling(spelling);
  return build(state, { kind: 'apply', ids, spelling: valid }, ids, {
    kind: 'apply',
    label: `Apply #${valid}`,
    identity: tagIdentity(valid),
  });
}

export function planRemove(
  state: DomainState,
  ids: readonly TransactionId[],
  identity: TagIdentity,
): OperationPlan {
  return build(state, { kind: 'remove', ids, identity }, ids, {
    kind: 'remove',
    label: `Remove #${canonical(state, identity)}`,
    identity,
  });
}

/**
 * A rename, or a merge when the distinct target identity already exists in the Budget
 * (Req 13.2). Requires a valid spelling with a different identity; throws otherwise.
 */
export function planRename(
  state: DomainState,
  from: TagIdentity,
  toSpelling: string,
): OperationPlan {
  const valid = validSpelling(toSpelling);
  const request: PlanRequest = { kind: 'rename', from, toSpelling: valid };
  resolve(request); // throws on a same-identity target before anything is planned
  const merge = state.index.byIdentity.has(tagIdentity(valid));
  const source = canonical(state, from);
  return build(state, request, membersOf(state, from), {
    kind: merge ? 'merge' : 'rename',
    label: merge
      ? `Merge #${source} into #${canonical(state, tagIdentity(valid))}`
      : `Rename #${source} → #${valid}`,
    identity: from,
  });
}

export function planDelete(state: DomainState, identity: TagIdentity): OperationPlan {
  return build(state, { kind: 'delete', identity }, membersOf(state, identity), {
    kind: 'delete',
    label: `Delete #${canonical(state, identity)}`,
    identity,
  });
}

export function planUndo(state: DomainState, source: UndoSlot): OperationPlan {
  return build(
    state,
    { kind: 'undo', source },
    source.changes.map((c) => c.transactionId),
    { kind: 'undo', label: `Undo ${source.label}`, identity: null },
  );
}

export function replan(state: DomainState, request: PlanRequest): OperationPlan {
  switch (request.kind) {
    case 'apply':
      return planApply(state, request.ids, request.spelling);
    case 'remove':
      return planRemove(state, request.ids, request.identity);
    case 'rename':
      return planRename(state, request.from, request.toSpelling);
    case 'delete':
      return planDelete(state, request.identity);
    case 'undo':
      return planUndo(state, request.source);
  }
}

/** Whether two plans would write differently: kind, change IDs, befores, afters, exclusions. */
export function planDiffers(a: OperationPlan, b: OperationPlan): boolean {
  const shape = (p: OperationPlan) =>
    JSON.stringify({
      kind: p.kind,
      changes: p.changes.map((c) => [c.transactionId, c.before, c.after]),
      exclusions: p.exclusions.map((e) => [e.transactionId, e.reason]),
    });
  return shape(a) !== shape(b);
}

/**
 * The pre-write check for one confirmed change against its re-read transaction (Req 17.1-17.3).
 * Other edits, such as amount or account, pass unless they change the planned `after` (Req 17.4).
 */
export function recheck(
  change: PlannedChange,
  request: PlanRequest,
  current: Transaction | undefined,
): 'ok' | 'gone' | 'memoChanged' | 'replanDiffers' {
  if (!current) return 'gone';
  if (current.memo !== change.before) return 'memoChanged';
  const d = decide(resolve(request), current);
  if (d.kind !== 'change' || d.after !== change.after) return 'replanDiffers';
  return 'ok';
}
