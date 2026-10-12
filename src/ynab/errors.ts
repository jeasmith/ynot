export type YnabFailure =
  | { kind: 'unauthorized' } // 401
  | { kind: 'forbidden'; id?: string } // 403 incl. data_limit_reached
  | { kind: 'notFound' } // 404
  | { kind: 'rejected'; detail: string } // 400
  | { kind: 'rateLimited' } // 429
  | { kind: 'server'; status: number } // 5xx
  | { kind: 'network' } // fetch threw before a response
  | { kind: 'timeout' } // client abort after 35 s
  | { kind: 'cancelled' }; // aborted by dispose or the session's signal

/** What `YnabClient` methods reject with. The message never carries request or token details. */
export class YnabError extends Error {
  readonly failure: YnabFailure;

  constructor(failure: YnabFailure) {
    super(`YNAB request failed: ${failure.kind}`);
    this.name = 'YnabError';
    this.failure = failure;
  }
}

/** The failure carried by a `YnabError`, or `null` for any other thrown value. */
export function ynabFailureOf(error: unknown): YnabFailure | null {
  return error instanceof YnabError ? error.failure : null;
}

function errorField(body: unknown, field: 'id' | 'detail'): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const error = (body as { error?: unknown }).error;
  if (typeof error !== 'object' || error === null) return undefined;
  const value = (error as Record<string, unknown>)[field];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/** Classifies a non-success HTTP status. `body` is the parsed JSON body, if any. */
export function classifyResponse(status: number, body: unknown): YnabFailure {
  if (status === 401) return { kind: 'unauthorized' };
  if (status === 403) {
    const id = errorField(body, 'id');
    return id === undefined ? { kind: 'forbidden' } : { kind: 'forbidden', id };
  }
  if (status === 404) return { kind: 'notFound' };
  if (status === 429) return { kind: 'rateLimited' };
  if (status >= 500) return { kind: 'server', status };
  // 400, and any other non-success status (for example 409): YNAB refused the request.
  return {
    kind: 'rejected',
    detail: errorField(body, 'detail') ?? `YNAB refused the request (HTTP ${status})`,
  };
}

/**
 * Classifies an abort by its reason. Only the client's private timeout reason is a `timeout`;
 * every other abort (dispose, the session signal, anything else) is `cancelled` (Req 18.9).
 */
export function abortFailure(reason: unknown, timeoutReason: unknown): YnabFailure {
  return reason === timeoutReason ? { kind: 'timeout' } : { kind: 'cancelled' };
}
