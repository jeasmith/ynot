import { describe, expect, it } from 'vite-plus/test';
import { createFakeYnab } from '../../test/fakeYnab.ts';
import type { AccountId, CategoryId, TransactionId } from '../domain/model.ts';
import { createYnabClient, type PlanSummary } from './client.ts';
import { ynabFailureOf } from './errors.ts';
import { loadBudget } from './load.ts';

function setup() {
  const fake = createFakeYnab({
    plans: [
      {
        id: 'p1',
        name: 'Household',
        firstMonth: '2019-03-01',
        accounts: [
          { id: 'a1', name: 'Current' },
          { id: 'a2', name: 'Closed', closed: true },
          { id: 'a3', deleted: true },
        ],
        categoryGroups: [{ id: 'g1', name: 'Bills', categories: [{ id: 'c1', name: 'Rent' }] }],
        transactions: [
          { id: 't0', date: '2019-03-05', memo: '#earliest' },
          {
            id: 't1',
            date: '2024-02-01',
            memo: 'split',
            subtransactions: [{ id: 's1', amount: -1, memo: '#a' }],
          },
          { id: 't2', date: '2024-02-02', memo: '' },
          { id: 'tx', date: '2024-02-03', deleted: true },
        ],
      },
    ],
  });
  const client = createYnabClient('pat', { fetchImpl: fake.fetchImpl });
  return { fake, client };
}

async function planOf(client: ReturnType<typeof setup>['client']): Promise<PlanSummary> {
  const plans = await client.listPlans();
  return plans[0]!;
}

describe('loadBudget', () => {
  it('loads accounts, categories and transactions from the plan’s first month', async () => {
    const { fake, client } = setup();
    const loaded = await loadBudget(client, await planOf(client));

    expect(loaded.plan).toMatchObject({ id: 'p1', name: 'Household', firstMonth: '2019-03-01' });
    expect([...loaded.transactions.keys()].sort((a, b) => a.localeCompare(b))).toEqual([
      't0',
      't1',
      't2',
    ]);
    expect(loaded.transactions.get('t2' as TransactionId)?.memo).toBeNull();
    expect(loaded.transactions.get('t1' as TransactionId)?.subtransactions).toHaveLength(1);
    expect([...loaded.accounts.keys()]).toEqual(['a1', 'a2']);
    expect(loaded.accounts.get('a2' as AccountId)?.closed).toBe(true);
    expect(loaded.categories.get('c1' as CategoryId)?.groupName).toBe('Bills');

    const gets = fake.requests.filter((r) => r.path.endsWith('/transactions'));
    expect(gets).toHaveLength(1);
    expect(gets[0]?.query['since_date']).toBe('2019-03-01');
    expect(gets[0]?.query['last_knowledge_of_server']).toBeUndefined();
  });

  it('records the knowledge cursors from each response', async () => {
    const { fake, client } = setup();
    const loaded = await loadBudget(client, await planOf(client));
    const k = fake.serverKnowledge('p1');
    expect(loaded.knowledge).toEqual({ transactions: k, accounts: k, categories: k });
  });

  it('requests accounts, categories and transactions in parallel', async () => {
    const { fake, client } = setup();
    const started: string[] = [];
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const gated = createYnabClient('pat', {
      fetchImpl: (async (input: RequestInfo | URL, init?: RequestInit) => {
        started.push(input instanceof Request ? input.url : String(input as string | URL));
        await gate;
        return fake.fetchImpl(input, init);
      }) as typeof fetch,
    });
    const plan = await planOf(client);
    const pending = loadBudget(gated, plan);
    await new Promise((r) => setTimeout(r, 0));
    expect(
      started
        .map((u) => new URL(u).pathname.split('/').pop() ?? '')
        .sort((a, b) => a.localeCompare(b)),
    ).toEqual(['accounts', 'categories', 'transactions']);
    release();
    await pending;
  });

  it('shows no partial result: if any request fails, the load fails', async () => {
    const { fake, client } = setup();
    const plan = await planOf(client);
    fake.queueFaults({ kind: '5xx', status: 500 });
    const failure = await loadBudget(client, plan).catch((e: unknown) => ynabFailureOf(e));
    expect(failure).toEqual({ kind: 'server', status: 500 });
  });

  it('passes the session signal to every request', async () => {
    const { fake, client } = setup();
    const plan = await planOf(client);
    const controller = new AbortController();
    controller.abort();
    const before = fake.requests.length;
    const failure = await loadBudget(client, plan, { signal: controller.signal }).catch(
      (e: unknown) => ynabFailureOf(e),
    );
    expect(failure).toEqual({ kind: 'cancelled' });
    expect(fake.requests.length).toBe(before);
  });

  it('loads an empty plan without error', async () => {
    const fake = createFakeYnab({ plans: [{ id: 'empty', accounts: [] }] });
    const client = createYnabClient('pat', { fetchImpl: fake.fetchImpl });
    const loaded = await loadBudget(client, await planOf(client));
    expect(loaded.transactions.size).toBe(0);
    expect(loaded.accounts.size).toBe(0);
  });
});
