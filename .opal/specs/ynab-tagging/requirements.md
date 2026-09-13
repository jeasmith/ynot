# Requirements Document

## Introduction

Ynot is a privacy-first, single-user web app for organizing transactions in one YNAB budget at a time through consistent, flat hashtags. YNAB remains the sole datastore for financial records, memos, Tag Associations, and the Tag Vocabulary. Ynot reads parent and split memos, associates tags with whole Transactions, and writes only parent memos.

This draft specifies the first usable version agreed in the completed [YNAB tagging system Wayfinder map](https://github.com/jeasmith/ynot/issues/1). It covers connection, account-scoped discovery, bulk tagging, budget-wide tag reading and management, vocabulary warnings, safe writes, recovery, and session-only undo. Every core workflow must work on desktop and phone with keyboard and screen-reader access. The requirements stage does not implement the product or select its implementation framework.

The linked resolutions and ADRs are the source of this draft. Later decisions refine earlier prototypes: selection clears on user changes to filters; split memos contribute read-only membership; Tag Totals have the agreed net/outflow/inflow/count composition; and near-duplicate warnings use the narrow comparison rule. Prototype-only analytics and alternative layouts are not requirements.

## Why

Ynot adds reusable organization across transactions without replacing YNAB's budgeting categories or creating another store of financial data. The Wayfinder effort has resolved the API constraints, two interaction prototypes, memo grammar, membership and totals, write safety, acceptance boundary, and vocabulary-warning policy. This specification turns those decisions into observable acceptance criteria for the first usable app and provides the contract for the subsequent design stage.

## Glossary

Domain terms follow [CONTEXT.md](../../../CONTEXT.md).

- **Ynot**: The browser application specified here.
- **YNAB**: The external budgeting service and sole datastore for the user's financial and tag data.
- **Budget**: The single YNAB dataset currently selected by the user; called a plan in the API research.
- **Tag**: A reusable, user-defined label associated with any number of Transactions independently of spending categories. A Transaction may have zero or more Tags.
- **Transaction**: A financial record originating in YNAB, either unsplit or composed of Splits; its Tags apply to the Transaction as a whole.
- **Split**: A categorized portion of a Transaction. It provides context and is not independently taggable. A Tag in its memo associates the whole parent Transaction, but Ynot cannot write that split memo.
- **Active Account**: The single YNAB account whose Register is open. It bounds discovery, not Tag membership or Tag Totals.
- **Register**: The complete, uncut sequence of Transactions belonging to the Active Account. Filters narrow its display, not its underlying history.
- **Tag Vocabulary**: The distinct Tags present in one Budget. A Tag leaves the vocabulary when its final association is removed.
- **Tag Identity**: The tag text in Unicode Normalization Form C (NFC), then case-folded with Unicode full default case folding, used for membership comparisons and distinct from its display spelling.
- **Canonical Spelling**: The spelling carried by the most distinct Transactions, with ties broken toward the earliest Transaction and then by code point. It is derived, governs display only, and does not change Tag Identity.
- **Tag Association**: Set membership created when a Tag Identity appears in a Transaction's own memo or any of its non-deleted split memos. Repetitions contribute once.
- **Tag Total**: The net signed sum of member Transaction amounts across every account and all history, always displayed with outflow subtotal, inflow subtotal, and member count.
- **Vocabulary Warning**: An advisory suspicion about tag spelling or usage that offers an explicit action and never changes a Tag automatically.
- **Near-duplicate Pair**: Two distinct Tag Identities whose nonempty comparison results are equal after removing the literal characters `-` and `_`.
- **PAT**: A user-generated YNAB Personal Access Token used to authenticate direct YNAB requests.
- **Session**: Tab-local page memory holding the PAT and loaded financial and operation state. Reload, tab closure, Disconnect, or inactivity lock ends it.
- **Budget Session**: The portion of a Session associated with one selected Budget; switching budgets clears its financial data, operation state, and pair dismissals.
- **Impact Preview**: Review of a proposed apply, remove, rename, merge, delete, or tidy operation's scope, exact before/after memos, and limitations before explicit confirmation. Undo uses a lighter confirmation instead (Requirement 19).
- **Write Operation**: One confirmed apply, remove, rename, merge, delete, tidy, or undo action, potentially affecting multiple parent memos.
- **Unknown Outcome**: A submitted write whose effect cannot yet be verified; it is neither confirmed success nor confirmed failure.

## Requirements

### Requirement 1: Browser execution and privacy boundary

**User Story:** As the budget owner, I want Ynot to communicate directly with YNAB, so that using Tags does not create another holder of my credentials or financial data.

#### Acceptance Criteria

1. THE Ynot application SHALL be statically hosted and run in the browser without a Ynot backend, server functions, Ynot account, or Ynot login.
2. THE Ynot application SHALL authenticate YNAB requests using a user-entered PAT rather than an OAuth onboarding flow.
3. THE Ynot application SHALL keep the PAT, financial records, memos, Tag Associations, Tag Vocabulary, and operation state only in page memory and YNAB as applicable; it SHALL NOT persist them in browser storage, URLs, logs, telemetry, service workers, or another backend.
4. WHEN the user has entered a PAT, THE Ynot application SHALL transmit it only to `https://api.ynab.com`, never to the static host or a third party.
5. THE deployment SHALL serve Ynot over HTTPS from a dedicated subdomain used only by Ynot, with the exact hostname supplied by deployment configuration.
6. THE application SHALL obtain runtime code and assets only from its own origin; dependencies may be bundled at build time, but third-party runtime scripts, analytics, telemetry, and remote error reporting SHALL be absent.
7. THE deployment SHALL enforce a fail-closed Content Security Policy permitting application resources only from the Ynot origin and network connections only to `https://api.ynab.com`, while prohibiting inline/evaluated scripts, framing, plugins, and uncontrolled form submission.
8. IF a build requires weakening that Content Security Policy, THEN THE release SHALL fail acceptance.
9. THE application SHALL have no service worker or offline mode; ordinary HTTP caching of static assets SHALL remain permitted.
10. THE privacy explanation SHALL distinguish ordinary static-host request metadata from financial data and identify the device, browser and privileged extensions, dedicated origin, deployment account, build pipeline, and bundled dependencies as trusted components; it SHALL NOT claim protection from their compromise.
11. THE application SHALL prevent YNAB API responses from being stored in the browser HTTP cache, by requesting them with `no-store` cache semantics, so that ordinary static-asset caching never extends to financial data.

### Requirement 2: Session and credential lifetime

**User Story:** As the budget owner, I want a clear, temporary connection, so that I understand when credentials and financial data leave the page.

#### Acceptance Criteria

1. THE application SHALL keep credentials and financial data tab-local and SHALL NOT share them between tabs.
2. WHEN the user reloads, closes the tab, or chooses Disconnect, THE application SHALL discard the PAT and the complete in-memory Session, including operation progress, results, undo history, and pair dismissals.
3. WHEN the Session reaches 15 minutes without user interaction, THE application SHALL warn the user and lock by clearing the complete in-memory Session.
4. WHEN the tab is merely backgrounded, THE application SHALL NOT immediately lock it; background refresh activity SHALL NOT count as user interaction for the inactivity limit.
5. WHEN the user chooses Disconnect, THE application SHALL explain that local state is cleared but the PAT is not revoked, and direct suspected compromise to YNAB Developer Settings for manual revocation.
6. WHEN the user chooses Disconnect, or the inactivity warning is shown, while a Write Operation has requests already sent to YNAB, THE application SHALL state that those requests may still take effect in YNAB after the Session clears, without verification, results, or undo; it SHALL NOT delay clearing the Session to wait for them.
7. THE application SHALL treat reload and tab closure during a Write Operation the same way: sent requests may complete after local state is discarded, and a later Session SHALL read the resulting memos from YNAB as ordinary data without claiming knowledge of the discarded operation.
8. WHEN a Session has ended, THE application SHALL require a new connection and reconstruct financial state from YNAB rather than restore the previous Session or its undo history.

### Requirement 3: Budget selection and complete financial scope

**User Story:** As the budget owner, I want to choose a Budget and see its complete data, so that Tags and totals do not silently omit older or closed-account Transactions.

#### Acceptance Criteria

1. WHEN a connection succeeds, THE application SHALL allow the user to choose one accessible Budget and operate within that Budget at a time.
2. WHEN loading a Budget in a fresh Session, THE application SHALL read its complete Transaction history, using an explicit history start derived from the Budget's first month rather than relying on a default recent-history response.
3. THE loaded membership universe SHALL include returned Transactions from on-budget, tracking, and closed accounts, including income, refunds, transfers, and unapproved Transactions.
4. THE application SHALL exclude scheduled Transactions and SHALL NOT invent records for pending Transactions that YNAB does not return.
5. WHEN loading or refreshing Transaction data, THE application SHALL exclude deleted Transactions and deleted Splits before deriving membership, vocabulary, warnings, or totals.
6. UNTIL the complete initial history is available, THE application SHALL show loading or load-failure state and SHALL NOT present a partial vocabulary, warning calculation, Tag Total, or impact preview as complete.
7. IF connecting, choosing a Budget, or initially loading history fails, THEN THE application SHALL show the failure without claiming a usable complete Budget has loaded and SHALL allow the user to retry or disconnect.
8. IF no accessible Budget or no Transactions are returned successfully, THEN THE application SHALL distinguish that empty result from a loading failure.
9. WHEN the user switches Budgets, THE application SHALL clear selection, loaded financial data, operation results, operation progress, undo history, and pair dismissals before loading the new Budget.
10. IF a Write Operation is unfinished or has an Unknown Outcome, THEN THE application SHALL require it to be resolved before switching Budgets.

### Requirement 4: Automatic refresh and stale-data handling

**User Story:** As the budget owner, I want changes made in YNAB to appear automatically, so that I can browse current information without repeatedly reloading the page.

#### Acceptance Criteria

1. WHEN a Budget connection is established, THE application SHALL load its data and provide an explicit Refresh action.
2. WHILE the connected app is visible, THE application SHALL check for updates every 60 seconds.
3. WHEN the user returns to the app's tab, THE application SHALL check for updates immediately, subject to the active-write pause in criterion 4.4.
4. WHILE a Write Operation is running, THE application SHALL pause background refresh checks while retaining the operation's own pre-write checks and post-write verification.
5. WHEN automatic updates arrive, THE application SHALL preserve filters and selection by Transaction ID rather than selecting whichever rows occupy old display positions.
6. WHEN an update changes an unconfirmed preview's impact, THE application SHALL require a fresh preview before confirmation; Transactions that conflict after confirmation SHALL follow Requirement 17.
7. IF refresh fails after a successful load, THEN THE application SHALL keep the last successfully loaded data available for browsing and show a persistent `Updates paused` indicator with a Retry action.
8. WHILE data updates are paused following a refresh failure, THE application SHALL block writes until refresh succeeds and the usual conflict checks can run.
9. WHEN connectivity returns, THE application SHALL NOT silently resume a paused Write Operation; recovery SHALL follow Requirement 18.

### Requirement 5: Active-account discovery and Transaction context

**User Story:** As the budget owner, I want a complete account Register with understandable filters and split context, so that I can find the Transactions I intend to organize.

#### Acceptance Criteria

1. THE Register SHALL use exclusive account navigation with exactly one Active Account at a time, rather than a composable multi-account filter.
2. THE Register SHALL include the Active Account's complete history without a rolling date cutoff.
3. WHEN the user uses the register-year control, THE Register SHALL move position within its history rather than remove Transactions from scope.
4. THE Register SHALL provide text search and category, category-group, status, and Tag facets within the Active Account; category group SHALL be available as an exact facet as well as through text search.
5. WHEN the user chooses additional Tag filters, THE Register SHALL build a multi-tag query and provide explicit Match all and Match any modes.
6. THE Register SHALL show account, category context, non-tag memo text, Tags, signed parent amount, and uncleared/cleared/reconciled status, with status labels available in the inspector.
7. WHEN a Transaction contains Splits, THE Register SHALL expose child category groups inline and full split lines, amounts, and memos as read-only inspector context.
8. THE normal memo display SHALL separate recognized tag tokens from human memo text and expose Tags as clickable filters, while preserving the raw memo for previews and rewrites.
9. THE Register's counts SHALL state their Active Account scope, and account navigation SHALL expose matching and total counts; Tag facet counts SHALL correspond to the Transactions shown by that facet.
10. WHEN filters find no matching Transactions, THE Register SHALL show an empty matching result without implying that the underlying account history is empty or has been shortened.
11. THE application SHALL provide cross-account discovery through Tag membership, while untagged Transaction discovery SHALL remain account-by-account.

### Requirement 6: Transaction selection

**User Story:** As the budget owner, I want explicit selection scope, so that bulk actions affect the Transactions I believe I have selected.

#### Acceptance Criteria

1. THE Register SHALL allow selection of whole parent Transactions and SHALL NOT make Splits independently selectable for tagging.
2. WHEN the user chooses Select all, THE application SHALL select every Transaction matching the current filters in the Active Account, including rows outside the visible screen.
3. THE Select all action SHALL state its matching Transaction count, for example, `Select all 243 matching transactions`.
4. WHEN the user changes search, filters, or the Active Account, THE application SHALL clear the current selection; moving position with the register-year control SHALL NOT clear it.
5. WHEN a user scope change clears selection, THE application SHALL show a small, non-blocking toast for five seconds, announce it to screen readers, and leave focus in place.
6. WHEN a Write Operation finishes, THE application SHALL clear selection and retain its results for review.
7. WHEN an operation has skipped or failed Transactions, THE results SHALL provide an explicit Select for review action that starts a fresh preview.
8. WHEN an operation pauses, THE application SHALL retain its confirmed scope for Resume independently of browsing selection.
9. THE application SHALL offer Transaction selection only in the Register; the Tag reader SHALL NOT offer per-Transaction selection, so apply and remove on chosen Transactions remain account-by-account while budget-wide changes use the Tag reader's global actions.

### Requirement 7: Hashtag recognition and escaping

**User Story:** As the budget owner, I want Tags recognized without cutting words apart or misreading ordinary memo text, so that organization preserves what I wrote in YNAB.

#### Acceptance Criteria

1. WHEN parsing a memo, THE tag reader SHALL recognize a candidate `#` only at memo start or after a character outside Unicode general categories `L*` and `N*`, and only when it is not immediately preceded by `\`.
2. WHEN a candidate begins with additional consecutive `#` markers, THE tag reader SHALL skip those extra markers and read the following non-whitespace run as one candidate tag text.
3. THE tag reader SHALL end a candidate at the next whitespace or memo end, trim trailing characters of Unicode general categories `Po`, `Pe`, and `Pf`, and then reject an empty result or a result consisting only of Unicode decimal digits (`Nd`).
4. THE tag reader SHALL preserve dashes (`Pd`), connectors (`Pc`), accents, and other characters not removed by criterion 7.3, without imposing an ASCII tag alphabet or truncating at an unfamiliar character.
5. THE tag reader SHALL recognize examples such as `#Café`, `#Grüße`, `#Home_Repair`, `#Cornwall-2026`, `Paint,#Home-Repair`, and `(#Tax`, subject to the same grammar.
6. THE tag reader SHALL treat `catalogue#kitchen`, `C#`, a bare `#`, `#3.`, and `#٣` as prose rather than Tags.
7. WHEN a memo contains `\#`, THE application SHALL treat that hash as literal prose; all other backslashes SHALL remain untouched, and Ynot SHALL NOT insert escapes on the user's behalf.
8. WHEN reading parent memos and split memos, THE application SHALL apply the same grammar.
9. WHEN a memo is null or empty, THE tag reader SHALL derive no Tags from it.

### Requirement 8: Tag Identity and Canonical Spelling

**User Story:** As the budget owner, I want equivalent spellings to identify one Tag with a predictable display name, so that case differences do not fragment membership or totals.

#### Acceptance Criteria

1. THE application SHALL derive Tag Identity by normalizing tag text to Unicode Normalization Form C (NFC) and then applying Unicode full default case folding (`CaseFolding.txt` statuses C and F, excluding the Turkic T mappings), independent of locale; canonically equivalent precomposed and decomposed text SHALL share an identity, and `#Straße` and `#STRASSE` SHALL share an identity.
2. THE application SHALL NOT apply compatibility normalization to Tag Identity, so compatibility variants such as full-width `＃ＴＡＸ` and `#TAX`, or the ligature `ﬁ` and `fi`, SHALL remain distinct identities.
3. THE application SHALL use Tag Identity for membership and totals and SHALL NOT use Canonical Spelling as a separate stored identity.
4. WHEN choosing Canonical Spelling, THE application SHALL prefer the spelling carried by the greatest number of distinct member Transactions, counting a spelling at most once per Transaction across its parent and split memos.
5. IF spelling counts tie, THEN THE application SHALL prefer the spelling carried by the earliest Transaction by date, then break any remaining tie by code-point order.
6. THE derived Canonical Spelling SHALL be independent of API response order and SHALL NOT require stored user preferences or automatic memo rewrites.
7. WHEN the underlying Transactions change, THE displayed Canonical Spelling SHALL be allowed to change according to the same rule without changing Tag Identity.

### Requirement 9: Membership and read-only split associations

**User Story:** As the budget owner, I want every recognized Tag in YNAB to contribute honestly, so that split memo Tags remain visible without promising edits Ynot cannot make.

#### Acceptance Criteria

1. WHEN a Tag Identity appears in a Transaction's own memo or any non-deleted split memo, THE application SHALL associate that whole parent Transaction with the Tag.
2. THE application SHALL treat membership as a set: repeated occurrences in one memo or across parent and split memos SHALL produce one association and one contribution per Transaction.
3. WHEN membership is carried only by split memos, THE application SHALL mark it read-only wherever listed and exclude it from the scope of remove, rename, merge, and delete operations rather than attempt a write that cannot succeed.
4. WHEN a parent memo Tag is removed but the same identity remains in a split memo, THE application SHALL retain and report the surviving membership.
5. WHEN a rename, merge, or delete cannot reach occurrences in split memos, THE preview SHALL count those occurrences and explain that the old spelling or membership will remain afterwards.
6. WHEN the last association disappears from the Budget, THE application SHALL remove the Tag from the derived Tag Vocabulary.
7. THE application SHALL NOT encode independent split associations into parent memos or another datastore.

### Requirement 10: Budget-wide Tag Totals

**User Story:** As the budget owner, I want each Tag Total to have one explicit interpretation, so that refunds, transfers, and splits do not make the figures misleading.

#### Acceptance Criteria

1. THE Tag Total SHALL be the net signed sum of its member Transactions' full parent amounts, each counted once, across all accounts and all history in the selected Budget.
2. WHEN displaying a Tag Total, THE application SHALL also display outflow subtotal, inflow subtotal, and member count, including when the net is zero.
3. WHEN a Transaction contains Splits, THE Tag Total SHALL use the full signed parent amount even if membership arises only from one split memo.
4. THE calculation SHALL include all returned eligible Transaction classes, including income, refunds, unapproved Transactions, and transfers, without excluding classes to alter the net.
5. WHEN both sides of a transfer are tagged, THE application SHALL treat them as independent member Transactions and identify their pairing in the composition display using transfer references on parents or Splits.
6. THE transfer explanation SHALL identify pairing without promising cancellation to zero, including when one member is a larger split parent containing only part of the transfer amount.
7. THE Tag reader SHALL label its scope `all accounts · all time` and state how many members lie outside the Active Account.
8. THE application SHALL NOT narrow Tag Totals through account, year, search, category, status, or Tag filters and SHALL NOT offer date-ranged Tag Totals in v1.

### Requirement 11: Tag Vocabulary browsing

**User Story:** As the budget owner, I want a place to read each Tag and manage its vocabulary entry, so that Tags remain useful across account boundaries.

#### Acceptance Criteria

1. THE Tag reader SHALL expose the complete Tag Vocabulary through exclusive tag navigation with one Tag open at a time.
2. WHEN a Tag is opened, THE reader SHALL show its member Transactions, split context, Tag Total composition, and read-only limitations across the whole Budget.
3. THE open Tag's header SHALL provide its management actions, including global rename, merge, and delete, subject to write eligibility.
4. THE Tag reader SHALL keep the budget-wide scope visible and SHALL NOT silently scope membership to the Active Account.
5. WHEN a Budget contains no Tags, THE Tag reader SHALL present an empty vocabulary without fabricating stored or suggested memberships.

### Requirement 12: Apply and remove Tags while preserving prose

**User Story:** As the budget owner, I want to add and remove Tags on selected Transactions without damaging their memos, so that organization leaves my original financial notes intact.

#### Acceptance Criteria

1. THE application SHALL support apply and remove actions on one or multiple selected parent Transactions through an Impact Preview and explicit confirmation.
2. WHEN applying a Tag to a nonempty memo, THE writer SHALL append it with one separating space and SHALL NOT reorder existing content; an empty memo SHALL become the tag alone.
3. IF the Transaction already carries the Tag Identity in its parent or split memos, THEN applying that Tag SHALL be a no-op rather than a spelling rewrite or a duplicate association.
4. WHEN removing a Tag, THE writer SHALL remove its matching parent-memo occurrences, close only the gap left by removal, and preserve unrelated prose, punctuation, tag positions, and escapes.
5. THE writer SHALL operate on raw memo text rather than the tag-stripped display text and SHALL preserve all content unrelated to the confirmed operation.
6. WHEN predicting whether a rewritten memo fits, THE preview SHALL count Unicode code points against the 500-character memo limit.
7. IF a proposed rewrite exceeds that limit, THEN THE application SHALL skip and report that Transaction in the preview without truncating its memo or blocking otherwise eligible Transactions.
8. IF YNAB rejects a memo for length despite passing the prediction, THEN THE application SHALL report it as skipped and SHALL NOT trim, automatically retry, or introduce an unrequested rewrite to make it fit.
9. WHEN removing a Tag leaves split-borne membership, THE application SHALL explain that limitation under Requirement 9 rather than claim full removal.

### Requirement 13: Global rename, merge, delete, and tidy

**User Story:** As the budget owner, I want to maintain consistent Tag spelling across my Budget, so that cleanup does not require editing each Transaction manually.

#### Acceptance Criteria

1. THE application SHALL support global rename and delete across eligible parent memos in the whole Budget, regardless of the Active Account or Register filters.
2. WHEN a rename targets an existing Tag Identity, THE application SHALL treat it as a merge and explicitly describe it as such before confirmation.
3. WHEN a merge creates overlapping membership, THE resulting membership and totals SHALL remain set-based rather than double-count Transactions that carried both Tags.
4. WHEN a Tag Identity has more than one spelling, THE application SHALL provide an explicit spelling-consistency action that lists every spelling with its Transaction count and read-only limitations, marks the Canonical Spelling without preselecting it, and requires the user to choose the spelling to keep.
5. WHEN the user confirms a spelling-consistency action, THE writer SHALL rewrite parent-memo occurrences of the other spellings to the chosen spelling, and the preview SHALL explain any occurrences that remain in split memos; ordinary apply operations SHALL NOT rewrite variant spellings.
6. WHEN the user chooses to tidy repeated tag occurrences or extra consecutive markers, THE application SHALL preview the parent-memo cleanup as one operation and preserve membership and totals.
7. THE application SHALL confirm one management operation at a time and SHALL NOT stage multiple independent operations under one combined preview in v1.
8. THE global writer SHALL preserve unrelated memo text and obey the same fit, split-read-only, preview, conflict, recovery, and undo rules as other tagging operations.

### Requirement 14: Advisory Vocabulary Warnings

**User Story:** As the budget owner, I want suspected vocabulary problems to be visible without automatic correction, so that I remain in control of their meaning.

#### Acceptance Criteria

1. WHEN complete history is available, THE application SHALL derive warnings over the whole Budget rather than the Active Account or a filtered subset.
2. THE Tag reader SHALL show warning markers on affected rail entries and a collapsible `needs attention` group pinned to the top of the rail.
3. THE warnings SHALL prioritize spelling inconsistencies and Near-duplicate Pairs; single-use Tags SHALL appear in a separate lower-priority section that does not crowd out duplicate warnings.
4. WHEN the same Tag repeats within a memo or uses extra consecutive markers such as `##Household`, THE application SHALL accept the membership and show a cleanup warning ranked below duplicate spellings.
5. THE application SHALL treat every warning as advisory and SHALL NOT automatically rename, merge, delete, or tidy any memo.
6. WHEN a warning offers a change, THE application SHALL require an explicit action and the usual Impact Preview, with read-only limitations stated.

### Requirement 15: Near-duplicate matching, dismissal, and merge choice

**User Story:** As the budget owner, I want conservative spelling suggestions and temporary dismissal, so that deliberately different Tags do not become persistent distractions.

#### Acceptance Criteria

1. WHEN comparing two distinct Tag Identities, THE application SHALL remove only literal `-` and `_` from each identity and suggest a pair only if the resulting nonempty strings are equal.
2. THE comparison SHALL preserve accents, all other punctuation, and symbols and SHALL NOT use typo correction, transposition, plural matching, or broader similarity scoring.
3. THE application SHALL suggest pairs among `#Home-Repair`, `#Home_Repair`, and `#HomeRepair`, but SHALL NOT suggest `#Grocries` / `#Groceries` or `#Tax` / `#Taxi` under this rule.
4. THE comparison result SHALL affect suggestions only and SHALL NOT change Tag Identity, membership, or totals; case variants of one identity SHALL retain their separate spelling-consistency warning.
5. WHEN the user chooses `Dismiss for this session`, THE application SHALL dismiss that individual pair for the current Budget Session while leaving other pairs unaffected.
6. WHEN automatic refresh completes, THE application SHALL preserve pair dismissals; reload, tab closure, Disconnect, inactivity lock, or Budget switching SHALL clear them without persisting them or writing them into YNAB memos.
7. WHEN the user reviews a pair for merging, THE application SHALL show Transaction counts and read-only limitations beside both spelling choices and require the user to choose which spelling to keep.
8. THE application SHALL NOT choose merge direction automatically.
9. THE detector SHALL include Tags found only in split memos, and the action SHALL offer only merge directions that can change parent memos.
10. WHEN a proposed merge leaves occurrences or membership in Splits, THE preview SHALL explain what will remain.
11. IF neither direction can change parent memos, THEN THE application SHALL offer explanation and session dismissal without promising a merge it cannot perform.

### Requirement 16: Explicit impact and fixed operation scope

**User Story:** As the budget owner, I want to inspect exactly what an operation will change, so that a broad tagging action has a concrete scope I can approve.

#### Acceptance Criteria

1. BEFORE submitting an apply, remove, rename, merge, delete, or tidy operation, THE application SHALL present an Impact Preview and require explicit confirmation; undo SHALL instead follow Requirement 19.
2. THE preview SHALL make the literal before and after raw memo available for each proposed change and state the operation's affected Transaction count and scope.
3. THE preview SHALL count affected Transactions outside the Active Account and disclose predicted memo-length skips and unreachable split occurrences.
4. WHEN the user confirms a preview, THE application SHALL fix the operation's scope to the Transactions included in that confirmation.
5. WHEN later reads discover additional matches, THE operation SHALL leave those Transactions untouched and report them as remaining work requiring a fresh preview.
6. THE application SHALL make the resulting operation progress and per-Transaction outcomes reviewable rather than infer success merely from submission.

### Requirement 17: Conflict checks and verified writes

**User Story:** As the budget owner, I want Ynot to check for intervening changes and verify its writes, so that it reduces accidental overwrites and reports uncertainty honestly.

#### Acceptance Criteria

1. BEFORE writing a Transaction, THE application SHALL re-read it and compare its raw memo against the confirmed preview.
2. IF that memo changed, THEN THE application SHALL skip the Transaction and offer fresh review while continuing with unaffected Transactions.
3. IF changes outside the memo alter eligibility or the previewed impact, including relevant amount, account, or split-tag changes, THEN THE application SHALL likewise skip the Transaction for fresh review.
4. WHEN unrelated fields have changed, THE writer SHALL preserve those changes without unnecessarily blocking tagging, including carrying the Transaction's current approval status in the update.
5. THE writer SHALL change only the intended parent memo content and preserve unrelated Transaction fields; it SHALL NOT write split memos.
6. AFTER submitting writes, THE application SHALL verify their effects rather than assume the entire batch succeeded atomically.
7. IF an operation partially succeeds, THEN THE application SHALL keep confirmed successful changes, report failures individually, and SHALL NOT automatically roll back.
8. WHEN a failed Transaction is retried, THE application SHALL require a fresh preview rather than replay the old write blindly.
9. THE results SHALL distinguish completed, skipped, failed, unattempted, and still-unknown outcomes.
10. THE application SHALL describe conflict protection as best effort and SHALL NOT promise absolute prevention of silent overwrites, because pre-write and post-write checks do not eliminate an intervening edit race.

### Requirement 18: Uncertain outcomes, interruption, and recovery

**User Story:** As the budget owner, I want interrupted operations to stop safely and explain what happened, so that recovery does not duplicate work or conceal partial changes.

#### Acceptance Criteria

1. WHEN a submitted request times out or otherwise has an uncertain outcome, THE application SHALL pause further writes and re-read the affected Transactions.
2. WHEN verification finds the intended memo, THE application SHALL count it as complete; unchanged memos SHALL be eligible for an offered retry; differing memos SHALL require review.
3. IF verification cannot complete, THEN THE application SHALL retain an explicit Unknown Outcome rather than claim success or failure, and SHALL block further writes while it remains unresolved.
4. WHEN the user cancels an operation, THE application SHALL stop sending subsequent batches, verify requests already sent, and retain confirmed changes for review and eligible undo.
5. WHEN a rate limit or connection loss interrupts an operation, THE application SHALL pause it and preserve progress in Session memory.
6. WHEN recovery becomes possible, THE application SHALL require an explicit Resume action rather than restart writes on restored connectivity or background refresh.
7. WHEN the user resumes, THE application SHALL first verify uncertain outcomes and then recheck remaining Transactions against the confirmed preview, skipping conflicts; failed Transactions SHALL still require fresh preview before retry.
8. THE application SHALL allow only one Write Operation at a time, including undo: WHILE an operation is running or has an unresolved Unknown Outcome, THE application SHALL disable starting another Write Operation with a stated reason, SHALL NOT queue one to start automatically, and SHALL keep browsing available.
9. WHEN the Session ends, THE application SHALL discard progress and SHALL NOT claim that the operation can be resumed from a later Session.

### Requirement 19: Session-only undo

**User Story:** As the budget owner, I want to undo confirmed changes during my Session, so that I can recover from an unwanted operation without overwriting later edits.

#### Acceptance Criteria

1. THE application SHALL retain an in-memory history of Write Operations and offer undo newest first, with each undo targeting confirmed changes from one operation.
2. WHEN undoing a Transaction change, THE application SHALL restore the original raw memo only if the current memo exactly matches Ynot's confirmed result.
3. IF the current memo differs, THEN THE application SHALL skip that Transaction and report the conflict while allowing other unchanged confirmed results to be restored.
4. WHEN the user chooses undo, THE application SHALL require explicit confirmation of a summary naming the operation, the number of Transactions to restore, and any conflicts already known; it SHALL NOT require a full before/after Impact Preview.
5. THE undo operation SHALL follow the same pre-write checks, verification, partial-success, cancellation, and recovery rules as other writes.
6. WHEN a Session ends or the user switches Budgets, THE application SHALL clear undo history and SHALL NOT imply that undo survives that boundary.

### Requirement 20: Desktop, phone, keyboard, and screen-reader access

**User Story:** As the budget owner, I want all core workflows available with my device and input method, so that I can complete the same work without needing a desktop mouse.

#### Acceptance Criteria

1. THE application SHALL make connection, Budget choice and switching, Register browsing and filtering, selection, tagging, Tag reading, vocabulary management, previews, results, recovery, and undo usable on both desktop and phone.
2. THE application SHALL make every core workflow operable by keyboard with perceivable focus and accessible to screen readers, including selecting Transactions and reviewing exact memo changes.
3. THE responsive interface SHALL preserve access to counts, scope labels, read-only limitations, and recovery actions instead of omitting them on phone layouts.
4. THE selection-cleared toast SHALL remain small and non-blocking, disappear after five seconds, and be announced without taking focus, as specified in Requirement 6.
5. THE interface SHALL expose loading, empty, failure, paused, progress, and result states through readable information rather than color or visual styling alone.

### Requirement 21: Evidence required for first-version acceptance

**User Story:** As the budget owner, I want release evidence that covers normal work and failures, so that the first usable version is supported by more than successful sample interactions.

#### Acceptance Criteria

1. BEFORE declaring v1 usable, THE release validation SHALL include a controlled YNAB test-budget walkthrough covering connection and Budget choice, discovery and selection, apply/remove, Tag reading and totals, vocabulary management, previews, results, and undo.
2. THE walkthrough evidence SHALL cover whole-history and cross-account scope, split-borne read-only membership, prose preservation, and the absence of unrequested approval changes.
3. THE acceptance evidence SHALL demonstrate the core workflows on desktop and phone and through keyboard and screen-reader access, including the selection-cleared toast.
4. THE automated or simulated failure evidence SHALL cover conflicting memo and relevant non-memo changes, partial success, timeouts, Unknown Outcomes, interrupted Sessions, cancellation, rate limits or connection loss, explicit Resume, and undo conflicts.
5. THE acceptance evidence SHALL check selection clearing, offscreen Select all, automatic-refresh timing, retained browsing after refresh failure, blocked writes, and Budget-switch state clearing against their numbered requirements.
6. THE release validation SHALL verify the memory-only credential and data boundary and enforced Content Security Policy, including that runtime requests do not disclose the PAT or financial data to the Ynot host or third parties, and that no YNAB API response is present in the browser HTTP cache after API use, reload, and Disconnect.
7. THE release record SHALL distinguish completed checks from unperformed or failing checks and SHALL NOT treat prototype simulations as evidence of verified live YNAB writes.

### Requirement 22: First-version exclusions

**User Story:** As the budget owner, I want the first release bounded by the agreed purpose, so that implementation effort stays focused on reliable tagging.

#### Acceptance Criteria

1. THE first version SHALL remain single-user and one-Budget-at-a-time, without multi-user accounts, tenancy, or general public onboarding.
2. THE first version SHALL NOT offer independently editable or selectable split Tags, encode independent split associations in parent memos, or tag scheduled Transactions.
3. THE first version SHALL NOT persist financial, memo, Tag, vocabulary, undo, or dismissal data outside YNAB and the permitted live page memory.
4. THE first version SHALL NOT provide native mobile apps, offline operation, or a service worker.
5. THE first version SHALL NOT add charts, trends, date-ranged Tag Totals, budgeting advice, reimbursement tracking, or analytics beyond the agreed tagged Transaction lists and Tag Total composition.
6. THE first version SHALL NOT offer staged multi-operation management plans or broader typo/similarity detection beyond the confirmed near-duplicate rule.
7. THE first version SHALL NOT offer per-Transaction selection in the Tag reader or queued Write Operations.

## Decision Traceability

The requirements above are the draft contract. These links preserve the rationale and original evidence; prototype details are included only where confirmed by a resolution or subsequent owner agreement. Historical API facts are captured in the repository's research note, not newly revalidated by this drafting step.

| Decision source | Requirements informed |
| --- | --- |
| [Completed Wayfinder map](https://github.com/jeasmith/ynot/issues/1) | Overall scope; 1–22 |
| [Official YNAB API constraints](../../../docs/research/ynab-api-constraints.md), [research ticket](https://github.com/jeasmith/ynot/issues/3) | 1–4, 7, 9, 12, 16–19 |
| [Execution and credential boundary](https://github.com/jeasmith/ynot/issues/6#issuecomment-5477823037) | 1–3, 18–19, 21–22 |
| [Parent-only tagging](https://github.com/jeasmith/ynot/issues/11), [ADR 0001](../../../docs/adr/0001-parent-only-tagging.md) | 5–6, 9–10, 12–13, 17, 22 |
| [Transaction-selection prototype decisions](https://github.com/jeasmith/ynot/issues/4), [ADR 0002](../../../docs/adr/0002-active-account-register-scope.md) | 5–6, 10, 16 |
| [Tag-reader resolution](https://github.com/jeasmith/ynot/issues/7#issuecomment-5558899035), [ADR 0003](../../../docs/adr/0003-tag-reader-vocabulary-warnings.md) | 3, 11–16 |
| [Hashtag grammar resolution](https://github.com/jeasmith/ynot/issues/5#issuecomment-5559446367), [ADR 0004](../../../docs/adr/0004-hashtag-memo-grammar.md) | 7–8, 12–14 |
| [Membership and total semantics](https://github.com/jeasmith/ynot/issues/8), [ADR 0005](../../../docs/adr/0005-tag-membership-and-totals.md) | 3, 5, 8–10, 12–13, 15–17 |
| [Safe write, conflict, and recovery resolution](https://github.com/jeasmith/ynot/issues/9#issuecomment-5559857802) | 4, 12–13, 16–19, 21 |
| [First-version acceptance boundary](https://github.com/jeasmith/ynot/issues/10#issuecomment-5559965626) | 3–6, 16, 18–22 |
| [Near-duplicate resolution](https://github.com/jeasmith/ynot/issues/17#issuecomment-5560026583) | 14–15, 22 |
| Owner clarifications during requirements review, 2026-09-13: undo confirms a summary rather than a full preview; a second write is blocked, not queued; selection stays Register-only; Tag Identity is NFC plus full default case folding; the user chooses the spelling a consistency fix keeps; Disconnect and inactivity lock clear immediately and warn that sent requests may still land; YNAB responses are kept out of the HTTP cache | 1–2, 6, 8, 13, 16, 18–19, 21–22 |
