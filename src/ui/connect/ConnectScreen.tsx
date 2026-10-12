import { useState, type FormEvent } from 'react';
import { Button, Checkbox, Form, Input, Label, Link, Text, TextField } from 'react-aria-components';
import type { AppPhase } from '../../session/store.ts';
import { describeFailure } from '../failureText.ts';
import { YNAB_DEVELOPER_SETTINGS_URL } from '../shell/DisconnectButton.tsx';
import { useFocusOnMount } from '../useFocusOnMount.ts';
import styles from './ConnectScreen.module.css';

type DisconnectedPhase = Extract<AppPhase, { phase: 'disconnected' }>;

interface Props {
  /** Why the app is disconnected, if it is worth saying (Req 2.10, 3.7). */
  notice?: DisconnectedPhase['notice'];
  failure?: DisconnectedPhase['failure'];
  onConnect: (pat: string, remember: boolean) => void;
}

function Notice({ notice, failure }: Pick<Props, 'notice' | 'failure'>) {
  if (notice === 'unauthorized') {
    return (
      <p role="alert" className={styles.error}>
        YNAB rejected this token. It was revoked or is invalid, and any remembered token has been
        deleted. Enter a new token to connect.
      </p>
    );
  }
  if (failure !== undefined) {
    return (
      <p role="alert" className={styles.error}>
        Could not connect to YNAB. {describeFailure(failure, 'connect')}
      </p>
    );
  }
  if (notice === 'rememberFailed') {
    return (
      <p role="status" className={styles.info}>
        The token could not be remembered on this device.
      </p>
    );
  }
  if (notice === 'disconnected') {
    return (
      <p role="status" className={styles.info}>
        Disconnected. Local data was cleared and any remembered token was forgotten.
      </p>
    );
  }
  return null;
}

/** PAT entry with an opt-in `Remember on this device` and the privacy explanation (Req 1.10, 2.9). */
export function ConnectScreen({ notice, failure, onConnect }: Props) {
  const [pat, setPat] = useState('');
  const [remember, setRemember] = useState(false);
  const trimmed = pat.trim();
  const titleRef = useFocusOnMount<HTMLHeadingElement>([]);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (trimmed === '') return;
    onConnect(trimmed, remember);
  };

  return (
    <main className={styles.page}>
      <h1 ref={titleRef} tabIndex={-1} className={styles.title}>
        Connect to YNAB
      </h1>
      <p className={styles.lead}>
        Ynot reads and tags your YNAB transactions directly from this browser. Paste a personal
        access token to begin.
      </p>

      <Notice
        {...(notice !== undefined && { notice })}
        {...(failure !== undefined && { failure })}
      />

      <Form className={styles.form} onSubmit={submit}>
        <TextField
          className={styles.field}
          value={pat}
          onChange={setPat}
          type="password"
          autoComplete="off"
          isRequired
        >
          <Label className={styles.label}>YNAB personal access token</Label>
          <Input className={styles.input} spellCheck={false} autoCapitalize="off" />
          <Text slot="description" className={styles.hint}>
            Create one under Developer Settings in{' '}
            <Link href={YNAB_DEVELOPER_SETTINGS_URL} target="_blank" rel="noopener noreferrer">
              your YNAB account <span className="sr-only">(opens in a new tab)</span>
            </Link>
            .
          </Text>
        </TextField>

        <Checkbox
          className={styles.checkbox}
          isSelected={remember}
          onChange={setRemember}
          aria-describedby="remember-hint"
        >
          <div className={styles.box} aria-hidden="true">
            <svg className={styles.tick} viewBox="0 0 16 16" focusable="false">
              <path d="M3.5 8.5l3 3 6-6" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
          </div>
          Remember on this device
        </Checkbox>
        <p id="remember-hint" className={styles.hint}>
          Off by default. A remembered token is stored in this browser on this device and grants
          full access to your YNAB account until you revoke it.
        </p>

        <Button type="submit" className={styles.submit} isDisabled={trimmed === ''}>
          Connect
        </Button>
      </Form>

      <section aria-labelledby="privacy-heading" className={styles.privacy}>
        <h2 id="privacy-heading" className={styles.privacyTitle}>
          Privacy
        </h2>
        <p>
          Ynot has no backend, account or login. Your token and your financial data go only from
          this page to api.ynab.com. The static host that serves Ynot sees ordinary request
          metadata, such as your IP address and the files requested, but never your token or your
          financial data. Data is kept only in this tab&rsquo;s memory and is discarded when you
          reload, close the tab or disconnect.
        </p>
        <p>
          You are trusting your device, your browser and any privileged extensions, the dedicated
          domain Ynot runs on, its deployment account and build pipeline, and the dependencies
          bundled into it. Ynot cannot protect you if any of these is compromised.
        </p>
        <p>
          If you choose <strong>Remember on this device</strong>, the token is stored on this device
          and grants full access to your YNAB account until you revoke it. Disconnecting forgets it
          here but does not revoke it in YNAB.
        </p>
      </section>
    </main>
  );
}
