// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { ErrorBoundary } from './ErrorBoundary.tsx';

afterEach(cleanup);

let explode = false;

function Boom() {
  if (explode) throw new Error('kaboom');
  return <p>fine</p>;
}

describe('ErrorBoundary', () => {
  it('renders children when nothing throws', () => {
    explode = false;
    render(
      <ErrorBoundary onDisconnect={vi.fn()}>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText('fine')).toBeTruthy();
  });

  it('shows Something went wrong with Disconnect, and recovers once disconnected', () => {
    explode = true;
    // React reports the caught error to the console; keep the test output clean.
    const spy = vi.spyOn(globalThis.console, 'error').mockImplementation(() => undefined);
    // Disconnecting ends the session, so the broken view is no longer rendered.
    const onDisconnect = vi.fn(() => {
      explode = false;
    });
    render(
      <ErrorBoundary onDisconnect={onDisconnect}>
        <Boom />
      </ErrorBoundary>,
    );
    spy.mockRestore();
    expect(screen.getByRole('alert').textContent).toContain('Something went wrong');
    expect(document.body.textContent).not.toContain('kaboom');
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    expect(onDisconnect).toHaveBeenCalledOnce();
    expect(screen.getByText('fine')).toBeTruthy();
  });
});
