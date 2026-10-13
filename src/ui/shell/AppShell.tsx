import { useState } from 'react';
import { Button, Tab, TabList, TabPanel, Tabs } from 'react-aria-components';
import type { TagIdentity } from '../../domain/grammar/identity.ts';
import type { BudgetSessionSnapshot } from '../../session/store.ts';
import { describeFailure } from '../failureText.ts';
import { useFocusOnMount } from '../useFocusOnMount.ts';
import { TagsView } from '../tags/TagsView.tsx';
import { DisconnectButton } from './DisconnectButton.tsx';
import styles from './AppShell.module.css';

interface Props {
  budget: BudgetSessionSnapshot;
  /** The Refresh button. The caller passes `includeAccounts: true` to the store. */
  onRefresh: () => void;
  /** Retry beside `Updates paused`. */
  onRetry: () => void;
  /** Rejection means a Write Operation must be resolved first (Req 3.10). */
  onSwitchBudget: () => void | Promise<void>;
  onDisconnect: () => void;
  /** Opens a tag's reader, or returns to the overview with `null`. Handed to the Tags view. */
  onOpenTag: (identity: TagIdentity | null) => void;
  /** A Write Operation has requests already sent to YNAB (slice 2 supplies this). */
  writeInFlight?: boolean;
}

function formatUpdatedAt(ms: number): { iso: string; text: string } {
  const date = new Date(ms);
  return { iso: date.toISOString(), text: date.toLocaleTimeString() };
}

/** The header, tabs and main area around a loaded Budget Session (design: UI components). */
export function AppShell({
  budget,
  onRefresh,
  onRetry,
  onSwitchBudget,
  onDisconnect,
  onOpenTag,
  writeInFlight = false,
}: Props) {
  const [switchBlocked, setSwitchBlocked] = useState(false);
  const titleRef = useFocusOnMount<HTMLHeadingElement>([]);
  const paused = budget.refreshHealth === 'ok' ? null : budget.refreshHealth.paused;
  const updated = budget.lastUpdatedAt === null ? null : formatUpdatedAt(budget.lastUpdatedAt);

  const switchBudget = (): void => {
    setSwitchBlocked(false);
    void Promise.resolve()
      .then(onSwitchBudget)
      .catch(() => setSwitchBlocked(true));
  };

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.identity}>
          <h1 ref={titleRef} tabIndex={-1} className={styles.brand}>
            Ynot
          </h1>
          <span className={styles.budgetName}>{budget.plan.name}</span>
        </div>
        <div className={styles.status}>
          {updated !== null && (
            <span className={styles.updated}>
              Last updated <time dateTime={updated.iso}>{updated.text}</time>
            </span>
          )}
          {budget.refreshing && (
            <span role="status" className={styles.refreshing}>
              Refreshing…
            </span>
          )}
        </div>
        <div className={styles.actions}>
          <Button className={styles.button} onPress={onRefresh} isPending={budget.refreshing}>
            Refresh
          </Button>
          <Button className={styles.button} onPress={switchBudget}>
            Switch budget
          </Button>
          <DisconnectButton onDisconnect={onDisconnect} writeInFlight={writeInFlight} />
        </div>
      </header>

      {paused !== null && (
        <div className={styles.paused}>
          <div role="status" className={styles.pausedText}>
            <strong>Updates paused</strong>{' '}
            <span>{describeFailure(paused, 'session')} Showing the last data loaded.</span>
          </div>
          <Button className={styles.button} onPress={onRetry}>
            Retry
          </Button>
        </div>
      )}

      {switchBlocked && (
        <p role="alert" className={styles.blocked}>
          Finish or resolve the unfinished write operation before switching budgets.
        </p>
      )}

      <main className={styles.main}>
        <Tabs className={styles.tabs}>
          <TabList aria-label="Views" className={styles.tabList}>
            <Tab id="tags" className={styles.tab}>
              Tags
            </Tab>
          </TabList>
          <TabPanel id="tags" className={styles.panel}>
            <TagsView budget={budget} onOpenTag={onOpenTag} />
          </TabPanel>
        </Tabs>
      </main>
    </div>
  );
}
