import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from 'react-aria-components';
import styles from './ErrorBoundary.module.css';

interface Props {
  /** Ends the session (Disconnect). The boundary clears its error afterwards. */
  onDisconnect: () => void;
  children: ReactNode;
}

interface State {
  failed: boolean;
}

/**
 * Catches an unexpected exception in the UI. It shows "Something went wrong" with Disconnect.
 * Nothing is logged or sent anywhere (design: Error Handling).
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  // Deliberately empty: the error is neither logged nor reported.
  override componentDidCatch(_error: Error, _info: ErrorInfo): void {}

  private readonly disconnect = (): void => {
    this.props.onDisconnect();
    this.setState({ failed: false });
  };

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <main className={styles.page}>
        <div role="alert" className={styles.panel}>
          <h1 className={styles.title}>Something went wrong</h1>
          <p>
            Ynot hit an unexpected problem. Disconnecting clears everything held in this tab and
            forgets any remembered token. Your token is not revoked in YNAB.
          </p>
          <Button className={styles.button} onPress={this.disconnect}>
            Disconnect
          </Button>
        </div>
      </main>
    );
  }
}
