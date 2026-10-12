import { useEffect, useRef } from 'react';
import { startRefreshOnReturn } from '../session/refreshOnReturn.ts';
import type { SessionStore } from '../session/store.ts';
import { BudgetPicker } from './connect/BudgetPicker.tsx';
import { ConnectScreen } from './connect/ConnectScreen.tsx';
import { ErrorBoundary } from './ErrorBoundary.tsx';
import { AppShell } from './shell/AppShell.tsx';
import { StoreProvider, useAppPhase, useSessionStore } from './storeContext.tsx';
import styles from './App.module.css';

function Connecting() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <main ref={ref} tabIndex={-1} className={styles.connecting}>
      <p role="status">Connecting to YNAB…</p>
    </main>
  );
}

/** Chooses the screen from the store's AppPhase. */
function Screen() {
  const store = useSessionStore();
  const state = useAppPhase();

  useEffect(() => startRefreshOnReturn({ store, document }), [store]);

  switch (state.phase) {
    case 'disconnected':
      return (
        <ConnectScreen
          {...(state.notice !== undefined && { notice: state.notice })}
          {...(state.failure !== undefined && { failure: state.failure })}
          onConnect={(pat, remember) => void store.connect(pat, remember)}
        />
      );
    case 'connecting':
      return <Connecting />;
    case 'choosingBudget':
      return (
        <BudgetPicker
          state={{
            status: 'choosing',
            plans: state.plans,
            ...(state.rememberFailed === true && { rememberFailed: true }),
          }}
          onChoose={(planId) => void store.chooseBudget(planId)}
          onRetry={() => undefined}
          onDisconnect={() => store.disconnect()}
        />
      );
    case 'loadingBudget':
      return (
        <BudgetPicker
          state={{ status: 'loading' }}
          onChoose={() => undefined}
          onRetry={() => undefined}
          onDisconnect={() => store.disconnect()}
        />
      );
    case 'loadFailed':
      return (
        <BudgetPicker
          state={{ status: 'failed', failure: state.failure }}
          onChoose={() => undefined}
          onRetry={() => void store.chooseBudget(state.planId)}
          onDisconnect={() => store.disconnect()}
        />
      );
    case 'ready':
      return (
        <AppShell
          budget={state.budget}
          onRefresh={() => void store.refreshNow({ includeAccounts: true })}
          onRetry={() => void store.refreshNow()}
          onSwitchBudget={() => store.switchBudget()}
          onDisconnect={() => store.disconnect()}
          onOpenTag={(identity) => store.openTag(identity)}
        />
      );
  }
}

export function App({ store }: { store: SessionStore }) {
  return (
    <StoreProvider store={store}>
      <ErrorBoundary onDisconnect={() => store.disconnect()}>
        <Screen />
      </ErrorBoundary>
    </StoreProvider>
  );
}
