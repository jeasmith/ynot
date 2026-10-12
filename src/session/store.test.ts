import fc from 'fast-check';
import { describe, expect, it, vi } from 'vite-plus/test';
import { createFakeYnab, type FakePlanInit } from '../../test/fakeYnab.ts';
import type { TagIdentity } from '../domain/grammar/identity.ts';
import type { TransactionId } from '../domain/model.ts';
import type { TagIndex } from '../domain/tags/tagIndex.ts';
import { createYnabClient, type YnabClient } from '../ynab/client.ts';
import { createSessionStore, type AppPhase, type PatStorage } from './store.ts';

// ---- helpers ----

function memoryPatStorage(initial: string | null = null, writable = true) {
  let stored = initial;
  const storage: PatStorage = {
    read: () => stored,
    remember: (pat) => {
      if (writable) stored = pat;
    },
    forget: () => {
      stored = null;
    },
  };
  return { storage, held: () => stored };
}

const emptyIndex = (): TagIndex => ({ byIdentity: new Map(), membership: new Map() });

const PLANS: FakePlanInit[] = [
  {
    id: 'p1',
    name: 'Household',
    firstMonth: '2020-01-01',
    accounts: [{ id: 'a1' }],
    categoryGroups: [{ id: 'g1', categories: [{ id: 'c1' }] }],
    transactions: [
      { id: 't1', accountId: 'a1', categoryId: 'c1', memo: 'shop #food' },
      { id: 't2', accountId: 'a1', categoryId: 'c1', memo: null },
    ],
  },
  { id: 'p2', name: 'Other', accounts: [{ id: 'b1' }], transactions: [] },
];

interface SetupOptions {
  token?: string;
  plans?: FakePlanInit[];
  remembered?: string | null;
  writable?: boolean;
  fetchImpl?: (fake: typeof fetch) => typeof fetch;
  gated?: boolean;
}

/** A client that can hold read calls and ignores their signal, to prove the stale-result guard. */
function setup(opts: SetupOptions = {}) {
  const fake = createFakeYnab({
    plans: opts.plans ?? PLANS,
    ...(opts.token !== undefined && { token: opts.token }),
  });
  const pat = memoryPatStorage(opts.remembered ?? null, opts.writable ?? true);
  const build = vi.fn((_t: unknown, _p: unknown) => emptyIndex());
  const markers = vi.fn((_i: unknown) => new Map());
  let clock = 1000;
  const gate: { reads: Promise<void> | null; plans: Promise<void> | null } = {
    reads: null,
    plans: null,
  };
  const signals: AbortSignal[] = [];
  const disposed = vi.fn();
  const baseFetch = opts.fetchImpl ? opts.fetchImpl(fake.fetchImpl) : fake.fetchImpl;

  const createClient = (token: string): YnabClient => {
    const real = createYnabClient(token, { fetchImpl: baseFetch });
    if (!opts.gated) {
      return {
        ...real,
        dispose: () => {
          disposed();
          real.dispose();
        },
      };
    }
    const held = async <T>(
      run: (signalFree: { signal?: undefined }) => Promise<T>,
      o: { signal?: AbortSignal } | undefined,
      kind: 'reads' | 'plans' = 'reads',
    ) => {
      if (o?.signal) signals.push(o.signal);
      const wait = gate[kind];
      if (wait) await wait;
      return run({});
    };
    return {
      listPlans: (o) => held((x) => real.listPlans(x), o, 'plans'),
      getAccounts: (id, q, o) => held((x) => real.getAccounts(id, q, x), o),
      getCategories: (id, q, o) => held((x) => real.getCategories(id, q, x), o),
      getTransactions: (id, q, o) => held((x) => real.getTransactions(id, q, x), o),
      patchTransactions: (id, items, o) => held((x) => real.patchTransactions(id, items, x), o),
      dispose: () => {
        disposed();
        real.dispose();
      },
    };
  };

  const store = createSessionStore({
    createClient,
    patStorage: pat.storage,
    buildTagIndex: build as never,
    deriveMarkers: markers as never,
    now: () => clock++,
  });
  const phases: string[] = [];
  store.subscribe(() => phases.push(store.getSnapshot().phase));
  const phase = () => store.getSnapshot().phase;
  const ready = () => {
    const s = store.getSnapshot();
    if (s.phase !== 'ready') throw new Error(`expected ready, got ${s.phase}`);
    return s.budget;
  };
  /** Holds calls (budget reads by default, or the plan list) until `release()`. */
  const hold = (kind: 'reads' | 'plans' = 'reads') => {
    let release!: () => void;
    gate[kind] = new Promise<void>((r) => (release = r));
    return () => {
      gate[kind] = null;
      release();
    };
  };
  const loaded = async (planId = 'p1', token = 'good') => {
    await store.connect(token, false);
    await store.chooseBudget(planId);
    return ready();
  };
  const clearRequests = () => void ((fake.requests as unknown[]).length = 0);
  return {
    clearRequests,
    fake,
    store,
    pat,
    build,
    markers,
    phases,
    phase,
    ready,
    hold,
    signals,
    disposed,
    loaded,
  };
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

const dataFreeSnapshot = (s: AppPhase) => JSON.stringify(s);

// ---- connect and start-up ----

describe('connect', () => {
  it('connects without remembering: lists plans and stores nothing', async () => {
    const t = setup();
    await t.store.connect('good', false);
    const s = t.store.getSnapshot();
    expect(s.phase).toBe('choosingBudget');
    expect(s.phase === 'choosingBudget' && s.plans.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(t.pat.held()).toBeNull();
    expect(t.phases).toEqual(['connecting', 'choosingBudget']);
    expect(t.fake.requests.map((r) => r.path)).toEqual(['/v1/plans']);
  });

  it('remembers the PAT only after a successful plans call', async () => {
    const t = setup();
    await t.store.connect('good', true);
    expect(t.phase()).toBe('choosingBudget');
    expect(t.pat.held()).toBe('good');
  });

  it('does not remember a rejected PAT, and forgets an older Remembered one (401)', async () => {
    const t = setup({ token: 'good', remembered: 'old' });
    await t.store.connect('bad', true);
    expect(t.store.getSnapshot()).toEqual({ phase: 'disconnected', notice: 'unauthorized' });
    expect(t.pat.held()).toBeNull();
    expect(t.disposed).toHaveBeenCalled();
  });

  it('connects anyway when storage cannot remember, and says so', async () => {
    const t = setup({ writable: false });
    await t.store.connect('good', true);
    const s = t.store.getSnapshot();
    expect(s).toMatchObject({ phase: 'choosingBudget', rememberFailed: true });
  });

  it('reports a non-401 connect failure and keeps nothing connected', async () => {
    const t = setup();
    t.fake.queueFaults({ kind: '5xx', status: 503 });
    await t.store.connect('good', true);
    expect(t.store.getSnapshot()).toEqual({
      phase: 'disconnected',
      failure: { kind: 'server', status: 503 },
    });
    expect(t.pat.held()).toBeNull();
    // A retry works.
    await t.store.connect('good', false);
    expect(t.phase()).toBe('choosingBudget');
  });

  it('lets an empty plan list through as an empty choice, not a failure', async () => {
    const t = setup({ plans: [] });
    await t.store.connect('good', false);
    expect(t.store.getSnapshot()).toEqual({ phase: 'choosingBudget', plans: [] });
  });
});

describe('start', () => {
  it('connects with a Remembered PAT without re-saving it', async () => {
    const t = setup({ remembered: 'good' });
    const remember = vi.spyOn(t.pat.storage, 'remember');
    await t.store.start();
    expect(t.phase()).toBe('choosingBudget');
    expect(t.fake.requests[0]?.headers['authorization']).toBe('Bearer good');
    expect(remember).not.toHaveBeenCalled();
  });

  it('does nothing without a Remembered PAT', async () => {
    const t = setup();
    await t.store.start();
    expect(t.store.getSnapshot()).toEqual({ phase: 'disconnected' });
    expect(t.fake.requests).toHaveLength(0);
  });

  it('deletes a rejected Remembered PAT and explains (Req 2.10)', async () => {
    const t = setup({ token: 'good', remembered: 'revoked' });
    await t.store.start();
    expect(t.store.getSnapshot()).toEqual({ phase: 'disconnected', notice: 'unauthorized' });
    expect(t.pat.held()).toBeNull();
  });

  it('keeps a Remembered PAT when YNAB is merely unreachable', async () => {
    const t = setup({ remembered: 'good' });
    t.fake.queueFaults({ kind: '5xx' });
    await t.store.start();
    expect(t.store.getSnapshot()).toMatchObject({
      phase: 'disconnected',
      failure: { kind: 'server' },
    });
    expect(t.pat.held()).toBe('good');
  });
});

// ---- choose a budget ----

describe('chooseBudget', () => {
  it('shows loading, then derives the index from the full load', async () => {
    const t = setup();
    await t.store.connect('good', false);
    t.phases.length = 0;
    await t.store.chooseBudget('p1');
    expect(t.phases).toEqual(['loadingBudget', 'ready']);
    const budget = t.ready();
    expect([...budget.domain.transactions.keys()].sort((a, b) => a.localeCompare(b))).toEqual([
      't1',
      't2',
    ]);
    expect([...budget.domain.accounts.keys()]).toEqual(['a1']);
    expect([...budget.domain.categories.keys()]).toEqual(['c1']);
    expect(budget).toMatchObject({
      plan: { id: 'p1', name: 'Household' },
      refreshHealth: 'ok',
      lastUpdatedAt: 1000,
      refreshing: false,
      openTag: null,
    });
    expect(t.build).toHaveBeenCalledTimes(1);
    expect(t.build.mock.calls[0]?.[0]).toBe(budget.domain.transactions);
    expect(budget.domain.index).toBe(t.build.mock.results[0]?.value);
  });

  it('fails as a whole with Retry, showing no partial data', async () => {
    const t = setup();
    await t.store.connect('good', false);
    t.fake.queueFaults({ kind: '5xx', status: 500 });
    await t.store.chooseBudget('p1');
    expect(t.store.getSnapshot()).toEqual({
      phase: 'loadFailed',
      planId: 'p1',
      failure: { kind: 'server', status: 500 },
    });
    expect(t.build).not.toHaveBeenCalled();
    await t.store.chooseBudget('p1'); // Retry
    expect(t.phase()).toBe('ready');
  });

  it('ignores an unknown plan ID', async () => {
    const t = setup();
    await t.store.connect('good', false);
    await t.store.chooseBudget('nope');
    expect(t.phase()).toBe('choosingBudget');
  });

  it('openTag sets and clears the open tag', async () => {
    const t = setup();
    await t.loaded();
    const tag = 'food' as TagIdentity;
    t.store.openTag(tag);
    expect(t.ready().openTag).toBe(tag);
    t.store.openTag(null);
    expect(t.ready().openTag).toBeNull();
  });
});

// ---- refresh ----

describe('refreshNow', () => {
  it('merges a delta, rebuilds the index and updates lastUpdatedAt', async () => {
    const t = setup();
    await t.loaded();
    const before = t.ready();
    t.fake.externalEdit('p1', 't1', 'shop #grocery');
    t.fake.addTransaction('p1', { id: 't3', accountId: 'a1', memo: '#new' });
    t.fake.deleteTransaction('p1', 't2');
    t.clearRequests();

    await t.store.refreshNow();

    const after = t.ready();
    expect(t.fake.requests.map((r) => r.path)).toEqual(['/v1/plans/p1/transactions']);
    expect(t.fake.requests[0]?.query['last_knowledge_of_server']).toBe(
      String(before.knowledge.transactions),
    );
    expect([...after.domain.transactions.keys()].sort((a, b) => a.localeCompare(b))).toEqual([
      't1',
      't3',
    ]);
    expect(after.domain.transactions.get('t1' as TransactionId)?.memo).toBe('shop #grocery');
    expect(t.build).toHaveBeenCalledTimes(2);
    expect(after.domain.index).not.toBe(before.domain.index);
    expect(after.lastUpdatedAt).toBeGreaterThan(before.lastUpdatedAt ?? 0);
    expect(after.knowledge.transactions).toBe(t.fake.serverKnowledge('p1'));
    expect(after.refreshHealth).toBe('ok');
  });

  it('keeps the same domain objects when nothing changed, but still stamps the time', async () => {
    const t = setup();
    await t.loaded();
    const before = t.ready();
    await t.store.refreshNow();
    const after = t.ready();
    expect(after.domain).toBe(before.domain);
    expect(t.build).toHaveBeenCalledTimes(1);
    expect(after.lastUpdatedAt).toBeGreaterThan(before.lastUpdatedAt ?? 0);
  });

  it('re-reads accounts and categories on a manual refresh only', async () => {
    const t = setup();
    await t.loaded();
    t.fake.addAccount('p1', { id: 'a2', name: 'New' });
    t.fake.addCategoryGroup('p1', { id: 'g2', categories: [{ id: 'c2' }] });

    t.clearRequests();
    await t.store.refreshNow();
    expect(t.fake.requests.map((r) => r.path)).toEqual(['/v1/plans/p1/transactions']);
    expect([...t.ready().domain.accounts.keys()]).toEqual(['a1']);

    t.clearRequests();
    await t.store.refreshNow({ includeAccounts: true });
    expect(t.fake.requests.map((r) => r.path).sort((a, b) => a.localeCompare(b))).toEqual([
      '/v1/plans/p1/accounts',
      '/v1/plans/p1/categories',
      '/v1/plans/p1/transactions',
    ]);
    const after = t.ready();
    expect([...after.domain.accounts.keys()].sort((a, b) => a.localeCompare(b))).toEqual([
      'a1',
      'a2',
    ]);
    expect([...after.domain.categories.keys()].sort((a, b) => a.localeCompare(b))).toEqual([
      'c1',
      'c2',
    ]);
    expect(after.knowledge.accounts).toBe(t.fake.serverKnowledge('p1'));
  });

  it('re-reads accounts and categories when a delta references an unknown ID', async () => {
    const t = setup();
    await t.loaded();
    t.fake.addAccount('p1', { id: 'a2' });
    t.fake.addCategoryGroup('p1', { id: 'g2', categories: [{ id: 'c2' }] });
    t.fake.addTransaction('p1', { id: 't3', accountId: 'a2', categoryId: 'c2', memo: '#x' });
    t.clearRequests();

    await t.store.refreshNow();

    expect(t.fake.requests.map((r) => r.path)).toContain('/v1/plans/p1/accounts');
    expect(t.fake.requests.map((r) => r.path)).toContain('/v1/plans/p1/categories');
    expect(t.ready().domain.accounts.has('a2' as never)).toBe(true);
    expect(t.ready().domain.categories.has('c2' as never)).toBe(true);
  });

  it('does not re-read accounts for a delta that only uses known IDs', async () => {
    const t = setup();
    await t.loaded();
    t.fake.addTransaction('p1', {
      id: 't3',
      accountId: 'a1',
      memo: 'split',
      subtransactions: [{ id: 's1', amount: -1, categoryId: 'c1' }],
    });
    t.clearRequests();
    await t.store.refreshNow();
    expect(t.fake.requests).toHaveLength(1);
  });

  it('coalesces overlapping refreshes and exposes `refreshing`', async () => {
    const t = setup({ gated: true });
    await t.loaded();
    t.clearRequests();
    const release = t.hold();
    const first = t.store.refreshNow();
    const second = t.store.refreshNow();
    expect(t.ready().refreshing).toBe(true);
    release();
    await Promise.all([first, second]);
    expect(t.fake.requests).toHaveLength(1);
    expect(t.ready().refreshing).toBe(false);
  });

  it('pauses updates on failure, keeps the last data, and recovers on Retry', async () => {
    const t = setup();
    await t.loaded();
    const before = t.ready();
    t.fake.queueFaults({ kind: '429' });
    await t.store.refreshNow();
    const paused = t.ready();
    expect(paused.refreshHealth).toEqual({ paused: { kind: 'rateLimited' } });
    expect(paused.domain).toBe(before.domain);
    expect(paused.lastUpdatedAt).toBe(before.lastUpdatedAt);
    expect(paused.refreshing).toBe(false);

    await t.store.refreshNow(); // Retry
    expect(t.ready().refreshHealth).toBe('ok');
    expect(t.ready().lastUpdatedAt).toBeGreaterThan(before.lastUpdatedAt ?? 0);
  });

  it('a 404 for the plan mid-session pauses updates', async () => {
    let missing = false;
    const t = setup({
      fetchImpl: (real) => async (input, init) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (missing && url.includes('/transactions')) {
          return new Response(JSON.stringify({ error: { id: '404.2', name: 'x', detail: 'y' } }), {
            status: 404,
          });
        }
        return real(input, init);
      },
    });
    await t.loaded();
    missing = true;
    await t.store.refreshNow();
    expect(t.ready().refreshHealth).toEqual({ paused: { kind: 'notFound' } });
  });

  it('does nothing before a Budget is loaded', async () => {
    const t = setup();
    await t.store.refreshNow();
    await t.store.connect('good', false);
    t.clearRequests();
    await t.store.refreshNow();
    expect(t.fake.requests).toHaveLength(0);
  });

  it('is notified to subscribers and an unsubscribed listener hears nothing', async () => {
    const t = setup();
    await t.loaded();
    const listener = vi.fn();
    const off = t.store.subscribe(listener);
    await t.store.refreshNow();
    expect(listener).toHaveBeenCalled();
    off();
    listener.mockClear();
    await t.store.refreshNow();
    expect(listener).not.toHaveBeenCalled();
  });
});

// ---- Property 24: a 401 mid-session ----

describe('401 mid-session (Property 24)', () => {
  it('pauses updates, keeps the data, and forgets a Remembered PAT', async () => {
    let revoked = false;
    const t = setup({
      fetchImpl: (real) => async (input, init) => {
        if (revoked) {
          return new Response(JSON.stringify({ error: { id: '401', name: 'u', detail: 'u' } }), {
            status: 401,
          });
        }
        return real(input, init);
      },
    });
    await t.store.connect('good', true);
    await t.store.chooseBudget('p1');
    expect(t.pat.held()).toBe('good');
    const before = t.ready();

    revoked = true;
    await t.store.refreshNow();

    expect(t.pat.held()).toBeNull();
    const after = t.ready();
    expect(after.refreshHealth).toEqual({ paused: { kind: 'unauthorized' } });
    expect(after.domain).toBe(before.domain);
  });

  it('a 401 while loading a Budget also forgets the PAT', async () => {
    let revoked = false;
    const t = setup({
      fetchImpl: (real) => async (input, init) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (revoked && url.includes('/plans/p1')) {
          return new Response(JSON.stringify({ error: { id: '401', name: 'u', detail: 'u' } }), {
            status: 401,
          });
        }
        return real(input, init);
      },
    });
    await t.store.connect('good', true);
    revoked = true;
    await t.store.chooseBudget('p1');
    expect(t.store.getSnapshot()).toEqual({
      phase: 'loadFailed',
      planId: 'p1',
      failure: { kind: 'unauthorized' },
    });
    expect(t.pat.held()).toBeNull();
  });
});

// ---- switch budget and disconnect (Property 21) ----

describe('switchBudget', () => {
  it('aborts the Budget Session, keeps the client and the PAT, and refreshes the plan list', async () => {
    const t = setup({ gated: true });
    await t.store.connect('good', true);
    await t.store.chooseBudget('p1');
    const signal = t.signals.at(-1)!;
    expect(signal.aborted).toBe(false);
    t.clearRequests();

    const before = t.disposed.mock.calls.length;
    await t.store.switchBudget();

    expect(signal.aborted).toBe(true);
    expect(t.disposed.mock.calls.length).toBe(before);
    expect(t.pat.held()).toBe('good');
    const s = t.store.getSnapshot();
    expect(s.phase).toBe('choosingBudget');
    expect(s.phase === 'choosingBudget' && s.plans.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(t.fake.requests.map((r) => r.path)).toEqual(['/v1/plans']);
    expect(dataFreeSnapshot(s)).not.toContain('shop');

    await t.store.chooseBudget('p2'); // same client, no new PAT
    expect(t.ready().plan.id).toBe('p2');
  });

  it('discards a delayed old-session load after switchBudget', async () => {
    const t = setup({ gated: true });
    await t.store.connect('good', false);
    const release = t.hold();
    const loading = t.store.chooseBudget('p1');
    expect(t.phase()).toBe('loadingBudget');
    await t.store.switchBudget();
    expect(t.phase()).toBe('choosingBudget');
    release(); // the old reads resolve now, ignoring their aborted signal
    await loading;
    await flush();
    expect(t.phase()).toBe('choosingBudget');
    expect(t.build).not.toHaveBeenCalled();
  });

  it('a late result for the old Budget cannot overwrite the new one', async () => {
    const t = setup({ gated: true });
    await t.store.connect('good', false);
    const release = t.hold();
    const old = t.store.chooseBudget('p1');
    await t.store.switchBudget();
    const next = t.store.chooseBudget('p2');
    release();
    await Promise.all([old, next]);
    await flush();
    expect(t.ready().plan.id).toBe('p2');
    expect(t.build).toHaveBeenCalledTimes(1);
  });

  it('discards a delayed refresh result after switchBudget', async () => {
    const t = setup({ gated: true });
    await t.loaded();
    t.fake.externalEdit('p1', 't1', 'changed');
    const release = t.hold();
    const refresh = t.store.refreshNow();
    await t.store.switchBudget();
    release();
    await refresh;
    await flush();
    expect(t.phase()).toBe('choosingBudget');
    expect(t.build).toHaveBeenCalledTimes(1);
    expect(dataFreeSnapshot(t.store.getSnapshot())).not.toContain('changed');
  });
});

describe('disconnect', () => {
  it('forgets the PAT, disposes the client, and clears everything', async () => {
    const t = setup();
    await t.store.connect('good', true);
    await t.store.chooseBudget('p1');
    t.store.openTag('food' as TagIdentity);
    t.disposed.mockClear();

    t.store.disconnect();

    expect(t.pat.held()).toBeNull();
    expect(t.disposed).toHaveBeenCalledTimes(1);
    const s = t.store.getSnapshot();
    expect(s).toEqual({ phase: 'disconnected', notice: 'disconnected' });
    expect(dataFreeSnapshot(s)).not.toContain('shop');
  });

  it('discards a delayed old-session load after disconnect', async () => {
    const t = setup({ gated: true });
    await t.store.connect('good', true);
    const release = t.hold();
    const loading = t.store.chooseBudget('p1');
    t.store.disconnect();
    release();
    await loading;
    await flush();
    expect(t.store.getSnapshot()).toEqual({ phase: 'disconnected', notice: 'disconnected' });
    expect(t.build).not.toHaveBeenCalled();
    expect(t.pat.held()).toBeNull();
  });

  it('discards a delayed refresh result after disconnect', async () => {
    const t = setup({ gated: true });
    await t.loaded();
    t.fake.externalEdit('p1', 't1', 'changed');
    const release = t.hold();
    const refresh = t.store.refreshNow();
    t.store.disconnect();
    release();
    await refresh;
    await flush();
    expect(t.store.getSnapshot()).toEqual({ phase: 'disconnected', notice: 'disconnected' });
    expect(t.build).toHaveBeenCalledTimes(1);
  });

  it('discards a delayed connect result after disconnect', async () => {
    const t = setup({ gated: true });
    const release = t.hold('plans');
    const connecting = t.store.connect('good', true);
    expect(t.phase()).toBe('connecting');
    t.store.disconnect();
    release();
    await connecting;
    expect(t.store.getSnapshot()).toEqual({ phase: 'disconnected', notice: 'disconnected' });
    expect(t.pat.held()).toBeNull();
  });
});

// ---- Property 24 over sequences ----

describe('Property 24: a PAT is stored only by explicit choice', () => {
  type Op = { kind: 'connect'; good: boolean; remember: boolean } | { kind: 'disconnect' };
  const ops = fc.array(
    fc.oneof(
      fc.record({
        kind: fc.constant('connect' as const),
        good: fc.boolean(),
        remember: fc.boolean(),
      }),
      fc.record({ kind: fc.constant('disconnect' as const) }),
    ),
    { maxLength: 8 },
  );

  it('holds a PAT only after connect(pat, true) succeeds, never after false, disconnect or 401', async () => {
    await fc.assert(
      fc.asyncProperty(ops, async (sequence: Op[]) => {
        const t = setup({ token: 'good' });
        let expected: string | null = null;
        for (const op of sequence) {
          if (op.kind === 'disconnect') {
            t.store.disconnect();
            expected = null;
          } else if (!op.good) {
            await t.store.connect('bad', op.remember);
            expected = null;
          } else {
            await t.store.connect('good', op.remember);
            if (op.remember) expected = 'good';
          }
          expect(t.pat.held()).toBe(expected);
        }
      }),
      { numRuns: 40 },
    );
  });
});
