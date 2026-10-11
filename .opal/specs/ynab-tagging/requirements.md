# Requirements Document

## Introduction

Ynot is a privacy-first, single-user web app for organizing transactions in one YNAB budget at a time through consistent, flat hashtags. YNAB remains the sole datastore for financial records, memos, Tag Associations, and the Tag Vocabulary. Ynot reads parent and split memos, associates tags with whole Transactions, and writes only parent memos.

This draft specifies the first version agreed in the completed [YNAB tagging system Wayfinder map](https://github.com/jeasmith/ynot/issues/1), as re-scoped on 2026-10-11 in the [problem statement](../../../docs/problem-statement.md). It covers:

- connection, and discovery in one account or across all accounts
- bulk tagging
- budget-wide tag reading and totals, and a tag overview
- tag management and vocabulary warnings
- safe writes, with an operation results view
- undo of the last operation

The app is desktop-first. Browsing, totals and tagging must also work on a phone, and every core workflow must be operable by keyboard. The requirements stage does not implement the product or select its implementation framework.

The linked resolutions and ADRs are the source of this draft. Later decisions refine earlier prototypes:

- Selection clears when the user changes filters.
- Split memos contribute read-only membership at the split line's amount.
- Tag Totals have the agreed net, outflow, inflow and count composition.
- Near-duplicate warnings use the narrow comparison rule.

Prototype-only analytics and alternative layouts are not requirements. Criteria removed by the 2026-10-11 scope reset keep their numbers, and each says why it was removed.

## Why

Ynot adds reusable organization across transactions without replacing YNAB's budgeting categories or creating another store of financial data. The Wayfinder effort has resolved the API constraints, two interaction prototypes, memo grammar, membership and totals, write safety, acceptance boundary, and vocabulary-warning policy. This specification turns those decisions into observable acceptance criteria for the first usable app and provides the contract for the subsequent design stage.

After a pause, the 2026-10-11 scope reset re-tested this specification against the owner's original problem.

- **Removed**, because it was sized for a multi-user product: polling, pause and resume, multi-step undo, an idle lock, full Unicode case folding, and the multi-browser release matrix.
- **Added**, because the job needed it: discovery across all accounts, a tag overview, an existing-tag picker, split-line amounts, and a results view.

The build proceeds in vertical slices. The first slice, a read-only tag reader, is the first usable version.

## Glossary

Domain terms follow [CONTEXT.md](../../../CONTEXT.md).

- **Ynot**: The browser application specified here.
- **YNAB**: The external budgeting service and sole datastore for the user's financial and tag data.
- **Budget**: The single YNAB dataset currently selected by the user; called a plan in the API research.
- **Tag**: A reusable, user-defined label associated with any number of Transactions independently of spending categories. A Transaction may have zero or more Tags.
- **Transaction**: A financial record originating in YNAB, either unsplit or composed of Splits; its Tags apply to the Transaction as a whole.
- **Split**: A categorized portion of a Transaction. Ynot cannot select it or write its memo. A Tag in its memo associates the parent Transaction, and that split line's amount is what the Tag counts (see Contribution).
- **Active Account**: The single YNAB account whose Register is open, when the user has chosen one account rather than All accounts. It bounds discovery, not Tag membership or Tag Totals.
- **All accounts**: The Register scope that covers every account in the Budget at once, offered alongside the per-account choices.
- **Register**: The complete, uncut sequence of Transactions in the current scope: the Active Account, or All accounts. Filters narrow its display, not its underlying history.
- **Tag Vocabulary**: The distinct Tags present in one Budget. A Tag leaves the vocabulary when its final association is removed.
- **Tag Identity**: The tag text in Unicode Normalization Form C (NFC), then lowercased with the default Unicode lowercase mapping, which does not depend on locale. It is used for membership comparisons and is distinct from the display spelling.
- **Canonical Spelling**: The spelling carried by the most distinct Transactions, with ties broken toward the earliest Transaction and then by code point. It is derived, governs display only, and does not change Tag Identity.
- **Tag Association**: Set membership created when a Tag Identity appears in a Transaction's own memo or any of its non-deleted split memos. Repetitions contribute once.
- **Contribution**: The amount a member Transaction adds to a Tag Total. If the Tag Identity is in the parent memo, it is the full signed parent amount. Otherwise it is the sum of the signed amounts of the non-deleted split lines whose memos carry the Tag Identity.
- **Tag Total**: The net signed sum of member Contributions across every account and all history, always displayed with outflow subtotal, inflow subtotal, and member count.
- **Tag Overview**: A table listing every Tag in the Tag Vocabulary with its Tag Total composition.
- **Vocabulary Warning**: An advisory suspicion about tag spelling or usage that offers an explicit action and never changes a Tag automatically.
- **Near-duplicate Pair**: Two distinct Tag Identities whose nonempty comparison results are equal after removing the literal characters `-` and `_`.
- **PAT**: A user-generated YNAB Personal Access Token used to authenticate direct YNAB requests.
- **Remembered PAT**: A PAT the user has chosen to keep on this device with `Remember on this device`. It is held in the Ynot origin's browser storage until Disconnect, a rejected token, or the user clearing site data removes it.
- **Session**: Tab-local page memory holding the PAT in use and loaded financial and operation state. Reload, tab closure, or Disconnect ends it. A Remembered PAT outlives the Session; nothing else does.
- **Budget Session**: The portion of a Session associated with one selected Budget. Switching budgets ends it and clears its financial data and operation state.
- **Impact Preview**: Review of a proposed apply, remove, rename, merge, delete, or undo operation's scope, exact before/after memos, and limitations before explicit confirmation.
- **Write Operation**: One confirmed apply, remove, rename, merge, delete, or undo action, potentially affecting multiple parent memos.
- **Operation Results**: The per-Transaction record of a Write Operation: each Transaction's status (done, unchanged, or conflict), its memo before and after, and a plain-language reason.
- **Unknown Outcome**: A submitted write whose effect cannot yet be verified; it is neither confirmed success nor confirmed failure.

## Requirements

### Requirement 1: Browser execution and privacy boundary

**User Story:** As the budget owner, I want Ynot to communicate directly with YNAB, so that using Tags does not create another holder of my credentials or financial data.

#### Acceptance Criteria

1. THE Ynot application SHALL be statically hosted and run in the browser without a Ynot backend, server functions, Ynot account, or Ynot login.
2. THE Ynot application SHALL authenticate YNAB requests using a user-entered PAT rather than an OAuth onboarding flow.
3. THE Ynot application SHALL keep financial records, memos, Tag Associations, Tag Vocabulary, and operation state only in page memory and YNAB as applicable; it SHALL NOT persist them in browser storage, URLs, logs, telemetry, service workers, or another backend. The PAT SHALL follow the same rule, except as a Remembered PAT under Requirement 2.
4. WHEN the user has entered a PAT, THE Ynot application SHALL transmit it only to `https://api.ynab.com`, never to the static host or a third party.
5. THE deployment SHALL serve Ynot over HTTPS from a dedicated subdomain used only by Ynot, with the exact hostname supplied by deployment configuration.
6. THE application SHALL obtain runtime code and assets only from its own origin; dependencies may be bundled at build time, but third-party runtime scripts, analytics, telemetry, and remote error reporting SHALL be absent.
7. THE deployment SHALL enforce a fail-closed Content Security Policy permitting application resources only from the Ynot origin and network connections only to `https://api.ynab.com`, while prohibiting inline/evaluated scripts, framing, plugins, and uncontrolled form submission.
8. IF a build requires weakening that Content Security Policy, THEN THE release SHALL fail acceptance.
9. THE application SHALL have no service worker or offline mode; ordinary HTTP caching of static assets SHALL remain permitted.
10. THE privacy explanation SHALL distinguish ordinary static-host request metadata from financial data and identify the device, browser and privileged extensions, dedicated origin, deployment account, build pipeline, and bundled dependencies as trusted components; it SHALL NOT claim protection from their compromise. It SHALL state that a Remembered PAT is stored on the device and grants full access to the YNAB account until revoked.
11. THE application SHALL prevent YNAB API responses from being stored in the browser HTTP cache, by requesting them with `no-store` cache semantics, so that ordinary static-asset caching never extends to financial data.

### Requirement 2: Session and credential lifetime

**User Story:** As the budget owner, I want a clear connection that I can choose to remember, so that I understand where my credentials live and when financial data leaves the page.

#### Acceptance Criteria

1. THE application SHALL keep financial data and operation state tab-local and SHALL NOT share them between tabs; only a Remembered PAT is available to other tabs of the Ynot origin.
2. WHEN the user reloads or closes the tab, THE application SHALL discard the complete in-memory Session, including operation progress, results, and undo. WHEN the user chooses Disconnect, it SHALL also delete any Remembered PAT.
3. _Removed 2026-10-11: the 15-minute inactivity lock is cut. Reload, tab closure and Disconnect end the Session, and the operating system's screen lock covers an unattended device ([problem statement](../../../docs/problem-statement.md), decision 6)._
4. _Removed 2026-10-11: there is no inactivity lock to defer (decision 6)._
5. WHEN the user chooses Disconnect, THE application SHALL explain that local state and any Remembered PAT are cleared but the PAT is not revoked, and direct suspected compromise to YNAB Developer Settings for manual revocation.
6. WHEN the user chooses Disconnect while a Write Operation has requests already sent to YNAB, THE application SHALL state that those requests may still take effect in YNAB after the Session clears, without verification, results, or undo; it SHALL NOT delay clearing the Session to wait for them.
7. THE application SHALL treat reload and tab closure during a Write Operation the same way: sent requests may complete after local state is discarded, and a later Session SHALL read the resulting memos from YNAB as ordinary data without claiming knowledge of the discarded operation.
8. WHEN a Session has ended, THE application SHALL require a new connection and reconstruct financial state from YNAB rather than restore the previous Session or its undo; a Remembered PAT MAY make that connection without the PAT being entered again.
9. WHEN the user enters a PAT, THE application SHALL offer `Remember on this device`, unselected by default, and SHALL store the PAT in the Ynot origin's browser storage only when the user selects it.
10. IF YNAB rejects a Remembered PAT as unauthorized, THEN THE application SHALL delete it and tell the user that the token was revoked or is invalid.

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
9. WHEN the user switches Budgets, THE application SHALL end the Budget Session as Disconnect would, except that it SHALL keep any Remembered PAT and the connection, and SHALL return to Budget choice before loading the new Budget.
10. IF a Write Operation is unfinished or has an Unknown Outcome, THEN THE application SHALL require it to be resolved before switching Budgets.

### Requirement 4: Refresh and stale-data handling

**User Story:** As the budget owner, I want changes made in YNAB to appear when I ask or when I come back to Ynot, so that I can browse current information without reloading the page.

#### Acceptance Criteria

1. WHEN a Budget connection is established, THE application SHALL load its data and provide an explicit Refresh action.
2. _Removed 2026-10-11: 60-second polling is cut. For one person editing their own Budget, refresh on return and the pre-write re-read in Requirement 17 are enough (decision 9)._
3. WHEN the user returns to the app's tab, THE application SHALL check for updates immediately, subject to criterion 4.4.
4. WHILE a Write Operation is running, THE application SHALL NOT start refresh checks, and SHALL keep the operation's own pre-write checks and post-write verification.
5. WHEN updates arrive, THE application SHALL preserve filters and selection by Transaction ID rather than selecting whichever rows occupy old display positions.
6. WHEN the user confirms an Impact Preview, THE application SHALL first re-read and re-plan it. IF the impact has changed, THEN it SHALL show the changed preview for a fresh confirmation instead of writing. Transactions that conflict after confirmation SHALL follow Requirement 17.
7. IF refresh fails after a successful load, THEN THE application SHALL keep the last successfully loaded data available for browsing and show a persistent `Updates paused` indicator with a Retry action.
8. WHILE data updates are paused following a refresh failure, THE application SHALL block writes until refresh succeeds and the usual conflict checks can run.
9. WHEN connectivity returns, THE application SHALL NOT restart a stopped Write Operation; recovery SHALL follow Requirement 18.
10. THE application SHALL show when the loaded data was last successfully updated.

### Requirement 5: Discovery and Transaction context

**User Story:** As the budget owner, I want a complete Register, for one account or for all accounts, with understandable filters and split context, so that I can find the Transactions I intend to organize, even when they span accounts.

#### Acceptance Criteria

1. THE Register SHALL use exclusive account navigation offering All accounts and each account, with one scope chosen at a time rather than a composable multi-account filter. A single account SHALL be the default scope.
2. THE Register SHALL include the complete history of its scope without a rolling date cutoff.
3. _Removed 2026-10-11: the register-year control is cut; search and scrolling cover moving through history (decision 2)._
4. THE Register SHALL provide text search and category, category-group, status, and Tag facets within its scope; category group SHALL be available as an exact facet as well as through text search.
5. THE Tag facet SHALL filter by one Tag at a time. Multi-tag Match all and Match any modes are removed as prototype-only (decision 2).
6. THE Register SHALL show account, category context, non-tag memo text, Tags, signed parent amount, and uncleared/cleared/reconciled status, with status labels available in the inspector.
7. WHEN a Transaction contains Splits, THE Register SHALL expose child category groups inline and full split lines, amounts, and memos as read-only inspector context.
8. THE normal memo display SHALL separate recognized tag tokens from human memo text and expose Tags as clickable filters, while preserving the raw memo for previews and rewrites.
9. THE Register's counts SHALL state their scope, and account navigation SHALL expose matching and total counts; Tag facet counts SHALL correspond to the Transactions shown by that facet.
10. WHEN filters find no matching Transactions, THE Register SHALL show an empty matching result without implying that the underlying account history is empty or has been shortened.
11. THE application SHALL provide cross-account discovery both through Tag membership and through the All accounts Register, including for untagged Transactions.
12. WHEN the scope is All accounts, THE Register SHALL show each Transaction's account.

### Requirement 6: Transaction selection

**User Story:** As the budget owner, I want explicit selection scope, so that bulk actions affect the Transactions I believe I have selected.

#### Acceptance Criteria

1. THE Register SHALL allow selection of whole parent Transactions and SHALL NOT make Splits independently selectable for tagging.
2. WHEN the user chooses Select all, THE application SHALL select every Transaction matching the current filters in the Register's scope, including rows outside the visible screen.
3. THE Select all action SHALL state its matching Transaction count, for example, `Select all 243 matching transactions`.
4. WHEN the user changes search, filters, or the Register's scope, THE application SHALL clear the current selection; scrolling SHALL NOT clear it.
5. WHEN a user scope change clears selection, THE application SHALL show a small, non-blocking toast for five seconds, announce it to screen readers, and leave focus in place.
6. WHEN a Write Operation finishes, THE application SHALL clear selection and retain its results for review.
7. WHEN an operation has unchanged or conflicting Transactions, THE Operation Results SHALL provide an explicit action to select them for a fresh preview.
8. _Removed 2026-10-11: operations no longer pause for Resume; continuing is a fresh preview of the remaining Transactions (decision 7)._
9. THE application SHALL offer Transaction selection only in the Register. The Tag reader and Tag Overview SHALL NOT offer per-Transaction selection, so apply and remove on chosen Transactions happen in the Register while budget-wide changes use the Tag reader's global actions.

### Requirement 7: Hashtag recognition and escaping

**User Story:** As the budget owner, I want Tags recognized without cutting words apart or misreading ordinary memo text, so that organization preserves what I wrote in YNAB.

#### Acceptance Criteria

1. WHEN parsing a memo, THE tag reader SHALL recognize a candidate `#` only at memo start or after a character outside Unicode general categories `L*` and `N*`, and only when it is not immediately preceded by `\`; a combining mark (`M*`) before the `#` SHALL be judged by the base character it modifies, so canonically equivalent memos such as precomposed and decomposed `é#tag` parse identically.
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

1. THE application SHALL derive Tag Identity by normalizing tag text to Unicode Normalization Form C (NFC) and then applying the default Unicode lowercase mapping, independent of locale. Canonically equivalent precomposed and decomposed text SHALL share an identity, and `#Trip` and `#TRIP` SHALL share an identity. Full case folding is not applied, so `#Straße` and `#STRASSE` SHALL remain distinct identities (decision 11).
2. THE application SHALL NOT apply compatibility normalization to Tag Identity, so compatibility variants such as full-width `#ＴＡＸ` and `#TAX`, superscript `#m²` and `#m2`, or the ligature in `#ﬁle` and `#file` SHALL remain distinct identities.
3. THE application SHALL use the single Tag Identity contract of criteria 8.1–8.2 in the tag reader, membership, totals, Tag Vocabulary, Vocabulary Warnings, and every writer and SHALL NOT use Canonical Spelling as a separate stored identity.
4. WHEN choosing Canonical Spelling, THE application SHALL prefer the spelling carried by the greatest number of distinct member Transactions, counting a spelling at most once per Transaction across its parent and split memos.
5. IF spelling counts tie, THEN THE application SHALL prefer the spelling carried by the earliest Transaction by date, then break any remaining tie by code-point order.
6. THE derived Canonical Spelling SHALL be independent of API response order and SHALL NOT require stored user preferences or automatic memo rewrites.
7. WHEN the underlying Transactions change, THE displayed Canonical Spelling SHALL be allowed to change according to the same rule without changing Tag Identity.

### Requirement 9: Membership and read-only split associations

**User Story:** As the budget owner, I want every recognized Tag in YNAB to contribute honestly, so that Tags I write on split lines, such as one line per person who owes me, are counted without Ynot promising edits it cannot make.

#### Acceptance Criteria

1. WHEN a Tag Identity appears in a Transaction's own memo or any non-deleted split memo, THE application SHALL associate that whole parent Transaction with the Tag.
2. THE application SHALL treat membership as a set: repeated occurrences in one memo or across parent and split memos SHALL produce one association and one contribution per Transaction.
3. WHEN membership is carried only by split memos, THE application SHALL mark it read-only wherever listed and exclude it from the scope of remove, rename, merge, and delete operations rather than attempt a write that cannot succeed.
4. WHEN a parent memo Tag is removed but the same identity remains in a split memo, THE application SHALL retain and report the surviving membership.
5. WHEN a rename, merge, or delete cannot reach occurrences in split memos, THE preview SHALL count those occurrences and explain that the old spelling or membership will remain afterwards.
6. WHEN the last association disappears from the Budget, THE application SHALL remove the Tag from the derived Tag Vocabulary.
7. THE application SHALL NOT encode independent split associations into parent memos or another datastore.

### Requirement 10: Budget-wide Tag Totals

**User Story:** As the budget owner, I want each Tag Total to have one explicit interpretation, so that refunds, transfers, and splits do not make the figures misleading, and a Tag on one split line counts only that line.

#### Acceptance Criteria

1. THE Tag Total SHALL be the net signed sum of its members' Contributions, each member counted once, across all accounts and all history in the selected Budget.
2. WHEN displaying a Tag Total, THE application SHALL also display outflow subtotal, inflow subtotal, and member count, including when the net is zero. The outflow subtotal SHALL sum the negative contributing amounts and the inflow subtotal the positive ones, where each contributing amount is either a parent amount or one tagged split line's amount.
3. WHEN a Transaction carries the Tag Identity in its parent memo, its Contribution SHALL be the full signed parent amount, whatever its split memos say. WHEN it carries the Tag Identity only in split memos, its Contribution SHALL be the sum of the signed amounts of the non-deleted split lines whose memos carry it. For example, take a £120 bill split into a £30 own share and three per-person lines, one of them £25 tagged `#owed-alice`: that Transaction contributes −£25 to `#owed-alice`.
4. THE calculation SHALL include all returned eligible Transaction classes, including income, refunds, unapproved Transactions, and transfers, without excluding classes to alter the net.
5. WHEN both sides of a transfer are tagged, THE application SHALL treat them as independent member Transactions and identify their pairing in the composition display using transfer references on parents or Splits.
6. THE transfer explanation SHALL identify pairing without promising cancellation to zero, including when one member contributes a parent amount that contains only part of the transfer amount.
7. THE Tag reader SHALL label its scope `all accounts · all time` and, while the Register's scope is a single account, state how many members lie outside it.
8. THE application SHALL NOT narrow Tag Totals through account, search, category, status, or Tag filters and SHALL NOT offer date-ranged Tag Totals in v1.

### Requirement 11: Tag Vocabulary browsing

**User Story:** As the budget owner, I want to see every Tag's total at a glance and read each Tag in depth, so that I know what each group adds up to across account boundaries.

#### Acceptance Criteria

1. THE Tag reader SHALL expose the complete Tag Vocabulary through exclusive tag navigation with one Tag open at a time.
2. WHEN a Tag is opened, THE reader SHALL show its member Transactions, split context, Tag Total composition, and read-only limitations across the whole Budget. A member whose Contribution comes from split lines SHALL show those lines and their amounts.
3. THE open Tag's header SHALL provide its management actions, including global rename, merge, and delete, subject to write eligibility.
4. THE Tag reader SHALL keep the budget-wide scope visible and SHALL NOT silently scope membership to the Active Account.
5. WHEN a Budget contains no Tags, THE Tag reader and Tag Overview SHALL present an empty vocabulary without fabricating stored or suggested memberships.
6. THE application SHALL provide a Tag Overview listing every Tag with its net total, outflow subtotal, inflow subtotal, and member count, sortable by each, and labelled `all accounts · all time`.
7. WHEN the user chooses a Tag in the Tag Overview, THE application SHALL open that Tag in the Tag reader.

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
10. WHEN the user types a Tag to apply, THE application SHALL suggest existing Tags whose Tag Identity, or whose identity with `-` and `_` removed, matches what has been typed. It SHALL mark a Tag that is not yet in the Tag Vocabulary as new before the Impact Preview.
11. IF the text to apply is not a valid Tag under Requirement 7, THEN THE application SHALL say why inline and SHALL NOT create an Impact Preview.

### Requirement 13: Global rename, merge, and delete

**User Story:** As the budget owner, I want to maintain consistent Tag spelling across my Budget, so that cleanup does not require editing each Transaction manually.

#### Acceptance Criteria

1. THE application SHALL support global rename and delete across eligible parent memos in the whole Budget, regardless of the Active Account or Register filters.
2. WHEN a rename targets an existing Tag Identity, THE application SHALL treat it as a merge and explicitly describe it as such before confirmation.
3. WHEN a merge creates overlapping membership, THE resulting membership and totals SHALL remain set-based rather than double-count Transactions that carried both Tags.
4. _Removed 2026-10-11: the spelling-consistency action is deferred. Tag Identity already unifies case variants, so the choice is cosmetic (decision 4)._
5. Ordinary apply operations SHALL NOT rewrite variant spellings of an existing Tag Identity. The rest of this criterion belonged to the deferred spelling-consistency action and is removed (decision 4).
6. _Removed 2026-10-11: tidy is deferred. Repeated tags and extra markers leave membership and totals correct (decision 4)._
7. THE application SHALL confirm one management operation at a time and SHALL NOT stage multiple independent operations under one combined preview in v1.
8. THE global writer SHALL preserve unrelated memo text and obey the same fit, split-read-only, preview, conflict, recovery, and undo rules as other tagging operations.
9. WHEN the user enters rename text that is not a valid Tag under Requirement 7, or that has the same Tag Identity as the Tag being renamed, THE application SHALL say why inline and SHALL NOT create an Impact Preview; changing only the spelling of one identity is the deferred spelling-consistency action (criterion 13.4).

### Requirement 14: Advisory Vocabulary Warnings

**User Story:** As the budget owner, I want suspected vocabulary problems to be visible without automatic correction, so that I remain in control of their meaning.

#### Acceptance Criteria

1. WHEN complete history is available, THE application SHALL derive warnings over the whole Budget rather than the Active Account or a filtered subset.
2. THE Tag reader and Tag Overview SHALL show a warning marker with an accessible name on each Tag in a Near-duplicate Pair, and a separate, lower-priority marker on each Tag with exactly one member Transaction.
3. THE near-duplicate marker SHALL name the other Tag in the pair, and the single-use marker SHALL NOT crowd out or outrank it. The spelling-inconsistency warning and the pinned `needs attention` group are removed along with the deferred spelling-consistency action (decision 4).
4. WHEN the same Tag repeats within a memo or uses extra consecutive markers such as `##Household`, THE application SHALL accept the membership. The cleanup warning is removed along with the deferred tidy action (decision 4).
5. THE application SHALL treat every warning as advisory and SHALL NOT automatically rename, merge, or delete any memo.
6. WHEN the user acts on a near-duplicate marker, THE application SHALL open the ordinary rename action of Requirement 13 with the other Tag's spelling offered as the target. The user chooses the direction and confirms through the usual Impact Preview.

### Requirement 15: Near-duplicate matching

**User Story:** As the budget owner, I want conservative spelling suggestions, so that likely duplicates stand out and deliberately different Tags are not flagged.

#### Acceptance Criteria

1. WHEN comparing two distinct Tag Identities, THE application SHALL remove only literal `-` and `_` from each identity and suggest a pair only if the resulting nonempty strings are equal.
2. THE comparison SHALL preserve accents, all other punctuation, and symbols and SHALL NOT use typo correction, transposition, plural matching, or broader similarity scoring.
3. THE application SHALL suggest pairs among `#Home-Repair`, `#Home_Repair`, and `#HomeRepair`, but SHALL NOT suggest `#Grocries` / `#Groceries` or `#Tax` / `#Taxi` under this rule.
4. THE comparison result SHALL affect suggestions only and SHALL NOT change Tag Identity, membership, or totals.
5. _Removed 2026-10-11: session dismissal of pairs is cut (decision 4)._
6. _Removed 2026-10-11: there are no dismissals to preserve or clear (decision 4)._
7. _Removed 2026-10-11: the dedicated merge-direction chooser is cut. Acting on a pair opens the ordinary rename (Requirement 14.6)._
8. THE application SHALL NOT choose merge direction automatically.
9. THE detector SHALL include Tags found only in split memos.
10. WHEN a proposed merge leaves occurrences or membership in Splits, THE preview SHALL explain what will remain.
11. _Removed 2026-10-11: without dismissal, a pair that no rename can reach keeps its marker, and the marker's explanation names the split-only limitation (decision 4)._

### Requirement 16: Explicit impact and fixed operation scope

**User Story:** As the budget owner, I want to inspect exactly what an operation will change, so that a broad tagging action has a concrete scope I can approve.

#### Acceptance Criteria

1. BEFORE submitting an apply, remove, rename, merge, delete, or undo operation, THE application SHALL present an Impact Preview and require explicit confirmation.
2. THE preview SHALL make the literal before and after raw memo available for each proposed change and state the operation's affected Transaction count and scope.
3. THE preview SHALL count affected Transactions outside the Register's current account, when it has one, and disclose predicted memo-length skips and unreachable split occurrences.
4. WHEN the user confirms a preview, THE application SHALL fix the operation's scope to the Transactions included in that confirmation.
5. WHEN later reads discover additional matches, THE operation SHALL leave those Transactions untouched; only a fresh preview can include them.
6. THE application SHALL make the resulting operation progress and per-Transaction outcomes reviewable rather than infer success merely from submission.

### Requirement 17: Conflict checks and verified writes

**User Story:** As the budget owner, I want Ynot to check for intervening changes and verify its writes, so that it reduces accidental overwrites and reports uncertainty honestly.

#### Acceptance Criteria

1. BEFORE writing a Transaction, THE application SHALL re-read it and compare its raw memo against the confirmed preview.
2. IF that memo changed, THEN THE application SHALL skip the Transaction and offer fresh review while continuing with unaffected Transactions.
3. IF the Transaction has been deleted, or re-planning the confirmed operation against the re-read Transaction gives a different memo from the confirmed preview, THEN THE application SHALL likewise skip it for fresh review. Skipping more Transactions than strictly necessary is acceptable.
4. WHEN other fields have changed, THE writer SHALL preserve those changes, including by carrying the Transaction's current approval status in the update.
5. THE writer SHALL change only the intended parent memo content and preserve unrelated Transaction fields; it SHALL NOT write split memos.
6. AFTER submitting writes, THE application SHALL verify their effects rather than assume the entire batch succeeded atomically.
7. IF an operation partially succeeds, THEN THE application SHALL keep confirmed successful changes, report failures individually, and SHALL NOT automatically roll back.
8. WHEN a failed Transaction is retried, THE application SHALL require a fresh preview rather than replay the old write blindly.
9. THE Operation Results SHALL give each Transaction in the confirmed scope one status: done, unchanged, or conflict. They SHALL show an Unknown Outcome as not yet verified rather than as any of the three.
10. THE application SHALL describe conflict protection as best effort and SHALL NOT promise absolute prevention of silent overwrites, because pre-write and post-write checks do not eliminate an intervening edit race.
11. THE Operation Results SHALL show, for each Transaction, its date, payee, account, amount, raw memo before and after, and status. For any status other than done, they SHALL give a plain-language reason, such as `memo changed in YNAB since preview`, `would exceed 500 characters`, `YNAB rejected: <message>`, `YNAB did not answer`, `not verified: connection lost`, or `tag only in a split; edit it in YNAB`.
12. THE Operation Results SHALL be filterable by status and SHALL remain available until the next Write Operation is confirmed or the Session ends.

### Requirement 18: Failures, uncertain outcomes, and recovery

**User Story:** As the budget owner, I want a failed operation to stop, check what actually happened and show me, so that recovery does not duplicate work or conceal partial changes.

#### Acceptance Criteria

1. WHEN any write request fails, times out, is rate-limited, or loses its connection, THE application SHALL stop sending further requests for that operation and re-read the operation's Transactions to verify them. For a request that received no response, that re-read SHALL wait until YNAB's documented 30-second processing limit has passed since the request was sent, so the result is final.
2. WHEN verification finds the intended memo, THE application SHALL mark the Transaction done. An unchanged memo SHALL be marked unchanged, and a memo matching neither SHALL be marked conflict.
3. IF verification cannot complete, THEN THE application SHALL keep an explicit Unknown Outcome rather than claim success or failure, SHALL offer `Verify again`, and SHALL block further writes while it remains unresolved.
4. WHEN the user cancels an operation, THE application SHALL stop sending requests after the one in flight, verify requests already sent, and show the Operation Results.
5. _Removed 2026-10-11: rate limits and connection loss stop the operation under criterion 18.1 instead of pausing it (decision 7)._
6. _Removed 2026-10-11: there is no Resume; criterion 18.7 replaces it (decision 7)._
7. WHEN the user wants to continue a stopped operation, THE application SHALL allow it only through the Operation Results action of Requirement 6.7, which starts a fresh Impact Preview. Transactions already done SHALL drop out because they no longer need the change.
8. THE application SHALL allow only one Write Operation at a time, including undo: WHILE an operation is running or has an unresolved Unknown Outcome, THE application SHALL disable starting another Write Operation with a stated reason, SHALL NOT queue one to start automatically, and SHALL keep browsing available.
9. WHEN the Session ends, THE application SHALL discard progress and SHALL NOT claim that the operation can be resumed from a later Session.

### Requirement 19: Undo last operation

**User Story:** As the budget owner, I want to undo my last operation, so that I can recover from an unwanted change without overwriting later edits.

#### Acceptance Criteria

1. THE application SHALL offer undo only for the most recent non-undo Write Operation that has confirmed changes, from its Operation Results, and the undo SHALL target those confirmed changes. It SHALL NOT keep a multi-step undo history in v1 (decision 8).
2. WHEN undoing a Transaction change, THE application SHALL restore the original raw memo only if the current memo exactly matches Ynot's confirmed result.
3. IF the current memo differs, THEN THE application SHALL skip that Transaction and report the conflict while allowing other unchanged confirmed results to be restored.
4. WHEN the user chooses undo, THE application SHALL present it as an ordinary Impact Preview naming the operation it reverses, and require explicit confirmation.
5. THE undo operation SHALL follow the same pre-write checks, verification, partial-success, cancellation, recovery, and Operation Results rules as other writes, and SHALL NOT itself be undoable. WHEN an undo finishes, THE application SHALL clear the undo slot, so there is no redo (Req 22.8).
6. WHEN a Session ends or the user switches Budgets, THE application SHALL discard undo and SHALL NOT imply that undo survives that boundary.

### Requirement 20: Desktop-first, phone, keyboard, and programmatic access

**User Story:** As the budget owner, I want Ynot to work fully on my desktop and for everyday tasks on my phone, and to be navigable by keyboard and by automated tools, so that I can use it however I am working.

#### Acceptance Criteria

1. THE application SHALL make every workflow usable on desktop. It SHALL make connection, Budget choice, Register browsing and filtering, selection, apply and remove with their previews and results, the Tag Overview, and Tag reading usable on a phone. Other workflows SHALL remain reachable on a phone without being optimized for it.
2. THE application SHALL make every core workflow operable by keyboard with perceivable focus. It SHALL give every interactive control and every status message a semantic role and an accessible name, so that screen readers and automated tools can find and operate them.
3. THE responsive interface SHALL preserve access to counts, scope labels, read-only limitations, and recovery actions instead of omitting them on phone layouts.
4. THE selection-cleared toast SHALL remain small and non-blocking, disappear after five seconds, and be announced without taking focus, as specified in Requirement 6.
5. THE interface SHALL expose loading, empty, failure, paused, progress, and result states through readable information rather than color or visual styling alone.

### Requirement 21: Evidence required for first-version acceptance

**User Story:** As the budget owner, I want release evidence proportionate to a personal tool, covering normal work and failures, so that each slice is supported by more than successful sample interactions.

#### Acceptance Criteria

1. BEFORE declaring the first usable version, which is read-only, THE release validation SHALL include a controlled YNAB test-budget walkthrough covering:
   - connection with and without a Remembered PAT
   - Budget choice and whole-history load
   - the Tag Overview and Tag reading
   - Contributions from split lines, transfer pairs, and warning markers
2. BEFORE Ynot writes to a real Budget, THE release validation SHALL include a controlled test-budget walkthrough covering:
   - discovery in one account and in All accounts, and selection
   - apply and remove; rename, merge and delete
   - Operation Results and undo

   It SHALL confirm that prose is preserved and that approval, cleared status, and flags are unchanged.
3. THE automated end-to-end evidence SHALL run on a desktop Chromium viewport and one phone viewport, SHALL locate controls by role and accessible name, and SHALL include automated accessibility checks.
4. THE automated or simulated failure evidence SHALL cover conflicting memo changes, partial success, timeouts, Unknown Outcomes, rate limits, cancellation, and undo conflicts.
5. THE automated evidence SHALL check selection clearing, offscreen Select all, retained browsing after refresh failure, and blocked writes against their numbered requirements.
6. THE release validation SHALL verify the credential and data boundary and the enforced Content Security Policy:
   - runtime requests reach only `https://api.ynab.com`
   - the deployed response headers carry the policy
   - no YNAB API response is cached
   - a PAT is stored only when `Remember on this device` is selected, and is deleted on Disconnect
7. _Removed 2026-10-11: a formal release record is cut. The walkthroughs and automated evidence above are the bar (decision 13)._

### Requirement 22: First-version exclusions

**User Story:** As the budget owner, I want the first release bounded by the agreed purpose, so that implementation effort stays focused on reliable tagging.

#### Acceptance Criteria

1. THE first version SHALL remain single-user and one-Budget-at-a-time, without multi-user accounts, tenancy, or general public onboarding.
2. THE first version SHALL NOT offer independently editable or selectable split Tags, encode independent split associations in parent memos, or tag scheduled Transactions.
3. THE first version SHALL NOT persist financial, memo, Tag, vocabulary, or undo data outside YNAB and the permitted live page memory. A Remembered PAT is the only thing Ynot stores in the browser.
4. THE first version SHALL NOT provide native mobile apps, offline operation, or a service worker.
5. THE first version SHALL NOT add charts, trends, date-ranged Tag Totals, budgeting advice, a reimbursement schema or view ([issue #2](https://github.com/jeasmith/ynot/issues/2)), or analytics beyond the agreed tagged Transaction lists, Tag Overview, and Tag Total composition.
6. THE first version SHALL NOT offer staged multi-operation management plans or broader typo/similarity detection beyond the confirmed near-duplicate rule.
7. THE first version SHALL NOT offer per-Transaction selection in the Tag reader or queued Write Operations.
8. THE first version SHALL NOT offer OAuth, multi-step undo, redo, pause and resume of Write Operations, automatic polling, an inactivity lock, the spelling-consistency action, tidy, warning dismissal, or writing new splits.

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
| Owner clarifications during requirements review, 2026-09-13 (partly superseded by the next row): undo confirms a summary rather than a full preview; a second write is blocked, not queued; selection stays Register-only; Tag Identity is NFC plus full default case folding; the user chooses the spelling a consistency fix keeps; Disconnect and inactivity lock clear immediately and warn that sent requests may still land; YNAB responses are kept out of the HTTP cache | 1–2, 6, 8, 13, 16, 18–19, 21–22 |
| [Problem statement and v1 scope reset](../../../docs/problem-statement.md), 2026-10-11: All accounts Register; split-line Contributions; Tag Overview; existing-tag picker; trimmed vocabulary tools; desktop-first with roles and names; optional Remembered PAT and no idle lock; stop, verify, report with Operation Results; undo last only; refresh on demand and on return; Budget switch as a reset; NFC plus lowercase identity; lean evidence; vertical slices | 1–6, 8–22 |
| [ADR 0006: optional Remembered PAT](../../../docs/adr/0006-optional-remembered-pat.md) | 1–3, 21–22 |
| [ADR 0007: stop, verify, report](../../../docs/adr/0007-stop-verify-report-writes.md) | 6, 16–19, 21 |
