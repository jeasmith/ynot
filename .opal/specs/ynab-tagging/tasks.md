# Implementation Plan: YNAB Tagging

## Overview

The build runs as **vertical slices**. Each slice ends in an app you can run against a real budget (`docs/problem-statement.md`, decision 14):

1. **Scaffold** the toolchain, headers and CI.
2. **Slice 1: read-only tag reader.** This is the first usable version. It covers connect (optionally remembered), budget choice, full load, refresh, the Tag Overview, and the Tag reader with Contributions, transfer pairs and markers. It makes no writes.
3. **Contract checks.** The owner runs them against a test budget before anything writes.
4. **Slice 2: Register and tagging.** All accounts and per-account Register, filters and selection, the tag picker, apply and remove, the write engine, Operation Results, and undo last.
5. **Slice 3: vocabulary management.** Rename, merge-on-rename and delete, plus near-duplicate marker actions.
6. **Release.** Vercel and live walkthroughs.

Work test-first within each task (TDD): write the listed tests, see them fail, then implement.

## Tasks

- [ ] 1. Scaffold the toolchain, headers and CI
  - [x] 1.1 Create the Vite+ React project
    - Add `package.json`:
      - pnpm pinned through `packageManager`, Node 24 in `engines`, `vite-plus` pinned to an exact version
      - React 19, `react-aria-components`, `@tanstack/react-virtual`
      - dev dependencies: `openapi-typescript`, `fast-check`, `@testing-library/react`, `jsdom`, `@playwright/test`, `@axe-core/playwright`
    - Add `tsconfig.json` with `strict` on, `index.html` with only an external module script, `src/main.tsx` and a placeholder `src/ui/App.tsx`
    - Add `vite.config.ts` using `defineConfig` from `vite-plus`:
      - `build.modulePreload.polyfill = false` and `build.assetsInlineLimit = 0`
      - the Vitest, Oxfmt and Oxlint configuration, and `staged` (`vp check --fix`)
    - Configure Oxlint:
      - `no-console` in `src/`
      - `no-restricted-globals` for `localStorage`, `sessionStorage`, `indexedDB` and `caches`, with an override for `src/session/patStorage.ts` only
    - Use system fonts; ship no font files
    - _Requirements: 1.1, 1.3, 1.6, 1.9, 22.3, 22.4_

  - [x] 1.2 Add deployment headers and the preview header check
    - Add `vercel.json` exactly as in the design
    - In `vite.config.ts`, read its headers into `preview.headers`
    - Confirm that `vp preview` serves the CSP on `/` and on an asset. If it does not, add a small static server that applies the `vercel.json` headers for Playwright, and note it in the design through the change protocol
    - _Requirements: 1.5, 1.7, 1.8, 1.9_

  - [x] 1.3 Add CI
    - Add `.github/workflows/ci.yml`: `voidzero-dev/setup-vp`, `vp install --frozen-lockfile`, `vp check`, `vp test`, `vp build`
    - The end-to-end job is added in task 6.1
    - _Requirements: 1.7, 21.3_

- [x] 2. Checkpoint - Verify the scaffold
  - Run `vp check`, `vp test` and `vp build`
  - Run `vp preview` and confirm the CSP header in the response
  - _Requirements: 1.1, 1.7, 1.9_

### Slice 1: read-only tag reader

- [ ] 3. Domain core for reading
  - [x] 3.1 Add the domain model
    - Add `src/domain/model.ts` with the branded IDs, `Transaction`, `SubTransaction`, `Account`, `Category` and `DomainState` from the design
    - _Requirements: 3.3, 3.5_

  - [x] 3.2 Implement Tag Identity and tag text validation
    - Add `src/domain/grammar/identity.ts`: `tagIdentity` as `normalize('NFC').toLowerCase()`, and `validateTagText` with every rejection reason
    - Unit tests:
      - case variants and NFC/NFD forms
      - `Straße`/`STRASSE`, full-width/ASCII and `ﬁ`/`fi` all stay distinct
      - each validation reason, and acceptance with or without a leading `#`
    - _Requirements: 8.1, 8.2, 8.3, 12.11, 13.9_

  - [x] 3.3 Implement the memo parser
    - Add `src/domain/grammar/parseMemo.ts` following the design's five steps, including the combining-mark base rule
    - Unit tests: the ADR 0004 example table and the design's Unicode cases, `\#`, `C:\#temp`, and `null` or empty memos
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9_

  - [x] 3.4 Add memo and transaction arbitraries
    - Add `test/arbitraries.ts`:
      - memos from the weighted alphabet in the design
      - transactions with splits, tagged split lines and transfers
    - _Requirements: 7.1, 10.3_

  - [x] 3.5 Write property tests for grammar and identity
    - Property 1: tokens are never truncated
    - Property 3: identity is invariant under canonical equivalence and case
    - Property 2 is covered by the example table in 3.3
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 8.1, 8.2, 8.3_

  - [x] 3.6 Implement the Tag Index with Contributions
    - Add `src/domain/tags/tagIndex.ts` with `buildTagIndex`, which derives:
      - membership as a set over parent and non-deleted split memos
      - per-member `source` and `contributingAmounts` (parent amount, or each tagged split line once)
      - `net`, `outflow` and `inflow` partitioned by contributing amount, and `memberCount`
      - Canonical Spelling
      - transfer pairs via parent and subtransaction transfer IDs
    - Unit tests:
      - **Restaurant bill:** a £120 bill with a £30 own share and `#owed-alice`/`#owed-bob`/`#owed-carol` lines contributes each line's amount, and a £25 inflow tagged `#owed-alice` nets it to zero
      - **Overrides and repeats:** a parent-memo tag overrides split tags; a split line carrying a tag twice counts once
      - **Transfers:** a transfer pair inside a split, and a tagged split line that is itself a transfer
      - **Inclusion:** closed accounts and unapproved transactions are included; deleted subtransactions are excluded
      - **Canonical Spelling:** ties broken by date and code point (Property 4); repeated occurrences do not change membership (Property 5)
    - _Requirements: 8.4, 8.5, 8.6, 8.7, 9.1, 9.2, 9.6, 14.4, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.8_

  - [x] 3.7 Write property tests for Contributions and transfer pairs
    - Property 6: Contributions and total composition, including that the total is unchanged by scope or filters
    - Property 7: transfer pairs are named and never assumed to cancel
    - _Requirements: 10.1, 10.2, 10.3, 10.5, 10.6, 10.8_

  - [x] 3.8 Implement markers
    - Add `src/domain/tags/markers.ts`: `nearDuplicateKey` and `deriveMarkers`, with near-duplicates (including split-only tags) and single-use
    - Unit tests (Property 19):
      - `#Home-Repair`/`#Home_Repair`/`#HomeRepair` give three pairs
      - `#Tax`/`#Taxi` and `#Grocries`/`#Groceries` are not flagged
      - single-use is flagged at exactly one member
      - markers change no totals
    - _Requirements: 14.1, 14.2, 14.5, 15.1, 15.2, 15.3, 15.4, 15.9_

- [ ] 4. YNAB adapter and session for reading
  - [ ] 4.1 Add the pinned OpenAPI document and generated types
    - Commit `openapi/ynab-1.86.0.yaml`, generate `src/ynab/openapi.generated.ts` with `openapi-typescript`, and add a `vp run` script that regenerates it
    - _Requirements: 1.1_

  - [x] 4.2 Implement error classification and the client
    - Add `src/ynab/errors.ts` with `YnabFailure`, where only the client's private timeout reason maps to `timeout` and every other abort maps to `cancelled`
    - Add `src/ynab/client.ts` per the design:
      - origin assertion before the `Authorization` header
      - `cache: 'no-store'`, `credentials: 'omit'`, `referrerPolicy: 'no-referrer'`
      - a 35-second timeout combined with `dispose` and the caller's signal
      - the PAT held only in a closure
    - Unit tests with a recording `fetchImpl` cover status classification, abort reasons and fetch init. Property 22, the network boundary, is covered by example tests
    - _Requirements: 1.4, 1.11, 2.7, 18.9_

  - [x] 4.3 Implement mapping, delta merge and the initial load
    - Add `src/ynab/map.ts` (`''` → `null` memos; deleted subtransactions dropped), `src/ynab/delta.ts` (`mergeTransactions`) and `src/ynab/load.ts`
    - The load requests accounts, categories and `transactions?since_date=<first_month>` in parallel
    - Contract checks 2 and 5 confirm the load's history start and the memo mapping. Slice 1 is read-only, so it proceeds on the design's assumptions, and task 8.2 corrects them if a check fails
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 4.4 Build the fake YNAB
    - Add `test/fakeYnab.ts`:
      - data: plans, accounts, categories and transactions with `server_knowledge` and delta semantics (including `deleted` records), 400 for memos over 500 code points, and the `approved` default
      - a scripted fault queue (`429`, `5xx`, `400`, `timeoutAfterCommit`, `dropBeforeCommit`, `externalEdit`)
      - exposure both as a `fetchImpl` and as a Playwright route handler
    - _Requirements: 21.4_

  - [x] 4.5 Write the delta property test
    - Property 18: a delta merge equals a fresh read, using fake-YNAB mutation scripts with deleted transactions and subtransactions
    - _Requirements: 3.5, 4.5, 9.6_

  - [x] 4.6 Implement PAT storage
    - Add `src/session/patStorage.ts` with `readRememberedPat`, `rememberPat` and `forgetPat` on the `ynot.pat` key, each wrapped in `try`/`catch`
    - Unit tests: round trip, and storage that throws
    - _Requirements: 1.3, 2.9, 22.3_

  - [x] 4.7 Implement the session store for reading
    - Add `src/session/store.ts` with `AppPhase`, `start`, `connect(pat, remember)`, `chooseBudget`, `switchBudget`, `disconnect`, `refreshNow` and `openTag`
    - Behaviour:
      - the PAT is remembered only after a successful plans call
      - a 401 forgets the PAT
      - `disconnect` forgets the PAT and disposes the client
      - `switchBudget` aborts the Budget Session's controller and keeps the client and the PAT
      - results apply only if their `BudgetSession` is still current
      - `refreshHealth` and `lastUpdatedAt` are tracked
      - accounts and categories are re-read on a manual refresh and when a delta references an unknown ID
    - Add `src/session/refreshOnReturn.ts`
    - Unit tests:
      - connect with and without remember, and start-up with a Remembered PAT
      - a 401 on connect and mid-session (Property 24)
      - a delayed old-session read is discarded after `switchBudget` and after `disconnect` (Property 21)
      - `refreshOnReturn` fires on visible, but not mid-refresh; the disposer removes the listener
    - _Requirements: 2.1, 2.2, 2.5, 2.8, 2.9, 2.10, 3.1, 3.6, 3.7, 3.8, 3.9, 4.1, 4.3, 4.7, 4.10_

- [x] 5. UI for reading
  - [x] 5.1 Connect the store to React and add the app shell
    - `useSyncExternalStore` binding and an error boundary showing "Something went wrong" with Disconnect
    - Add `AppShell` with:
      - Switch budget and Refresh
      - `Last updated` and `Updates paused` with Retry
      - Disconnect confirmation stating the PAT is not revoked and a remembered token is forgotten, linking to YNAB Developer Settings, and warning when a Write Operation has requests already sent
      - a Tags tab (the Register tab arrives in slice 2)
    - Mount `refreshOnReturn`
    - _Requirements: 2.5, 2.6, 3.9, 4.1, 4.7, 4.10, 20.3, 20.5_

  - [x] 5.2 Add the connect screen and budget picker
    - `ConnectScreen`:
      - PAT field and a `Remember on this device` checkbox, off by default
      - a privacy explanation, including that a Remembered PAT grants full access until revoked
      - errors that never echo the token
    - `BudgetPicker`: plan list, empty state, loading, and load failure with Retry and Disconnect
    - _Requirements: 1.2, 1.10, 2.9, 2.10, 3.1, 3.6, 3.7, 3.8_

  - [x] 5.3 Add the Tag Overview, tag rail and Tag reader
    - `TagOverview`:
      - a React Aria Table of every tag with net, outflow, inflow, count and marker icons with accessible names
      - sortable by each column and labelled `all accounts · all time`
      - a row opens the reader
    - `TagRail`: exclusive tag list with markers
    - `TagReader`:
      - scope label and total composition (net, outflow, inflow, count, transfer pairs)
      - member list showing contributing split lines and their amounts
      - read-only markers for split-only members
      - the near-duplicate marker naming the other tag
    - Empty-vocabulary state in both views
    - Component tests: an overview sort, the restaurant example rendering per-line Contributions, and markers with accessible names
    - _Requirements: 10.2, 10.5, 10.6, 10.7, 11.1, 11.2, 11.4, 11.5, 11.6, 11.7, 14.2, 14.3, 20.2_

- [x] 6. Slice 1 end-to-end evidence
  - [x] 6.1 Configure Playwright and the boundary spec
    - Playwright config:
      - Desktop Chromium and Pixel 7 projects against `vp preview`, with the fake YNAB as a `page.route` handler
      - a `securitypolicyviolation` listener that fails any test
      - every locator via `getByRole` with an accessible name
    - Add `e2e/boundary.spec.ts`:
      - requests go only to the app origin (assets, no `Authorization`) or `https://api.ynab.com`
      - `localStorage` holds `ynot.pat` only after Remember, and nothing after Disconnect
    - Add the end-to-end job to CI
    - _Requirements: 1.4, 1.7, 1.11, 2.2, 2.9, 20.2, 21.3, 21.6_

  - [x] 6.2 Add the slice 1 walkthrough spec
    - `e2e/walkthrough.spec.ts`:
      - connect with and without remember, and budget choice
      - the overview, and the reader showing split-line Contributions and a transfer pair
      - markers, Refresh, and refresh on return
    - Run axe on each screen at both viewports
    - _Requirements: 3.1, 4.3, 10.3, 10.5, 11.6, 14.2, 20.1, 20.2, 21.3_

- [ ] 7. Checkpoint - Slice 1 is usable
  - Run `vp check`, `vp test`, `vp build` and `vp run e2e`
  - Deploy a Vercel preview, and have the owner run the read-only live walkthrough (Req 21.1) on the controlled test budget:
    - history older than a year, and closed and tracking accounts
    - split lines tagged per person, and a transfer
    - unapproved transactions, and a memo with prose and `\#`
  - Record the result in the PR description. Slice 1 is now the first usable version
  - _Requirements: 3.2, 10.3, 11.6, 21.1, 21.3_

### Contract checks

- [ ] 8. Run the YNAB contract checks (owner; before slice 2 writes)
  - [ ] 8.1 Write the contract-check script
    - Add `scripts/contract-checks.ts`:
      - it reads a PAT and a test plan ID from environment variables, never a file, and uses plain `fetch`
      - it exercises checks 1–5 from the design
      - it restores every memo it changes, and prints results without memos, amounts or the PAT
    - _Requirements: 3.2, 17.4, 17.5_

  - [ ] 8.2 Run the checks and record the results
    - Needs the owner, the test budget and a PAT
    - Record the outcomes in `docs/research/ynab-contract-checks.md` with the date and API version
    - If a check fails, follow `.opal/runtime/change-protocol.md` before task 10. Check 2 or 5 failing also means correcting `load.ts` or `map.ts` from task 4.3
    - _Requirements: 3.2, 17.4, 17.5_

### Slice 2: Register and tagging

- [ ] 9. Domain for tagging
  - [ ] 9.1 Implement the Register
    - Add `src/domain/register/register.ts` with `RegisterScope` (`account` or `all`), single-tag filters, search across payee, account, category, group and split memos, facet counts, and per-scope counts
    - Unit tests:
      - All accounts versus a single account, with the account name shown in All accounts
      - tag facet counts equal the rows shown
      - an empty result does not claim the history is empty
    - _Requirements: 5.1, 5.2, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 5.11, 5.12_

  - [ ] 9.2 Implement memo rewriting
    - Add `src/domain/memo/rewrite.ts` with `applyTag`, `removeIdentity`, `renameIdentity` (merge removes the source when the target is present) and `fits`
    - Unit tests: the `·` regression, removal at the start, end and middle, the line-break preference, extra markers kept on rename, and over-length handling
    - _Requirements: 12.2, 12.4, 12.5, 12.6, 13.2, 13.3_

  - [ ] 9.3 Write property tests for rewriting
    - Property 8: apply then remove is the identity
    - Property 9: rewrites touch only tag spans
    - _Requirements: 7.7, 12.2, 12.4, 12.5, 13.8_

  - [ ] 9.4 Implement planning, recheck and undo planning
    - Add `src/domain/operations/plan.ts` with `PlannedChange`, `PlanRequest`, `Exclusion`, `OperationPlan`, `UndoSlot`, `planApply`, `planRemove`, `planRename`, `planDelete`, `planUndo`, `replan`, `planDiffers` and `recheck`
    - `planApply` and `planRename` validate with `validateTagText` and throw on invalid text
    - Unit tests:
      - exclusions: already tagged, split-only, over length and no change (Properties 10 and 12)
      - merge detection and set-based results (Property 13)
      - `replan` round trip for every kind
      - `recheck` returns `gone`, `memoChanged` and `replanDiffers`, and ignores amount and account edits that leave `after` unchanged
      - `planUndo` gives `changedSince` exclusions (Property 20)
      - invalid spellings and same-identity rename targets throw
    - _Requirements: 9.3, 9.4, 9.5, 9.7, 12.1, 12.3, 12.7, 12.9, 12.11, 13.1, 13.2, 13.3, 13.5, 13.8, 13.9, 16.2, 16.3, 17.1, 17.2, 17.3, 19.2, 19.3_

  - [ ] 9.5 Write the no-op apply property test
    - Property 11: applying an existing tag is a no-op
    - _Requirements: 12.3_

- [ ] 10. Write engine and undo slot (after task 8.2)
  - [ ] 10.1 Implement the write engine
    - Add `src/writes/writeEngine.ts` as a pure `step(state, event)` with a thin runner, following the design's write flow:
      - batches of up to 50
      - pre-read and recheck, with conflicts recorded with reasons
      - `PATCH {id, memo, approved}` with no `subtransactions`
      - stop on any failure, mark unsent items `unchanged`, then one delta verify that classifies `done`, `unchanged` or `conflict`
      - `unverified` with Verify again when the verify read fails
      - cancel after the in-flight request
      - the final verify on every operation
    - On finish, fill the undo slot with the `done` changes (a finished undo clears it instead) and clear the selection
    - _Requirements: 6.6, 12.8, 16.4, 16.6, 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7, 17.9, 18.1, 18.2, 18.3, 18.4, 18.8, 19.1, 19.5_

  - [ ] 10.2 Test the write engine against the fake YNAB
    - Scenarios:
      - all done, a memo conflict, and a deleted transaction
      - a 400 on one batch after another batch is done
      - a timeout that committed and one that did not, and an early dropped connection whose verify waits until 35 s after sending
      - a received 503 timeout response whose verify waits until 35 s after sending
      - a 429, and cancel mid-run
      - verify failure, then Verify again
      - the final verify always runs
    - Covers Properties 14 (fixed scope, recheck before write), 15 (approval carried), 16 (honest partition), 17 (single writer, no automatic restart) and 12 (split-only IDs absent from every `PATCH`)
    - _Requirements: 3.10, 4.4, 4.9, 12.9, 16.4, 16.5, 17.4, 17.5, 17.6, 17.7, 17.8, 17.9, 18.1, 18.2, 18.3, 18.4, 18.7, 18.8_

  - [ ] 10.3 Wire writes into the store
    - Store methods `setScope`, `setFilters`, `setSelection`, `preview`, `confirm` (confirm-time refresh and `replan`; replace a changed preview without writing), `cancelOperation`, `verifyAgain`, `selectForReview` and `previewUndo`
    - The write gate `canWrite` and its reason
    - Selection rules: clear on a filter or scope change with one `selectionCleared` event; keep IDs on merge
    - Switching budget is blocked while an operation is unfinished or unverified
    - The undo slot and results are dropped with the Budget Session
    - Unit tests: Property 23 (selection scope), a changed preview at confirm, the write gate reasons, and no undo slot after a budget switch
    - _Requirements: 3.10, 4.4, 4.5, 4.6, 4.8, 6.2, 6.4, 6.5, 6.6, 6.7, 16.1, 16.4, 18.7, 18.8, 19.4, 19.6_

- [ ] 11. UI for tagging
  - [ ] 11.1 Add account navigation and the toolbar
    - `AccountRail`: All accounts and each account (including closed ones) with `matching of total` counts
    - `RegisterToolbar`: search, category, group and status facets, and a single-tag facet
    - Add the Register tab to `AppShell`
    - _Requirements: 5.1, 5.4, 5.5, 5.9_

  - [ ] 11.2 Add the grid, inspector, selection bar, tag picker and toasts
    - `RegisterGrid`:
      - a virtualised GridList with `aria-rowcount` and checkbox selection
      - `Select all N matching transactions`
      - rows show the account (always in All accounts), category context, prose, tag chips (split-only chips read "read-only, in a split"), amount and status label
    - `TransactionInspector`
    - `SelectionBar` with apply and remove, or the write-blocked reason
    - `TagPicker`: a ComboBox suggesting existing tags by identity and near-duplicate key, a "new tag" marker, and the inline validation reason
    - `Toasts`: `selectionCleared` for 5 s in a polite live region, never stealing focus
    - Component tests: the Select all label, picker suggestions and the new marker, validation messages, and toast attributes with focus retained
    - _Requirements: 5.2, 5.6, 5.7, 5.8, 5.10, 5.12, 6.1, 6.2, 6.3, 6.5, 6.9, 9.3, 12.1, 12.10, 12.11, 20.3, 20.4_

  - [ ] 11.3 Add the Impact Preview and Operation Results
    - `ImpactPreview`:
      - label, counts, outside-account count and exclusions
      - unreachable split occurrences and the remaining-in-vocabulary notice
      - a virtualised raw before/after list
      - the "changed since you reviewed it" banner, and Confirm
    - `OperationResults`:
      - progress and Cancel, and Verify again when unverified
      - a table with date, payee, account, amount, before → after, status and reason
      - a status filter, Select unchanged/conflicts → review, and Undo
    - Best-effort conflict copy
    - Component tests: preview content, the banner, and results filtering and reasons
    - _Requirements: 4.6, 6.7, 9.5, 12.9, 16.1, 16.2, 16.3, 16.6, 17.9, 17.10, 17.11, 17.12, 18.3, 18.7, 19.1, 19.4_

- [ ] 12. Slice 2 end-to-end evidence
  - [ ] 12.1 Extend the walkthrough
    - Cover:
      - discovery in one account and in All accounts, and offscreen Select all
      - the tag picker, apply and remove, results and undo
      - axe on the new screens and dialogs
    - _Requirements: 5.1, 5.11, 6.2, 12.1, 12.10, 19.1, 20.1, 21.3_

  - [ ] 12.2 Add the failures spec
    - `e2e/failures.spec.ts`:
      - memo conflict and partial success
      - a timeout, then verification, then Verify again
      - a 429, cancellation and an undo conflict
      - a refresh failure with `Updates paused` and blocked writes
      - the selection-cleared toast
    - _Requirements: 4.7, 4.8, 6.4, 6.5, 17.2, 17.7, 18.1, 18.3, 18.4, 19.3, 21.4, 21.5_

- [ ] 13. Checkpoint - Slice 2 is verified
  - Run `vp check`, `vp test`, `vp build` and `vp run e2e`
  - Resolve failures before continuing
  - _Requirements: 12.1, 17.6, 18.1, 19.1, 21.3, 21.4, 21.5_

### Slice 3: vocabulary management

- [ ] 14. Rename, merge and delete
  - [ ] 14.1 Add rename, merge and delete to the Tag reader
    - `TagReader` header actions: Rename and Delete
    - `RenameDialog`: inline validation, rejection of a target with the same identity as the source, and a merge notice when the target identity exists
    - Delete and rename go through the ordinary Impact Preview, which states unreachable split occurrences and whether the old tag remains in the vocabulary
    - One operation at a time
    - _Requirements: 9.5, 11.3, 13.1, 13.2, 13.3, 13.7, 13.8, 13.9_

  - [ ] 14.2 Act on near-duplicate markers
    - Acting on a near-duplicate marker in the overview or reader opens `RenameDialog` with the other tag's spelling offered as the target. The user chooses the direction
    - Component test: the prefilled target, and no automatic merge
    - _Requirements: 14.5, 14.6, 15.8, 15.10_

  - [ ] 14.3 Extend the walkthrough
    - Cover rename, merge onto an existing tag, delete, and acting on a near-duplicate marker, with axe on `RenameDialog`
    - _Requirements: 13.1, 13.2, 14.6, 21.3_

- [ ] 15. Checkpoint - Slice 3 is verified
  - Run `vp check`, `vp test`, `vp build` and `vp run e2e`
  - _Requirements: 13.1, 13.2, 14.6, 21.3_

### Release

- [ ] 16. Deploy and validate
  - [ ] 16.1 Set up the Vercel project (owner)
    - Static project from this repository on a dedicated subdomain
    - Web Analytics, Speed Insights and the Toolbar off
    - Deployment Protection on previews
    - _Requirements: 1.5, 1.6_

  - [ ] 16.2 Check production headers
    - `curl -I` the production URL and compare the CSP and security headers with `vercel.json`
    - Record the output in the release PR description
    - _Requirements: 1.7, 21.6_

  - [ ] 16.3 Run the live write walkthrough (owner)
    - On the controlled test budget, cover:
      - discovery in one account and in All accounts, and selection
      - apply and remove; rename, merge and delete
      - Operation Results and undo
    - Afterwards, check in YNAB that prose is preserved and that approval, cleared status and flags are unchanged
    - Record the result in the release PR description
    - _Requirements: 21.2_

- [ ] 17. Final checkpoint - Ensure verification passes
  - Run `vp check`, `vp test`, `vp build` and `vp run e2e`
  - Confirm that 7, 16.2 and 16.3 are recorded
  - _Requirements: 21.1, 21.2, 21.3, 21.6_

## Notes

- **No optional tasks.** The property tests listed are the reduced set from decision 13. The other correctness properties are checked by the example tests that name them.
- **Owner steps**: 7 (read-only walkthrough), 8.2 (contract checks), 16.1 (Vercel) and 16.3 (write walkthrough). No PAT or test-budget data is ever committed.
- **Contract checks gate writes, not reading.** Slice 1 can ship before task 8.2, because it never writes. Task 10 starts only after 8.2.
- **Layer order**: `src/domain/` never imports from `src/ynab/`, `src/session/`, `src/writes/` or `src/ui/`. The `UndoSlot` type lives in the domain.
- **Test conventions**: tests import from `vite-plus/test` and live beside their modules as `*.test.ts(x)`. Arbitraries and the fake YNAB live under `test/`, and Playwright specs live under `e2e/`, using `getByRole` only.
- **Write engine**: a pure transition function and a thin runner, without XState.
- **Exclusions** (Req 22.1–22.8) are honoured by not building them. Review each PR against Requirement 22.
- **Deferred, not planned here**: reimbursement extension (#2), OAuth, multi-step undo, Split bill, respell, tidy, warning dismissal, polling, idle lock.
- **Change protocol**: if a task cannot be completed as written, follow `.opal/runtime/change-protocol.md` before diverging.
- Update checkboxes as each task, subtask or checkpoint completes, so this file is the resume ledger.
