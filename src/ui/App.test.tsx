// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { createFakeYnab } from '../../test/fakeYnab.ts';
import { createSessionStore, type PatStorage } from '../session/store.ts';
import { App } from './App.tsx';

// The Tags tab content belongs to the tag views; App is tested around a stub.
vi.mock('./tags/TagsView.tsx', () => ({
  TagsView: () => <h2>Tags view</h2>,
}));

afterEach(cleanup);

const TOKEN = 'good-token';

function memoryPatStorage(initial: string | null = null) {
  let stored = initial;
  const storage: PatStorage = {
    read: () => stored,
    remember: (pat) => {
      stored = pat;
    },
    forget: () => {
      stored = null;
    },
  };
  return { storage, held: () => stored };
}

function setup(opts: { remembered?: string | null; noPlans?: boolean } = {}) {
  const fake = createFakeYnab({
    token: TOKEN,
    plans: opts.noPlans
      ? []
      : [
          {
            id: 'p1',
            name: 'Household',
            firstMonth: '2020-01-01',
            accounts: [{ id: 'a1' }],
            categoryGroups: [{ id: 'g1', categories: [{ id: 'c1' }] }],
            transactions: [{ id: 't1', accountId: 'a1', categoryId: 'c1', memo: 'x #food' }],
          },
          { id: 'p2', name: 'Other', accounts: [{ id: 'b1' }], transactions: [] },
        ],
  });
  const pat = memoryPatStorage(opts.remembered ?? null);
  const store = createSessionStore({ fetchImpl: fake.fetchImpl, patStorage: pat.storage });
  render(<App store={store} />);
  return { fake, pat, store };
}

function connect(token: string, remember = false) {
  fireEvent.change(screen.getByLabelText('YNAB personal access token'), {
    target: { value: token },
  });
  if (remember) fireEvent.click(screen.getByRole('checkbox', { name: 'Remember on this device' }));
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
}

describe('App', () => {
  it('walks disconnected, choosing a budget, loading and the ready shell', async () => {
    const { pat } = setup();
    expect(screen.getByRole('heading', { name: 'Connect to YNAB' })).toBeTruthy();
    connect(TOKEN);
    expect(await screen.findByRole('heading', { name: 'Choose a budget' })).toBeTruthy();
    expect(pat.held()).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Household' }));
    expect(await screen.findByRole('tab', { name: 'Tags' })).toBeTruthy();
    expect(screen.getByRole('tabpanel').textContent).toContain('Tags view');
  });

  it('remembers the token only when asked', async () => {
    const { pat } = setup();
    connect(TOKEN, true);
    await screen.findByRole('heading', { name: 'Choose a budget' });
    expect(pat.held()).toBe(TOKEN);
  });

  it('rejects a bad token without echoing it', async () => {
    const { pat } = setup();
    connect('bad-token-xyz');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('YNAB rejected this token');
    expect(document.body.textContent).not.toContain('bad-token-xyz');
    expect(pat.held()).toBeNull();
  });

  it('connects at start-up with a Remembered PAT, and deletes it on a 401', async () => {
    const { pat, store } = setup({ remembered: 'revoked-token' });
    await act(() => store.start());
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(pat.held()).toBeNull();
  });

  it('connects at start-up with a good Remembered PAT', async () => {
    const { store } = setup({ remembered: TOKEN });
    await act(() => store.start());
    expect(await screen.findByRole('heading', { name: 'Choose a budget' })).toBeTruthy();
  });

  it('shows the empty state when there are no budgets', async () => {
    setup({ noPlans: true });
    connect(TOKEN);
    await screen.findByRole('heading', { name: 'Choose a budget' });
    expect(screen.getByRole('status').textContent).toContain('no accessible budgets');
  });

  it('shows a load failure with Retry, then loads on Retry', async () => {
    const { fake } = setup();
    connect(TOKEN);
    await screen.findByRole('heading', { name: 'Choose a budget' });
    fake.queueFaults({ kind: '5xx', status: 503 });
    fireEvent.click(screen.getByRole('button', { name: 'Household' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Could not load this budget');
    expect(screen.queryByRole('tab')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('tab', { name: 'Tags' })).toBeTruthy();
  });

  it('refreshes when the tab becomes visible again', async () => {
    const { fake } = setup();
    connect(TOKEN);
    await screen.findByRole('heading', { name: 'Choose a budget' });
    fireEvent.click(screen.getByRole('button', { name: 'Household' }));
    await screen.findByRole('tab', { name: 'Tags' });
    const before = fake.requests.length;
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(fake.requests.length).toBeGreaterThan(before));
  });

  it('Refresh also re-reads accounts and categories', async () => {
    const { fake } = setup();
    connect(TOKEN);
    await screen.findByRole('heading', { name: 'Choose a budget' });
    fireEvent.click(screen.getByRole('button', { name: 'Household' }));
    await screen.findByRole('tab', { name: 'Tags' });
    const before = fake.requests.length;
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => {
      const seen = fake.requests.slice(before).map((r) => r.path);
      expect(seen.some((p) => p.endsWith('/accounts'))).toBe(true);
      expect(seen.some((p) => p.endsWith('/categories'))).toBe(true);
    });
  });

  it('Switch budget returns to the budget list', async () => {
    setup();
    connect(TOKEN);
    await screen.findByRole('heading', { name: 'Choose a budget' });
    fireEvent.click(screen.getByRole('button', { name: 'Household' }));
    await screen.findByRole('tab', { name: 'Tags' });
    fireEvent.click(screen.getByRole('button', { name: 'Switch budget' }));
    expect(await screen.findByRole('heading', { name: 'Choose a budget' })).toBeTruthy();
  });

  it('Disconnect confirmation clears the session and forgets the token', async () => {
    const { pat } = setup();
    connect(TOKEN, true);
    await screen.findByRole('heading', { name: 'Choose a budget' });
    fireEvent.click(screen.getByRole('button', { name: 'Household' }));
    await screen.findByRole('tab', { name: 'Tags' });
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, disconnect' }));
    expect(await screen.findByRole('heading', { name: 'Connect to YNAB' })).toBeTruthy();
    expect(pat.held()).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Disconnected');
  });
});
