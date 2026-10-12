import type { YnabFailure } from '../ynab/errors.ts';

/**
 * Readable text for a YNAB failure. It is built only from the failure kind and YNAB's own error
 * detail, so it can never echo the token (design: Error Handling).
 *
 * `during` chooses the wording where the same failure means different things: on connect a 401
 * means the typed or Remembered PAT is bad; mid-session it means the token may have been revoked.
 */
export function describeFailure(
  failure: YnabFailure,
  during: 'connect' | 'load' | 'session' = 'connect',
): string {
  switch (failure.kind) {
    case 'unauthorized':
      return during === 'session'
        ? 'Your token may have been revoked.'
        : 'YNAB rejected this token. It may be invalid or revoked.';
    case 'forbidden':
      return failure.id === 'data_limit_reached'
        ? 'YNAB refused the request because a data limit was reached.'
        : 'YNAB refused access to this request.';
    case 'notFound':
      return during === 'session'
        ? 'This budget is no longer available.'
        : 'YNAB could not find what was requested.';
    case 'rejected':
      return `YNAB refused the request: ${failure.detail}`;
    case 'rateLimited':
      return 'YNAB is limiting requests right now. Wait a little and try again.';
    case 'server':
      return `YNAB had a problem on its side (HTTP ${failure.status}). Try again shortly.`;
    case 'network':
      return 'Ynot could not reach YNAB. Check your connection and try again.';
    case 'timeout':
      return 'YNAB took too long to respond. Try again.';
    case 'cancelled':
      return 'The request was cancelled.';
  }
}
