// PROTOTYPE (wayfinder ticket #33, map #29). Throwaway: answers one question and is not used by
// any test.
//
// Question: can a test scenario written once as data drive both the fake YNAB and a seeding
// script against a real test budget? What does the seed cost in requests, which features need a
// person in YNAB, and does an `import_id` scheme make reseeding a no-op?
//
// This module is the portable part: pure functions over plain data, no I/O. `tui.ts` drives it.
// API facts come from `openapi/ynab-1.87.0.yaml`; anything the document leaves open is reported
// as `undocumented` rather than assumed.
import type { FakePlanInit, FakeTransactionInit } from '../fakeYnab.ts';

// ---------------------------------------------------------------------------------------------
// Scenario
// ---------------------------------------------------------------------------------------------

/** `SaveAccountType`: the types the API can create. Tracking accounts are the two "other" ones. */
export type AccountType =
  | 'checking'
  | 'savings'
  | 'cash'
  | 'creditCard'
  | 'otherAsset'
  | 'otherLiability';

export interface ScenarioAccount {
  readonly key: string;
  readonly name: string;
  readonly type: AccountType;
  readonly closed?: boolean;
}

export interface ScenarioCategoryGroup {
  readonly key: string;
  readonly name: string;
  readonly categories: readonly { key: string; name: string; hidden?: boolean }[];
}

export interface ScenarioLine {
  readonly amount: number;
  readonly memo?: string;
  readonly category?: string;
}

export interface ScenarioTransaction {
  readonly key: string;
  readonly account: string;
  /** Relative to the run date, because YNAB refuses future dates and "older than a year" moves. */
  readonly daysAgo: number;
  /** Milliunits. */
  readonly amount: number;
  readonly payee?: string;
  readonly category?: string;
  readonly memo?: string;
  readonly approved?: boolean;
  readonly cleared?: 'cleared' | 'uncleared' | 'reconciled';
  readonly flag?: 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple';
  readonly lines?: readonly ScenarioLine[];
  /** A transfer to this account key. YNAB creates the other side itself. */
  readonly transferTo?: string;
  /** The memo wanted on the other side of a transfer. */
  readonly counterpartMemo?: string;
  /** Created, then deleted, so loaders see a tombstone. */
  readonly deleted?: boolean;
}

export interface Scenario {
  readonly id: string;
  readonly name: string;
  readonly accounts: readonly ScenarioAccount[];
  readonly categoryGroups: readonly ScenarioCategoryGroup[];
  readonly transactions: readonly ScenarioTransaction[];
  /** Tag spelling → expected net in milliunits. The same assertions run against either backend. */
  readonly expectedNets: Readonly<Record<string, number>>;
}

const isTracking = (type: AccountType) => type === 'otherAsset' || type === 'otherLiability';

export function isoDate(today: string, daysAgo: number): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------------------------
// import_id: deterministic, at most 36 characters (`NewTransaction.import_id`)
// ---------------------------------------------------------------------------------------------

function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (const ch of text) {
    hash ^= ch.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** `YNOT:<scenario hash>:<key hash>`, 22 characters whatever the key length. */
export function importIdFor(scenario: Scenario, key: string): string {
  return `YNOT:${fnv1a(scenario.id)}:${fnv1a(key)}`;
}

// ---------------------------------------------------------------------------------------------
// Backend 1: the fake
// ---------------------------------------------------------------------------------------------

/** The scenario as `createFakeYnab` seed data, including the transfer sides YNAB would create. */
export function toFakePlan(
  scenario: Scenario,
  today: string,
  planId = 'plan-scenario',
): FakePlanInit {
  const accountName = new Map(scenario.accounts.map((a) => [a.key, a.name]));
  const transactions: FakeTransactionInit[] = [];
  for (const t of scenario.transactions) {
    const date = isoDate(today, t.daysAgo);
    const pairId = t.transferTo === undefined ? undefined : `${t.key}~pair`;
    transactions.push({
      id: t.key,
      date,
      amount: t.amount,
      memo: t.memo ?? null,
      accountId: t.account,
      payeeName: t.transferTo
        ? `Transfer : ${accountName.get(t.transferTo) ?? t.transferTo}`
        : (t.payee ?? null),
      categoryId: t.lines ? null : (t.category ?? null),
      approved: t.approved ?? true,
      cleared: t.cleared ?? 'cleared',
      flagColor: t.flag ?? null,
      transferTransactionId: pairId ?? null,
      deleted: t.deleted ?? false,
      subtransactions: (t.lines ?? []).map((l, i) => ({
        id: `${t.key}~${i}`,
        amount: l.amount,
        memo: l.memo ?? null,
        categoryId: l.category ?? null,
      })),
    });
    if (pairId !== undefined && t.transferTo !== undefined) {
      transactions.push({
        id: pairId,
        date,
        amount: -t.amount,
        // Undocumented: what memo YNAB gives the side it creates. The fake assumes none.
        memo: t.counterpartMemo ?? null,
        accountId: t.transferTo,
        payeeName: `Transfer : ${accountName.get(t.account) ?? t.account}`,
        transferTransactionId: t.key,
        deleted: t.deleted ?? false,
      });
    }
  }
  return {
    id: planId,
    name: scenario.name,
    firstMonth: `${isoDate(today, Math.max(0, ...scenario.transactions.map((t) => t.daysAgo))).slice(0, 7)}-01`,
    accounts: scenario.accounts.map((a) => ({
      id: a.key,
      name: a.name,
      onBudget: !isTracking(a.type),
      closed: a.closed ?? false,
    })),
    categoryGroups: scenario.categoryGroups.map((g) => ({
      id: g.key,
      name: g.name,
      categories: g.categories.map((c) => ({ id: c.key, name: c.name, hidden: c.hidden ?? false })),
    })),
    transactions,
  };
}

// ---------------------------------------------------------------------------------------------
// Backend 2: a real test budget
// ---------------------------------------------------------------------------------------------

/** What a first read of the test budget found, matched by name or `import_id`. */
export interface SeedState {
  readonly accounts: ReadonlySet<string>;
  readonly groups: ReadonlySet<string>;
  /** `group name/category name`. */
  readonly categories: ReadonlySet<string>;
  readonly importIds: ReadonlySet<string>;
  /** The plan's `first_month`; a new plan's is probably the month it was created. */
  readonly firstMonth: string;
}

export interface SeedRequest {
  readonly method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  readonly path: string;
  readonly why: string;
}

export interface SeedPlan {
  readonly requests: readonly SeedRequest[];
  /** Things a person must do in YNAB, because the API cannot. */
  readonly manualSteps: readonly string[];
  /** The scenario breaks a documented API rule; seeding would fail. */
  readonly invalid: readonly string[];
  /** The OpenAPI document is silent; a contract check has to settle it. */
  readonly undocumented: readonly string[];
  readonly transactionsToCreate: number;
  readonly alreadySeeded: number;
}

export interface SeedOptions {
  readonly today: string;
  /** `PostTransactionsWrapper.transactions` documents no maximum. */
  readonly batchSize: number;
  readonly existing: SeedState;
}

const codePoints = (s: string) => Array.from(s).length;

export function planSeed(scenario: Scenario, options: SeedOptions): SeedPlan {
  const { existing, today, batchSize } = options;
  const requests: SeedRequest[] = [];
  const manualSteps: string[] = [];
  const invalid: string[] = [];
  const undocumented = new Set<string>();
  const accounts = new Map(scenario.accounts.map((a) => [a.key, a]));
  const req = (method: SeedRequest['method'], path: string, why: string) =>
    requests.push({ method, path, why });

  // Reads: first_month, existing accounts (with transfer_payee_id) and categories.
  req('GET', '/plans/{plan}', 'first_month and a sanity check that this is the test budget');
  req('GET', '/plans/{plan}/accounts', 'existing accounts and their transfer_payee_id');
  req('GET', '/plans/{plan}/categories', 'existing groups and categories');
  req('GET', '/plans/{plan}/transactions', 'import_ids already seeded (since_date = first_month)');

  for (const a of scenario.accounts) {
    if (!existing.accounts.has(a.name)) {
      req('POST', '/plans/{plan}/accounts', `create account "${a.name}" (${a.type}, balance 0)`);
      undocumented.add('Whether a balance-0 account gets a starting-balance transaction.');
    }
    if (a.closed) {
      manualSteps.push(`Close "${a.name}" in YNAB after seeding (the API cannot close accounts).`);
    }
  }
  for (const g of scenario.categoryGroups) {
    if (codePoints(g.name) > 50) invalid.push(`Group "${g.name}" is over 50 characters.`);
    if (!existing.groups.has(g.name)) {
      req('POST', '/plans/{plan}/category_groups', `create group "${g.name}"`);
    }
    for (const c of g.categories) {
      if (!existing.categories.has(`${g.name}/${c.name}`)) {
        req('POST', '/plans/{plan}/categories', `create category "${g.name}/${c.name}"`);
      }
      if (c.hidden) {
        manualSteps.push(`Hide "${g.name}/${c.name}" in YNAB (SaveCategory has no hidden field).`);
      }
    }
  }

  let toCreate = 0;
  let alreadySeeded = 0;
  const toDelete: string[] = [];
  const counterpartMemos: string[] = [];
  for (const t of scenario.transactions) {
    const where = `"${t.key}"`;
    const account = accounts.get(t.account);
    if (!account) invalid.push(`${where} uses unknown account ${t.account}.`);
    if (!Number.isInteger(t.amount)) invalid.push(`${where} amount is not whole milliunits.`);
    if (t.daysAgo < 0) invalid.push(`${where} is in the future, which YNAB refuses.`);
    if (t.memo !== undefined && codePoints(t.memo) > 500) invalid.push(`${where} memo > 500.`);
    if (t.payee !== undefined && codePoints(t.payee) > 200) invalid.push(`${where} payee > 200.`);
    if (t.lines) {
      const sum = t.lines.reduce((s, l) => s + l.amount, 0);
      if (sum !== t.amount) invalid.push(`${where} split lines sum to ${sum}, not ${t.amount}.`);
      if (account && isTracking(account.type)) invalid.push(`${where} splits a tracking account.`);
      for (const l of t.lines) {
        if (!Number.isInteger(l.amount)) {
          invalid.push(`${where} line amount ${l.amount} is not whole milliunits.`);
        }
        if (l.memo !== undefined && codePoints(l.memo) > 500)
          invalid.push(`${where} line memo > 500.`);
      }
    }
    if (t.transferTo !== undefined) {
      const target = accounts.get(t.transferTo);
      if (!target) invalid.push(`${where} transfers to unknown account ${t.transferTo}.`);
      else if (t.lines && account && !isTracking(account.type) && !isTracking(target.type)) {
        invalid.push(`${where} splits a transfer between on-budget accounts.`);
      }
      if (t.counterpartMemo !== undefined) counterpartMemos.push(t.key);
      undocumented.add('Which memo YNAB puts on the transfer side it creates.');
    }
    const date = isoDate(today, t.daysAgo);
    if (date < existing.firstMonth) {
      undocumented.add(
        `Whether a transaction dated before first_month (${existing.firstMonth}) is accepted, ` +
          'and whether it moves first_month.',
      );
    }
    if (account?.closed) {
      // Seeding must run before the manual close: undocumented whether a closed account takes writes.
      undocumented.add('Whether transactions can be created in an account after it is closed.');
    }

    if (existing.importIds.has(importIdFor(scenario, t.key))) {
      alreadySeeded += 1;
      continue;
    }
    toCreate += 1;
    if (t.deleted) {
      toDelete.push(t.key);
      undocumented.add(
        'Whether a deleted transaction keeps its import_id (so reseeding skips it).',
      );
    }
  }

  for (let i = 0; i < toCreate; i += batchSize) {
    const n = Math.min(batchSize, toCreate - i);
    req('POST', '/plans/{plan}/transactions', `create ${n} transactions with import_ids`);
  }
  if (toCreate > 0 && batchSize > 50) {
    undocumented.add(
      `Whether one POST accepts ${batchSize} transactions (check 3 only covers 50).`,
    );
  }
  if (counterpartMemos.length > 0 && toCreate > 0) {
    // The created side's id is in no response, so it has to be read before it can be patched.
    req('GET', '/plans/{plan}/transactions', 'find the transfer sides YNAB created');
    req('PATCH', '/plans/{plan}/transactions', `set ${counterpartMemos.length} counterpart memos`);
  }
  for (const key of toDelete) {
    req('DELETE', '/plans/{plan}/transactions/{id}', `delete "${key}" (one request each)`);
  }
  if (toCreate > 0) req('GET', '/plans/{plan}/transactions', 'verify: read back and compare');

  return {
    requests,
    manualSteps,
    invalid,
    undocumented: [...undocumented],
    transactionsToCreate: toCreate,
    alreadySeeded,
  };
}

/** The state a reseed would find after `scenario` was seeded once (by name and import_id). */
export function stateAfterSeed(scenario: Scenario, firstMonth: string): SeedState {
  return {
    accounts: new Set(scenario.accounts.map((a) => a.name)),
    groups: new Set(scenario.categoryGroups.map((g) => g.name)),
    categories: new Set(
      scenario.categoryGroups.flatMap((g) => g.categories.map((c) => `${g.name}/${c.name}`)),
    ),
    // Assumes YNAB keeps the import_id of a deleted transaction; see `undocumented`.
    importIds: new Set(scenario.transactions.map((t) => importIdFor(scenario, t.key))),
    firstMonth,
  };
}

export function emptyState(today: string): SeedState {
  return {
    accounts: new Set(),
    groups: new Set(),
    categories: new Set(),
    importIds: new Set(),
    firstMonth: `${today.slice(0, 7)}-01`,
  };
}

// ---------------------------------------------------------------------------------------------
// Building scenarios
// ---------------------------------------------------------------------------------------------

export interface Features {
  readonly splits: boolean;
  readonly transfers: boolean;
  readonly closedAccount: boolean;
  readonly oldHistory: boolean;
  readonly deleted: boolean;
  readonly hiddenCategory: boolean;
  /** Extra generated transactions. */
  readonly volume: number;
}

/** A deterministic PRNG, so generated data is the same on every run and on every backend. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The e2e fixture budget (`e2e/fixtures.ts`) restated as a scenario, with switchable features. */
export function householdScenario(f: Features): Scenario {
  const accounts: ScenarioAccount[] = [
    { key: 'checking', name: 'Everyday Checking', type: 'checking' },
    { key: 'savings', name: 'Holiday Savings', type: 'savings' },
  ];
  const nets: Record<string, number> = {};
  const add = (tag: string, amount: number) => (nets[tag] = (nets[tag] ?? 0) + amount);
  const tx: ScenarioTransaction[] = [];

  if (f.splits) {
    tx.push({
      key: 'bill',
      account: 'checking',
      daysAgo: 40,
      amount: -120_000,
      payee: 'Trattoria',
      lines: [
        { amount: -30_000, memo: 'Own share', category: 'eating-out' },
        { amount: -25_000, memo: '#owed-alice' },
        { amount: -35_000, memo: '#owed-bob' },
        { amount: -30_000, memo: '#owed-carol' },
      ],
    });
    tx.push({
      key: 'repay',
      account: 'checking',
      daysAgo: 37,
      amount: 25_000,
      payee: 'Alice',
      memo: '#owed-alice',
    });
    add('owed-alice', 0);
    add('owed-bob', -35_000);
    add('owed-carol', -30_000);
  }
  if (f.transfers) {
    tx.push({
      key: 'trip',
      account: 'checking',
      daysAgo: 30,
      amount: -50_000,
      transferTo: 'savings',
      memo: 'Holiday fund #trip',
      counterpartMemo: 'Holiday fund #trip',
    });
    add('trip', 0);
  }
  tx.push(
    {
      key: 'repair-1',
      account: 'checking',
      daysAgo: 20,
      amount: -80_000,
      payee: 'Plumber',
      memo: '#home-repair boiler',
    },
    {
      key: 'repair-2',
      account: 'checking',
      daysAgo: 18,
      amount: -20_000,
      payee: 'Hardware store',
      memo: '#home-repair',
      approved: false,
    },
    {
      key: 'repair-3',
      account: 'checking',
      daysAgo: 16,
      amount: -15_000,
      payee: 'Hardware store',
      memo: '#home_repair',
      flag: 'red',
    },
    {
      key: 'repair-4',
      account: 'checking',
      daysAgo: 14,
      amount: -5_000,
      payee: 'Hardware store',
      memo: '#home_repair',
      cleared: 'uncleared',
    },
    {
      key: 'once',
      account: 'checking',
      daysAgo: 10,
      amount: -9_990,
      payee: 'Market stall',
      memo: 'Lamp #one-off',
    },
    {
      key: 'prose',
      account: 'checking',
      daysAgo: 9,
      amount: -1_000,
      payee: 'Coffee',
      memo: 'Issue \\#42 is not a tag',
    },
  );
  add('home-repair', -100_000);
  add('home_repair', -20_000);
  add('one-off', -9_990);

  if (f.closedAccount) {
    accounts.push({ key: 'old', name: 'Old Joint Account', type: 'checking', closed: true });
    tx.push(
      {
        key: 'old-1',
        account: 'old',
        daysAgo: f.oldHistory ? 900 : 60,
        amount: -45_000,
        payee: 'Landlord',
        memo: '#archive',
      },
      {
        key: 'old-2',
        account: 'old',
        daysAgo: f.oldHistory ? 870 : 58,
        amount: -45_000,
        payee: 'Landlord',
        memo: '#archive',
      },
    );
    add('archive', -90_000);
  } else if (f.oldHistory) {
    tx.push({
      key: 'old-1',
      account: 'checking',
      daysAgo: 900,
      amount: -45_000,
      payee: 'Landlord',
      memo: '#archive',
    });
    add('archive', -45_000);
  }
  if (f.deleted) {
    // Deleted, so it must not count: #owed-alice stays as expected.
    tx.push({
      key: 'mistake',
      account: 'checking',
      daysAgo: 5,
      amount: -99_000,
      payee: 'Typo',
      memo: '#owed-alice',
      deleted: true,
    });
    nets['owed-alice'] ??= 0;
  }

  const random = mulberry32(42);
  const vocab = ['groceries', 'fuel', 'gifts', 'kids'];
  for (let i = 0; i < f.volume; i++) {
    const tag = vocab[Math.floor(random() * vocab.length)]!;
    const amount = -Math.floor(random() * 100_000) * 10; // whole cents, so any currency works
    const daysAgo = 1 + Math.floor(random() * 300);
    tx.push({
      key: `gen-${i}`,
      account: 'checking',
      daysAgo,
      amount,
      payee: `Shop ${i % 25}`,
      memo: `#${tag}`,
    });
    add(tag, amount);
  }

  return {
    id: 'household-v1',
    name: 'Ynot integration test budget',
    accounts,
    categoryGroups: [
      {
        key: 'everyday',
        name: 'Everyday',
        categories: [
          { key: 'eating-out', name: 'Eating out' },
          ...(f.hiddenCategory ? [{ key: 'retired', name: 'Retired category', hidden: true }] : []),
        ],
      },
    ],
    transactions: tx,
    expectedNets: nets,
  };
}
