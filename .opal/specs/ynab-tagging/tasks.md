# Implementation Plan: YNAB Tagging

## Overview

The build goes **domain first, then outwards**. The repository has no application code yet, so the order is:

1. Scaffold the toolchain and the privacy guards.
2. Run the YNAB contract checks against a live test budget, because design decisions depend on them.
3. Build the pure domain core under `src/domain/`: grammar, identity, tags, warnings, register, memo rewriting and planning.
4. Build the YNAB adapter under `src/ynab/`, together with the fake YNAB it is tested against.
5. Build the session runtime under `src/session/` and the write engine under `src/writes/`.
6. Build the UI under `src/ui/`.
7. Add end-to-end, accessibility and boundary tests, deploy, and record the manual release validation.

Each layer imports only from the layers before it, so each checkpoint verifies a complete layer before anything depends on it. The write engine is a pure transition core (`step(state, event)`) driven by a thin effect runner; XState is not used.

## Tasks

- [ ] 1. Scaffold the toolchain and privacy guards
  - [ ] 1.1 Create the Vite+ React project
    - Add `package.json`: pnpm pinned through `packageManager`, Node 24 in `engines`, `vite-plus` pinned to an exact version, React 19, `react-aria-components`, `@tanstack/react-virtual`; dev dependencies `openapi-typescript`, `fast-check`, `@testing-library/react`, `jsdom`, `@playwright/test`, `@axe-core/playwright`
    - Add `tsconfig.json` with `strict` enabled, `index.html` with only an external module script, `src/main.tsx` and a placeholder `src/ui/App.tsx`
    - Add `vite.config.ts` using `defineConfig` from `vite-plus`: `build.modulePreload.polyfill = false`, `build.assetsInlineLimit = 0`, and the Vitest, Oxfmt, Oxlint and `staged` (`vp check --fix`) configuration
    - Configure Oxlint with `no-console` in `src/` and `no-restricted-globals` for `localStorage`, `sessionStorage`, `indexedDB`, `caches` and `document.cookie` access
    - Self-host Geist fonts under `public/fonts/`
    - Add `e2e` and `contract` scripts runnable through `vp run`
    - _Requirements: 1.1, 1.3, 1.6, 1.9, 22.3, 22.4_

  - [ ] 1.2 Add deployment headers and the preview header check
    - Add `vercel.json` exactly as in the design: install/build commands, SPA rewrite, CSP, `Referrer-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, COOP, `Permissions-Policy`, HSTS, and the asset/`index.html` `Cache-Control` rules
    - In `vite.config.ts`, read the headers from `vercel.json` into `preview.headers`
    - Confirm that `vp preview` serves the CSP header on `/` and on an asset
    - _Requirements: 1.5, 1.7, 1.9_

  - [ ]* 1.3 Fallback static server for end-to-end tests
    - Only if task 1.2 shows that `vp preview` ignores `preview.headers`: add a small static server that serves `dist/` with the `vercel.json` headers, and use it for Playwright
    - _Requirements: 1.7_

  - [ ] 1.4 Add the build CSP guard
    - Add `scripts/check-build-csp.ts`. It fails if:
      - `dist/index.html` contains an inline `<script>` or `<style>`, an `on*=` attribute, a `style=` attribute, or any absolute URL;
      - any JS bundle contains `eval(` or `new Function(`;
      - the CSP in `vercel.json` differs from the expected constant.
    - Add unit tests for the guard, using fixture HTML and bundles that each violate one rule
    - _Requirements: 1.6, 1.7, 1.8_

  - [ ] 1.5 Add CI
    - Add `.github/workflows/ci.yml`: `pnpm install --frozen-lockfile`, `vp check`, `vp test`, `vp build`, `node scripts/check-build-csp.ts`
    - The end-to-end job is added in task 13.1
    - _Requirements: 1.8, 21.6_

- [ ] 2. Checkpoint - Verify the scaffold
  - Run `vp check`, `vp test`, `vp build` and `node scripts/check-build-csp.ts`
  - Run `vp preview` and confirm the CSP header in the response
  - Resolve failures before continuing

- [ ] 3. Run the YNAB contract checks
  - [ ] 3.1 Write the contract-check script
    - Add `scripts/ynab-contract-checks.ts`. It reads a PAT and a test plan ID from environment variables, never from a file, and uses plain `fetch` against `https://api.ynab.com`
    - It exercises the five checks from the design's Testing Strategy:
      1. `PATCH` with only `id`, `memo` and `approved` leaves `cleared`, `flag_color`, `category_id`, `payee_id` and `date` unchanged
      2. `since_date=first_month` returns the earliest transactions
      3. A `PATCH` batch of 50 is accepted
      4. A delta with `since_date` returns changes to older transactions
      5. Whether a memo emptied to `""` or `null` is stored as `""` or `null`
    - It restores every memo it changes, and prints results without memos, amounts or the PAT
    - _Requirements: 3.2, 12.2, 17.4, 17.5, 21.7_

  - [ ] 3.2 Run the checks against the controlled test budget and record the results (owner; non-blocking)
    - Needs the owner, a test budget and a PAT
    - **This is the one exception to building in order.** If the owner has not run the checks yet, leave this task unchecked and continue with task 4. Only tasks 9.5, 9.7 and 11 wait for it, and each of them says so
    - Record the outcomes in `docs/research/ynab-contract-checks.md` with the date and the API version
    - If any check fails, stop and follow `.opal/runtime/change-protocol.md` before building the code that depends on it. Check 5 gates `src/ynab/map.ts`; checks 1, 3 and 4 gate the write engine; check 2 gates `src/ynab/load.ts`
    - _Requirements: 3.2, 17.4, 17.5, 21.7_

- [ ] 4. Domain model, grammar and Tag Identity
  - [ ] 4.1 Add the domain model
    - Add `src/domain/model.ts`: branded `TransactionId`, `AccountId`, `CategoryId` and `CategoryGroupId`; `IsoDate`, `Transaction`, `SubTransaction`, `Account`, `Category` and `DomainState`
    - _Requirements: 3.3, 3.5, 9.1_

  - [ ] 4.2 Generate the case-folding table
    - Add `scripts/generate-case-folding.ts`. It reads Unicode 17.0.0 `CaseFolding.txt`, keeps statuses C and F (excluding T), and writes `src/domain/grammar/caseFolding.generated.ts` with the runtime Unicode version it was checked against
    - Commit the generated table
    - _Requirements: 8.1, 8.2_

  - [ ] 4.3 Implement Tag Identity and tag text validation
    - Add `src/domain/grammar/identity.ts`: `TagIdentity`, `tagIdentity` (NFC, then fold), `CASE_FOLDING_UNICODE_VERSION`, and `validateTagText` with the reasons `empty`, `digitsOnly`, `whitespace`, `trailingPunctuation` and `marker`
    - Add `src/domain/grammar/identity.test.ts`: `ß`/`ss`, final sigma, Turkic dotted I (not special-cased), full-width versus ASCII and `m²` versus `m2` kept distinct, `ﬁ` folding to `fi`, and the pinned version
    - Export the example table from a shared fixture module so `e2e/identity.spec.ts` can reuse it
    - _Requirements: 8.1, 8.2, 8.3_

  - [ ] 4.4 Implement the memo parser
    - Add `src/domain/grammar/parseMemo.ts`: `TagToken`, `ParsedMemo` and `parseMemo`, walking by code point. The `#` candidate rule judges a combining mark by its base character, and a mark with no base counts as memo start. Extra markers are consumed; the token ends at `\p{White_Space}`; trailing `Po`/`Pe`/`Pf` is trimmed; empty or all-`Nd` results are rejected. `prose` removes tag spans by the gap rule and shows `\#` as `#`
    - Add `src/domain/grammar/parseMemo.test.ts` with the ADR 0004 table and the Unicode cases listed in the design (`#Café` in both forms, `#家計。`, `#٣`, `#Ⅻ`, `##Household`, `\#`, `C:\#temp`, `é#tag` in both forms, `#-`, `null` and `""`), shared with `e2e/identity.spec.ts`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9_

  - [ ] 4.5 Add the memo and transaction arbitraries
    - Add `test/arbitraries.ts`: memos from the weighted alphabet (ASCII, Latin-1, CJK, combining marks, `Po`/`Pe`/`Pf`/`Pd`/`Pc`, `Nd`, `#`, `\`, every `White_Space` code point), and transactions with splits and transfers
    - _Requirements: 21.4_

  - [ ] 4.6 Write property tests for the grammar and identity
    - **Property 1: Tokens are never truncated**
    - **Property 2: Grammar examples and escapes**
    - **Property 3: Identity is invariant under canonical equivalence and case**
    - **Validates: Requirements 7.1–7.9, 8.1, 8.2, 8.3**

- [ ] 5. Tag Index, Tag Totals and Vocabulary Warnings
  - [ ] 5.1 Implement the Tag Index
    - Add `src/domain/tags/tagIndex.ts`: `TagIndex`, `TagEntry`, `SpellingUse`, `CleanupSite`, `TagTotal` and `buildTagIndex`
    - Membership is the set union of parent and non-deleted split identities
    - `parentMembers` and `splitOnlyMembers` are kept per identity, and the parent/split counts are kept per spelling
    - Cleanup sites are detected within each memo on its own
    - Canonical Spelling uses count, then earliest date, then code point
    - Totals use the full parent amount once per member, with outflow, inflow, count and `outsideActiveAccountCount`
    - Transfer pairs resolve parent and subtransaction transfer IDs to their parents
    - Add a memoised parse cache keyed by raw memo text
    - _Requirements: 8.4, 8.5, 8.6, 8.7, 9.1, 9.2, 9.3, 9.4, 9.6, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 11.5_

  - [ ] 5.2 Unit-test the Tag Index
    - Add `src/domain/tags/tagIndex.test.ts` with the ADR 0005 examples (split-only membership, a transfer pair inside a split, closed accounts, unapproved transactions, deleted subtransactions)
    - Cover provenance: `#tax` in a parent with `#Tax` only in a split; `##Tax` only in a split; `#Tax` in both the parent and a split of one transaction (`parentTransactionCount` 1, `splitOccurrenceCount` 1); one `#Tax` in the parent plus one in a split raising no repeat; `##Tax #Tax` counting as one tidyable transaction
    - _Requirements: 9.1, 9.2, 9.3, 10.3, 10.5, 14.4_

  - [ ] 5.3 Write property tests for the Tag Index
    - **Property 4: Canonical Spelling ignores input order**
    - **Property 5: Membership is a set**
    - **Property 6: Tag Total composition**
    - **Property 7: Transfer pairs are named, never assumed to cancel**
    - **Validates: Requirements 5.9, 8.4–8.7, 9.1, 9.2, 10.1–10.8**

  - [ ] 5.4 Implement Vocabulary Warnings
    - Add `src/domain/tags/warnings.ts`: `VocabularyWarning`, `SpellingChoice`, `MergeDirection`, `PairKey`, `nearDuplicateKey` and `deriveWarnings`
    - Pairs come from every two distinct identities sharing a nonempty key, with the pair key sorted by code point
    - Merge directions are offered only when `rewritableCount > 0`
    - Cleanup counts distinct tidyable and read-only transactions
    - Spelling choices use the per-spelling counts
    - Ordering follows Decision 12, with single-use in its own list; dismissed pairs are filtered out
    - Add `src/domain/tags/warnings.test.ts`: ordering, `#Home-Repair`/`#Home_Repair`/`#HomeRepair` giving three pairs, `#Tax`/`#Taxi` and `#Grocries`/`#Groceries` not flagged, case variants kept as a spelling warning, dismissal isolation, and split-only directions
    - _Requirements: 13.4, 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 15.1, 15.2, 15.3, 15.4, 15.5, 15.7, 15.8, 15.9, 15.11_

  - [ ] 5.5 Write property tests for warnings
    - **Property 20: Near-duplicate detection is exactly the dash/underscore rule**
    - **Property 21: Warnings are deterministic and advisory**
    - **Validates: Requirements 14.1, 14.3–14.6, 15.1–15.5**

- [ ] 6. Register and memo rewriting
  - [ ] 6.1 Implement the Register
    - Add `src/domain/register/register.ts`: `RegisterFilters`, `RegisterView`, `buildRegister`, `filtersChangeClearsSelection`, and a `selectAllMatching` helper returning the matching IDs in the Active Account
    - Rows are the complete Active Account history sorted by date descending, then ID, with a `yearIndex` for position
    - Search folds the query and matches payee, category, group and prose memo text of the parent and its splits
    - Category and category-group facets also match split children
    - Tag facet counts are computed after the other filters under Match all and Match any
    - Account counts give matching and total
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.9, 5.10, 5.11, 6.2, 6.3, 6.4_

  - [ ] 6.2 Unit-test the Register
    - Add `src/domain/register/register.test.ts`: facet counts equal the rows shown for that tag with search, category, status and other tag filters active under both match modes; a year jump does not clear selection; an empty filter result keeps `totalCount`
    - _Requirements: 5.3, 5.4, 5.5, 5.9, 5.10, 6.4_

  - [ ] 6.3 Implement memo rewriting
    - Add `src/domain/memo/rewrite.ts`: `MEMO_LIMIT_CODE_POINTS`, `applyTag`, `removeIdentity`, `renameIdentity`, `respell`, `tidyIdentity` and `fits`
    - Work right to left on raw memo text, using the design's gap rule including the line-break preference
    - Rename keeps markers, and a merge removes the source occurrence when the memo already holds the target
    - Tidy reduces markers to one and removes later repeats
    - An empty result returns `null`
    - Add `src/domain/memo/rewrite.test.ts`: the `shop #Tag · Club` regression, removal at start, middle and end, the line-break preference, rename keeping extra markers, merge removal, tidy, and `\#` preservation
    - _Requirements: 7.7, 12.2, 12.4, 12.5, 12.6, 13.2, 13.3, 13.5, 13.6, 13.8_

  - [ ] 6.4 Write property tests for rewriting
    - **Property 8: Apply then remove is the identity**
    - **Property 9: Rewrites touch only tag spans**
    - **Validates: Requirements 7.7, 12.2, 12.4, 12.5, 13.5, 13.6, 13.8**

- [ ] 7. Operation planning
  - [ ] 7.1 Implement plans and requests
    - Add `src/domain/operations/plan.ts`: `OperationKind`, `PlannedChange` (with `fingerprint` and `changesMembership`), `EligibilityFingerprint`, `PlanRequest`, `Exclusion`, `OperationPlan` (with `request` and `activeAccountId`)
    - Add `planApply`, `planRemove`, `planRename` (merge detection, and routing to `planRespell` for the same identity), `planDelete`, `planRespell`, `planTidy`, `replan` and `planDiffers`
    - Apply excludes `alreadyTagged`; the others reach only parent members and list split-only members
    - Over-length results become `overLength` exclusions
    - Compute `outsideActiveAccountCount`, `unreachableSplitOccurrences` and `remainsInVocabularyAfter`
    - `changesMembership` compares membership from `before` and `after`, each with the split memos
    - _Requirements: 9.3, 9.5, 12.1, 12.3, 12.6, 12.7, 12.9, 13.1, 13.2, 13.4, 13.5, 13.6, 13.7, 15.10, 16.2, 16.3_

  - [ ] 7.2 Implement recheck, remaining work and undo planning
    - Add `recheck`: `gone`, `memoChanged` (exact comparison with `before`), and `eligibilityChanged` when the recomputed `after` differs or a relevant fingerprint field differs. Account counts only as scope against `plan.activeAccountId`; amount counts only when `changesMembership` is true; split tokens count only for the identities the plan touches
    - Add `remainingWork`: the change IDs of `replan(state, plan.request)` outside the confirmed scope; empty for undo
    - Add `planUndo` in `src/domain/operations/plan.ts` with `knownConflicts`, and `HistoryEntry` types in `src/writes/undoHistory.ts` (types only; the domain may import them as types)
    - _Requirements: 4.6, 16.4, 16.5, 17.1, 17.2, 17.3, 17.4, 19.1, 19.2, 19.3_

  - [ ] 7.3 Unit-test planning
    - Add `src/domain/operations/plan.test.ts`:
      - exclusions, outside-account counts and merge detection
      - `replan` reproducing the original plan for every `PlanRequest` kind on unchanged state
      - `remainingWork` reporting an exclusion that became eligible
      - `changesMembership` false for a remove whose identity survives in a split, with `recheck` then ignoring an amount-only change (as for respell and tidy) but not for an apply or a rename onto a new identity
      - `recheck` ignoring split tokens of untouched identities and a move between two accounts outside `plan.activeAccountId`, while flagging a move across it
      - `planUndo` conflicts
    - _Requirements: 13.2, 16.3, 16.5, 17.3, 17.4, 19.2, 19.3_

  - [ ] 7.4 Write property tests for planning
    - **Property 10: Nothing is truncated to fit**
    - **Property 11: Applying an existing tag is a no-op**
    - **Property 12: Split-only memberships are never written** (the plan half: no `PlannedChange` targets a split-only member; the payload half is in tasks 11.4 and 11.5)
    - **Property 13: Merges and rename-onto-existing are set-based**
    - **Property 22: Undo restores only exact matches**
    - **Validates: Requirements 9.3–9.5, 12.3, 12.6, 12.7, 12.9, 13.2, 13.3, 15.9, 15.10, 19.1–19.3, 19.5**

- [ ] 8. Checkpoint - Verify the domain core
  - Run `vp check` and `vp test`
  - Confirm that nothing under `src/domain/` imports React, `fetch`, timers or `src/ynab/`
  - Resolve failures before continuing

- [ ] 9. YNAB adapter and fake YNAB
  - [ ] 9.1 Add the pinned OpenAPI document and generated types
    - Commit `openapi/ynab-1.86.0.yaml`, and generate `src/ynab/openapi.generated.ts` with `openapi-typescript` through a `vp run` script
    - _Requirements: 1.10_

  - [ ] 9.2 Implement error classification
    - Add `src/ynab/errors.ts`: `YnabFailure` (including `cancelled`), classification from status (401, 403 including `data_limit_reached`, 404, 400, 429, 5xx), a thrown `fetch` error becoming `network`, and aborts classified by reason: only the private `TimeoutReason` becomes `timeout`, and every other abort becomes `cancelled`
    - Add tests: timeout versus `dispose` and session-signal aborts, before `fetch`, while waiting for headers and while reading the body
    - _Requirements: 2.6, 2.7, 18.1, 18.9_

  - [ ] 9.3 Implement the client
    - Add `src/ynab/client.ts`: `RequestOptions`, `YnabClient` and `createYnabClient(pat, { fetchImpl, timeoutMs })`
    - The PAT is held only in a closure
    - Each request asserts the origin before attaching `Authorization`, and sends `cache: 'no-store'`, `credentials: 'omit'`, `referrerPolicy: 'no-referrer'` and `mode: 'cors'`
    - The signal combines a 35-second timeout, `dispose` and the caller's signal with `AbortSignal.any`
    - Provide `listPlans`, `getAccounts`, `getCategories`, `getTransactions` and `patchTransactions`; `patchTransactions` sends only `{id, memo, approved}`
    - Add `src/ynab/client.test.ts` with a recording `fetchImpl`
    - _Requirements: 1.2, 1.4, 1.11, 2.2, 17.4, 17.5_

  - [ ] 9.4 Write the network-boundary property test
    - **Property 24: Network boundary**
    - **Validates: Requirements 1.4, 1.11**

  - [ ] 9.5 Implement mapping and delta merge
    - **Waits for task 3.2** (check 5). Until it is done, continue with 9.6, then return here
    - Add `src/ynab/map.ts`: `TransactionDetail` to `Transaction`, mapping `""` memos (parent and split) to `null` according to contract check 5, dropping deleted subtransactions, and mapping accounts and categories (deleted accounts hidden, closed kept)
    - Add `src/ynab/delta.ts`: `mergeTransactions` upserts by ID, drops `deleted`, replaces subtransactions, and returns a new map
    - _Requirements: 3.3, 3.4, 3.5, 4.5, 9.6_

  - [ ] 9.6 Build the fake YNAB
    - Add `test/fake-ynab/`: an in-memory store of plans, accounts, categories and transactions with `server_knowledge`, delta semantics (including `deleted` records and the one-year default without `since_date`), 400 for memos over 500 code points, and the `approved` default
    - Add fault injection: latency, 429, 5xx, a timeout after commit, a dropped connection before or after commit, a whole-batch 400, a 400 after partial saves, and scripted external edits
    - Export it as a `fetchImpl` now; the Playwright route handler is added in task 13.1
    - Add fake-YNAB mutation-script arbitraries to `test/arbitraries.ts`
    - _Requirements: 21.4_

  - [ ] 9.7 Implement the initial load
    - **Waits for task 3.2** (check 2) and task 9.5
    - Add `src/ynab/load.ts`: accounts, categories and transactions from `first_month` in parallel
    - On a timeout or 503 from the full transactions request, fall back to yearly windows, keeping the minimum `server_knowledge` and merging idempotently by ID
    - Report progress; any window failure is a load failure
    - Test against the fake YNAB
    - _Requirements: 3.2, 3.6, 3.7, 3.8_

  - [ ] 9.8 Write the delta property test
    - **Property 19: A delta merge equals a fresh read**
    - Add `src/ynab/delta.test.ts`
    - **Validates: Requirements 3.2, 3.5, 4.5, 9.6**

- [ ] 10. Session runtime
  - [ ] 10.1 Implement the session store
    - Add `src/session/store.ts`: `AppPhase` and `SessionStore`
    - `connect` validates the PAT with `listPlans`; `chooseBudget` and `switchBudget` create a `BudgetSession` with the next `generation` and its own `AbortController`
    - `disconnect` and `lock` advance the generation, dispose the client and reset to `disconnected` with a notice; `switchBudget` keeps the client and aborts the old session's requests
    - Results apply only when the captured generation matches
    - Selection rules: filter and account changes clear a nonempty selection and emit `selectionCleared`; year jumps do not; delta merges keep existing IDs in the Active Account
    - Write gate: `canWrite` with a stated reason
    - `switchBudget` rejects with `writeUnresolved` while an operation is unfinished
    - Open previews are re-planned after a merge and marked stale when `planDiffers`
    - Include `setActiveAccount`, `setFilters`, `setSelection`, `openTag` and `dismissPair`
    - _Requirements: 1.3, 2.1, 2.2, 2.8, 3.1, 3.6, 3.7, 3.8, 3.9, 3.10, 4.5, 4.6, 4.8, 6.4, 6.5, 6.8, 15.5, 15.6, 18.8, 19.6_

  - [ ] 10.2 Unit-test the store
    - Add `src/session/store.test.ts`: a delayed read from the old Budget Session is not merged after `switchBudget`, whether aborted or already resolved, including when switching away and back to the same plan and across a disconnect and reconnect; a `cancelled` read raises no `Updates paused`; a 401 on connect stays disconnected without echoing the token
    - _Requirements: 2.2, 3.7, 3.9_

  - [ ] 10.3 Write property tests for the store
    - **Property 23: Ending a session clears everything**
    - **Property 25: Selection scope**
    - **Validates: Requirements 2.2, 2.3, 2.8, 3.9, 4.5, 6.2–6.6, 15.6, 19.6**

  - [ ] 10.4 Implement the Refresh Scheduler
    - Add `src/session/refreshScheduler.ts`: `RefreshSchedulerDeps` and `startRefreshScheduler`, with a 60-second cadence while visible, an immediate check on return to visible, skipping while an operation runs, accounts and categories on every tenth check, on manual Refresh or on an unknown ID
    - A failure sets `refreshHealth` to paused; `refreshNow` retries
    - The disposer is idempotent, removes the listener, cancels the timer, drops in-flight results and clears its references
    - A paused operation is never restarted
    - Add `src/session/refreshScheduler.test.ts` with fake timers and visibility
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.7, 4.8, 4.9_

  - [ ] 10.5 Implement the idle lock
    - Add `src/session/idleLock.ts`: `IDLE_WARNING_MS`, `IDLE_LOCK_MS` and `startIdleLock`. Interaction is `pointerdown`, `keydown`, `wheel` and `touchstart`; elapsed time comes from `now()`; a tab returning hidden past 15 minutes locks immediately
    - Add `src/session/idleLock.test.ts`: refresh activity never resets the timer, the warning at 14 minutes, the lock at 15, and the lock after a hidden period
    - _Requirements: 2.3, 2.4_

- [ ] 11. Write engine and undo history
  - **Waits for task 3.2** (checks 1, 3 and 4)
  - [ ] 11.1 Implement the write engine core
    - Add `src/writes/writeEngine.ts`: `TxOutcome`, `OperationState`, `Operation` and `WriteEngine`
    - Keep transitions in a pure function over state and events, and keep requests in a small runner that passes the Budget Session's signal and discards results from a stale generation
    - Batch loop of up to 50 items:
      - check cancel, then pre-read with a delta
      - after the pre-read, compare the replanned kind and stop on a change (pending and unattempted items become `skipped: conflictEligibility`)
      - recheck each item
      - check cancel again, then `PATCH` `{id, memo: after, approved: current.approved}`
    - Verify responses, and run a delta verify on a missing or different memo
    - After the last batch, always run a final delta verify before recording results and the history entry, even when every response showed the expected memo
    - Update `remainingWork` after each read
    - _Requirements: 4.4, 13.2, 16.4, 16.5, 16.6, 17.1, 17.2, 17.3, 17.4, 17.5, 17.6_

  - [ ] 11.2 Implement failure, pause, cancel and resume handling
    - A 400 runs a delta verify and classifies each item (`gone`, then `completed` at `after`, then `conflictMemo`); only items at `before` are split and resubmitted after a fresh recheck. An isolated 400 is `skipped: rejected` or `failed`
    - A 429 pauses as `rateLimited`
    - Network loss, a timeout or 5xx on a `PATCH` pauses as `unknownOutcome` and verifies automatically
    - A failed pre-read pauses as `connection`
    - A failed verify after a sent `PATCH` pauses as `unknownOutcome` with unconfirmed items `unknown`; `verifyAgain` retries
    - `cancelRequested` persists through every state. Cancel while paused finishes at once only when nothing is `unknown`; a cancelled operation verifies anything in doubt, then finishes cancelled and never offers Resume
    - `resume` verifies first, then rechecks the remaining items
    - No `pending` item survives entering `paused` or `finished`, and recorded outcomes are never overwritten
    - On finish, append a history entry of completed changes, clear the selection and keep the results
    - `start` is rejected while an operation exists
    - A `cancelled` write result creates no Unknown Outcome
    - _Requirements: 6.6, 6.7, 12.8, 17.7, 17.8, 17.9, 18.1, 18.2, 18.3, 18.4, 18.5, 18.6, 18.7, 18.8, 18.9_

  - [ ] 11.3 Implement undo history
    - Add `src/writes/undoHistory.ts`: `UndoHistory`, appending entries on finish, undo of the newest entry through `planUndo` and the same engine, and removal of the entry after its undo finishes, including partially; undo operations are not added to history
    - _Requirements: 19.1, 19.4, 19.5, 19.6_

  - [ ] 11.4 Unit-test the write engine against the fake YNAB
    - Add `src/writes/writeEngine.test.ts`:
      - a 400 with some items already saved: saved items are `completed` and never resent, a deleted item is `skipped: gone`, and only items at `before` are split
      - a rename that becomes a merge after an external edit stops, even though its remaining transactions have unchanged `after` memos
      - a cancel during a pre-read sends nothing for that batch
      - an over-length rejection after a passing prediction is `skipped: rejected` and is not retried
      - no payload contains `subtransactions`
      - for remove, rename, merge, delete, respell and tidy over a fixture where the identity sits only in a split memo of some parents, those parent IDs never appear in any `PATCH`
    - _Requirements: 9.3, 12.8, 13.2, 17.5, 17.7, 18.4_

  - [ ] 11.5 Write property tests for the write engine
    - Use fault-injection schedules and external-edit interleavings from the fake YNAB
    - **Property 14: The confirmed scope is fixed**
    - **Property 15: No write without a passing recheck**
    - **Property 16: Approval is carried**
    - **Property 17: Outcomes partition the scope honestly**
    - **Property 18: A single writer, and no silent resumption**
    - **Property 12: Split-only memberships are never written** (the payload half: across generated budgets with split-only members and every management kind, no split-only parent ID appears in any `PATCH`, and no item carries `subtransactions`)
    - **Validates: Requirements 3.10, 9.3, 17.5, 4.4, 4.6, 4.9, 16.4–16.6, 17.1–17.4, 17.6, 17.7, 17.9, 18.2–18.8**

- [ ] 12. Checkpoint - Verify the adapter, session runtime and write engine
  - Run `vp check` and `vp test`, including every property test from Properties 14–19 and 23–25
  - Confirm that contract checks 1, 3, 4 and 5 passed, or that their change-protocol updates are merged, before continuing
  - Resolve failures before continuing

- [ ] 13. End-to-end harness
  - [ ] 13.1 Configure Playwright and the fake YNAB route
    - Add `playwright.config.ts` with Desktop Chrome, Desktop Firefox, WebKit and iPhone 14 projects, running against `vp preview` (or the task 1.3 server)
    - Add a `page.route('https://api.ynab.com/**')` handler over `test/fake-ynab`
    - Add a shared fixture that fails a test on any `securitypolicyviolation` event
    - Wire `vp run e2e` and add the end-to-end job to `.github/workflows/ci.yml`
    - _Requirements: 1.7, 21.4, 21.5_

  - [ ] 13.2 Add the identity end-to-end spec
    - Add `e2e/identity.spec.ts`, evaluating the shared `parseMemo` and `tagIdentity` example tables in each browser project
    - _Requirements: 7.1, 8.1, 8.2_

- [ ] 14. UI: connection, budget and shell
  - [ ] 14.1 Connect the store to React and add the app shell
    - Add `src/ui/App.tsx` switching on `AppPhase` through `useSyncExternalStore`, an error boundary showing "Something went wrong" with Disconnect and logging nothing, and in-memory view state with no router or history API
    - Add `src/ui/AppShell.tsx`: budget switcher (blocked with a reason while a write is unresolved), Refresh, the `Updates paused` indicator with Retry, Disconnect confirmation (PAT not revoked, a link to YNAB Developer Settings, and the in-flight warning), Register and Tags tabs, the toast region and the idle dialog host
    - Add the responsive layout in CSS Modules: three columns at 1024px and above; below that a rail drawer, full-height sheets and docked bars
    - _Requirements: 1.3, 2.5, 2.6, 3.9, 3.10, 4.1, 4.7, 20.1, 20.3, 20.5_

  - [ ] 14.2 Add the connect screen and budget picker
    - Add `src/ui/ConnectScreen.tsx` with PAT entry, connection errors (401 message without the token), the locked/disconnected notice, and `PrivacyPanel` naming the trusted components and distinguishing static-host metadata from financial data
    - Add `src/ui/BudgetPicker.tsx` with the plan list, empty states distinct from failures, and load progress and failure with Retry and Disconnect
    - _Requirements: 1.2, 1.10, 2.3, 3.1, 3.6, 3.7, 3.8_

  - [ ] 14.3 Add the idle dialog and toasts
    - Add `src/ui/IdleDialog.tsx`: an `alertdialog` countdown with "Stay connected" and the in-flight write warning
    - Add `src/ui/Toasts.tsx`: the React Aria toast region with `selectionCleared` for 5 seconds, `aria-live="polite"` and no focus change
    - Add component tests for the toast's live-region attributes and focus retention
    - _Requirements: 2.3, 2.6, 6.5, 20.4_

- [ ] 15. UI: Register
  - [ ] 15.1 Add account navigation and the toolbar
    - Add `src/ui/register/AccountRail.tsx` with exclusive navigation and `matching of total` counts, including closed accounts
    - Add `src/ui/register/RegisterToolbar.tsx` with search, category, group and status facets, tag chips with Match all/any and facet counts, and the year jump
    - _Requirements: 5.1, 5.3, 5.4, 5.5, 5.9_

  - [ ] 15.2 Add the grid, inspector and selection bar
    - Add `src/ui/register/RegisterGrid.tsx`: a virtualised GridList with `aria-rowcount` and checkbox selection. `Select all N matching transactions` selects offscreen rows. Rows show account, category context (including split child groups), prose memo, clickable tag chips (split-only chips have a read-only icon, and an accessible name ending "read-only, in a split"), signed amount and a labelled status. An empty state keeps the account history message
    - Add `src/ui/register/TransactionInspector.tsx` with the status label, raw memo, read-only split lines and the tag list with read-only markers
    - Add `src/ui/register/SelectionBar.tsx` with apply and remove (tag entry validated by `validateTagText`) or the write-blocked reason
    - Add component tests for the Select all label
    - _Requirements: 5.2, 5.6, 5.7, 5.8, 5.10, 5.11, 6.1, 6.2, 6.3, 6.9, 9.3, 12.1, 20.2_

- [ ] 16. UI: Tag reader and vocabulary management
  - [ ] 16.1 Add the tag rail and reader
    - Add `src/ui/tags/TagRail.tsx` with the exclusive tag list, the pinned collapsible `needs attention` group, the single-use section, per-entry markers and an empty vocabulary state
    - Add `src/ui/tags/TagReader.tsx` with the `all accounts · all time` label, the outside-account count, total composition (net, outflow, inflow, count and transfer pairs, explained without promising cancellation), members with split context and read-only markers, and header actions for rename, merge, delete, make consistent and tidy, each gated by the write gate
    - Validate rename target text with `validateTagText` before planning. Invalid text shows an inline message naming the reason and creates no plan
    - Add component tests for rename validation (whitespace, marker, trailing punctuation, digits only)
    - _Requirements: 10.2, 10.5, 10.6, 10.7, 11.1, 11.2, 11.3, 11.4, 11.5, 13.1, 14.2, 14.3_

  - [ ] 16.2 Add warning detail
    - Add `src/ui/tags/WarningDetail.tsx`: the pair view with both spellings, counts, limitations, only the directions that can change parent memos, and `Dismiss for this session`; explanation only when no direction qualifies; the spelling-variant chooser with the canonical spelling marked and nothing preselected; and cleanup with tidy
    - _Requirements: 13.4, 14.5, 14.6, 15.5, 15.7, 15.8, 15.9, 15.10, 15.11_

- [ ] 17. UI: previews, operations and undo
  - [ ] 17.1 Add the Impact Preview
    - Add `src/ui/writes/ImpactPreview.tsx`: a dialog with the label (merge described as a merge), counts, outside-account count, exclusions, unreachable split occurrences, the remaining-in-vocabulary notice, a virtualised per-transaction raw before/after list, the stale banner with Confirm disabled, and a best-effort conflict note
    - Add component tests for preview content and the stale state
    - _Requirements: 4.6, 9.5, 12.7, 12.9, 13.2, 13.7, 16.1, 16.2, 16.3, 17.10_

  - [ ] 17.2 Add the operation panel and undo confirmation
    - Add `src/ui/writes/OperationPanel.tsx` with progress, Cancel, the paused reason with Resume (only when not cancelled) or Verify again, results grouped as completed, skipped, failed, unattempted and unknown, `Select for review` starting a fresh preview, the remaining-work notice and the kind-change notice
    - Add `src/ui/writes/UndoConfirm.tsx` with a summary of the label, the restore count and known conflicts, without a before/after listing
    - Add component tests for the undo summary
    - _Requirements: 6.6, 6.7, 6.8, 16.5, 16.6, 17.8, 17.9, 18.3, 18.4, 18.6, 19.1, 19.4_

- [ ] 18. Checkpoint - Verify the UI
  - Run `vp check`, `vp test` and `vp build`, then `node scripts/check-build-csp.ts`
  - Run `vp preview` against the fake YNAB and walk connection, register, tag reader, a preview and an undo once with the keyboard at desktop and phone widths
  - Resolve failures before continuing

- [ ] 19. End-to-end, accessibility and boundary evidence
  - [ ] 19.1 Add the walkthrough spec
    - Add `e2e/walkthrough.spec.ts` covering connection and Budget choice, discovery and selection, apply/remove, Tag reading and totals, vocabulary management, previews, results and undo against the fake YNAB, including whole-history and cross-account scope, split read-only membership, prose preservation and approval being unchanged; run each workflow keyboard-only in every project
    - _Requirements: 20.1, 20.2, 21.1, 21.2, 21.3_

  - [ ] 19.2 Add the failure spec
    - Add `e2e/failures.spec.ts`: memo conflict, eligibility conflict, partial success, a timeout leading to an Unknown Outcome and verification, 429 then Resume, cancellation, reload mid-operation, undo conflict, and a Budget switch blocked by an unresolved write
    - _Requirements: 2.7, 3.10, 17.2, 17.3, 17.7, 18.1, 18.3, 18.4, 18.5, 18.6, 19.3, 21.4_

  - [ ] 19.3 Add the selection and refresh spec
    - Add `e2e/selection-refresh.spec.ts`: selection cleared by filters with the toast announced and focus kept, offscreen Select all, the 60-second and return-to-tab refresh timing with a controlled clock, browsing kept after refresh failure with writes blocked, and Budget-switch clearing
    - _Requirements: 4.2, 4.3, 4.7, 4.8, 6.4, 6.5, 3.9, 21.5_

  - [ ] 19.4 Add the accessibility spec
    - Add `e2e/accessibility.spec.ts`, running `@axe-core/playwright` on every screen and dialog at desktop and phone sizes and failing on serious or critical violations
    - _Requirements: 20.2, 20.3, 20.5_

  - [ ] 19.5 Add the boundary and CSP spec
    - Add `e2e/boundary-csp.spec.ts`: every request goes to the app origin (assets only, no `Authorization` header, no financial query strings) or to `https://api.ynab.com`; storage, cookies, the Cache API and the URL hold no PAT or financial data after API use, reload and Disconnect; no service worker is registered
    - _Requirements: 1.3, 1.4, 1.6, 1.9, 1.11, 2.1, 21.6_

- [ ] 20. Checkpoint - Verify the end-to-end suite
  - Run `vp run e2e` across all four Playwright projects, and confirm CI passes
  - Resolve failures before continuing

- [ ] 21. Deploy
  - [ ] 21.1 Add the deployment header check
    - Add `scripts/verify-deployment-headers.ts <url>`, comparing response headers on `/` and an asset against `vercel.json`, and sending Vercel's automation bypass secret from an environment variable for a protected preview
    - _Requirements: 1.5, 1.7, 21.6_

  - [ ] 21.2 Configure the Vercel project
    - Needs the owner. Create the project with Node 24, disable Web Analytics, Speed Insights and the Vercel Toolbar, enable Deployment Protection for all previews, assign only the dedicated production subdomain, and keep the hostname out of the code
    - Run `scripts/verify-deployment-headers.ts` against a preview and production
    - _Requirements: 1.1, 1.5, 1.6, 1.7_

- [ ] 22. Release validation
  - [ ] 22.1 Create the release validation record
    - Add `docs/release/v1-validation.md` listing every check below, each marked passed, failed or not performed, with fake-YNAB results kept apart from live-write evidence
    - _Requirements: 21.7_

  - [ ] 22.2 Run the live walkthrough
    - Needs the owner and the controlled YNAB test budget: history older than a year, closed and tracking accounts, split-borne tags, transfers, unapproved transactions, and a memo with prose and `\#`. Afterwards, confirm in YNAB that approval, cleared status, flags and other fields are unchanged
    - _Requirements: 21.1, 21.2_

  - [ ] 22.3 Run the screen-reader validation
    - Needs the owner. Use VoiceOver on macOS Safari and iOS Safari through every core workflow of Req 20.1, including offscreen Select all, the selection-cleared toast, the exact memo diff, recovery and undo. Axe results do not count
    - _Requirements: 20.1, 20.2, 21.3_

  - [ ] 22.4 Check the HTTP cache
    - In Firefox `about:cache?storage=disk`, confirm there are no `api.ynab.com` entries after API use, after a reload and after Disconnect
    - _Requirements: 1.11, 21.6_

- [ ] 23. Final checkpoint - Ensure verification passes
  - Run `vp check`, `vp test`, `vp build`, `node scripts/check-build-csp.ts` and `vp run e2e`
  - Run `scripts/verify-deployment-headers.ts` against production
  - Confirm `docs/release/v1-validation.md` records every check, and list any not performed

## Notes

- Tasks marked with `*` are optional. Only task 1.3 is optional, and only because it is conditional. The property tests are not optional: the design treats them as the main automated evidence for Req 21.4.
- **Owner steps**: tasks 3.2, 21.2, 22.2 and 22.3 need the owner, a PAT or the Vercel account. No PAT, bypass secret or test-budget data is ever committed.
- **Contract checks gate code**: check 2 gates `src/ynab/load.ts` (task 9.7); check 5 gates `src/ynab/map.ts` (task 9.5); checks 1, 3 and 4 gate the write engine (task 11). The domain tasks (4–7) do not depend on them and can go ahead while the owner runs them.
- **Layer order**: `src/domain/` never imports from `src/ynab/`, `src/session/`, `src/writes/` or `src/ui/`. The one exception is the `HistoryEntry` type import from `src/writes/undoHistory.ts`, which is type-only.
- **Test conventions**: tests import from `vite-plus/test` and live beside their modules as `*.test.ts(x)`; arbitraries and the fake YNAB live under `test/`; Playwright specs live under `e2e/`.
- **Write engine**: a pure transition function and a thin runner, without XState, so Property 18 can drive the transition function directly with generated event sequences.
- **Change protocol**: if a task cannot be completed as written, follow `.opal/runtime/change-protocol.md` before diverging.
- Update checkboxes as each task, subtask or checkpoint completes, so this file is the resume ledger.
