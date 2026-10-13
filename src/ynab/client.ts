import type { IsoDate } from '../domain/model.ts';
import { abortFailure, classifyResponse, YnabError } from './errors.ts';
import type { components } from './openapi.generated.ts';

// Wire shapes are YNAB API v1.87.0 (snake_case), generated from `openapi/ynab-1.87.0.yaml` by
// `vp run gen:ynab`. They are mapped to the domain in `map.ts`.
type Schemas = components['schemas'];

export type CurrencyFormat = Schemas['CurrencyFormat'];
export type PlanSummary = Schemas['PlanSummary'];
export type Account = Schemas['Account'];
export type Category = Schemas['Category'];
export type CategoryGroupWithCategories = Schemas['CategoryGroupWithCategories'];
export type SubTransaction = Schemas['SubTransaction'];
export type TransactionDetail = Schemas['TransactionDetail'];
export type SaveTransactionsResponse = Schemas['SaveTransactionsResponse']['data'];

/** A list response plus the cursor to pass back as `lastKnowledge`. */
export interface Delta<T> {
  readonly items: readonly T[];
  readonly serverKnowledge: number;
}

export interface RequestOptions {
  readonly signal?: AbortSignal;
}

export interface YnabClient {
  listPlans(opts?: RequestOptions): Promise<PlanSummary[]>;
  getAccounts(
    planId: string,
    q: { lastKnowledge?: number },
    opts?: RequestOptions,
  ): Promise<Delta<Account>>;
  getCategories(
    planId: string,
    q: { lastKnowledge?: number },
    opts?: RequestOptions,
  ): Promise<Delta<CategoryGroupWithCategories>>;
  getTransactions(
    planId: string,
    q: { sinceDate: IsoDate; lastKnowledge?: number },
    opts?: RequestOptions,
  ): Promise<Delta<TransactionDetail>>;
  patchTransactions(
    planId: string,
    items: readonly { id: string; memo: string | null; approved: boolean }[],
    opts?: RequestOptions,
  ): Promise<SaveTransactionsResponse>;
  dispose(): void; // aborts in-flight requests, drops the token
}

export const YNAB_ORIGIN = 'https://api.ynab.com';
const BASE_URL = `${YNAB_ORIGIN}/v1`;
const DEFAULT_TIMEOUT_MS = 35_000;

// Private abort reasons. Only TIMEOUT_REASON classifies as `timeout`; a caller cannot forge it.
const TIMEOUT_REASON: object = Object.freeze({ reason: 'ynot-ynab-timeout' });
const CANCEL_REASON: object = Object.freeze({ reason: 'ynot-ynab-cancel' });

/** Throws unless `url` is on the YNAB origin. Called before any header is attached (Req 1.4). */
export function assertYnabOrigin(url: string): void {
  let origin: string;
  try {
    origin = new URL(url).origin;
  } catch {
    throw new Error('Refusing to send a request: the URL is not valid');
  }
  if (origin !== YNAB_ORIGIN) {
    throw new Error(`Refusing to send a request outside ${YNAB_ORIGIN}`);
  }
}

function buildUrl(path: string, query: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const qs = params.toString();
  return `${BASE_URL}${path}${qs === '' ? '' : `?${qs}`}`;
}

const planPath = (planId: string) => `/plans/${encodeURIComponent(planId)}`;

export function createYnabClient(
  pat: string,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): YnabClient {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  // The token lives only in this closure; `dispose` drops it.
  let token: string | null = pat;
  const disposal = new AbortController();

  async function request(
    method: 'GET' | 'PATCH',
    url: string,
    body: unknown,
    callerSignal: AbortSignal | undefined,
  ): Promise<unknown> {
    assertYnabOrigin(url);
    const bearer = token;
    if (bearer === null || disposal.signal.aborted || callerSignal?.aborted) {
      throw new YnabError({ kind: 'cancelled' });
    }

    const controller = new AbortController();
    const cancel = () => controller.abort(CANCEL_REASON);
    disposal.signal.addEventListener('abort', cancel, { once: true });
    callerSignal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(() => controller.abort(TIMEOUT_REASON), timeoutMs);

    const aborted = () =>
      controller.signal.aborted
        ? new YnabError(abortFailure(controller.signal.reason, TIMEOUT_REASON))
        : null;

    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${bearer}`,
        Accept: 'application/json',
      };
      if (body !== undefined) headers['Content-Type'] = 'application/json';

      let status: number;
      let text: string;
      try {
        const doFetch = opts.fetchImpl ?? ((input, init) => fetch(input, init));
        const response = await doFetch(url, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          cache: 'no-store',
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
          mode: 'cors',
          signal: controller.signal,
        });
        status = response.status;
        text = await response.text();
      } catch {
        throw aborted() ?? new YnabError({ kind: 'network' });
      }
      // A response that was already resolving when the abort landed is discarded.
      const abortedError = aborted();
      if (abortedError) throw abortedError;

      let parsed: unknown;
      try {
        parsed = text === '' ? undefined : JSON.parse(text);
      } catch {
        parsed = undefined;
        if (status >= 200 && status < 300) throw new YnabError({ kind: 'server', status });
      }
      if (status < 200 || status >= 300) throw new YnabError(classifyResponse(status, parsed));
      return parsed;
    } finally {
      clearTimeout(timer);
      disposal.signal.removeEventListener('abort', cancel);
      callerSignal?.removeEventListener('abort', cancel);
    }
  }

  /** Sends the request and returns the `data` envelope. */
  async function requestData<T>(
    method: 'GET' | 'PATCH',
    path: string,
    query: Record<string, string | number | undefined>,
    body: unknown,
    requestOpts: RequestOptions | undefined,
  ): Promise<T> {
    const parsed = await request(method, buildUrl(path, query), body, requestOpts?.signal);
    const data =
      typeof parsed === 'object' && parsed !== null
        ? (parsed as { data?: unknown }).data
        : undefined;
    if (typeof data !== 'object' || data === null) {
      throw new YnabError({ kind: 'server', status: 200 });
    }
    return data as T;
  }

  async function getDelta<T>(
    path: string,
    listKey: string,
    query: Record<string, string | number | undefined>,
    requestOpts: RequestOptions | undefined,
  ): Promise<Delta<T>> {
    const data = await requestData<Record<string, unknown>>(
      'GET',
      path,
      query,
      undefined,
      requestOpts,
    );
    const items = data[listKey];
    const serverKnowledge = data['server_knowledge'];
    if (!Array.isArray(items) || typeof serverKnowledge !== 'number') {
      throw new YnabError({ kind: 'server', status: 200 });
    }
    return { items: items as T[], serverKnowledge };
  }

  return {
    async listPlans(requestOpts) {
      const data = await requestData<{ plans?: unknown }>(
        'GET',
        '/plans',
        { include_accounts: 'false' },
        undefined,
        requestOpts,
      );
      if (!Array.isArray(data.plans)) throw new YnabError({ kind: 'server', status: 200 });
      return data.plans as PlanSummary[];
    },
    getAccounts(planId, q, requestOpts) {
      return getDelta<Account>(
        `${planPath(planId)}/accounts`,
        'accounts',
        { last_knowledge_of_server: q.lastKnowledge },
        requestOpts,
      );
    },
    getCategories(planId, q, requestOpts) {
      return getDelta<CategoryGroupWithCategories>(
        `${planPath(planId)}/categories`,
        'category_groups',
        { last_knowledge_of_server: q.lastKnowledge },
        requestOpts,
      );
    },
    getTransactions(planId, q, requestOpts) {
      return getDelta<TransactionDetail>(
        `${planPath(planId)}/transactions`,
        'transactions',
        { since_date: q.sinceDate, last_knowledge_of_server: q.lastKnowledge },
        requestOpts,
      );
    },
    patchTransactions(planId, items, requestOpts) {
      return requestData<SaveTransactionsResponse>(
        'PATCH',
        `${planPath(planId)}/transactions`,
        {},
        { transactions: items },
        requestOpts,
      );
    },
    dispose() {
      token = null;
      disposal.abort();
    },
  };
}
