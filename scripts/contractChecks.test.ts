import { describe, expect, it } from 'vite-plus/test';
import { createFakeYnab, type FakeTransactionInit } from '../test/fakeYnab.ts';
import { BATCH_SIZE, formatReport, MARKER, runContractChecks } from './contractChecks.ts';

const PAT = 'pat-secret-value';
const PROSE = 'lunch with Sam at the corner place';

function seed(extra: FakeTransactionInit[] = [], plain = BATCH_SIZE + 5): FakeTransactionInit[] {
  const many: FakeTransactionInit[] = Array.from({ length: plain }, (_, i) => ({
    id: `p${i}`,
    date: `2025-03-${String((i % 28) + 1).padStart(2, '0')}`,
    memo: i % 3 === 0 ? null : `${PROSE} ${i}`,
    amount: -1_234_560 - i,
  }));
  return [
    {
      id: 'split',
      date: '2025-06-01',
      memo: PROSE,
      subtransactions: [
        { id: 's1', amount: -5_000, memo: 'half #alex' },
        { id: 's2', amount: -5_000, memo: 'half #sam' },
      ],
      amount: -10_000,
    },
    { id: 'unapproved', date: '2025-06-02', approved: false, memo: PROSE },
    { id: 'flagged', date: '2025-06-03', flagColor: 'red', cleared: 'uncleared', memo: PROSE },
    { id: 'old', date: '2020-01-04', memo: PROSE },
    ...many,
    ...extra,
  ];
}

function setup(transactions = seed()) {
  const fake = createFakeYnab({
    token: PAT,
    plans: [{ id: 'plan-1', name: 'Test budget', firstMonth: '2020-01-01', transactions }],
  });
  const snapshot = () =>
    Object.fromEntries(transactions.map((t) => [t.id, fake.getTransaction('plan-1', t.id)]));
  return { fake, snapshot };
}

const now = () => new Date('2026-10-13T12:00:00Z');

describe('runContractChecks against the fake YNAB', () => {
  it('passes every check and leaves every transaction as it found it', async () => {
    const { fake, snapshot } = setup();
    const before = snapshot();
    const lines: string[] = [];
    const run = await runContractChecks({
      pat: PAT,
      planId: 'plan-1',
      fetchImpl: fake.fetchImpl,
      ask: async () => 'y',
      log: (l) => lines.push(l),
      now,
    });

    expect(run.results.map((r) => [r.id, r.outcome])).toEqual([
      [1, 'pass'],
      [2, 'pass'],
      [3, 'pass'],
      [4, 'pass'],
      [5, 'pass'],
    ]);
    expect(run.unrestored).toEqual([]);
    expect(run.requests).toBeLessThan(25);

    // Memos are back; only `approved` was ever resent, so nothing else moved either.
    const after = snapshot();
    for (const [id, t] of Object.entries(before)) {
      expect(after[id]?.memo ?? null, id).toBe(t?.memo ?? null);
      expect({ ...after[id], memo: null }, id).toEqual({ ...t, memo: null });
    }

    // Every write is {id, memo, approved}, so no PATCH can touch a split's lines.
    for (const p of fake.patches()) {
      const items = (p.body as { transactions: Record<string, unknown>[] }).transactions;
      for (const item of items)
        expect(Object.keys(item).sort()).toEqual(['approved', 'id', 'memo']);
    }
    expect(
      Math.max(...fake.patches().map((p) => (p.body as { transactions: [] }).transactions.length)),
    ).toBe(BATCH_SIZE);

    // No memo, amount or token in the output or the report.
    const output = [...lines, formatReport(run)].join('\n');
    expect(output).not.toContain(PAT);
    expect(output).not.toContain(PROSE);
    expect(output).not.toContain('#alex');
    expect(output).not.toMatch(/1234\.?56|1,234/);
  });

  it('only reads in a read-only run', async () => {
    const { fake } = setup();
    const run = await runContractChecks({
      pat: PAT,
      planId: 'plan-1',
      fetchImpl: fake.fetchImpl,
      readOnly: true,
      now,
    });
    expect(fake.patches()).toHaveLength(0);
    expect(run.results.find((r) => r.id === 2)?.outcome).toBe('pass');
    expect(run.results.filter((r) => r.outcome === 'skipped').map((r) => r.id)).toEqual([
      1, 3, 4, 5,
    ]);
  });

  it('fails check 1 and skips the batch when a memo PATCH changes another field', async () => {
    const { fake, snapshot } = setup();
    const before = snapshot();
    // A YNAB that reconciles a transaction whenever a memo is written.
    const fetchImpl: typeof fetch = async (input, init) => {
      const response = await fake.fetchImpl(input, init);
      if (init?.method === 'PATCH')
        fake.updateTransaction('plan-1', 'flagged', { cleared: 'reconciled' });
      return response;
    };
    const run = await runContractChecks({ pat: PAT, planId: 'plan-1', fetchImpl, now });

    const check1 = run.results.find((r) => r.id === 1)!;
    expect(check1.outcome).toBe('fail');
    expect(check1.notes.join(' ')).toContain('cleared');
    expect(run.results.find((r) => r.id === 3)?.outcome).toBe('skipped');
    expect(
      fake
        .patches()
        .every((p) => (p.body as { transactions: [] }).transactions.length < BATCH_SIZE),
    ).toBe(true);
    expect(snapshot()['split']?.memo).toBe(before['split']?.memo);
  });

  it('fails check 3 when YNAB rejects a batch of 50, without changing anything', async () => {
    const { fake, snapshot } = setup();
    const before = snapshot();
    const fetchImpl: typeof fetch = async (input, init) => {
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      if (body?.transactions?.length === BATCH_SIZE) {
        return new Response(
          JSON.stringify({ error: { id: '400', name: 'bad_request', detail: PROSE } }),
          {
            status: 400,
          },
        );
      }
      return fake.fetchImpl(input, init);
    };
    const run = await runContractChecks({ pat: PAT, planId: 'plan-1', fetchImpl, now });
    const check3 = run.results.find((r) => r.id === 3)!;
    expect(check3.outcome).toBe('fail');
    expect(check3.notes.join(' ')).not.toContain(PROSE);
    expect(snapshot()).toEqual(before);
  });

  it('never overwrites a memo someone edits in YNAB while a check runs', async () => {
    const { fake } = setup();
    let edited = false;
    const fetchImpl: typeof fetch = async (input, init) => {
      const response = await fake.fetchImpl(input, init);
      if (init?.method === 'PATCH' && !edited) {
        edited = true;
        fake.externalEdit('plan-1', 'old', 'edited in YNAB');
      }
      return response;
    };
    const run = await runContractChecks({ pat: PAT, planId: 'plan-1', fetchImpl, now });
    expect(fake.getTransaction('plan-1', 'old')?.memo).toBe('edited in YNAB');
    expect(run.unrestored).toHaveLength(1);
    expect(run.unrestored[0]).toContain('2020-01-04');
  });

  it('reports check 5 as inconclusive when nobody looks in YNAB', async () => {
    const { fake } = setup();
    const run = await runContractChecks({
      pat: PAT,
      planId: 'plan-1',
      fetchImpl: fake.fetchImpl,
      now,
    });
    const check5 = run.results.find((r) => r.id === 5)!;
    expect(check5.outcome).toBe('inconclusive');
    expect(check5.notes).toContain('Sending "" stores "".');
    expect(check5.notes).toContain('Sending null stores null.');
  });

  it('marks a check that fails because YNAB missed older transactions', async () => {
    const { fake } = setup(seed([{ id: 'before-first-month', date: '2019-12-31' }]));
    const run = await runContractChecks({
      pat: PAT,
      planId: 'plan-1',
      fetchImpl: fake.fetchImpl,
      readOnly: true,
      now,
    });
    const check2 = run.results.find((r) => r.id === 2)!;
    expect(check2.outcome).toBe('fail');
    expect(check2.notes.join(' ')).toContain('1 transactions dated before first_month');
  });

  it('leaves the marker only while the checks run', async () => {
    const { fake } = setup();
    await runContractChecks({ pat: PAT, planId: 'plan-1', fetchImpl: fake.fetchImpl, now });
    const marked = fake
      .patches()
      .flatMap((p) => (p.body as { transactions: { memo: string | null }[] }).transactions)
      .filter((t) => t.memo?.includes(MARKER));
    expect(marked.length).toBeGreaterThan(0);
    for (const id of ['split', 'unapproved', 'flagged', 'old']) {
      expect(fake.getTransaction('plan-1', id)?.memo ?? '').not.toContain(MARKER);
    }
  });
});
