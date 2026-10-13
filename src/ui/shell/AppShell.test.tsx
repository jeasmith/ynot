// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import type { BudgetSessionSnapshot } from '../../session/store.ts';
import { AppShell } from './AppShell.tsx';

// The Tags tab content belongs to the tag views; the shell is tested around a stub.
vi.mock('../tags/TagsView.tsx', () => ({
  TagsView: ({ budget }: { budget: BudgetSessionSnapshot }) => (
    <h2>Tags view for {budget.plan.name}</h2>
  ),
}));

afterEach(cleanup);

function budget(patch: Partial<BudgetSessionSnapshot> = {}): BudgetSessionSnapshot {
  return {
    plan: { id: 'p1', name: 'Household', firstMonth: '2020-01-01', currencyFormat: null },
    refreshHealth: 'ok',
    lastUpdatedAt: Date.UTC(2026, 9, 12, 8, 30, 0),
    refreshing: false,
    openTag: null,
    ...patch,
  } as unknown as BudgetSessionSnapshot;
}

function setup(
  snapshot: BudgetSessionSnapshot,
  extra: { onSwitchBudget?: () => void | Promise<void>; writeInFlight?: boolean } = {},
) {
  const handlers = {
    onRefresh: vi.fn(),
    onRetry: vi.fn(),
    onSwitchBudget: extra.onSwitchBudget ?? vi.fn(),
    onDisconnect: vi.fn(),
    onOpenTag: vi.fn(),
  };
  render(
    <AppShell
      budget={snapshot}
      {...handlers}
      {...(extra.writeInFlight !== undefined && { writeInFlight: extra.writeInFlight })}
    />,
  );
  return handlers;
}

describe('AppShell', () => {
  it('shows the budget, a Tags tab with its view, and when data was last updated', () => {
    setup(budget());
    expect(screen.getByText('Household')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Tags', selected: true })).toBeTruthy();
    expect(screen.getByRole('tabpanel').textContent).toContain('Tags view for Household');
    expect(screen.getByText(/Last updated/)).toBeTruthy();
    expect(document.querySelector('time')?.getAttribute('datetime')).toBe(
      '2026-10-12T08:30:00.000Z',
    );
    expect(screen.queryByText('Updates paused')).toBeNull();
  });

  it('refreshes and switches budget from the header', async () => {
    const h = setup(budget());
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(h.onRefresh).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Switch budget' }));
    await waitFor(() => expect(h.onSwitchBudget).toHaveBeenCalledOnce());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('explains when switching budget is refused because a write is unresolved', async () => {
    setup(budget(), { onSwitchBudget: () => Promise.reject(new Error('writeUnresolved')) });
    fireEvent.click(screen.getByRole('button', { name: 'Switch budget' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('unfinished write operation');
  });

  it('announces a refresh in progress', () => {
    setup(budget({ refreshing: true }));
    expect(screen.getByRole('status').textContent).toContain('Refreshing');
  });

  it('has one main landmark and a level 1 heading', () => {
    setup(budget());
    expect(screen.getByRole('main')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Ynot' })).toBeTruthy();
  });

  it('shows Updates paused with a reason and Retry, and keeps the view', () => {
    const h = setup(budget({ refreshHealth: { paused: { kind: 'network' } } }));
    const paused = screen.getByText('Updates paused').closest('[role="status"]') as HTMLElement;
    expect(paused.textContent).toContain('could not reach YNAB');
    // The live region holds only the message; Retry sits beside it.
    expect(within(paused).queryByRole('button')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(h.onRetry).toHaveBeenCalledOnce();
    expect(screen.getByRole('tabpanel').textContent).toContain('Tags view');
  });

  it('says a 401 mid-session means the token may have been revoked', () => {
    setup(budget({ refreshHealth: { paused: { kind: 'unauthorized' } } }));
    expect(screen.getByText(/token may have been revoked/)).toBeTruthy();
  });

  it('says a 404 mid-session means the budget is gone', () => {
    setup(budget({ refreshHealth: { paused: { kind: 'notFound' } } }));
    expect(screen.getByText(/no longer available/)).toBeTruthy();
  });

  it('confirms Disconnect, explaining that the PAT is not revoked', () => {
    const h = setup(budget());
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    expect(h.onDisconnect).not.toHaveBeenCalled();
    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toContain('does not revoke your personal access token');
    expect(dialog.textContent).toContain('forgets any token remembered on this device');
    const link = within(dialog).getByRole('link', {
      name: 'YNAB Developer Settings (opens in a new tab)',
    });
    expect(link.getAttribute('href')).toBe('https://app.ynab.com/settings/developer');
    expect(within(dialog).queryByRole('alert')).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, disconnect' }));
    expect(h.onDisconnect).toHaveBeenCalledOnce();
  });

  it('can be cancelled without disconnecting', async () => {
    const h = setup(budget());
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }),
    );
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(h.onDisconnect).not.toHaveBeenCalled();
  });

  it('warns that sent write requests may still land when a write is in flight', () => {
    setup(budget(), { writeInFlight: true });
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByRole('alert').textContent).toContain(
      'may still take effect in YNAB',
    );
  });
});
