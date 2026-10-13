import {
  createContext,
  useCallback,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { AppPhase, SessionStore } from '../session/store.ts';

const StoreContext = createContext<SessionStore | null>(null);

/** Makes one SessionStore available to the React tree below it. */
export function StoreProvider({ store, children }: { store: SessionStore; children: ReactNode }) {
  return <StoreContext value={store}>{children}</StoreContext>;
}

/** The SessionStore for command calls (`connect`, `refreshNow`, ...). */
export function useSessionStore(): SessionStore {
  const store = useContext(StoreContext);
  if (store === null) throw new Error('useSessionStore must be used inside a StoreProvider');
  return store;
}

/** The current AppPhase, re-rendering whenever the store publishes a new one. */
export function useAppPhase(): AppPhase {
  const store = useSessionStore();
  const subscribe = useCallback((listener: () => void) => store.subscribe(listener), [store]);
  const getSnapshot = useCallback(() => store.getSnapshot(), [store]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
