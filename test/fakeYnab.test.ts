import type { Route } from '@playwright/test';
import { describe, expect, it } from 'vite-plus/test';
import { createYnabClient } from '../src/ynab/client.ts';
import { ynabFailureOf } from '../src/ynab/errors.ts';
import { createFakeYnab, type FakeYnabOptions, type RouteLike } from './fakeYnab.ts';

function setup(options?: Parameters<typeof createFakeYnab>[0], timeoutMs?: number) {
  const fake = createFakeYnab(options);
  const client = createYnabClient('pat', { fetchImpl: fake.fetchImpl, timeoutMs });
  return { fake, client };
}

describe('fakeYnab data and delta semantics', () => {
  it('lists plans with first_month', async () => {
    const { client } = setup({ plans: [{ id: 'p1', name: 'One', firstMonth: '2019-03-01' }] });
    const plans = await client.listPlans();
    expect(plans.map((p) => [p.id, p.name, p.first_month])).toEqual([['p1', 'One', '2019-03-01']]);
  });

  it('full reads omit deleted records; deltas return only changes, tombstones included', async () => {
    const { fake, client } = setup({
      plans: [
        {
          id: 'p',
          transactions: [
            { id: 't1', memo: 'a' },
            { id: 't2', memo: 'b' },
            { id: 't3', memo: 'c', deleted: true },
          ],
        },
      ],
    });
    const full = await client.getTransactions('p', { sinceDate: '2020-01-01' });
    expect(full.items.map((t) => t.id).sort((a, b) => a.localeCompare(b))).toEqual(['t1', 't2']);

    fake.externalEdit('p', 't1', 'a2');
    fake.deleteTransaction('p', 't2');
    const delta = await client.getTransactions('p', {
      sinceDate: '2020-01-01',
      lastKnowledge: full.serverKnowledge,
    });
    expect(
      delta.items
        .map((t) => [t.id, t.memo, t.deleted])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    ).toEqual([
      ['t1', 'a2', false],
      ['t2', 'b', true],
    ]);
    expect(delta.serverKnowledge).toBeGreaterThan(full.serverKnowledge);

    const empty = await client.getTransactions('p', {
      sinceDate: '2020-01-01',
      lastKnowledge: delta.serverKnowledge,
    });
    expect(empty.items).toEqual([]);
  });

  it('applies since_date', async () => {
    const { client } = setup({
      plans: [
        {
          id: 'p',
          transactions: [
            { id: 'old', date: '2019-12-31' },
            { id: 'new', date: '2020-01-01' },
          ],
        },
      ],
    });
    const res = await client.getTransactions('p', { sinceDate: '2020-01-01' });
    expect(res.items.map((t) => t.id)).toEqual(['new']);
  });

  it('keeps removed split lines as deleted tombstones in deltas only', async () => {
    const { fake, client } = setup({
      plans: [
        {
          id: 'p',
          transactions: [
            {
              id: 't',
              subtransactions: [
                { id: 's1', amount: -1 },
                { id: 's2', amount: -2 },
              ],
            },
          ],
        },
      ],
    });
    const full = await client.getTransactions('p', { sinceDate: '2020-01-01' });
    fake.updateTransaction('p', 't', { subtransactions: [{ id: 's1', amount: -1 }] });
    const delta = await client.getTransactions('p', {
      sinceDate: '2020-01-01',
      lastKnowledge: full.serverKnowledge,
    });
    expect(delta.items[0]?.subtransactions.map((s) => [s.id, s.deleted])).toEqual([
      ['s1', false],
      ['s2', true],
    ]);
    const refreshed = await client.getTransactions('p', { sinceDate: '2020-01-01' });
    expect(refreshed.items[0]?.subtransactions.map((s) => s.id)).toEqual(['s1']);
  });

  it('serves accounts and categories with deltas', async () => {
    const { fake, client } = setup({
      plans: [
        {
          id: 'p',
          accounts: [{ id: 'a1' }, { id: 'a2', deleted: true }],
          categoryGroups: [{ id: 'g', categories: [{ id: 'c' }] }],
        },
      ],
    });
    const accounts = await client.getAccounts('p', {});
    expect(accounts.items.map((a) => a.id)).toEqual(['a1']);
    fake.updateAccount('p', 'a1', { closed: true });
    const accountDelta = await client.getAccounts('p', { lastKnowledge: accounts.serverKnowledge });
    expect(accountDelta.items.map((a) => [a.id, a.closed])).toEqual([['a1', true]]);
    const categories = await client.getCategories('p', {});
    expect(categories.items[0]?.categories.map((c) => c.id)).toEqual(['c']);
  });

  it('401s a wrong or missing token, and 404s an unknown plan', async () => {
    const fake = createFakeYnab({ token: 'right' });
    const wrong = createYnabClient('wrong', { fetchImpl: fake.fetchImpl });
    const failure = await wrong.listPlans().catch((e: unknown) => ynabFailureOf(e));
    expect(failure).toEqual({ kind: 'unauthorized' });
    const right = createYnabClient('right', { fetchImpl: fake.fetchImpl });
    const notFound = await right.getAccounts('nope', {}).catch((e: unknown) => ynabFailureOf(e));
    expect(notFound).toEqual({ kind: 'notFound' });
  });
});

describe('fakeYnab writes', () => {
  const seed: FakeYnabOptions = {
    plans: [
      {
        id: 'p',
        transactions: [
          {
            id: 't1',
            memo: 'one',
            approved: true,
            cleared: 'reconciled',
            flagColor: 'red',
          },
          { id: 't2', memo: 'two', approved: false },
        ],
      },
    ],
  };

  it('PATCH changes memo and approved only, and returns the saved transactions', async () => {
    const { fake, client } = setup(seed);
    const res = await client.patchTransactions('p', [
      { id: 't1', memo: 'one #x', approved: true },
      { id: 't2', memo: null, approved: false },
    ]);
    expect(res.transaction_ids).toEqual(['t1', 't2']);
    expect(res.transactions?.map((t) => t.memo)).toEqual(['one #x', null]);
    const t1 = fake.getTransaction('p', 't1');
    expect([t1?.memo, t1?.approved, t1?.cleared, t1?.flag_color]).toEqual([
      'one #x',
      true,
      'reconciled',
      'red',
    ]);
    expect(fake.patches()).toHaveLength(1);
  });

  it('defaults an omitted approved to false, like YNAB', async () => {
    const { fake, fetchImpl } = (() => {
      const f = createFakeYnab(seed);
      return { fake: f, fetchImpl: f.fetchImpl };
    })();
    const res = await fetchImpl('https://api.ynab.com/v1/plans/p/transactions', {
      method: 'PATCH',
      headers: { Authorization: 'Bearer x', 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactions: [{ id: 't1', memo: 'changed' }] }),
    });
    expect(res.status).toBe(200);
    expect(fake.getTransaction('p', 't1')?.approved).toBe(false);
  });

  it('rejects a memo over 500 code points with a 400 and writes nothing', async () => {
    const { fake, client } = setup(seed);
    const tooLong = 'x'.repeat(501);
    const failure = await client
      .patchTransactions('p', [
        { id: 't2', memo: 'fine', approved: false },
        { id: 't1', memo: tooLong, approved: true },
      ])
      .then(
        () => null,
        (e: unknown) => ynabFailureOf(e),
      );
    expect(failure?.kind).toBe('rejected');
    expect(fake.getTransaction('p', 't2')?.memo).toBe('two');
  });

  it('counts memo length in code points, not UTF-16 units', async () => {
    const { client } = setup(seed);
    const exactly500 = '😀'.repeat(500); // 1000 UTF-16 units
    await expect(
      client.patchTransactions('p', [{ id: 't1', memo: exactly500, approved: true }]),
    ).resolves.toBeDefined();
    const failure = await client
      .patchTransactions('p', [{ id: 't1', memo: '😀'.repeat(501), approved: true }])
      .then(
        () => null,
        (e: unknown) => ynabFailureOf(e),
      );
    expect(failure?.kind).toBe('rejected');
  });

  it('bumps server_knowledge on a write so the next delta sees it', async () => {
    const { client } = setup(seed);
    const full = await client.getTransactions('p', { sinceDate: '2020-01-01' });
    await client.patchTransactions('p', [{ id: 't1', memo: 'z', approved: true }]);
    const delta = await client.getTransactions('p', {
      sinceDate: '2020-01-01',
      lastKnowledge: full.serverKnowledge,
    });
    expect(delta.items.map((t) => t.id)).toEqual(['t1']);
  });
});

describe('fakeYnab scripted faults', () => {
  const seed = { plans: [{ id: 'p', transactions: [{ id: 't1', memo: 'one' }] }] };
  const write = { id: 't1', memo: 'one #x', approved: true };

  it('429, 5xx and 400 answer the next request, then clear', async () => {
    const { fake, client } = setup(seed);
    fake.queueFaults(
      { kind: '429' },
      { kind: '5xx', status: 502 },
      { kind: '400', detail: 'nope' },
    );
    expect(await client.listPlans().catch((e: unknown) => ynabFailureOf(e))).toEqual({
      kind: 'rateLimited',
    });
    expect(await client.listPlans().catch((e: unknown) => ynabFailureOf(e))).toEqual({
      kind: 'server',
      status: 502,
    });
    expect(await client.listPlans().catch((e: unknown) => ynabFailureOf(e))).toEqual({
      kind: 'rejected',
      detail: 'nope',
    });
    await expect(client.listPlans()).resolves.toHaveLength(1);
    expect(fake.pendingFaults()).toBe(0);
  });

  it('a fault can target only PATCH requests', async () => {
    const { fake, client } = setup(seed);
    fake.queueFaults({ kind: '429', on: 'PATCH' });
    await expect(client.listPlans()).resolves.toHaveLength(1);
    expect(fake.pendingFaults()).toBe(1);
    expect(
      await client.patchTransactions('p', [write]).catch((e: unknown) => ynabFailureOf(e)),
    ).toEqual({
      kind: 'rateLimited',
    });
    expect(fake.getTransaction('p', 't1')?.memo).toBe('one');
  });

  it('dropBeforeCommit fails as a network error and writes nothing', async () => {
    const { fake, client } = setup(seed);
    fake.queueFaults({ kind: 'dropBeforeCommit', on: 'PATCH' });
    expect(
      await client.patchTransactions('p', [write]).catch((e: unknown) => ynabFailureOf(e)),
    ).toEqual({
      kind: 'network',
    });
    expect(fake.getTransaction('p', 't1')?.memo).toBe('one');
  });

  it('timeoutAfterCommit commits the write but the client times out', async () => {
    const { fake, client } = setup(seed, 30);
    fake.queueFaults({ kind: 'timeoutAfterCommit', on: 'PATCH' });
    expect(
      await client.patchTransactions('p', [write]).catch((e: unknown) => ynabFailureOf(e)),
    ).toEqual({
      kind: 'timeout',
    });
    expect(fake.getTransaction('p', 't1')?.memo).toBe('one #x');
  });

  it('externalEdit changes the transaction just before the request is handled', async () => {
    const { fake, client } = setup(seed);
    fake.queueFaults({ kind: 'externalEdit', id: 't1', memo: 'edited elsewhere' });
    const res = await client.getTransactions('p', { sinceDate: '2020-01-01' });
    expect(res.items[0]?.memo).toBe('edited elsewhere');
  });

  it('records every request, including faulted ones, with its outcome', async () => {
    const { fake, client } = setup(seed);
    fake.queueFaults({ kind: '429' });
    await client.listPlans().catch(() => undefined);
    await client.listPlans();
    expect(fake.requests.map((r) => [r.method, r.path, r.outcome])).toEqual([
      ['GET', '/v1/plans', 429],
      ['GET', '/v1/plans', 200],
    ]);
  });
});

describe('fakeYnab as a Playwright route handler', () => {
  it('has the shape of a Playwright route handler (type-only check, no runtime import)', () => {
    const handler: (route: Route) => Promise<void> = createFakeYnab().routeHandler;
    expect(typeof handler).toBe('function');
  });

  function route(
    method: string,
    url: string,
    headers: Record<string, string> = {},
    postData: string | null = null,
  ) {
    const calls: { fulfill?: Parameters<RouteLike['fulfill']>[0]; abort?: string | undefined } = {};
    const r: RouteLike = {
      request: () => ({
        url: () => url,
        method: () => method,
        headers: () => headers,
        postData: () => postData,
      }),
      fulfill: async (o) => void (calls.fulfill = o),
      abort: async (code) => void (calls.abort = code ?? 'failed'),
    };
    return { r, calls };
  }

  it('fulfills a GET with JSON and CORS headers', async () => {
    const fake = createFakeYnab({ plans: [{ id: 'p', name: 'Plan' }] });
    const { r, calls } = route('GET', 'https://api.ynab.com/v1/plans?include_accounts=false', {
      authorization: 'Bearer abc',
    });
    await fake.routeHandler(r);
    expect(calls.fulfill?.status).toBe(200);
    expect(calls.fulfill?.headers?.['access-control-allow-origin']).toBe('*');
    expect(JSON.parse(calls.fulfill?.body ?? '').data.plans[0].name).toBe('Plan');
  });

  it('answers a CORS preflight', async () => {
    const fake = createFakeYnab();
    const { r, calls } = route('OPTIONS', 'https://api.ynab.com/v1/plans');
    await fake.routeHandler(r);
    expect(calls.fulfill?.status).toBe(204);
    expect(calls.fulfill?.headers?.['access-control-allow-headers']).toContain('authorization');
  });

  it('applies a PATCH and aborts for dropBeforeCommit', async () => {
    const fake = createFakeYnab({ plans: [{ id: 'p', transactions: [{ id: 't1', memo: 'a' }] }] });
    const body = JSON.stringify({ transactions: [{ id: 't1', memo: 'b', approved: true }] });
    const ok = route(
      'PATCH',
      'https://api.ynab.com/v1/plans/p/transactions',
      { authorization: 'Bearer x' },
      body,
    );
    await fake.routeHandler(ok.r);
    expect(ok.calls.fulfill?.status).toBe(200);
    expect(fake.getTransaction('p', 't1')?.memo).toBe('b');

    fake.queueFaults({ kind: 'dropBeforeCommit', on: 'PATCH' });
    const dropped = route(
      'PATCH',
      'https://api.ynab.com/v1/plans/p/transactions',
      { authorization: 'Bearer x' },
      body.replace('"b"', '"c"'),
    );
    await fake.routeHandler(dropped.r);
    expect(dropped.calls.abort).toBeDefined();
    expect(fake.getTransaction('p', 't1')?.memo).toBe('b');
  });
});
