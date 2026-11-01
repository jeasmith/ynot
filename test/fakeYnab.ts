// A small in-memory YNAB simulator for tests (design: "Fake YNAB").
//
// It serves the endpoints Ynot uses, with `server_knowledge` and delta semantics, and is exposed
// two ways: `fetchImpl` (for `vp test`) and `routeHandler` (for Playwright's
// `page.route('https://api.ynab.com/**', fake.routeHandler)`). This module must not import
// `@playwright/test`: the route handler is typed structurally.
import type {
  Account,
  CategoryGroupWithCategories,
  SubTransaction,
  TransactionDetail,
  PlanSummary,
} from '../src/ynab/client.ts';
import { wireAccount, wireCategory, wireCategoryGroup } from './wire.ts';

const ORIGIN = 'https://api.ynab.com';
const MAX_MEMO_CODE_POINTS = 500;

// ---------------------------------------------------------------------------------------------
// Faults
// ---------------------------------------------------------------------------------------------

/** Which requests a fault may be consumed by. Defaults to any request. */
export type FaultTarget = 'any' | 'GET' | 'PATCH';

export type Fault = (
  | { kind: '429' }
  | { kind: '5xx'; status?: number }
  | { kind: '400'; detail?: string }
  /** The write is committed, then no response ever arrives (the client's timeout fires). */
  | { kind: 'timeoutAfterCommit' }
  /** The connection drops before the write is committed. */
  | { kind: 'dropBeforeCommit' }
  /** Someone edits a transaction in YNAB just before this request is handled, which then proceeds. */
  | { kind: 'externalEdit'; id: string; memo: string | null; planId?: string }
) & { on?: FaultTarget };

// ---------------------------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------------------------

export interface FakeSubTransactionInit {
  id: string;
  amount: number;
  memo?: string | null;
  categoryId?: string | null;
  payeeName?: string | null;
  transferTransactionId?: string | null;
  deleted?: boolean;
}

export interface FakeTransactionInit {
  id: string;
  date?: string;
  amount?: number;
  memo?: string | null;
  cleared?: 'cleared' | 'uncleared' | 'reconciled';
  approved?: boolean;
  accountId?: string;
  payeeName?: string | null;
  categoryId?: string | null;
  transferTransactionId?: string | null;
  flagColor?: TransactionDetail['flag_color'];
  subtransactions?: readonly FakeSubTransactionInit[];
  deleted?: boolean;
}

export interface FakeAccountInit {
  id: string;
  name?: string;
  onBudget?: boolean;
  closed?: boolean;
  deleted?: boolean;
}

export interface FakeCategoryGroupInit {
  id: string;
  name?: string;
  categories?: readonly { id: string; name?: string; deleted?: boolean; hidden?: boolean }[];
  deleted?: boolean;
}

export interface FakePlanInit {
  id: string;
  name?: string;
  firstMonth?: string;
  accounts?: readonly FakeAccountInit[];
  categoryGroups?: readonly FakeCategoryGroupInit[];
  transactions?: readonly FakeTransactionInit[];
}

export interface FakeYnabOptions {
  /** When set, every other bearer token gets a 401. By default any non-empty token is accepted. */
  token?: string;
  plans?: readonly FakePlanInit[];
}

// ---------------------------------------------------------------------------------------------
// Public shapes
// ---------------------------------------------------------------------------------------------

export interface RecordedRequest {
  readonly method: string;
  readonly url: string;
  readonly path: string;
  readonly query: Readonly<Record<string, string>>;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
  /** How the fake answered: an HTTP status, or what happened instead. */
  outcome: number | 'hang' | 'drop';
}

/** The slice of Playwright's `Route` that the fake uses. Playwright's own type satisfies it. */
export interface RouteLike {
  request(): {
    url(): string;
    method(): string;
    headers(): Record<string, string>;
    postData(): string | null;
  };
  fulfill(response: {
    status?: number;
    headers?: Record<string, string>;
    body?: string;
    contentType?: string;
  }): Promise<void>;
  abort(errorCode?: string): Promise<void>;
}

export interface FakeYnab {
  readonly fetchImpl: typeof fetch;
  readonly routeHandler: (route: RouteLike) => Promise<void>;
  /** Every request seen, in order (including faulted ones). */
  readonly requests: readonly RecordedRequest[];
  /** Requests that PATCHed transactions. */
  readonly patches: () => readonly RecordedRequest[];
  /** Queue per-request outcomes; each is consumed by the next request it matches. */
  queueFaults(...faults: Fault[]): void;
  clearFaults(): void;
  readonly pendingFaults: () => number;

  // Direct state changes, as if made in YNAB by someone else.
  addTransaction(planId: string, t: FakeTransactionInit): void;
  /** Replaces the fields given. `subtransactions` replaces the whole split (omitted ones are deleted). */
  updateTransaction(planId: string, id: string, patch: Partial<FakeTransactionInit>): void;
  deleteTransaction(planId: string, id: string): void;
  externalEdit(planId: string, id: string, memo: string | null): void;
  addAccount(planId: string, a: FakeAccountInit): void;
  updateAccount(planId: string, id: string, patch: Partial<FakeAccountInit>): void;
  addCategoryGroup(planId: string, g: FakeCategoryGroupInit): void;
  /** The current wire transaction, including a tombstone if deleted. */
  getTransaction(planId: string, id: string): TransactionDetail | undefined;
  serverKnowledge(planId: string): number;
}

// ---------------------------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------------------------

interface Stamped<T> {
  value: T;
  changedAt: number;
}

interface PlanState {
  id: string;
  name: string;
  firstMonth: string;
  knowledge: number;
  accounts: Map<string, Stamped<Account>>;
  groups: Map<string, Stamped<CategoryGroupWithCategories>>;
  transactions: Map<string, Stamped<TransactionDetail>>;
}

function toSub(parentId: string, s: FakeSubTransactionInit): SubTransaction {
  return {
    id: s.id,
    transaction_id: parentId,
    amount: s.amount,
    memo: s.memo ?? null,
    payee_id: null,
    payee_name: s.payeeName ?? null,
    category_id: s.categoryId ?? null,
    category_name: null,
    transfer_account_id: null,
    transfer_transaction_id: s.transferTransactionId ?? null,
    deleted: s.deleted ?? false,
  };
}

function toTransaction(t: FakeTransactionInit): TransactionDetail {
  return {
    id: t.id,
    date: t.date ?? '2024-01-15',
    amount: t.amount ?? -10_000,
    memo: t.memo === undefined ? null : t.memo,
    cleared: t.cleared ?? 'cleared',
    approved: t.approved ?? true,
    flag_color: t.flagColor ?? null,
    account_id: t.accountId ?? 'acc-1',
    account_name: t.accountId ?? 'acc-1',
    payee_id: null,
    payee_name: t.payeeName ?? null,
    category_id: t.categoryId ?? null,
    category_name: null,
    transfer_account_id: null,
    transfer_transaction_id: t.transferTransactionId ?? null,
    deleted: t.deleted ?? false,
    subtransactions: (t.subtransactions ?? []).map((s) => toSub(t.id, s)),
  };
}

function toAccount(a: FakeAccountInit): Account {
  return wireAccount({
    id: a.id,
    name: a.name ?? a.id,
    on_budget: a.onBudget ?? true,
    closed: a.closed ?? false,
    deleted: a.deleted ?? false,
  });
}

function toGroup(g: FakeCategoryGroupInit): CategoryGroupWithCategories {
  return wireCategoryGroup({
    id: g.id,
    name: g.name ?? g.id,
    deleted: g.deleted ?? false,
    categories: (g.categories ?? []).map((c) =>
      wireCategory({
        id: c.id,
        category_group_id: g.id,
        category_group_name: g.name ?? g.id,
        name: c.name ?? c.id,
        hidden: c.hidden ?? false,
        deleted: c.deleted ?? false,
      }),
    ),
  });
}

type Outcome =
  | { kind: 'response'; status: number; body?: unknown; headers?: Record<string, string> }
  | { kind: 'hang' }
  | { kind: 'drop' };

const CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, accept',
  'access-control-allow-methods': 'GET, PATCH, POST, PUT, OPTIONS',
  'cache-control': 'no-store',
};

function errorBody(id: string, name: string, detail: string) {
  return { error: { id, name, detail } };
}

const codePoints = (s: string) => Array.from(s).length;

function oneYearAgo(): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------------------------
// The fake
// ---------------------------------------------------------------------------------------------

export function createFakeYnab(options: FakeYnabOptions = {}): FakeYnab {
  const plans = new Map<string, PlanState>();
  const requests: RecordedRequest[] = [];
  const faults: Fault[] = [];

  const plan = (id: string): PlanState => {
    const p = plans.get(id);
    if (!p) throw new Error(`fakeYnab: unknown plan ${id}`);
    return p;
  };
  const bump = (p: PlanState): number => ++p.knowledge;

  function putTransaction(p: PlanState, t: TransactionDetail): void {
    p.transactions.set(t.id, { value: t, changedAt: bump(p) });
  }
  function seedPlan(init: FakePlanInit): void {
    const p: PlanState = {
      id: init.id,
      name: init.name ?? init.id,
      firstMonth: init.firstMonth ?? '2020-01-01',
      knowledge: 0,
      accounts: new Map(),
      groups: new Map(),
      transactions: new Map(),
    };
    plans.set(p.id, p);
    for (const a of init.accounts ?? [{ id: 'acc-1' }])
      p.accounts.set(a.id, { value: toAccount(a), changedAt: bump(p) });
    for (const g of init.categoryGroups ?? [])
      p.groups.set(g.id, { value: toGroup(g), changedAt: bump(p) });
    for (const t of init.transactions ?? []) putTransaction(p, toTransaction(t));
  }
  for (const init of options.plans ?? [{ id: 'plan-1' }]) seedPlan(init);

  // ---- direct mutations ----

  function updateTransaction(planId: string, id: string, patch: Partial<FakeTransactionInit>) {
    const p = plan(planId);
    const current = p.transactions.get(id)?.value;
    if (!current) throw new Error(`fakeYnab: unknown transaction ${id}`);
    const next: TransactionDetail = {
      ...current,
      ...(patch.date !== undefined && { date: patch.date }),
      ...(patch.amount !== undefined && { amount: patch.amount }),
      ...(patch.memo !== undefined && { memo: patch.memo }),
      ...(patch.cleared !== undefined && { cleared: patch.cleared }),
      ...(patch.approved !== undefined && { approved: patch.approved }),
      ...(patch.accountId !== undefined && { account_id: patch.accountId }),
      ...(patch.payeeName !== undefined && { payee_name: patch.payeeName }),
      ...(patch.categoryId !== undefined && { category_id: patch.categoryId }),
      ...(patch.transferTransactionId !== undefined && {
        transfer_transaction_id: patch.transferTransactionId,
      }),
      ...(patch.deleted !== undefined && { deleted: patch.deleted }),
    };
    let subtransactions = next.subtransactions;
    if (patch.subtransactions !== undefined) {
      // Lines that disappear from the split stay behind as deleted tombstones, as in YNAB deltas.
      const kept = new Set(patch.subtransactions.map((s) => s.id));
      const removed = current.subtransactions
        .filter((s) => !kept.has(s.id) && !s.deleted)
        .map((s) => ({ ...s, deleted: true }));
      subtransactions = [...patch.subtransactions.map((s) => toSub(id, s)), ...removed];
    }
    putTransaction(p, { ...next, subtransactions });
  }

  // ---- reads ----

  const visible = (p: PlanState, since: string | undefined) => (t: TransactionDetail) =>
    since === undefined || t.date >= since;

  function listTransactions(p: PlanState, query: Record<string, string>) {
    const last = query['last_knowledge_of_server'];
    const isDelta = last !== undefined;
    // Like YNAB, a missing since_date means one year ago, not the whole history.
    const since = query['since_date'] ?? oneYearAgo();
    const items: TransactionDetail[] = [];
    for (const { value, changedAt } of p.transactions.values()) {
      if (isDelta ? changedAt <= Number(last) : value.deleted) continue;
      if (!visible(p, since)(value)) continue;
      items.push(
        isDelta
          ? value
          : { ...value, subtransactions: value.subtransactions.filter((s) => !s.deleted) },
      );
    }
    return { transactions: items, server_knowledge: p.knowledge };
  }

  function listAccounts(p: PlanState, query: Record<string, string>) {
    const last = query['last_knowledge_of_server'];
    const items = [...p.accounts.values()]
      .filter((a) => (last === undefined ? !a.value.deleted : a.changedAt > Number(last)))
      .map((a) => a.value);
    return { accounts: items, server_knowledge: p.knowledge };
  }

  function listCategories(p: PlanState, query: Record<string, string>) {
    const last = query['last_knowledge_of_server'];
    const items = [...p.groups.values()]
      .filter((g) => (last === undefined ? !g.value.deleted : g.changedAt > Number(last)))
      .map((g) => g.value);
    return { category_groups: items, server_knowledge: p.knowledge };
  }

  // ---- writes ----

  function patch(p: PlanState, body: unknown): Outcome {
    const list =
      typeof body === 'object' && body !== null
        ? (body as { transactions?: unknown }).transactions
        : undefined;
    if (!Array.isArray(list)) {
      return {
        kind: 'response',
        status: 400,
        body: errorBody('400', 'bad_request', 'transactions is required'),
      };
    }
    const items = list as { id?: unknown; memo?: unknown; approved?: unknown }[];
    // All or nothing: validate the whole request first.
    for (const item of items) {
      if (typeof item.id !== 'string' || !p.transactions.get(item.id)) {
        return {
          kind: 'response',
          status: 404,
          body: errorBody('404.2', 'resource_not_found', 'transaction not found'),
        };
      }
      if (typeof item.memo === 'string' && codePoints(item.memo) > MAX_MEMO_CODE_POINTS) {
        return {
          kind: 'response',
          status: 400,
          body: errorBody(
            '400',
            'bad_request',
            `memo: must be ${MAX_MEMO_CODE_POINTS} characters or less`,
          ),
        };
      }
    }
    const knowledge = bump(p);
    const saved: TransactionDetail[] = [];
    for (const item of items) {
      const current = p.transactions.get(item.id as string)!.value;
      const next: TransactionDetail = {
        ...current,
        ...(item.memo !== undefined && { memo: item.memo as string | null }),
        // YNAB defaults an omitted `approved` to false.
        approved: typeof item.approved === 'boolean' ? item.approved : false,
      };
      p.transactions.set(next.id, { value: next, changedAt: knowledge });
      saved.push(next);
    }
    return {
      kind: 'response',
      status: 200,
      body: {
        data: {
          transaction_ids: saved.map((t) => t.id),
          transactions: saved,
          duplicate_import_ids: [],
          server_knowledge: knowledge,
        },
      },
    };
  }

  // ---- request handling ----

  function takeFault(method: string): Fault | undefined {
    const index = faults.findIndex((f) => (f.on ?? 'any') === 'any' || f.on === method);
    return index === -1 ? undefined : faults.splice(index, 1)[0];
  }

  function handle(record: RecordedRequest): Outcome {
    const method = record.method;
    if (method === 'OPTIONS') return { kind: 'response', status: 204 };

    const bearer = /^Bearer (.+)$/.exec(record.headers['authorization'] ?? '')?.[1];
    if (!bearer || (options.token !== undefined && bearer !== options.token)) {
      return {
        kind: 'response',
        status: 401,
        body: errorBody('401', 'unauthorized', 'Unauthorized'),
      };
    }

    const fault = takeFault(method);
    if (fault?.kind === 'externalEdit') {
      const planId = fault.planId ?? [...plans.keys()][0]!;
      updateTransaction(planId, fault.id, { memo: fault.memo });
    } else if (fault?.kind === '429') {
      return {
        kind: 'response',
        status: 429,
        body: errorBody('429', 'too_many_requests', 'Too many requests'),
      };
    } else if (fault?.kind === '5xx') {
      const status = fault.status ?? 503;
      return {
        kind: 'response',
        status,
        body: errorBody(String(status), 'server_error', 'Server error'),
      };
    } else if (fault?.kind === '400') {
      return {
        kind: 'response',
        status: 400,
        body: errorBody('400', 'bad_request', fault.detail ?? 'Bad request'),
      };
    } else if (fault?.kind === 'dropBeforeCommit') {
      return { kind: 'drop' };
    }

    const segments = record.path.split('/').filter(Boolean); // ['v1','plans',id,...]
    const notFound: Outcome = {
      kind: 'response',
      status: 404,
      body: errorBody('404.2', 'resource_not_found', 'Resource not found'),
    };
    if (segments[0] !== 'v1' || segments[1] !== 'plans') return notFound;

    if (segments.length === 2 && method === 'GET') {
      const summaries: PlanSummary[] = [...plans.values()].map((p) => ({
        id: p.id,
        name: p.name,
        last_modified_on: '2024-01-01T00:00:00Z',
        first_month: p.firstMonth,
        last_month: '2030-01-01',
        currency_format: null,
      }));
      return {
        kind: 'response',
        status: 200,
        body: { data: { plans: summaries, default_plan: null } },
      };
    }

    const p = plans.get(decodeURIComponent(segments[2] ?? ''));
    if (!p) return notFound;
    const resource = segments[3];
    if (segments.length === 4 && method === 'GET') {
      if (resource === 'accounts') return ok(listAccounts(p, record.query));
      if (resource === 'categories') return ok(listCategories(p, record.query));
      if (resource === 'transactions') return ok(listTransactions(p, record.query));
    }
    if (segments.length === 4 && resource === 'transactions' && method === 'PATCH') {
      const outcome = patch(p, record.body);
      if (
        fault?.kind === 'timeoutAfterCommit' &&
        outcome.kind === 'response' &&
        outcome.status === 200
      ) {
        return { kind: 'hang' };
      }
      return outcome;
    }
    return notFound;
  }

  function ok(data: unknown): Outcome {
    return { kind: 'response', status: 200, body: { data } };
  }

  function record(method: string, url: string, headers: Record<string, string>, body: unknown) {
    const parsed = new URL(url);
    const query: Record<string, string> = {};
    for (const [k, v] of parsed.searchParams) query[k] = v;
    const lower: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
    const rec: RecordedRequest = {
      method: method.toUpperCase(),
      url,
      path: parsed.pathname,
      query,
      headers: lower,
      body,
      outcome: 0,
    };
    requests.push(rec);
    return rec;
  }

  function run(rec: RecordedRequest): Outcome {
    if (new URL(rec.url).origin !== ORIGIN) {
      // The fake only plays YNAB. Anything else is a network failure.
      rec.outcome = 'drop';
      return { kind: 'drop' };
    }
    const outcome = handle(rec);
    rec.outcome = outcome.kind === 'response' ? outcome.status : outcome.kind;
    return outcome;
  }

  const parseBody = (text: string | null | undefined): unknown => {
    if (!text) return undefined;
    try {
      return JSON.parse(text);
    } catch {
      return undefined;
    }
  };

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const isRequest = typeof input === 'object' && 'url' in input;
    const url = isRequest ? input.url : String(input);
    const method = init?.method ?? (isRequest ? input.method : 'GET');
    const headers: Record<string, string> = {};
    new Headers(init?.headers ?? (isRequest ? input.headers : undefined)).forEach((v, k) => {
      headers[k] = v;
    });
    const bodyText = typeof init?.body === 'string' ? init.body : undefined;
    const signal = init?.signal ?? undefined;
    if (signal?.aborted) throw signal.reason;

    const outcome = run(record(method, url, headers, parseBody(bodyText)));
    if (outcome.kind === 'drop') throw new TypeError('Failed to fetch');
    if (outcome.kind === 'hang') {
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    }
    if (signal?.aborted) throw signal.reason;
    const text = outcome.body === undefined ? null : JSON.stringify(outcome.body);
    return new Response(outcome.status === 204 ? null : text, {
      status: outcome.status,
      headers: { 'content-type': 'application/json', ...CORS_HEADERS, ...outcome.headers },
    });
  }) as typeof fetch;

  const routeHandler = async (route: RouteLike): Promise<void> => {
    const req = route.request();
    const rec = record(req.method(), req.url(), req.headers(), parseBody(req.postData()));
    const outcome = run(rec);
    if (outcome.kind === 'drop') return route.abort('connectionfailed');
    // Never answer, so the client's own timeout fires, as with `fetchImpl`.
    if (outcome.kind === 'hang') return new Promise<void>(() => {});
    await route.fulfill({
      status: outcome.status,
      contentType: 'application/json',
      headers: { ...CORS_HEADERS, ...outcome.headers },
      body:
        outcome.status === 204 || outcome.body === undefined ? '' : JSON.stringify(outcome.body),
    });
  };

  return {
    fetchImpl,
    routeHandler,
    requests,
    patches: () => requests.filter((r) => r.method === 'PATCH'),
    queueFaults: (...f) => void faults.push(...f),
    clearFaults: () => void (faults.length = 0),
    pendingFaults: () => faults.length,
    addTransaction: (planId, t) => putTransaction(plan(planId), toTransaction(t)),
    updateTransaction,
    deleteTransaction: (planId, id) => updateTransaction(planId, id, { deleted: true }),
    externalEdit: (planId, id, memo) => updateTransaction(planId, id, { memo }),
    addAccount: (planId, a) => {
      const p = plan(planId);
      p.accounts.set(a.id, { value: toAccount(a), changedAt: bump(p) });
    },
    updateAccount: (planId, id, patch) => {
      const p = plan(planId);
      const current = p.accounts.get(id)?.value;
      if (!current) throw new Error(`fakeYnab: unknown account ${id}`);
      p.accounts.set(id, {
        value: {
          ...current,
          ...(patch.name !== undefined && { name: patch.name }),
          ...(patch.onBudget !== undefined && { on_budget: patch.onBudget }),
          ...(patch.closed !== undefined && { closed: patch.closed }),
          ...(patch.deleted !== undefined && { deleted: patch.deleted }),
        },
        changedAt: bump(p),
      });
    },
    addCategoryGroup: (planId, g) => {
      const p = plan(planId);
      p.groups.set(g.id, { value: toGroup(g), changedAt: bump(p) });
    },
    getTransaction: (planId, id) => plan(planId).transactions.get(id)?.value,
    serverKnowledge: (planId) => plan(planId).knowledge,
  };
}
