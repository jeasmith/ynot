import { describe, expect, it, vi } from 'vite-plus/test';
import { startRefreshOnReturn } from './refreshOnReturn.ts';
import type { AppPhase, BudgetSessionSnapshot, SessionStore } from './store.ts';

function fakeDocument(initial: 'visible' | 'hidden' = 'hidden') {
  const listeners = new Map<string, Set<() => void>>();
  const doc = {
    visibilityState: initial as DocumentVisibilityState,
    addEventListener: vi.fn((type: string, listener: () => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
    }),
    removeEventListener: vi.fn((type: string, listener: () => void) => {
      listeners.get(type)?.delete(listener);
    }),
  };
  return {
    doc,
    listenerCount: () => listeners.get('visibilitychange')?.size ?? 0,
    change(state: 'visible' | 'hidden') {
      doc.visibilityState = state;
      for (const l of listeners.get('visibilitychange') ?? []) l();
    },
  };
}

const budget = (refreshing: boolean) => ({ refreshing }) as unknown as BudgetSessionSnapshot;

function fakeStore(phase: AppPhase) {
  const state = { phase };
  const refreshNow = vi.fn(() => Promise.resolve());
  const store: Pick<SessionStore, 'getSnapshot' | 'refreshNow'> = {
    getSnapshot: () => state.phase,
    refreshNow,
  };
  return { store, state, refreshNow };
}

describe('startRefreshOnReturn', () => {
  it('refreshes when the tab becomes visible', () => {
    const d = fakeDocument();
    const s = fakeStore({ phase: 'ready', budget: budget(false) });
    startRefreshOnReturn({ store: s.store, document: d.doc });
    d.change('visible');
    expect(s.refreshNow).toHaveBeenCalledTimes(1);
    expect(s.refreshNow).toHaveBeenCalledWith();
  });

  it('does nothing when the tab becomes hidden', () => {
    const d = fakeDocument('visible');
    const s = fakeStore({ phase: 'ready', budget: budget(false) });
    startRefreshOnReturn({ store: s.store, document: d.doc });
    d.change('hidden');
    expect(s.refreshNow).not.toHaveBeenCalled();
  });

  it('does not start a refresh while one is in flight', () => {
    const d = fakeDocument();
    const s = fakeStore({ phase: 'ready', budget: budget(true) });
    startRefreshOnReturn({ store: s.store, document: d.doc });
    d.change('visible');
    expect(s.refreshNow).not.toHaveBeenCalled();
  });

  it('does nothing unless a Budget is loaded', () => {
    const d = fakeDocument();
    const s = fakeStore({ phase: 'choosingBudget', plans: [] });
    startRefreshOnReturn({ store: s.store, document: d.doc });
    d.change('visible');
    s.state.phase = { phase: 'loadingBudget', planId: 'p1' };
    d.change('visible');
    s.state.phase = { phase: 'disconnected' };
    d.change('visible');
    expect(s.refreshNow).not.toHaveBeenCalled();
  });

  it('reads the phase at event time', () => {
    const d = fakeDocument();
    const s = fakeStore({ phase: 'choosingBudget', plans: [] });
    startRefreshOnReturn({ store: s.store, document: d.doc });
    d.change('visible');
    s.state.phase = { phase: 'ready', budget: budget(false) };
    d.change('visible');
    expect(s.refreshNow).toHaveBeenCalledTimes(1);
  });

  it('the disposer removes the listener', () => {
    const d = fakeDocument();
    const s = fakeStore({ phase: 'ready', budget: budget(false) });
    const dispose = startRefreshOnReturn({ store: s.store, document: d.doc });
    expect(d.listenerCount()).toBe(1);
    dispose();
    expect(d.listenerCount()).toBe(0);
    d.change('visible');
    expect(s.refreshNow).not.toHaveBeenCalled();
  });
});
