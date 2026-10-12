// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { ConnectScreen } from './ConnectScreen.tsx';

afterEach(cleanup);

const TOKEN = 'super-secret-token-123';

function typeToken(value: string) {
  fireEvent.change(screen.getByLabelText('YNAB personal access token'), { target: { value } });
}

describe('ConnectScreen', () => {
  it('has a token field and a Remember checkbox that is off by default', () => {
    render(<ConnectScreen onConnect={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Connect to YNAB' })).toBeTruthy();
    expect(screen.getByLabelText('YNAB personal access token')).toBeTruthy();
    const remember = screen.getByRole('checkbox', { name: 'Remember on this device' });
    expect((remember as HTMLInputElement).checked).toBe(false);
  });

  it('describes the fields with their hints and warns before opening a new tab', () => {
    render(<ConnectScreen onConnect={vi.fn()} />);
    const describedBy = (element: HTMLElement): string =>
      (element.getAttribute('aria-describedby') ?? '')
        .split(' ')
        .map((id) => document.getElementById(id)?.textContent ?? '')
        .join(' ');
    expect(describedBy(screen.getByLabelText('YNAB personal access token'))).toContain(
      'Developer Settings',
    );
    expect(
      describedBy(screen.getByRole('checkbox', { name: 'Remember on this device' })),
    ).toContain('Off by default');
    expect(
      screen.getByRole('link', { name: 'your YNAB account (opens in a new tab)' }),
    ).toBeTruthy();
  });

  it('keeps Connect disabled until a token is entered', () => {
    render(<ConnectScreen onConnect={vi.fn()} />);
    const connect = screen.getByRole('button', { name: 'Connect' });
    expect((connect as HTMLButtonElement).disabled).toBe(true);
    typeToken('  ');
    expect((connect as HTMLButtonElement).disabled).toBe(true);
    typeToken(TOKEN);
    expect((connect as HTMLButtonElement).disabled).toBe(false);
  });

  it('connects without remembering by default, passing the trimmed token', () => {
    const onConnect = vi.fn();
    render(<ConnectScreen onConnect={onConnect} />);
    typeToken(`  ${TOKEN}  `);
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    expect(onConnect).toHaveBeenCalledExactlyOnceWith(TOKEN, false);
  });

  it('connects with remembering when the box is ticked', () => {
    const onConnect = vi.fn();
    render(<ConnectScreen onConnect={onConnect} />);
    typeToken(TOKEN);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Remember on this device' }));
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    expect(onConnect).toHaveBeenCalledExactlyOnceWith(TOKEN, true);
  });

  it('submits from the keyboard with Enter in the token field', () => {
    const onConnect = vi.fn();
    render(<ConnectScreen onConnect={onConnect} />);
    typeToken(TOKEN);
    fireEvent.submit(screen.getByLabelText('YNAB personal access token').closest('form')!);
    expect(onConnect).toHaveBeenCalledExactlyOnceWith(TOKEN, false);
  });

  it('explains privacy, including that a Remembered PAT grants full access until revoked', () => {
    render(<ConnectScreen onConnect={vi.fn()} />);
    const privacy = screen.getByRole('region', { name: 'Privacy' });
    expect(privacy.textContent).toContain(
      'grants full access to your YNAB account until you revoke it',
    );
    expect(privacy.textContent).toContain('api.ynab.com');
    expect(privacy.textContent).toContain('trusting your device');
  });

  it('explains an unauthorized token without echoing anything', () => {
    render(<ConnectScreen notice="unauthorized" onConnect={vi.fn()} />);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('YNAB rejected this token');
    expect(alert.textContent).toContain('remembered token has been deleted');
  });

  it('shows a non-401 connect failure and never echoes the typed token', () => {
    const { rerender } = render(<ConnectScreen onConnect={vi.fn()} />);
    typeToken(TOKEN);
    rerender(<ConnectScreen failure={{ kind: 'network' }} onConnect={vi.fn()} />);
    expect(screen.getByRole('alert').textContent).toContain('could not reach YNAB');
    expect(document.body.textContent).not.toContain(TOKEN);
  });

  it('says so after a disconnect', () => {
    render(<ConnectScreen notice="disconnected" onConnect={vi.fn()} />);
    expect(screen.getByRole('status').textContent).toContain('Disconnected');
  });

  it('says the token could not be remembered', () => {
    render(<ConnectScreen notice="rememberFailed" onConnect={vi.fn()} />);
    expect(screen.getByRole('status').textContent).toContain('could not be remembered');
  });
});
