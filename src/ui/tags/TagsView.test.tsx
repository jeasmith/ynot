// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import type { BudgetSessionSnapshot } from '../../session/store.ts';
import { identityOf, makeBudget, sub, tx } from './testBudget.ts';
import { TagsView } from './TagsView.tsx';

afterEach(cleanup);

const MINUS = '−';

// A GBP120 restaurant bill split into own share and per-person lines; Alice repays GBP25.
const bill = tx('bill', -120_000, null, {
  date: '2026-01-02',
  payeeName: 'Trattoria',
  subtransactions: [
    sub('bill-own', -30_000, null),
    sub('bill-alice', -25_000, '#owed-alice'),
    sub('bill-bob', -35_000, '#owed-bob'),
    sub('bill-carol', -30_000, '#owed-carol'),
  ],
});
const repayment = tx('repay', 25_000, '#owed-alice', {
  date: '2026-01-05',
  payeeName: 'Alice',
});

function show(budget: BudgetSessionSnapshot, onOpenTag = vi.fn()) {
  render(<TagsView budget={budget} onOpenTag={onOpenTag} />);
  return onOpenTag;
}

const stat = (region: HTMLElement, term: string): string | null =>
  within(region).getByText(term, { selector: 'dt' }).nextElementSibling?.textContent ?? null;

function overviewTagOrder(): string[] {
  const table = screen.getByRole('grid', { name: /Tag Overview/ });
  return within(table)
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('rowheader')[0]?.textContent ?? '');
}

describe('Tag Overview', () => {
  const budget = makeBudget([
    tx('t1', -10_000, '#aaa', { date: '2026-01-01' }),
    tx('t2', -50_000, '#bbb', { date: '2026-01-02' }),
    tx('t3', 30_000, '#bbb', { date: '2026-01-03' }),
    tx('t4', 5_000, '#ccc', { date: '2026-01-04' }),
    tx('t5', 6_000, '#ccc', { date: '2026-01-04' }),
    tx('t6', 7_000, '#ccc', { date: '2026-01-04' }),
  ]);

  it('lists every tag with the scope label, sorted by tag by default', () => {
    show(budget);
    expect(screen.getByText('all accounts · all time')).toBeTruthy();
    expect(overviewTagOrder()).toEqual(['#aaa', '#bbb', '#ccc']);
    const bbb = screen.getByRole('row', { name: /#bbb/ });
    const cells = within(bbb)
      .getAllByRole('gridcell')
      .map((c) => c.textContent);
    expect(cells.slice(0, 4)).toEqual([`${MINUS}£20.00`, `${MINUS}£50.00`, '£30.00', '2']);
  });

  it('sorts by each column, toggling direction', () => {
    show(budget);
    const header = (name: string) => screen.getByRole('columnheader', { name });

    fireEvent.click(header('Net'));
    // net: #bbb -20, #aaa -10, #ccc +18
    expect(overviewTagOrder()).toEqual(['#bbb', '#aaa', '#ccc']);
    expect(header('Net').getAttribute('aria-sort')).toBe('ascending');

    fireEvent.click(header('Net'));
    expect(overviewTagOrder()).toEqual(['#ccc', '#aaa', '#bbb']);
    expect(header('Net').getAttribute('aria-sort')).toBe('descending');

    fireEvent.click(header('Transactions'));
    expect(overviewTagOrder()).toEqual(['#aaa', '#bbb', '#ccc']);
    fireEvent.click(header('Transactions'));
    expect(overviewTagOrder()).toEqual(['#ccc', '#bbb', '#aaa']);

    fireEvent.click(header('Outflow'));
    expect(overviewTagOrder()).toEqual(['#bbb', '#aaa', '#ccc']);

    fireEvent.click(header('Inflow'));
    expect(overviewTagOrder()).toEqual(['#aaa', '#ccc', '#bbb']);
  });

  it('opens the reader for a row', () => {
    const onOpenTag = show(budget);
    fireEvent.click(screen.getByRole('row', { name: /#bbb/ }));
    expect(onOpenTag).toHaveBeenCalledWith(identityOf('bbb'));
  });
});

describe('Tag reader: the restaurant example', () => {
  const budget = makeBudget([bill, repayment], { openTag: identityOf('owed-alice') });

  it('nets #owed-alice to zero and shows the composition', () => {
    show(budget);
    expect(screen.getByRole('heading', { level: 2, name: '#owed-alice' })).toBeTruthy();
    expect(screen.getByText('all accounts · all time')).toBeTruthy();
    const composition = screen.getByRole('region', { name: 'Total composition' });
    expect(stat(composition, 'Net')).toBe('£0.00');
    expect(stat(composition, 'Outflow')).toBe(`${MINUS}£25.00`);
    expect(stat(composition, 'Inflow')).toBe('£25.00');
    expect(stat(composition, 'Transactions')).toBe('2');
    expect(stat(composition, 'Transfer pairs')).toBe('0');
  });

  it('shows the tagged split line, not the whole bill, with a read-only marker', () => {
    show(budget);
    const members = screen.getByRole('list', { name: 'Member transactions' });
    const rows = within(members).getAllByRole('listitem', { name: '' });
    const billRow = rows.find((row) => row.textContent?.includes('Trattoria'));
    if (billRow === undefined) throw new Error('bill row missing');

    expect(billRow.textContent).toContain('2026-01-02');
    expect(billRow.textContent).toContain('Current');
    const lines = within(billRow).getByRole('list', { name: 'Contributing split lines' });
    const line = within(lines).getByRole('listitem');
    expect(line.textContent).toContain('#owed-alice');
    expect(line.textContent).toContain(`${MINUS}£25.00`);
    expect(lines.textContent).not.toContain('#owed-bob');
    expect(within(billRow).getByText(/Transaction total .*120\.00/)).toBeTruthy();

    const readOnly = within(billRow).getByRole('img', { name: /read-only, in a split$/ });
    expect(readOnly.getAttribute('aria-label')).toBe('#owed-alice read-only, in a split');

    const repayRow = rows.find((row) => row.textContent?.includes('2026-01-05'));
    expect(repayRow).toBeTruthy();
    expect(within(repayRow as HTMLElement).queryByRole('img', { name: /read-only/ })).toBeNull();
    expect(within(repayRow as HTMLElement).queryByRole('list')).toBeNull();
  });

  it('leaves #owed-bob negative by exactly his line', () => {
    show({ ...budget, openTag: identityOf('owed-bob') });
    const composition = screen.getByRole('region', { name: 'Total composition' });
    expect(stat(composition, 'Net')).toBe(`${MINUS}£35.00`);
    expect(stat(composition, 'Transactions')).toBe('1');
  });

  it('goes back to the overview', () => {
    const onOpenTag = show(budget);
    fireEvent.click(screen.getByRole('button', { name: 'Back to all tags' }));
    expect(onOpenTag).toHaveBeenCalledWith(null);
  });

  it('names transfer pairs without promising they cancel', () => {
    const out = tx('xfer-out', -50_000, '#move', {
      payeeName: 'Transfer : Savings',
      transferTransactionId: 'xfer-in',
    });
    const into = tx('xfer-in', 50_000, '#move', {
      accountId: 'acct-2' as never,
      payeeName: 'Transfer : Current',
      transferTransactionId: 'xfer-out',
    });
    show(makeBudget([out, into], { openTag: identityOf('move') }));
    const composition = screen.getByRole('region', { name: 'Total composition' });
    expect(stat(composition, 'Transfer pairs')).toBe('1');
    const pairs = screen.getByRole('list', { name: 'Transfer pairs' });
    expect(pairs.textContent).toContain('Transfer : Savings');
    expect(pairs.textContent).toContain('Transfer : Current');
    expect(screen.getByText(/do not necessarily cancel to zero/)).toBeTruthy();
  });

  it('offers no write actions and no outside-account count in slice 1', () => {
    show(budget);
    expect(screen.queryByRole('button', { name: /rename|delete|merge/i })).toBeNull();
    expect(screen.queryByText(/outside/i)).toBeNull();
  });
});

describe('markers have accessible names', () => {
  const budget = makeBudget([
    tx('a1', -1_000, '#Home-Repair'),
    tx('a2', -2_000, '#Home-Repair'),
    tx('b1', -3_000, '#HomeRepair'),
    tx('b2', -3_000, '#HomeRepair'),
    tx('s1', -4_000, '#solo'),
    tx('n1', -4_000, '#Tax'),
    tx('n2', -4_000, '#Tax'),
  ]);

  it('names the other tag on the near-duplicate marker, in the overview and the rail', () => {
    show(budget);
    const row = screen.getByRole('row', { name: /#Home-Repair/ });
    expect(within(row).getByRole('img', { name: 'Near-duplicate of #HomeRepair' })).toBeTruthy();
    const option = screen.getByRole('option', { name: /^#HomeRepair/ });
    expect(
      within(option).getByRole('img', { name: 'Near-duplicate of #Home-Repair' }),
    ).toBeTruthy();
  });

  it('marks single-use tags separately and shows nothing on ordinary tags', () => {
    show(budget);
    const solo = screen.getByRole('row', { name: /#solo/ });
    expect(within(solo).getByRole('img', { name: 'Single use, one transaction' })).toBeTruthy();
    expect(within(solo).queryByRole('img', { name: /Near-duplicate/ })).toBeNull();
    const tax = screen.getByRole('row', { name: /#Tax/ });
    expect(within(tax).queryByRole('img')).toBeNull();
  });

  it('puts the near-duplicate marker before the single-use marker', () => {
    const both = makeBudget(
      [tx('a', -1_000, '#Lone-Tag'), tx('b', -1_000, '#LoneTag'), tx('c', -1_000, '#LoneTag')],
      {
        openTag: identityOf('lone-tag'),
      },
    );
    show(both);
    const header = screen.getByRole('heading', { level: 2, name: '#Lone-Tag' })
      .parentElement as HTMLElement;
    const names = within(header)
      .getAllByRole('img')
      .map((el) => el.getAttribute('aria-label'));
    expect(names).toEqual(['Near-duplicate of #LoneTag', 'Single use, one transaction']);
  });

  it('shows the markers in the reader header', () => {
    show({ ...budget, openTag: identityOf('home-repair') });
    const header = screen.getByRole('heading', { level: 2, name: '#Home-Repair' })
      .parentElement as HTMLElement;
    expect(within(header).getByRole('img', { name: 'Near-duplicate of #HomeRepair' })).toBeTruthy();
  });
});

describe('the rail', () => {
  it('is exclusive and opens a tag', () => {
    const budget = makeBudget([tx('a', -1_000, '#aaa'), tx('b', -1_000, '#bbb')], {
      openTag: identityOf('aaa'),
    });
    const onOpenTag = show(budget);
    const rail = screen.getByRole('listbox', { name: 'Tags' });
    const options = within(rail).getAllByRole('option');
    expect(options.map((o) => o.getAttribute('aria-selected'))).toEqual(['true', 'false']);
    fireEvent.click(options[1] as HTMLElement);
    expect(onOpenTag).toHaveBeenCalledWith(identityOf('bbb'));
  });
});

describe('empty vocabulary', () => {
  const empty = makeBudget([tx('a', -1_000, 'just prose'), tx('b', -2_000, null)]);

  it('says so in the overview and the rail without inventing tags', () => {
    show(empty);
    expect(screen.getAllByRole('status').map((s) => s.textContent)).toEqual([
      'No tags in this budget.',
      expect.stringContaining('No tags in this budget yet'),
    ]);
    expect(screen.queryByRole('grid')).toBeNull();
    expect(screen.queryByRole('option')).toBeNull();
  });

  it('says so in the reader', () => {
    show({ ...empty, openTag: identityOf('gone') });
    const reader = screen.getByRole('region', { name: 'Tag reader' });
    expect(within(reader).getByRole('status').textContent).toContain('No tags in this budget yet');
  });

  it('tells the reader when an open tag has disappeared', () => {
    show(makeBudget([tx('a', -1_000, '#here')], { openTag: identityOf('gone') }));
    expect(screen.getByText(/no longer in the budget/)).toBeTruthy();
  });
});

describe('Tag drawer and focus', () => {
  const budget = makeBudget([tx('t1', -10_000, '#aaa'), tx('t2', -20_000, '#bbb')]);

  it('keeps one name on the toggle, and closes with the Close button or Escape', () => {
    show(budget);
    const toggle = screen.getByRole('button', { name: 'Browse tags' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Browse tags' }).getAttribute('aria-expanded')).toBe(
      'true',
    );
    const close = screen.getByRole('button', { name: 'Close tag list' });
    expect(document.activeElement).toBe(close);
    fireEvent.click(close);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(toggle);

    fireEvent.click(toggle);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(toggle);
  });

  it('moves focus to the reader heading when a tag opens', () => {
    const view = render(<TagsView budget={budget} onOpenTag={vi.fn()} />);
    view.rerender(
      <TagsView budget={{ ...budget, openTag: identityOf('aaa') }} onOpenTag={vi.fn()} />,
    );
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2, name: '#aaa' }));
  });
});

describe('Tag reader: a tag with thousands of members', () => {
  const many = Array.from({ length: 3000 }, (_, i) =>
    tx(`m${i}`, -1_000, '#household', { date: '2026-01-01' }),
  );
  const budget = makeBudget(many, { openTag: identityOf('household') });

  it('mounts only the rows near the viewport, each saying its place in the list', () => {
    // jsdom has no layout: give every element a row's height so the virtualiser can measure.
    const height = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(64);
    show(budget);
    const members = screen.getByRole('list', { name: 'Member transactions' });
    const rows = within(members).getAllByRole('listitem');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(100);
    expect(rows[0]?.getAttribute('aria-posinset')).toBe('1');
    expect(rows[0]?.getAttribute('aria-setsize')).toBe('3000');
    const composition = screen.getByRole('region', { name: 'Total composition' });
    expect(stat(composition, 'Transactions')).toBe('3000');
    height.mockRestore();
  });
});
