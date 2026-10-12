import { parseMemo } from '../domain/grammar/parseMemo.ts';
import type { TagIdentity } from '../domain/grammar/identity.ts';
import type { DomainState } from '../domain/model.ts';
import { buildTagIndex } from '../domain/tags/tagIndex.ts';
import { deriveMarkers, type TagMarkers } from '../domain/tags/markers.ts';
import {
  createYnabClient,
  type PlanSummary,
  type TransactionDetail,
  type YnabClient,
} from '../ynab/client.ts';
import { mergeTransactions } from '../ynab/delta.ts';
import { ynabFailureOf, type YnabFailure } from '../ynab/errors.ts';
import { loadBudget, type LoadedBudget } from '../ynab/load.ts';
import { mapAccounts, mapCategories } from '../ynab/map.ts';
import { forgetPat, readRememberedPat, rememberPat } from './patStorage.ts';

export type AppPhase =
  | {
      phase: 'disconnected';
      notice?: 'disconnected' | 'unauthorized' | 'rememberFailed';
      /** Why a connect (or a start-up with a Remembered PAT) failed, when it was not a 401. */
      failure?: YnabFailure;
    }
  | { phase: 'connecting' }
  | {
      phase: 'choosingBudget';
      plans: PlanSummary[];
      /** `Remember on this device` was ticked but the token could not be stored (Req 2.9). */
      rememberFailed?: true;
    }
  | { phase: 'loadingBudget'; planId: string }
  | { phase: 'loadFailed'; planId: string; failure: YnabFailure }
  | { phase: 'ready'; budget: BudgetSessionSnapshot };

/**
 * What React reads for a loaded Budget Session. Slice 1 (reading) subset: the view state for
 * scope, filters, selection and the operations arrive with slice 2.
 */
export interface BudgetSessionSnapshot {
  readonly plan: LoadedBudget['plan'];
  readonly knowledge: LoadedBudget['knowledge'];
  readonly domain: DomainState;
  readonly markers: ReadonlyMap<TagIdentity, TagMarkers>;
  readonly openTag: TagIdentity | null;
  readonly refreshHealth: 'ok' | { paused: YnabFailure };
  /** Epoch milliseconds of the last successful load or refresh (Req 4.10). */
  readonly lastUpdatedAt: number | null;
  /** True while a refresh is in flight. */
  readonly refreshing: boolean;
}

/** Slice 1 (reading) subset. The browsing and write methods of the design arrive with slice 2. */
export interface SessionStore {
  getSnapshot(): AppPhase;
  subscribe(listener: () => void): () => void;
  /** Connects with a Remembered PAT if one exists. */
  start(): Promise<void>;
  connect(pat: string, remember: boolean): Promise<void>;
  chooseBudget(planId: string): Promise<void>;
  /** Ends the Budget Session and returns to Budget choice, keeping the client and any Remembered PAT. */
  switchBudget(): Promise<void>;
  disconnect(): void;
  /**
   * One transactions delta read. Accounts and categories are re-read too when
   * `includeAccounts` is set (a manual Refresh) or when the delta references an unknown ID.
   * Never rejects.
   */
  refreshNow(opts?: { includeAccounts: boolean }): Promise<void>;
  openTag(identity: TagIdentity | null): void;
}

export interface PatStorage {
  read(): string | null;
  remember(pat: string): void;
  forget(): void;
}

export interface SessionStoreOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Replaces `createYnabClient` (tests). */
  createClient?: (pat: string) => YnabClient;
  patStorage?: PatStorage;
  buildTagIndex?: typeof buildTagIndex;
  deriveMarkers?: typeof deriveMarkers;
  parse?: typeof parseMemo;
  now?: () => number;
}

const defaultPatStorage: PatStorage = {
  read: readRememberedPat,
  remember: rememberPat,
  forget: forgetPat,
};

interface Connection {
  readonly client: YnabClient;
}

/**
 * The identity of one Budget Session. Every request made for it passes `controller.signal`, and a
 * result is applied only while this very object is still the store's current session (the
 * stale-result guard, design: Session lifecycle).
 */
interface BudgetSession {
  readonly controller: AbortController;
  readonly planId: string;
  loaded: BudgetSessionSnapshot | null;
  refresh: Promise<void> | null;
}

const failureOf = (error: unknown): YnabFailure => ynabFailureOf(error) ?? { kind: 'network' };

export function createSessionStore(options: SessionStoreOptions = {}): SessionStore {
  const patStorage = options.patStorage ?? defaultPatStorage;
  const build = options.buildTagIndex ?? buildTagIndex;
  const derive = options.deriveMarkers ?? deriveMarkers;
  const parse = options.parse ?? parseMemo;
  const now = options.now ?? Date.now;
  const createClient =
    options.createClient ??
    ((pat: string) =>
      createYnabClient(pat, {
        ...(options.fetchImpl !== undefined && { fetchImpl: options.fetchImpl }),
        ...(options.timeoutMs !== undefined && { timeoutMs: options.timeoutMs }),
      }));

  let state: AppPhase = { phase: 'disconnected' };
  let connection: Connection | null = null;
  let session: BudgetSession | null = null;
  let knownPlans: PlanSummary[] = [];
  const listeners = new Set<() => void>();

  function setState(next: AppPhase): void {
    state = next;
    for (const listener of listeners) listener();
  }

  const isChoosingBudget = (): boolean => state.phase === 'choosingBudget';

  function publish(s: BudgetSession): void {
    if (session === s && s.loaded !== null) setState({ phase: 'ready', budget: s.loaded });
  }

  function endSession(): void {
    if (session !== null) {
      session.controller.abort();
      session = null;
    }
  }

  function endConnection(): void {
    endSession();
    if (connection !== null) {
      connection.client.dispose();
      connection = null;
    }
    knownPlans = [];
  }

  function deriveFrom(domain: Omit<DomainState, 'index'>) {
    const index = build(domain.transactions, parse);
    return { domain: { ...domain, index }, markers: derive(index) };
  }

  // ---- connect ----

  async function connectWith(pat: string, remember: boolean): Promise<void> {
    endConnection();
    const conn: Connection = { client: createClient(pat) };
    connection = conn;
    setState({ phase: 'connecting' });

    let plans: PlanSummary[];
    try {
      plans = await conn.client.listPlans();
    } catch (error) {
      if (connection !== conn) return;
      const failure = failureOf(error);
      endConnection();
      if (failure.kind === 'unauthorized') {
        patStorage.forget();
        setState({ phase: 'disconnected', notice: 'unauthorized' });
      } else {
        setState({ phase: 'disconnected', failure });
      }
      return;
    }
    if (connection !== conn) return;

    // The PAT is stored only after the plans call succeeds, and only if the user asked (Req 2.9).
    let rememberFailed = false;
    if (remember) {
      patStorage.remember(pat);
      rememberFailed = patStorage.read() !== pat;
    }
    knownPlans = plans;
    setState({
      phase: 'choosingBudget',
      plans,
      ...(rememberFailed && { rememberFailed: true as const }),
    });
  }

  async function start(): Promise<void> {
    if (state.phase !== 'disconnected') return;
    const pat = patStorage.read();
    if (pat === null) return;
    await connectWith(pat, false);
  }

  // ---- choose a budget ----

  async function chooseBudget(planId: string): Promise<void> {
    const conn = connection;
    if (conn === null) return;
    if (state.phase !== 'choosingBudget' && state.phase !== 'loadFailed') return;
    const plan = knownPlans.find((p) => p.id === planId);
    if (plan === undefined) return;

    endSession();
    const s: BudgetSession = {
      controller: new AbortController(),
      planId,
      loaded: null,
      refresh: null,
    };
    session = s;
    setState({ phase: 'loadingBudget', planId });

    try {
      const loaded = await loadBudget(conn.client, plan, { signal: s.controller.signal });
      if (session !== s) return;
      const { domain, markers } = deriveFrom({
        transactions: loaded.transactions,
        accounts: loaded.accounts,
        categories: loaded.categories,
      });
      s.loaded = {
        plan: loaded.plan,
        knowledge: loaded.knowledge,
        domain,
        markers,
        openTag: null,
        refreshHealth: 'ok',
        lastUpdatedAt: now(),
        refreshing: false,
      };
      publish(s);
    } catch (error) {
      if (session !== s) return;
      const failure = failureOf(error);
      if (failure.kind === 'unauthorized') patStorage.forget();
      endSession();
      setState({ phase: 'loadFailed', planId, failure });
    }
  }

  // ---- switch budget and disconnect ----

  async function switchBudget(): Promise<void> {
    const conn = connection;
    if (conn === null) return;
    if (
      state.phase !== 'loadingBudget' &&
      state.phase !== 'loadFailed' &&
      state.phase !== 'ready'
    ) {
      return;
    }
    endSession();
    setState({ phase: 'choosingBudget', plans: knownPlans });
    try {
      const plans = await conn.client.listPlans();
      if (connection !== conn || !isChoosingBudget()) return;
      knownPlans = plans;
      setState({ phase: 'choosingBudget', plans });
    } catch (error) {
      if (connection !== conn || !isChoosingBudget()) return;
      if (failureOf(error).kind === 'unauthorized') {
        patStorage.forget();
        endConnection();
        setState({ phase: 'disconnected', notice: 'unauthorized' });
      }
      // Any other failure keeps the plan list already shown; choosing a budget will surface it.
    }
  }

  function disconnect(): void {
    endConnection();
    patStorage.forget();
    setState({ phase: 'disconnected', notice: 'disconnected' });
  }

  // ---- refresh ----

  function referencesUnknownId(items: readonly TransactionDetail[], domain: DomainState): boolean {
    for (const t of items) {
      if (t.deleted) continue;
      if (!domain.accounts.has(t.account_id as never)) return true;
      const lines = t.subtransactions.filter((l) => !l.deleted);
      const categoryIds = lines.length === 0 ? [t.category_id] : lines.map((l) => l.category_id);
      for (const id of categoryIds) {
        if (id !== null && id !== undefined && !domain.categories.has(id as never)) return true;
      }
    }
    return false;
  }

  async function doRefresh(s: BudgetSession, client: YnabClient, includeAccounts: boolean) {
    const start = s.loaded;
    if (start === null) return;
    s.loaded = { ...start, refreshing: true };
    publish(s);

    /** Applies the end of a refresh atomically, only if `s` is still the current session. */
    const finish = (patch: Partial<BudgetSessionSnapshot>): void => {
      if (session !== s || s.loaded === null) return;
      s.loaded = { ...s.loaded, ...patch, refreshing: false };
      publish(s);
    };

    const signal = s.controller.signal;
    const { plan, knowledge } = start;
    const readAccountsAndCategories = () =>
      Promise.all([
        client.getAccounts(s.planId, {}, { signal }),
        client.getCategories(s.planId, {}, { signal }),
      ]);

    try {
      let delta;
      let extra;
      if (includeAccounts) {
        const [d, a] = await Promise.all([
          client.getTransactions(
            s.planId,
            { sinceDate: plan.firstMonth, lastKnowledge: knowledge.transactions },
            { signal },
          ),
          readAccountsAndCategories(),
        ]);
        delta = d;
        extra = a;
      } else {
        delta = await client.getTransactions(
          s.planId,
          { sinceDate: plan.firstMonth, lastKnowledge: knowledge.transactions },
          { signal },
        );
        if (
          session === s &&
          s.loaded !== null &&
          referencesUnknownId(delta.items, s.loaded.domain)
        ) {
          extra = await readAccountsAndCategories();
        }
      }
      if (session !== s || s.loaded === null) return;

      // Build everything first; nothing is applied unless all of it succeeds.
      const current = s.loaded;
      const transactionsChanged = delta.items.length > 0;
      const transactions = transactionsChanged
        ? mergeTransactions(current.domain.transactions, delta.items)
        : current.domain.transactions;
      const accounts = extra ? mapAccounts(extra[0].items) : current.domain.accounts;
      const categories = extra ? mapCategories(extra[1].items) : current.domain.categories;
      const derived = transactionsChanged
        ? deriveFrom({ transactions, accounts, categories })
        : {
            domain: extra ? { ...current.domain, accounts, categories } : current.domain,
            markers: current.markers,
          };

      finish({
        domain: derived.domain,
        markers: derived.markers,
        knowledge: {
          transactions: delta.serverKnowledge,
          accounts: extra ? extra[0].serverKnowledge : current.knowledge.accounts,
          categories: extra ? extra[1].serverKnowledge : current.knowledge.categories,
        },
        refreshHealth: 'ok',
        lastUpdatedAt: now(),
      });
    } catch (error) {
      if (session !== s) return;
      const failure = failureOf(error);
      if (failure.kind === 'unauthorized') patStorage.forget();
      // The last good data stays available for browsing; writes stay blocked while paused.
      finish(failure.kind === 'cancelled' ? {} : { refreshHealth: { paused: failure } });
    }
  }

  function refreshNow(opts?: { includeAccounts: boolean }): Promise<void> {
    const s = session;
    const conn = connection;
    if (s === null || s.loaded === null || conn === null || state.phase !== 'ready') {
      return Promise.resolve();
    }
    if (s.refresh !== null) return s.refresh;
    const run = doRefresh(s, conn.client, opts?.includeAccounts ?? false).finally(() => {
      if (s.refresh === run) s.refresh = null;
    });
    s.refresh = run;
    return run;
  }

  function openTag(identity: TagIdentity | null): void {
    const s = session;
    if (s === null || s.loaded === null || state.phase !== 'ready') return;
    s.loaded = { ...s.loaded, openTag: identity };
    publish(s);
  }

  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start,
    connect: (pat, remember) => connectWith(pat, remember),
    chooseBudget,
    switchBudget,
    disconnect,
    refreshNow,
    openTag,
  };
}
