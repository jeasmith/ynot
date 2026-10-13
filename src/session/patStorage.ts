/**
 * The only module that touches `localStorage` (Req 2.9–2.10, ADR 0006).
 * It reads, writes and deletes one key. Every call is wrapped so that
 * unavailable storage (private windows, blocked site data, previews) never throws.
 */
const KEY = 'ynot.pat';

/** Returns the Remembered PAT, or null when none is stored or storage is unavailable. */
export function readRememberedPat(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Remembers the PAT. If storage is unavailable this does nothing; callers can check with `readRememberedPat`. */
export function rememberPat(pat: string): void {
  try {
    localStorage.setItem(KEY, pat);
  } catch {
    // Storage unavailable: the connect screen reports that the token could not be remembered.
  }
}

/** Forgets the Remembered PAT. Never throws. */
export function forgetPat(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Storage unavailable: there is nothing to forget.
  }
}
