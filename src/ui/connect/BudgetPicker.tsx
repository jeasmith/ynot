import { Button, ProgressBar } from 'react-aria-components';
import type { PlanSummary } from '../../ynab/client.ts';
import type { YnabFailure } from '../../ynab/errors.ts';
import { describeFailure } from '../failureText.ts';
import { DisconnectButton } from '../shell/DisconnectButton.tsx';
import { useFocusOnMount } from '../useFocusOnMount.ts';
import styles from './BudgetPicker.module.css';

export type BudgetPickerState =
  | { status: 'choosing'; plans: readonly PlanSummary[]; rememberFailed?: boolean }
  | { status: 'loading' }
  | { status: 'failed'; failure: YnabFailure };

interface Props {
  state: BudgetPickerState;
  onChoose: (planId: string) => void;
  onRetry: () => void;
  onDisconnect: () => void;
}

/**
 * Budget choice, and the states around loading a chosen budget: progress, an empty result
 * (distinct from a failure, Req 3.8), and a load failure with Retry and Disconnect (Req 3.6-3.7).
 */
export function BudgetPicker({ state, onChoose, onRetry, onDisconnect }: Props) {
  const titleRef = useFocusOnMount<HTMLHeadingElement>([state.status]);
  return (
    <main className={styles.page}>
      <h1 ref={titleRef} tabIndex={-1} className={styles.title}>
        {state.status === 'choosing' ? 'Choose a budget' : 'Loading budget'}
      </h1>

      {state.status === 'loading' && (
        <ProgressBar isIndeterminate aria-label="Loading your budget" className={styles.progress}>
          <span>Loading your budget. This can take a moment for a long history.</span>
          <div className={styles.bar} aria-hidden="true">
            <div className={styles.fill} />
          </div>
        </ProgressBar>
      )}
      {state.status === 'loading' && (
        <div className={styles.actions}>
          <DisconnectButton onDisconnect={onDisconnect} />
        </div>
      )}

      {state.status === 'failed' && (
        <div role="alert" className={styles.failure}>
          <p>
            <strong>Could not load this budget.</strong> {describeFailure(state.failure, 'load')}{' '}
            Nothing is shown from it until it loads completely.
          </p>
          <div className={styles.actions}>
            <Button className={styles.primary} onPress={onRetry}>
              Retry
            </Button>
            <DisconnectButton onDisconnect={onDisconnect} />
          </div>
        </div>
      )}

      {state.status === 'choosing' && (
        <>
          {state.rememberFailed === true && (
            <p role="status" className={styles.notice}>
              The token could not be remembered on this device. You are connected for this session
              only.
            </p>
          )}
          {state.plans.length === 0 ? (
            <p role="status" className={styles.empty}>
              This token has no accessible budgets. Nothing failed to load; there is just nothing to
              choose.
            </p>
          ) : (
            <ul className={styles.list} aria-label="Budgets">
              {state.plans.map((plan) => (
                <li key={plan.id}>
                  <Button className={styles.plan} onPress={() => onChoose(plan.id)}>
                    {plan.name}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <div className={styles.actions}>
            <DisconnectButton onDisconnect={onDisconnect} />
          </div>
        </>
      )}
    </main>
  );
}
