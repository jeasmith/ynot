/**
 * Runs the YNAB contract checks against the owner's test budget (task 8).
 *
 *   YNAB_PAT=… YNAB_PLAN_ID=… node scripts/contract-checks.ts [options]
 *
 * Options:
 *   --read-only      Run only check 2, which never writes.
 *   --yes            Skip the confirmation before writing.
 *   --report <path>  Also write the results as Markdown, for example
 *                    docs/research/ynab-contract-checks.md.
 *
 * The token is read from the environment only, sent only to api.ynab.com and never printed.
 * Without YNAB_PLAN_ID the script lists the plans the token can see and exits.
 * Needs Node 22.18 or later (type stripping).
 */
import { writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import type { PlanSummary } from '../src/ynab/client.ts';
import { formatReport, runContractChecks, YNAB_API } from './contractChecks.ts';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const reportIndex = args.indexOf('--report');
const reportPath = reportIndex === -1 ? undefined : args[reportIndex + 1];

const pat = process.env['YNAB_PAT']?.trim();
const planId = process.env['YNAB_PLAN_ID']?.trim();

if (flag('--help') || flag('-h')) {
  console.log('Usage: YNAB_PAT=… YNAB_PLAN_ID=… node scripts/contract-checks.ts');
  console.log('       [--read-only] [--yes] [--report <path>]');
  process.exit(0);
}
if (!pat) {
  console.error('Set YNAB_PAT to a personal access token for the test budget.');
  process.exit(2);
}
if (reportIndex !== -1 && (!reportPath || reportPath.startsWith('--'))) {
  console.error('--report needs a path.');
  process.exit(2);
}

const rl = process.stdin.isTTY
  ? createInterface({ input: process.stdin, output: process.stdout })
  : undefined;
const ask = rl ? (question: string) => rl.question(question) : undefined;

try {
  if (!planId) {
    const response = await fetch(`${YNAB_API}/plans?include_accounts=false`, {
      headers: { Authorization: `Bearer ${pat}`, Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`YNAB answered ${response.status} when listing plans`);
    const { data } = (await response.json()) as { data: { plans: PlanSummary[] } };
    console.log('Set YNAB_PLAN_ID to one of these plans (use the test budget):');
    for (const p of data.plans) console.log(`  ${p.id}  ${p.name}`);
    process.exit(2);
  }

  const readOnly = flag('--read-only');
  if (!readOnly && !flag('--yes')) {
    console.log(
      'The checks change memos on about 60 transactions in this plan and restore each one.\n' +
        'Run them only on a test budget. Check 3 resends 50 memos unchanged.',
    );
    const answer = ask ? await ask('Continue? Type "yes": ') : '';
    if (answer.trim().toLowerCase() !== 'yes') {
      console.log('Stopped. Nothing was written. Use --read-only to run check 2 alone.');
      process.exit(1);
    }
  }

  const run = await runContractChecks({
    pat,
    planId,
    readOnly,
    ask,
    log: (line) => console.log(line),
  });

  console.log('');
  console.log(`Done in ${run.requests} requests (YNAB allows 200 an hour).`);
  for (const r of run.results) console.log(`  ${r.id}. ${r.outcome.padEnd(12)} ${r.title}`);
  if (run.unrestored.length > 0) {
    console.log('\nThese memos need fixing by hand in YNAB (remove the #ynot-contract-check tag):');
    for (const line of run.unrestored) console.log(`  ${line}`);
  }
  if (reportPath) {
    writeFileSync(reportPath, formatReport(run));
    console.log(`\nWrote ${reportPath}`);
  }
  process.exitCode = run.results.some((r) => r.outcome === 'fail') ? 1 : 0;
} catch (error) {
  console.error(`\nStopped: ${error instanceof Error ? error.message : 'unknown error'}`);
  console.error('Check the log above for any memo the script could not restore.');
  process.exitCode = 1;
} finally {
  rl?.close();
}
