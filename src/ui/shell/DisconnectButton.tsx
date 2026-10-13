import {
  Button,
  Dialog,
  DialogTrigger,
  Heading,
  Link,
  Modal,
  ModalOverlay,
} from 'react-aria-components';
import styles from './DisconnectButton.module.css';

export const YNAB_DEVELOPER_SETTINGS_URL = 'https://app.ynab.com/settings/developer';

interface Props {
  onDisconnect: () => void;
  /** A Write Operation has requests already sent to YNAB (Req 2.6). Slice 2 supplies this. */
  writeInFlight?: boolean;
}

/**
 * Disconnect behind a confirmation. The dialog states that the PAT is not revoked, that a
 * remembered token is forgotten, links to YNAB Developer Settings (Req 2.5), and warns when sent
 * write requests may still land (Req 2.6). Confirming never waits for them.
 */
export function DisconnectButton({ onDisconnect, writeInFlight = false }: Props) {
  return (
    <DialogTrigger>
      <Button className={styles.trigger}>Disconnect</Button>
      <ModalOverlay className={styles.overlay} isDismissable>
        <Modal className={styles.modal}>
          <Dialog className={styles.dialog} role="alertdialog">
            {({ close }) => (
              <>
                <Heading slot="title" className={styles.title}>
                  Disconnect from YNAB?
                </Heading>
                <p>
                  Disconnecting clears all budget data held in this tab and forgets any token
                  remembered on this device. It does not revoke your personal access token in YNAB.
                  If you suspect your token was compromised, revoke it in{' '}
                  <Link
                    href={YNAB_DEVELOPER_SETTINGS_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    YNAB Developer Settings <span className="sr-only">(opens in a new tab)</span>
                  </Link>
                  .
                </p>
                {writeInFlight && (
                  <p role="alert" className={styles.warning}>
                    A write operation has requests already sent to YNAB. They may still take effect
                    in YNAB after the session clears, with no verification, results or undo.
                  </p>
                )}
                <div className={styles.actions}>
                  <Button className={styles.secondary} onPress={close}>
                    Cancel
                  </Button>
                  <Button
                    className={styles.danger}
                    onPress={() => {
                      close();
                      onDisconnect();
                    }}
                  >
                    Yes, disconnect
                  </Button>
                </div>
              </>
            )}
          </Dialog>
        </Modal>
      </ModalOverlay>
    </DialogTrigger>
  );
}
