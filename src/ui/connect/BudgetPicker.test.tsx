// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import type { PlanSummary } from '../../ynab/client.ts';
import { BudgetPicker, type BudgetPickerState } from './BudgetPicker.tsx';

afterEach(cleanup);

const plans: PlanSummary[] = [
  { id: 'p1', name: 'Household' },
  { id: 'p2', name: 'Side business' },
];

function setup(state: BudgetPickerState) {
  const handlers = { onChoose: vi.fn(), onRetry: vi.fn(), onDisconnect: vi.fn() };
  render(<BudgetPicker state={state} {...handlers} />);
  return handlers;
}

describe('BudgetPicker', () => {
  it('lists the plans and chooses one', () => {
    const h = setup({ status: 'choosing', plans });
    const list = screen.getByRole('list', { name: 'Budgets' });
    expect(
      within(list)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Household', 'Side business']);
    fireEvent.click(screen.getByRole('button', { name: 'Side business' }));
    expect(h.onChoose).toHaveBeenCalledExactlyOnceWith('p2');
  });

  it('shows an empty state that is not an error', () => {
    setup({ status: 'choosing', plans: [] });
    expect(screen.getByRole('status').textContent).toContain('no accessible budgets');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('says when the token could not be remembered', () => {
    setup({ status: 'choosing', plans, rememberFailed: true });
    expect(screen.getByRole('status').textContent).toContain('could not be remembered');
  });

  it('shows loading progress', () => {
    setup({ status: 'loading' });
    expect(screen.getByRole('progressbar', { name: 'Loading your budget' })).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('shows a load failure with Retry and Disconnect', () => {
    const h = setup({ status: 'failed', failure: { kind: 'server', status: 503 } });
    expect(screen.getByRole('alert').textContent).toContain('Could not load this budget');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(h.onRetry).toHaveBeenCalledOnce();
    expect(h.onDisconnect).not.toHaveBeenCalled();
  });

  it('disconnects only after the confirmation', () => {
    const h = setup({ status: 'failed', failure: { kind: 'network' } });
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    expect(h.onDisconnect).not.toHaveBeenCalled();
    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toContain('not revoke');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, disconnect' }));
    expect(h.onDisconnect).toHaveBeenCalledOnce();
  });
});
