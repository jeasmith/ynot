// PROTOTYPE (wayfinder ticket #33). A throwaway terminal UI over `scenario.ts`.
//
//   pnpm prototype:scenario
//
// Toggle scenario features and watch two things change side by side: the seed plan a real test
// budget would need, and whether the same scenario loaded into the fake YNAB meets its own
// expected tag totals through the app's real loader and tag index.
import { emitKeypressEvents } from 'node:readline';
import { tagIdentity } from '../../src/domain/grammar/identity.ts';
import { parseMemo } from '../../src/domain/grammar/parseMemo.ts';
import { buildTagIndex } from '../../src/domain/tags/tagIndex.ts';
import { createYnabClient } from '../../src/ynab/client.ts';
import { loadBudget } from '../../src/ynab/load.ts';
import { createFakeYnab } from '../fakeYnab.ts';
import {
  emptyState,
  householdScenario,
  planSeed,
  stateAfterSeed,
  toFakePlan,
  type Features,
  type Scenario,
} from './scenario.ts';

const RATE_LIMIT = 200;
const VOLUMES = [0, 50, 500, 2000] as const;
const BATCHES = [25, 50, 100, 1000] as const;
const today = new Date().toISOString().slice(0, 10);

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const onOff = (on: boolean) => (on ? green('on ') : dim('off'));

interface State {
  features: Features;
  batch: number;
  reseed: boolean;
}

let state: State = {
  features: {
    splits: true,
    transfers: true,
    closedAccount: true,
    oldHistory: true,
    deleted: false,
    hiddenCategory: false,
    volume: 0,
  },
  batch: 100,
  reseed: false,
};

async function fakeCheck(scenario: Scenario): Promise<string[]> {
  const fake = createFakeYnab({ plans: [toFakePlan(scenario, today)] });
  const client = createYnabClient('prototype', { fetchImpl: fake.fetchImpl });
  const [plan] = await client.listPlans();
  const budget = await loadBudget(client, plan!);
  const index = buildTagIndex(budget.transactions, parseMemo);
  const lines: string[] = [];
  let ok = 0;
  for (const [spelling, expected] of Object.entries(scenario.expectedNets)) {
    const actual = index.byIdentity.get(tagIdentity(spelling))?.total.netMilliunits ?? 0;
    if (actual === expected) ok += 1;
    else lines.push(red(`  #${spelling}: expected ${expected}, fake gives ${actual}`));
  }
  const unexpected = [...index.byIdentity.values()].filter(
    (e) => !Object.keys(scenario.expectedNets).some((s) => tagIdentity(s) === e.identity),
  );
  for (const e of unexpected) lines.push(yellow(`  #${e.canonicalSpelling} has no expectation`));
  lines.unshift(
    `  ${ok}/${Object.keys(scenario.expectedNets).length} expected nets match ` +
      dim(
        `(${budget.transactions.size} live transactions via loadBudget, ${fake.requests.length} fake requests)`,
      ),
  );
  return lines;
}

async function render(): Promise<void> {
  const scenario = householdScenario(state.features);
  const firstMonth = `${today.slice(0, 7)}-01`;
  const existing = state.reseed ? stateAfterSeed(scenario, firstMonth) : emptyState(today);
  const plan = planSeed(scenario, { today, batchSize: state.batch, existing });
  const fake = await fakeCheck(scenario);

  const counts = new Map<string, number>();
  for (const r of plan.requests) {
    const k = `${r.method.padEnd(6)} ${r.path}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const total = plan.requests.length;
  const budget = total > RATE_LIMIT ? red : total > RATE_LIMIT / 2 ? yellow : green;

  const out: string[] = [];
  out.push(
    bold(`Scenario "${scenario.id}"`) +
      dim(`  run date ${today}, test budget first_month ${firstMonth}`),
  );
  out.push(
    `  ${scenario.accounts.length} accounts, ${scenario.transactions.length} transactions, ` +
      `${Object.keys(scenario.expectedNets).length} tags with expected nets`,
  );
  out.push('');
  out.push(
    bold('Seed plan for a real budget') +
      dim(state.reseed ? '  (reseed: the budget already holds this scenario)' : '  (empty budget)'),
  );
  for (const [k, n] of counts) out.push(`  ${String(n).padStart(4)} × ${k}`);
  out.push(
    `  ${budget(`${total} requests`)} of ${RATE_LIMIT}/hour` +
      dim(
        `; ${plan.transactionsToCreate} to create, ${plan.alreadySeeded} already there by import_id`,
      ),
  );
  out.push('');
  out.push(bold('Manual steps in YNAB'));
  out.push(
    ...(plan.manualSteps.length ? plan.manualSteps.map((s) => `  - ${s}`) : [dim('  none')]),
  );
  out.push(bold('Invalid for the API'));
  out.push(...(plan.invalid.length ? plan.invalid.map((s) => red(`  - ${s}`)) : [dim('  none')]));
  out.push(bold('Undocumented (needs a contract check)'));
  out.push(
    ...(plan.undocumented.length
      ? plan.undocumented.map((s) => yellow(`  - ${s}`))
      : [dim('  none')]),
  );
  out.push('');
  out.push(bold('Same scenario in the fake YNAB'));
  out.push(...fake);
  out.push('');
  const f = state.features;
  out.push(
    `${bold('[s]')} splits ${onOff(f.splits)}  ${bold('[t]')} transfers ${onOff(f.transfers)}  ` +
      `${bold('[c]')} closed account ${onOff(f.closedAccount)}  ${bold('[o]')} >1y history ${onOff(f.oldHistory)}`,
  );
  out.push(
    `${bold('[d]')} deleted tx ${onOff(f.deleted)}  ${bold('[h]')} hidden category ${onOff(f.hiddenCategory)}  ` +
      `${bold('[v]')} volume ${f.volume}  ${bold('[b]')} batch ${state.batch}  ` +
      `${bold('[r]')} reseed ${onOff(state.reseed)}  ${bold('[q]')} quit`,
  );
  console.clear();
  console.log(out.join('\n'));
}

const next = <T>(list: readonly T[], current: T): T =>
  list[(list.indexOf(current) + 1) % list.length]!;

function toggle(key: string): boolean {
  const f = state.features;
  const set = (patch: Partial<Features>) => (state = { ...state, features: { ...f, ...patch } });
  switch (key) {
    case 's':
      set({ splits: !f.splits });
      break;
    case 't':
      set({ transfers: !f.transfers });
      break;
    case 'c':
      set({ closedAccount: !f.closedAccount });
      break;
    case 'o':
      set({ oldHistory: !f.oldHistory });
      break;
    case 'd':
      set({ deleted: !f.deleted });
      break;
    case 'h':
      set({ hiddenCategory: !f.hiddenCategory });
      break;
    case 'v':
      set({ volume: next(VOLUMES, f.volume as (typeof VOLUMES)[number]) });
      break;
    case 'b':
      state = { ...state, batch: next(BATCHES, state.batch as (typeof BATCHES)[number]) };
      break;
    case 'r':
      state = { ...state, reseed: !state.reseed };
      break;
    default:
      return false;
  }
  return true;
}

if (!process.stdin.isTTY) {
  // Not interactive (for example piped): print one frame and stop.
  await render();
} else {
  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.on('keypress', (_text: string, key: { name?: string; ctrl?: boolean }) => {
    if (key.name === 'q' || (key.ctrl && key.name === 'c')) {
      process.stdin.setRawMode(false);
      process.exit(0);
    }
    if (key.name && toggle(key.name)) void render();
  });
  await render();
}
