/**
 * The YNAB contract checks (design: Testing Strategy, "Contract checks"; tasks 8.1 and 8.2).
 *
 * Each check confirms an API behaviour the slice 2 write path depends on that YNAB does not
 * document. The checks run against the owner's test budget with plain `fetch`, change memos only
 * through `PATCH {id, memo, approved}`, and restore every memo they change. Output and the report
 * never contain memos, amounts or the token.
 *
 * The CLI entry point is `scripts/contract-checks.ts`; this module holds the logic so it can be
 * tested against the fake YNAB.
 */
import type { PlanSummary, TransactionDetail } from '../src/ynab/client.ts';

export const YNAB_API = 'https://api.ynab.com/v1';
/** The API description the app's types are generated from. */
export const API_VERSION = '1.87.0';
/** The batch size the write engine sends (check 3). */
export const BATCH_SIZE = 50;
/** Appended to a memo while a check runs, so a leftover change is easy to find in YNAB. */
export const MARKER = '#ynot-contract-check';
const MAX_MEMO_CODE_POINTS = 500;

export type CheckId = 1 | 2 | 3 | 4 | 5;
export type Outcome = 'pass' | 'fail' | 'inconclusive' | 'skipped';

export interface CheckResult {
  readonly id: CheckId;
  readonly title: string;
  readonly outcome: Outcome;
  /** Plain-language findings. Never memos, amounts or the token. */
  readonly notes: readonly string[];
}

export interface ContractCheckOptions {
  readonly pat: string;
  readonly planId: string;
  /** Run only the read-only check (2). */
  readonly readOnly?: boolean;
  /** Asks the owner a question and returns the answer. Absent means nobody is watching. */
  readonly ask?: (question: string) => Promise<string>;
  /** Progress lines for the terminal. They may name dates, accounts and payees, never memos. */
  readonly log?: (line: string) => void;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => Date;
}

export interface ContractCheckRun {
  readonly planName: string;
  readonly ranAt: string;
  readonly requests: number;
  readonly results: readonly CheckResult[];
  /** Transactions whose memo could not be restored; the owner fixes these by hand. */
  readonly unrestored: readonly string[];
}

export const CHECK_TITLES: Readonly<Record<CheckId, string>> = {
  1: 'PATCH with only id, memo and approved leaves every other field unchanged',
  2: 'since_date equal to first_month returns the earliest transactions',
  3: `The PATCH endpoint accepts a batch of ${BATCH_SIZE}`,
  4: 'The delta endpoint with since_date returns changes to older transactions',
  5: 'How YNAB stores a memo emptied to "" or null, and whether the difference is visible',
};

// ---------------------------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------------------------

/** A YNAB error. Only the status and YNAB's error id and name are kept: `detail` can echo data. */
export class YnabApiError extends Error {
  readonly status: number;
  constructor(status: number, id: string | undefined, name: string | undefined) {
    super(`YNAB answered ${status}${id ? ` (${id} ${name ?? ''})` : ''}`.trim());
    this.status = status;
  }
}

interface TransactionList {
  readonly transactions: TransactionDetail[];
  readonly server_knowledge: number;
}

interface MemoWrite {
  readonly id: string;
  readonly memo: string | null;
  readonly approved: boolean;
}

function createApi(pat: string, fetchImpl: typeof fetch) {
  let requests = 0;

  async function call<T>(
    method: 'GET' | 'PATCH',
    path: string,
    query: Record<string, string | number | undefined> = {},
    body?: unknown,
  ): Promise<T> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) params.set(key, String(value));
    }
    const qs = params.toString();
    const url = `${YNAB_API}${path}${qs === '' ? '' : `?${qs}`}`;
    // The token is only ever sent to YNAB (ADR 0006).
    if (!url.startsWith(`${YNAB_API}/`)) throw new Error('Refusing to call outside the YNAB API');
    requests += 1;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${pat}`,
      Accept: 'application/json',
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetchImpl(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = text === '' ? undefined : JSON.parse(text);
    } catch {
      parsed = undefined;
    }
    if (!response.ok) {
      const error = (parsed as { error?: { id?: string; name?: string } } | undefined)?.error;
      throw new YnabApiError(response.status, error?.id, error?.name);
    }
    const data = (parsed as { data?: unknown } | undefined)?.data;
    if (typeof data !== 'object' || data === null) {
      throw new Error(`YNAB answered ${response.status} without a data envelope`);
    }
    return data as T;
  }

  const plan = (planId: string) => `/plans/${encodeURIComponent(planId)}`;

  return {
    get requests() {
      return requests;
    },
    async listPlans(): Promise<PlanSummary[]> {
      const data = await call<{ plans: PlanSummary[] }>('GET', '/plans', {
        include_accounts: 'false',
      });
      return data.plans;
    },
    /** Every live transaction, optionally from `sinceDate`. */
    async readAll(planId: string, sinceDate?: string): Promise<TransactionList> {
      const data = await call<TransactionList>('GET', `${plan(planId)}/transactions`, {
        since_date: sinceDate,
      });
      return {
        transactions: data.transactions.filter((t) => !t.deleted),
        server_knowledge: data.server_knowledge,
      };
    },
    readDelta(planId: string, sinceDate: string, lastKnowledge: number): Promise<TransactionList> {
      return call<TransactionList>('GET', `${plan(planId)}/transactions`, {
        since_date: sinceDate,
        last_knowledge_of_server: lastKnowledge,
      });
    },
    patch(planId: string, items: readonly MemoWrite[]): Promise<{ transaction_ids: string[] }> {
      return call('PATCH', `${plan(planId)}/transactions`, {}, { transactions: items });
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------------------------

const liveSubs = (t: TransactionDetail) =>
  t.subtransactions.filter((s) => !s.deleted).sort((a, b) => a.id.localeCompare(b.id));

/** Names of the fields that differ between two reads of a transaction, ignoring `ignore`. */
export function changedFields(
  before: TransactionDetail,
  after: TransactionDetail,
  ignore: readonly string[] = ['memo'],
): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changed: string[] = [];
  for (const key of [...keys].sort()) {
    if (ignore.includes(key)) continue;
    if (key === 'subtransactions') {
      const a = liveSubs(before);
      const b = liveSubs(after);
      if (JSON.stringify(a) !== JSON.stringify(b)) changed.push('subtransactions');
      continue;
    }
    const a = (before as unknown as Record<string, unknown>)[key];
    const b = (after as unknown as Record<string, unknown>)[key];
    if (JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)) changed.push(key);
  }
  return changed;
}

const codePoints = (s: string) => Array.from(s).length;

/** The memo a check writes: the original with the marker appended. */
export function markedMemo(memo: string | null | undefined): string {
  return memo ? `${memo} ${MARKER}` : MARKER;
}

const fitsMarker = (t: TransactionDetail) => codePoints(markedMemo(t.memo)) <= MAX_MEMO_CODE_POINTS;

/** How the owner finds a transaction in YNAB. Never the memo or the amount. */
function describe(t: TransactionDetail): string {
  const payee = t.payee_name ? `, payee "${t.payee_name}"` : '';
  return `${t.date} in "${t.account_name}"${payee} (id ${t.id})`;
}

// ---------------------------------------------------------------------------------------------
// Target selection
// ---------------------------------------------------------------------------------------------

const isSplit = (t: TransactionDetail) => liveSubs(t).length > 0;
const isTransfer = (t: TransactionDetail) => Boolean(t.transfer_account_id);
const byDate = (a: TransactionDetail, b: TransactionDetail) =>
  a.date.localeCompare(b.date) || a.id.localeCompare(b.id);

interface Targets {
  /** Check 1: the kinds whose other fields are most at risk from a memo PATCH. */
  readonly fieldCheck: readonly { kind: string; t: TransactionDetail }[];
  /** Check 4: the oldest transaction that can carry the marker. */
  readonly oldest: TransactionDetail | undefined;
  /** Check 5: two transactions with no memo. */
  readonly emptyMemo: readonly TransactionDetail[];
  /** Check 3: plain transactions with a memo, newest first, to resend unchanged. */
  readonly batch: readonly TransactionDetail[];
}

export function chooseTargets(all: readonly TransactionDetail[]): Targets {
  const markable = all.filter(fitsMarker).sort(byDate);
  const used = new Set<string>();
  const fieldCheck: { kind: string; t: TransactionDetail }[] = [];
  const pick = (kind: string, test: (t: TransactionDetail) => boolean) => {
    const t = [...markable].reverse().find((c) => test(c) && !used.has(c.id));
    if (t) {
      used.add(t.id);
      fieldCheck.push({ kind, t });
    }
  };
  pick('split', isSplit);
  pick('unapproved', (t) => !t.approved);
  pick('flagged', (t) => Boolean(t.flag_color));
  pick('uncleared', (t) => t.cleared === 'uncleared');
  pick('transfer', isTransfer);
  if (fieldCheck.length === 0) pick('plain', () => true);

  const oldest = markable.find((t) => !used.has(t.id));
  if (oldest) used.add(oldest.id);

  // Check 5 needs memo-less transactions so no prose is ever at stake.
  const emptyMemo = [...markable]
    .reverse()
    .filter((t) => (t.memo ?? '') === '' && !used.has(t.id) && !isSplit(t) && !isTransfer(t))
    .slice(0, 2);
  for (const t of emptyMemo) used.add(t.id);

  // Check 3 resends memos as they are, so only non-empty ones: until check 5 has run, resending a
  // missing memo might not read back the same. Every candidate is kept, so check 3 can skip any
  // that change in YNAB before it sends.
  const batch = [...all]
    .sort(byDate)
    .reverse()
    .filter((t) => !used.has(t.id) && !isSplit(t) && !isTransfer(t) && Boolean(t.memo));

  return { fieldCheck, oldest, emptyMemo, batch };
}

// ---------------------------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------------------------

export async function runContractChecks(options: ContractCheckOptions): Promise<ContractCheckRun> {
  const log = options.log ?? (() => {});
  const api = createApi(options.pat, options.fetchImpl ?? ((i, init) => fetch(i, init)));
  const now = options.now ?? (() => new Date());
  const { planId } = options;
  const results = new Map<CheckId, CheckResult>();
  const unrestored = new Set<string>();
  const record = (id: CheckId, outcome: Outcome, notes: string[]) => {
    results.set(id, { id, title: CHECK_TITLES[id], outcome, notes });
    log(`  Check ${id}: ${outcome.toUpperCase()}${notes.length ? ` - ${notes.join(' ')}` : ''}`);
  };

  const plans = await api.listPlans();
  const plan = plans.find((p) => p.id === planId);
  if (!plan) throw new Error('No plan with that ID is visible to this token');
  if (!plan.first_month) throw new Error('The plan has no first_month, so check 2 cannot run');
  const firstMonth = plan.first_month;
  log(`Plan "${plan.name}", first month ${firstMonth}`);

  // Memo restore: put back the original only where the check's own value is still there, so an
  // edit made in YNAB meanwhile is never overwritten.
  async function restore(
    originals: readonly TransactionDetail[],
    expected: ReadonlyMap<string, string | null>,
  ): Promise<void> {
    if (originals.length === 0) return;
    const current = new Map((await api.readAll(planId)).transactions.map((t) => [t.id, t]));
    const writes: MemoWrite[] = [];
    for (const o of originals) {
      const live = current.get(o.id);
      if (!live) continue;
      if ((live.memo ?? null) === (o.memo ?? null)) continue;
      if ((live.memo ?? null) !== (expected.get(o.id) ?? null)) {
        unrestored.add(describe(o));
        log(`  Not restoring ${describe(o)}: its memo changed in YNAB while the checks ran`);
        continue;
      }
      writes.push({ id: o.id, memo: o.memo ?? null, approved: live.approved });
    }
    if (writes.length === 0) return;
    try {
      await api.patch(planId, writes);
    } catch (error) {
      for (const o of originals) {
        if (!writes.some((w) => w.id === o.id)) continue;
        unrestored.add(describe(o));
        log(`  Could not restore ${describe(o)}: remove ${MARKER} from its memo in YNAB`);
      }
      throw error;
    }
    const after = new Map((await api.readAll(planId)).transactions.map((t) => [t.id, t]));
    for (const o of originals) {
      if (!writes.some((w) => w.id === o.id)) continue;
      const a = after.get(o.id);
      // YNAB may store a restored null as "" (check 5); both read as no memo.
      if (!a || (a.memo ?? '') !== (o.memo ?? '')) {
        unrestored.add(describe(o));
        log(`  Could not restore ${describe(o)}: check its memo in YNAB`);
      }
    }
  }

  // ---- Check 2: read only ----
  log('Check 2: comparing a read from first_month with a read of the whole history');
  const whole = await api.readAll(planId);
  const fromFirst = await api.readAll(planId, firstMonth);
  {
    const wholeIds = new Set(whole.transactions.map((t) => t.id));
    const firstIds = new Set(fromFirst.transactions.map((t) => t.id));
    const missing = [...wholeIds].filter((id) => !firstIds.has(id)).length;
    const extra = [...firstIds].filter((id) => !wholeIds.has(id)).length;
    const earliestWhole = [...whole.transactions].sort(byDate)[0]?.date;
    const earliestFirst = [...fromFirst.transactions].sort(byDate)[0]?.date;
    const notes = [
      `${whole.transactions.length} transactions in the whole history, ${fromFirst.transactions.length} from ${firstMonth}.`,
      `Earliest dates: ${earliestWhole ?? 'none'} (whole) and ${earliestFirst ?? 'none'} (from first_month).`,
    ];
    if (missing > 0) notes.push(`${missing} transactions dated before first_month are missed.`);
    if (extra > 0) notes.push(`${extra} transactions appear only in the first_month read.`);
    if (whole.transactions.length === 0)
      record(2, 'inconclusive', [...notes, 'The plan is empty.']);
    else record(2, missing === 0 && extra === 0 ? 'pass' : 'fail', notes);
  }

  if (options.readOnly) {
    for (const id of [1, 3, 4, 5] as const) record(id, 'skipped', ['Read-only run.']);
    return finish();
  }

  const targets = chooseTargets(whole.transactions);

  // ---- Checks 1 and 4: one marker write, then a full read and a delta read ----
  const marked = [
    ...targets.fieldCheck.map((f) => f.t),
    ...(targets.oldest ? [targets.oldest] : []),
  ];
  let check1Passed = false;
  if (marked.length === 0) {
    record(1, 'inconclusive', ['No transaction could carry the marker.']);
    record(4, 'inconclusive', ['No transaction could carry the marker.']);
  } else {
    log(`Checks 1 and 4: adding ${MARKER} to ${marked.length} memos, then restoring them`);
    for (const t of marked) log(`  Using ${describe(t)}`);
    const expected = new Map(marked.map((t) => [t.id, markedMemo(t.memo)]));
    const knowledgeBefore = whole.server_knowledge;
    try {
      await api.patch(
        planId,
        marked.map((t) => ({ id: t.id, memo: markedMemo(t.memo), approved: t.approved })),
      );
      const after = new Map((await api.readAll(planId)).transactions.map((t) => [t.id, t]));

      // Check 1
      const notes: string[] = [];
      let failed = false;
      for (const { kind, t } of targets.fieldCheck) {
        const a = after.get(t.id);
        if (!a) {
          failed = true;
          notes.push(`The ${kind} transaction disappeared.`);
          continue;
        }
        const changed = changedFields(t, a);
        if ((a.memo ?? null) !== expected.get(t.id)) {
          failed = true;
          notes.push(`The ${kind} transaction's memo was not saved as sent.`);
        }
        if (changed.length > 0) {
          failed = true;
          notes.push(`The ${kind} transaction changed: ${changed.join(', ')}.`);
        } else {
          notes.push(`The ${kind} transaction kept every other field.`);
        }
      }
      const kinds = new Set(targets.fieldCheck.map((f) => f.kind));
      const notCovered = ['split', 'unapproved', 'flagged'].filter((k) => !kinds.has(k));
      if (notCovered.length > 0) {
        notes.push(`The plan had no ${notCovered.join(', ')} transaction to try.`);
      }
      if (targets.fieldCheck.length === 0) record(1, 'inconclusive', notes);
      else if (failed) record(1, 'fail', notes);
      else record(1, notCovered.includes('split') ? 'inconclusive' : 'pass', notes);
      check1Passed = !failed && targets.fieldCheck.length > 0;

      // Check 4
      if (!targets.oldest) {
        record(4, 'inconclusive', ['No transaction was left to use as the older one.']);
      } else {
        const oldest = targets.oldest;
        const delta = await api.readDelta(planId, firstMonth, knowledgeBefore);
        const seen = delta.transactions.find((t) => t.id === oldest.id);
        const ageDays = Math.floor((now().getTime() - Date.parse(oldest.date)) / 86_400_000);
        const notes4 = [
          `Changed a transaction dated ${oldest.date} (${ageDays} days old), then read the delta from ${firstMonth}.`,
          `The delta held ${delta.transactions.length} transactions.`,
        ];
        if (ageDays < 365) notes4.push('The plan has no transaction older than a year.');
        if (!seen) record(4, 'fail', [...notes4, 'The change was missing from the delta.']);
        else if ((seen.memo ?? null) !== expected.get(oldest.id)) {
          record(4, 'fail', [...notes4, 'The delta returned the transaction without the change.']);
        } else record(4, ageDays < 365 ? 'inconclusive' : 'pass', notes4);
      }
    } finally {
      await restore(marked, expected);
    }
  }

  // ---- Check 3: resend 50 unchanged memos in one PATCH ----
  if (!check1Passed) {
    record(3, 'skipped', ['Check 1 did not pass, so no batch write was risked.']);
  } else {
    // Re-read just before sending and resend YNAB's current values, skipping anything edited in
    // YNAB since the run began, so the batch can never overwrite a change made meanwhile.
    const fresh = new Map((await api.readAll(planId)).transactions.map((t) => [t.id, t]));
    const batch: TransactionDetail[] = [];
    for (const before of targets.batch) {
      const now = fresh.get(before.id);
      if (now && now.memo === before.memo && now.approved === before.approved) batch.push(now);
      if (batch.length === BATCH_SIZE) break;
    }
    if (batch.length < BATCH_SIZE) {
      record(3, 'inconclusive', [
        `The plan has only ${batch.length} plain transactions with a memo; ${BATCH_SIZE} are needed.`,
      ]);
    } else {
      await sendBatch(batch);
    }
  }

  async function sendBatch(batch: readonly TransactionDetail[]): Promise<void> {
    log(`Check 3: resending ${BATCH_SIZE} memos unchanged in one PATCH`);
    try {
      const saved = await api.patch(
        planId,
        batch.map((t) => ({ id: t.id, memo: t.memo ?? null, approved: t.approved })),
      );
      const after = new Map((await api.readAll(planId)).transactions.map((t) => [t.id, t]));
      const altered = batch.filter((t) => {
        const a = after.get(t.id);
        return !a || changedFields(t, a, []).length > 0;
      });
      const notes = [
        `YNAB accepted the batch and saved ${saved.transaction_ids.length} transactions.`,
      ];
      if (altered.length > 0) {
        for (const t of altered) unrestored.add(describe(t));
        record(3, 'fail', [
          ...notes,
          `${altered.length} transactions changed although nothing was.`,
        ]);
      } else {
        record(3, saved.transaction_ids.length === BATCH_SIZE ? 'pass' : 'fail', [
          ...notes,
          'Every transaction read back unchanged.',
        ]);
      }
    } catch (error) {
      if (!(error instanceof YnabApiError) || error.status === 429) throw error;
      record(3, 'fail', [`${error.message} for a batch of ${BATCH_SIZE}.`]);
    }
  }

  // ---- Check 5: "" versus null ----
  if (targets.emptyMemo.length < 2) {
    record(5, 'inconclusive', ['The plan needs two plain transactions with no memo.']);
  } else {
    const [a, b] = targets.emptyMemo as [TransactionDetail, TransactionDetail];
    log(
      'Check 5: giving two memo-less transactions a memo, then emptying one to "" and one to null',
    );
    log(`  "" goes on ${describe(a)}`);
    log(`  null goes on ${describe(b)}`);
    const expected = new Map<string, string | null>([
      [a.id, MARKER],
      [b.id, MARKER],
    ]);
    try {
      await api.patch(planId, [
        { id: a.id, memo: MARKER, approved: a.approved },
        { id: b.id, memo: MARKER, approved: b.approved },
      ]);
      await api.patch(planId, [
        { id: a.id, memo: '', approved: a.approved },
        { id: b.id, memo: null, approved: b.approved },
      ]);
      expected.set(a.id, '');
      expected.set(b.id, null);
      const after = new Map((await api.readAll(planId)).transactions.map((t) => [t.id, t]));
      const shown = (m: string | null | undefined) =>
        m === undefined ? 'absent' : m === null ? 'null' : m === '' ? '""' : 'some other text';
      const storedA = after.get(a.id)?.memo;
      const storedB = after.get(b.id)?.memo;
      const notes = [
        `Sending "" stores ${shown(storedA)}.`,
        `Sending null stores ${shown(storedB)}.`,
      ];
      // Restore compares against what YNAB stored, not what was sent.
      expected.set(a.id, storedA ?? null);
      expected.set(b.id, storedB ?? null);
      let visible: string | undefined;
      if (options.ask) {
        const answer = await options.ask(
          'In YNAB, find the two transactions named above and look at their memos.\n' +
            'Do they look the same (no memo shown on either)? [y = same / n = different / s = skip] ',
        );
        visible = answer.trim().toLowerCase().slice(0, 1);
      }
      if (visible === 'y') notes.push('The owner saw no difference between them in YNAB.');
      else if (visible === 'n') notes.push('The owner saw a difference between them in YNAB.');
      else notes.push('Nobody compared them in YNAB.');
      const valid = (m: string | null | undefined) => m === null || m === '' || m === undefined;
      if (!valid(storedA) || !valid(storedB)) record(5, 'fail', notes);
      else record(5, visible === 'y' || visible === 'n' ? 'pass' : 'inconclusive', notes);
    } finally {
      await restore([a, b], expected);
    }
  }

  return finish();

  function finish(): ContractCheckRun {
    const ordered = ([1, 2, 3, 4, 5] as const).map(
      (id) =>
        results.get(id) ?? {
          id,
          title: CHECK_TITLES[id],
          outcome: 'skipped' as const,
          notes: ['Not run.'],
        },
    );
    return {
      planName: plan!.name,
      ranAt: now().toISOString(),
      requests: api.requests,
      results: ordered,
      unrestored: [...unrestored],
    };
  }
}

// ---------------------------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------------------------

/**
 * The results as `docs/research/ynab-contract-checks.md` (task 8.2). It names no plan,
 * transaction, memo or amount, so it can be committed.
 */
export function formatReport(run: ContractCheckRun): string {
  const lines = [
    '# YNAB contract checks',
    '',
    `Run on ${run.ranAt.slice(0, 10)} against YNAB API v1 (types from the ${API_VERSION} description) on the owner's test budget, with \`scripts/contract-checks.ts\`. ${run.requests} requests.`,
    '',
    'These confirm API behaviour the slice 2 write path depends on (design: "Contract checks"). A failed check goes through `.opal/runtime/change-protocol.md` before task 10.',
    '',
    '| # | Check | Result |',
    '| - | ----- | ------ |',
    ...run.results.map((r) => `| ${r.id} | ${r.title} | ${r.outcome} |`),
    '',
  ];
  for (const r of run.results) {
    lines.push(`## Check ${r.id}: ${r.outcome}`, '', r.title + '.', '');
    for (const note of r.notes) lines.push(`- ${note}`);
    lines.push('');
  }
  if (run.unrestored.length > 0) {
    lines.push(
      '## Not restored',
      '',
      `${run.unrestored.length} memos could not be restored by the script and needed fixing by hand.`,
      '',
    );
  }
  return lines.join('\n');
}
