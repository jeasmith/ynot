import type { SessionStore } from './store.ts';

/**
 * Checks for updates when the tab becomes visible (Req 4.3). It does nothing unless a Budget is
 * loaded and no refresh is already in flight. Slice 2 adds the "no Write Operation is running"
 * gate (Req 4.4) once the snapshot carries an operation. Returns a disposer that removes the listener.
 */
export function startRefreshOnReturn(deps: {
  store: Pick<SessionStore, 'getSnapshot' | 'refreshNow'>;
  document: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;
}): () => void {
  const { store, document } = deps;

  const onVisibilityChange = (): void => {
    if (document.visibilityState !== 'visible') return;
    const snapshot = store.getSnapshot();
    if (snapshot.phase !== 'ready' || snapshot.budget.refreshing) return;
    void store.refreshNow();
  };

  document.addEventListener('visibilitychange', onVisibilityChange);
  return () => document.removeEventListener('visibilitychange', onVisibilityChange);
}
