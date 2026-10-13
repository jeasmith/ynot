import { describe, expect, it, vi } from 'vite-plus/test';
import { assertYnabOrigin, createYnabClient, type RequestOptions } from './client.ts';
import { ynabFailureOf, type YnabFailure } from './errors.ts';

interface Recorded {
  readonly url: string;
  readonly init: RequestInit;
}

function json(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function recorder(respond: (r: Recorded) => Promise<Response> | Response) {
  const calls: Recorded[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const rec = {
      url: input instanceof Request ? input.url : String(input as string | URL),
      init: init ?? {},
    };
    calls.push(rec);
    return respond(rec);
  }) as typeof fetch;
  return { calls, fetchImpl };
}

async function failureOf(p: Promise<unknown>): Promise<YnabFailure> {
  try {
    await p;
  } catch (e) {
    const f = ynabFailureOf(e);
    if (f) return f;
    throw e;
  }
  throw new Error('expected the request to fail');
}

const planBody = { data: { plans: [{ id: 'p1', name: 'Plan' }], default_plan: null } };

describe('createYnabClient requests', () => {
  it('lists plans with include_accounts=false and unwraps the plans', async () => {
    const { calls, fetchImpl } = recorder(() => json(200, planBody));
    const client = createYnabClient('secret-pat', { fetchImpl });
    const plans = await client.listPlans();
    expect(plans).toEqual([{ id: 'p1', name: 'Plan' }]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://api.ynab.com/v1/plans?include_accounts=false');
  });

  it('sends the fixed fetch init on every request (Property 22)', async () => {
    const { calls, fetchImpl } = recorder((r) => {
      if (r.url.includes('/plans?')) return json(200, planBody);
      if (r.url.includes('/accounts'))
        return json(200, { data: { accounts: [], server_knowledge: 3 } });
      if (r.url.includes('/categories'))
        return json(200, { data: { category_groups: [], server_knowledge: 4 } });
      if (r.init.method === 'PATCH')
        return json(200, {
          data: { transaction_ids: [], transactions: [], server_knowledge: 9 },
        });
      return json(200, { data: { transactions: [], server_knowledge: 5 } });
    });
    const client = createYnabClient('secret-pat', { fetchImpl });
    await client.listPlans();
    await client.getAccounts('p1', {});
    await client.getCategories('p1', { lastKnowledge: 1 });
    await client.getTransactions('p1', { sinceDate: '2020-01-01' });
    await client.patchTransactions('p1', [{ id: 't1', memo: 'a', approved: true }]);
    expect(calls).toHaveLength(5);
    for (const { url, init } of calls) {
      expect(new URL(url).origin).toBe('https://api.ynab.com');
      expect(init.cache).toBe('no-store');
      expect(init.credentials).toBe('omit');
      expect(init.referrerPolicy).toBe('no-referrer');
      expect(init.mode).toBe('cors');
      expect(init.signal).toBeInstanceOf(AbortSignal);
      expect(new Headers(init.headers).get('authorization')).toBe('Bearer secret-pat');
    }
  });

  it('builds delta and since_date queries', async () => {
    const { calls, fetchImpl } = recorder(() =>
      json(200, { data: { transactions: [], server_knowledge: 42 } }),
    );
    const client = createYnabClient('pat', { fetchImpl });
    const first = await client.getTransactions('p 1/x', { sinceDate: '2019-03-01' });
    await client.getTransactions('p1', { sinceDate: '2019-03-01', lastKnowledge: 0 });
    expect(first).toEqual({ items: [], serverKnowledge: 42 });
    expect(calls[0]?.url).toBe(
      'https://api.ynab.com/v1/plans/p%201%2Fx/transactions?since_date=2019-03-01',
    );
    expect(calls[1]?.url).toBe(
      'https://api.ynab.com/v1/plans/p1/transactions?since_date=2019-03-01&last_knowledge_of_server=0',
    );
  });

  it('returns accounts and category groups as deltas', async () => {
    const { fetchImpl } = recorder((r) =>
      r.url.includes('/accounts')
        ? json(200, { data: { accounts: [{ id: 'a' }], server_knowledge: 7 } })
        : json(200, { data: { category_groups: [{ id: 'g' }], server_knowledge: 8 } }),
    );
    const client = createYnabClient('pat', { fetchImpl });
    expect(await client.getAccounts('p', {})).toEqual({ items: [{ id: 'a' }], serverKnowledge: 7 });
    expect(await client.getCategories('p', {})).toEqual({
      items: [{ id: 'g' }],
      serverKnowledge: 8,
    });
  });

  it('PATCHes {transactions} and returns the save response', async () => {
    const saved = { transaction_ids: ['t1'], transactions: [], server_knowledge: 11 };
    const { calls, fetchImpl } = recorder(() => json(200, { data: saved }));
    const client = createYnabClient('pat', { fetchImpl });
    const items = [{ id: 't1', memo: 'Hi #a', approved: false }];
    const res = await client.patchTransactions('p1', items);
    expect(res).toEqual(saved);
    expect(calls[0]?.url).toBe('https://api.ynab.com/v1/plans/p1/transactions');
    expect(calls[0]?.init.method).toBe('PATCH');
    expect(JSON.parse(calls[0]?.init.body as string)).toEqual({ transactions: items });
    expect(new Headers(calls[0]?.init.headers).get('content-type')).toBe('application/json');
  });

  it('keeps a path-like plan id inside the path (never changes the origin)', async () => {
    const { calls, fetchImpl } = recorder(() =>
      json(200, { data: { accounts: [], server_knowledge: 1 } }),
    );
    const client = createYnabClient('pat', { fetchImpl });
    await client.getAccounts('//evil.example/x', {});
    await client.getAccounts('..', {});
    for (const { url } of calls) expect(new URL(url).origin).toBe('https://api.ynab.com');
  });

  it('exposes no property that holds the token', () => {
    const client = createYnabClient('secret-pat-value', {
      fetchImpl: recorder(() => json(200, planBody)).fetchImpl,
    });
    expect(JSON.stringify(Object.keys(client))).not.toContain('secret');
    for (const v of Object.values(client)) {
      expect(typeof v).toBe('function');
    }
    expect(JSON.stringify(client)).not.toContain('secret-pat-value');
  });
});

describe('assertYnabOrigin', () => {
  it('accepts the YNAB origin', () => {
    expect(() => assertYnabOrigin('https://api.ynab.com/v1/plans')).not.toThrow();
  });

  it.each([
    'https://evil.example/v1/plans',
    'http://api.ynab.com/v1/plans',
    'https://api.ynab.com.evil.example/v1/plans',
    'https://api.ynab.com@evil.example/v1/plans',
    'https://api.ynab.com:8443/v1/plans',
    'https://API.YNAB.COM.evil.example/',
    'not a url',
    '',
  ])('throws for %s', (url) => {
    expect(() => assertYnabOrigin(url)).toThrow();
  });
});

describe('status classification through the client', () => {
  it.each<[number, unknown, YnabFailure]>([
    [401, { error: { id: '401', name: 'unauthorized', detail: 'x' } }, { kind: 'unauthorized' }],
    [
      403,
      { error: { id: '403.4', name: 'data_limit_reached', detail: 'x' } },
      { kind: 'forbidden', id: '403.4' },
    ],
    [
      404,
      { error: { id: '404.2', name: 'resource_not_found', detail: 'x' } },
      { kind: 'notFound' },
    ],
    [
      400,
      { error: { id: '400', name: 'bad_request', detail: 'memo too long' } },
      { kind: 'rejected', detail: 'memo too long' },
    ],
    [
      429,
      { error: { id: '429', name: 'too_many_requests', detail: 'x' } },
      { kind: 'rateLimited' },
    ],
    [
      503,
      { error: { id: '503', name: 'service_unavailable', detail: 'x' } },
      { kind: 'server', status: 503 },
    ],
  ])('status %i', async (status, body, expected) => {
    const { fetchImpl } = recorder(() => json(status, body));
    const client = createYnabClient('pat', { fetchImpl });
    expect(await failureOf(client.listPlans())).toEqual(expected);
  });

  it('classifies a fetch that throws before a response as network', async () => {
    const fetchImpl = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    const client = createYnabClient('pat', { fetchImpl });
    expect(await failureOf(client.listPlans())).toEqual({ kind: 'network' });
  });

  it('classifies a 200 with an unreadable body as a server failure', async () => {
    const { fetchImpl } = recorder(() => new Response('<html>', { status: 200 }));
    const client = createYnabClient('pat', { fetchImpl });
    expect(await failureOf(client.listPlans())).toEqual({ kind: 'server', status: 200 });
  });

  it('classifies a 200 without a data envelope as a server failure', async () => {
    const { fetchImpl } = recorder(() => json(200, { hello: 'world' }));
    const client = createYnabClient('pat', { fetchImpl });
    expect(await failureOf(client.listPlans())).toEqual({ kind: 'server', status: 200 });
  });
});

/** A fetch that never answers and rejects with the signal's reason, like the real one. */
function hangingFetch(): typeof fetch {
  return ((_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (signal?.aborted) return reject(signal.reason);
      signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
    })) as typeof fetch;
}

describe('abort handling', () => {
  it('turns the client timeout into a timeout failure', async () => {
    const client = createYnabClient('pat', { fetchImpl: hangingFetch(), timeoutMs: 20 });
    expect(await failureOf(client.listPlans())).toEqual({ kind: 'timeout' });
  });

  it('defaults to a 35 second timeout', async () => {
    vi.useFakeTimers();
    try {
      const client = createYnabClient('pat', { fetchImpl: hangingFetch() });
      const outcome = failureOf(client.listPlans());
      await vi.advanceTimersByTimeAsync(34_999);
      let settled = false;
      void outcome.then(() => (settled = true));
      await vi.advanceTimersByTimeAsync(0);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(await outcome).toEqual({ kind: 'timeout' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('classifies dispose as cancelled for an in-flight request', async () => {
    const client = createYnabClient('pat', { fetchImpl: hangingFetch(), timeoutMs: 5_000 });
    const outcome = failureOf(client.listPlans());
    client.dispose();
    expect(await outcome).toEqual({ kind: 'cancelled' });
  });

  it('classifies a caller signal abort as cancelled, whatever its reason', async () => {
    const client = createYnabClient('pat', { fetchImpl: hangingFetch(), timeoutMs: 5_000 });
    for (const reason of [undefined, new DOMException('t', 'TimeoutError'), 'timeout']) {
      const controller = new AbortController();
      const opts: RequestOptions = { signal: controller.signal };
      const outcome = failureOf(client.getAccounts('p', {}, opts));
      controller.abort(reason);
      expect(await outcome).toEqual({ kind: 'cancelled' });
    }
  });

  it('does not send a request when the caller signal is already aborted', async () => {
    const { calls, fetchImpl } = recorder(() => json(200, planBody));
    const client = createYnabClient('pat', { fetchImpl });
    const controller = new AbortController();
    controller.abort();
    expect(await failureOf(client.listPlans({ signal: controller.signal }))).toEqual({
      kind: 'cancelled',
    });
    expect(calls).toHaveLength(0);
  });

  it('refuses every request after dispose, with no fetch and no token', async () => {
    const { calls, fetchImpl } = recorder(() => json(200, planBody));
    const client = createYnabClient('pat', { fetchImpl });
    client.dispose();
    expect(await failureOf(client.listPlans())).toEqual({ kind: 'cancelled' });
    expect(calls).toHaveLength(0);
  });

  it('discards a response that resolves after the session signal aborted', async () => {
    let release: (r: Response) => void = () => {};
    const fetchImpl = (() =>
      new Promise<Response>((resolve) => {
        release = resolve;
      })) as typeof fetch; // ignores the signal, like a response already resolving
    const client = createYnabClient('pat', { fetchImpl });
    const controller = new AbortController();
    const outcome = failureOf(client.listPlans({ signal: controller.signal }));
    controller.abort();
    release(json(200, planBody));
    expect(await outcome).toEqual({ kind: 'cancelled' });
  });

  it('is not cancelled by a timeout reason supplied through the caller signal', async () => {
    // A caller cannot forge the private timeout reason: any caller abort is `cancelled`.
    const client = createYnabClient('pat', { fetchImpl: hangingFetch(), timeoutMs: 5_000 });
    const controller = new AbortController();
    const outcome = failureOf(client.listPlans({ signal: controller.signal }));
    controller.abort(new DOMException('timed out', 'TimeoutError'));
    expect(await outcome).toEqual({ kind: 'cancelled' });
  });

  it('removes its listeners from the caller signal once the request settles', async () => {
    const { fetchImpl } = recorder(() => json(200, planBody));
    const client = createYnabClient('pat', { fetchImpl });
    const controller = new AbortController();
    const add = vi.spyOn(controller.signal, 'addEventListener');
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    await client.listPlans({ signal: controller.signal });
    expect(add).toHaveBeenCalled();
    expect(remove).toHaveBeenCalled();
  });
});
