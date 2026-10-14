import { describe, expect, it } from 'vite-plus/test';
import { aid, domainState, sub, tid, tx } from '../../../test/domain.ts';
import { tagIdentity } from '../grammar/identity.ts';
import { MEMO_LIMIT_CODE_POINTS } from '../memo/rewrite.ts';
import {
  planApply,
  planDelete,
  planDiffers,
  planRemove,
  planRename,
  planUndo,
  recheck,
  replan,
  type UndoSlot,
} from './plan.ts';

const id = tagIdentity;
const ids = (...xs: string[]) => xs.map(tid);
const long = 'a'.repeat(MEMO_LIMIT_CODE_POINTS - 2);

describe('planApply', () => {
  it('appends the tag and excludes already tagged, split-tagged and over-length transactions', () => {
    const state = domainState([
      tx('plain', 'Weekly shop'),
      tx('empty', null),
      tx('tagged', 'shop #tax'),
      tx('split', null, { subtransactions: [sub('s1', 'half #TAX'), sub('s2', null)] }),
      tx('long', long),
    ]);
    const plan = planApply(state, ids('plain', 'empty', 'tagged', 'split', 'long'), '#Tax');

    expect(plan.kind).toBe('apply');
    expect(plan.label).toBe('Apply #Tax');
    expect(plan.changes).toEqual([
      { transactionId: 'empty', accountId: 'acct-1', before: null, after: '#Tax' },
      {
        transactionId: 'plain',
        accountId: 'acct-1',
        before: 'Weekly shop',
        after: 'Weekly shop #Tax',
      },
    ]);
    expect(plan.exclusions).toEqual([
      { reason: 'overLength', transactionId: 'long', wouldBe: MEMO_LIMIT_CODE_POINTS + 3 },
      { reason: 'alreadyTagged', transactionId: 'split' },
      { reason: 'alreadyTagged', transactionId: 'tagged' },
    ]);
    expect(plan.unreachableSplitOccurrences).toBe(0);
  });

  it('throws on invalid text, so no plan exists for it', () => {
    const state = domainState([tx('a', null)]);
    expect(() => planApply(state, ids('a'), 'two words')).toThrow(/whitespace/);
    expect(() => planApply(state, ids('a'), '#')).toThrow(/empty/);
    expect(() => planApply(state, ids('a'), '2026')).toThrow(/digitsOnly/);
  });
});

describe('planRemove', () => {
  it('removes parent occurrences and reports split ones it cannot reach', () => {
    const state = domainState([
      tx('parent', 'shop #Tax'),
      tx('both', '#tax fuel', { subtransactions: [sub('s1', '#Tax'), sub('s2', null)] }),
      tx('splitOnly', null, { subtransactions: [sub('s3', '#tax #TAX'), sub('s4', null)] }),
      tx('none', 'nothing'),
    ]);
    const plan = planRemove(state, ids('parent', 'both', 'splitOnly', 'none'), id('tax'));

    expect(plan.changes.map((c) => [c.transactionId, c.after])).toEqual([
      ['both', 'fuel'],
      ['parent', 'shop'],
    ]);
    expect(plan.exclusions).toEqual([
      { reason: 'noChange', transactionId: 'none' },
      { reason: 'splitOnly', transactionId: 'splitOnly', splitOccurrences: 2 },
    ]);
    expect(plan.unreachableSplitOccurrences).toBe(3);
    expect(plan.remainsInVocabularyAfter).toBe(true);
  });

  it('knows when the tag leaves the vocabulary', () => {
    const state = domainState([tx('a', '#Tax'), tx('b', 'x #tax')]);
    expect(planRemove(state, ids('a', 'b'), id('tax')).remainsInVocabularyAfter).toBe(false);
    expect(planRemove(state, ids('a'), id('tax')).remainsInVocabularyAfter).toBe(true);
  });
});

describe('planRename', () => {
  it('renames every parent member across accounts and leaves split-only members alone', () => {
    const state = domainState([
      tx('a', '#HomeRepair', { accountId: aid('acct-1') }),
      tx('b', 'tap ##homerepair.', { accountId: aid('acct-2') }),
      tx('c', null, { subtransactions: [sub('s1', '#HomeRepair'), sub('s2', null)] }),
    ]);
    const plan = planRename(state, id('homerepair'), 'Home-Repair');

    expect(plan.kind).toBe('rename');
    expect(plan.label).toBe('Rename #HomeRepair → #Home-Repair');
    expect(plan.changes.map((c) => [c.transactionId, c.accountId, c.after])).toEqual([
      ['a', 'acct-1', '#Home-Repair'],
      ['b', 'acct-2', 'tap ##Home-Repair.'],
    ]);
    expect(plan.exclusions).toEqual([
      { reason: 'splitOnly', transactionId: 'c', splitOccurrences: 1 },
    ]);
    expect(plan.unreachableSplitOccurrences).toBe(1);
    expect(plan.remainsInVocabularyAfter).toBe(true);
  });

  it('is a set-based merge when the target identity exists', () => {
    const state = domainState([
      tx('a', '#HomeRepair'),
      tx('b', '#HomeRepair #home-repair'),
      tx('c', '#Home-Repair'),
    ]);
    const plan = planRename(state, id('homerepair'), 'home-REPAIR');

    expect(plan.kind).toBe('merge');
    expect(plan.label).toBe('Merge #HomeRepair into #Home-Repair');
    expect(plan.changes.map((c) => [c.transactionId, c.after])).toEqual([
      ['a', '#home-REPAIR'],
      ['b', '#home-repair'],
    ]);
    expect(plan.remainsInVocabularyAfter).toBe(false);
  });

  it('throws for invalid text and for a target with the same identity', () => {
    const state = domainState([tx('a', '#tax')]);
    expect(() => planRename(state, id('tax'), 'Tax')).toThrow(/same Tag Identity/);
    expect(() => planRename(state, id('tax'), 'new tax')).toThrow(/whitespace/);
  });

  it('excludes a rename that would no longer fit', () => {
    const state = domainState([tx('a', `${long.slice(2)} #t`)]);
    const plan = planRename(state, id('t'), 'longer');
    expect(plan.changes).toEqual([]);
    expect(plan.exclusions).toEqual([
      { reason: 'overLength', transactionId: 'a', wouldBe: MEMO_LIMIT_CODE_POINTS + 4 },
    ]);
  });
});

describe('planDelete', () => {
  it('removes the tag from every parent memo in the budget', () => {
    const state = domainState([
      tx('a', '#Tax receipt'),
      tx('b', 'x #tax', { accountId: aid('acct-2') }),
      tx('c', 'unrelated'),
    ]);
    const plan = planDelete(state, id('tax'));
    expect(plan.label).toBe('Delete #Tax');
    expect(plan.changes.map((c) => [c.transactionId, c.after])).toEqual([
      ['a', 'receipt'],
      ['b', 'x'],
    ]);
    expect(plan.exclusions).toEqual([]);
    expect(plan.remainsInVocabularyAfter).toBe(false);
  });
});

describe('planUndo', () => {
  it('restores only memos that still equal the confirmed result', () => {
    const slot: UndoSlot = {
      label: 'Apply #Tax',
      changes: [
        { transactionId: tid('same'), before: 'shop', confirmedAfter: 'shop #Tax' },
        { transactionId: tid('edited'), before: null, confirmedAfter: '#Tax' },
        { transactionId: tid('gone'), before: null, confirmedAfter: '#Tax' },
      ],
    };
    const state = domainState([tx('same', 'shop #Tax'), tx('edited', '#Tax and more')]);
    const plan = planUndo(state, slot);

    expect(plan.kind).toBe('undo');
    expect(plan.label).toBe('Undo Apply #Tax');
    expect(plan.changes).toEqual([
      { transactionId: 'same', accountId: 'acct-1', before: 'shop #Tax', after: 'shop' },
    ]);
    expect(plan.exclusions).toEqual([
      { reason: 'changedSince', transactionId: 'edited' },
      { reason: 'changedSince', transactionId: 'gone' },
    ]);
  });
});

describe('replan and planDiffers', () => {
  const state = domainState([
    tx('a', '#Tax'),
    tx('b', 'x #tax'),
    tx('c', '#Fuel'),
    tx('d', null, { subtransactions: [sub('s1', '#tax'), sub('s2', null)] }),
  ]);
  const slot: UndoSlot = {
    label: 'Apply #Fuel',
    changes: [{ transactionId: tid('c'), before: null, confirmedAfter: '#Fuel' }],
  };
  const plans = [
    planApply(state, ids('a', 'c'), 'Fuel'),
    planRemove(state, ids('a', 'd'), id('tax')),
    planRename(state, id('tax'), 'Taxes'),
    planRename(state, id('tax'), 'fuel'),
    planDelete(state, id('fuel')),
    planUndo(state, slot),
  ];

  it('round-trips every kind', () => {
    for (const plan of plans) {
      const again = replan(state, plan.request);
      expect(again, plan.kind).toEqual(plan);
      expect(planDiffers(plan, again)).toBe(false);
    }
  });

  it('notices a change in the planned memos', () => {
    const plan = planDelete(state, id('tax'));
    const moved = domainState([tx('a', '#Tax extra'), tx('b', 'x #tax')]);
    expect(planDiffers(plan, replan(moved, plan.request))).toBe(true);
  });
});

describe('recheck', () => {
  const state = domainState([tx('a', 'shop'), tx('b', '#HomeRepair')]);
  const apply = planApply(state, ids('a'), 'Tax');
  const applyChange = apply.changes[0]!;

  it('passes an unchanged transaction', () => {
    expect(recheck(applyChange, apply.request, tx('a', 'shop'))).toBe('ok');
  });

  it('reports a deleted transaction and a changed memo', () => {
    expect(recheck(applyChange, apply.request, undefined)).toBe('gone');
    expect(recheck(applyChange, apply.request, tx('a', 'shop!'))).toBe('memoChanged');
  });

  it('reports a replan that differs, such as the tag arriving on a split line', () => {
    const now = tx('a', 'shop', { subtransactions: [sub('s1', '#tax'), sub('s2', null)] });
    expect(recheck(applyChange, apply.request, now)).toBe('replanDiffers');
  });

  it('ignores amount and account edits that leave the result unchanged', () => {
    const now = tx('a', 'shop', { amount: -99_000, accountId: aid('acct-2'), approved: false });
    expect(recheck(applyChange, apply.request, now)).toBe('ok');
  });

  it('rechecks a rename against the re-read memo', () => {
    const rename = planRename(state, id('homerepair'), 'Home-Repair');
    const change = rename.changes[0]!;
    expect(recheck(change, rename.request, tx('b', '#HomeRepair'))).toBe('ok');
    expect(recheck(change, rename.request, tx('b', '#HomeRepair', { payeeName: 'B&Q' }))).toBe(
      'ok',
    );
  });
});
