# Problem statement and v1 scope reset

Agreed with the owner on 2026-10-11, after a few weeks away from the project. It restates what Ynot is for and records the scope decisions that follow from it. Where this note conflicts with `.opal/specs/ynab-tagging/`, `CONTEXT.md` or the ADRs, this note wins until those documents are amended to match.

## The problem

YNAB gives a transaction one organising axis: a spending category inside an account. The owner wants a second axis that cuts across categories, accounts and time — a trip, a home repair, money someone owes back — and wants to see what each group adds up to, net of refunds and repayments.

The only place YNAB offers for this is the free-text memo. Hand-typed labels drift (`#Household`, `#household`, `#house-hold`) and the groups fragment. YNAB can search memos and show a total for a hand-made selection, but only one search at a time, and its bulk memo edit replaces existing memos rather than adding to them.

**Ynot makes this organisation consistent, bulk-capable and summable, without taking over YNAB's role or becoming a second store of financial data.**

- **User:** the owner, alone. One YNAB budget at a time, desktop first.
- **Job to be done:** label related transactions consistently and in bulk, see every transaction carrying a label with its net total across the whole budget, and keep the label set tidy so groups do not fragment.

## Hard constraints

From the owner:

- YNAB is the only datastore for financial records, memos, tag associations and the tag vocabulary.
- Single user, one budget at a time.
- Tags supplement YNAB's categories; they never replace them.
- Tags are flat, human-readable hashtags in memos, with case-insensitive identity.
- Totals are signed and net, so refunds and repayments offset spending.
- Ynot never damages the user's memo prose. A tag that does not fit is skipped and reported, never truncated.

From YNAB (see `docs/research/`):

- The API can write parent memos but cannot update an existing split's lines.
- Memos are capped at 500 characters.
- There is no conditional write, so overwrite protection is best effort: re-read before writing, verify after.
- Transaction listings default to the last year unless a `since_date` is given.
- 200 requests per hour per token.
- A write must resend `approved`, or YNAB resets the transaction to unapproved.
- Personal access tokens never expire and carry no scope.

## What YNAB already does

Checked against YNAB's help centre and by the owner in the YNAB web app on 2026-10-11.

| Capability | YNAB natively | Ynot |
|---|---|---|
| Find transactions by memo text | Search in All Accounts; matches parent and split-line memos | Same, plus identity-aware matching (`#Trip` = `#trip`) |
| Total for one label | Search, select all, read the selected total. Selecting a split selects the parent, so the total is likely the parent amount (unconfirmed) | Always-on per-tag net, outflow, inflow and count; split-line tags count at the split amount |
| Totals for every label at once | No | Tag overview table |
| Bulk-add a label | Web only; **replaces** existing memos (owner-tested) | Appends the tag and preserves the prose |
| Rename or merge a label everywhere | No | Yes, with impact preview |
| Native tags | None; flags (six colours with custom names) are the closest feature | — |

## Decisions

| # | Topic | Decision |
|---|---|---|
| 1 | Goal | Tagging is the goal. v1 gains a **tag overview table**: every tag with net, outflow, inflow and count. |
| 2 | Discovery scope | The Register gains an **All accounts** option, with a single account as the default. The register year control and Match all/any are cut. |
| 3 | Split memos | Split-memo tags are read and count at **the split line's amount**. A tag in the parent memo contributes the parent amount and wins over split tags on the same transaction. Split-borne tags are read-only in Ynot. |
| 4 | Vocabulary tools | Keep an **existing-tag picker** when applying, rename / merge-on-rename / delete, the near-duplicate marker, and a passive single-use marker. |
| 5 | Devices and access | Desktop first. On a phone, v1 supports browsing, totals and apply/remove. Keyboard operation, semantic HTML and axe checks form the baseline, and **every interactive control and status message has a role and an accessible name**, enforced by locating elements with `getByRole` in end-to-end tests. This also serves automated and agent navigation. |
| 6 | Credentials | An optional **Remember on this device** stores the PAT in `localStorage`. It is off by default, Disconnect wipes it, and a 401 clears it with a message. The CSP stays strict and no third-party scripts load. There is no idle lock. |
| 7 | Write failures | **Stop, verify, report.** On any failure, stop, run one delta verify (with Verify again), and show a **results view**: one row per transaction with date, payee, account, amount, memo before → after, status (done, unchanged, conflict) and a plain-language reason, filterable by status, with *Select unchanged → run again*. |
| 8 | Undo | **Undo last operation**, run as an ordinary operation through the same preview, recheck, verify and results pipeline. |
| 9 | Freshness | Refresh **on demand and when the tab regains focus**, re-plan on Confirm, show "last updated", and block writes while data is stale. |
| 10 | Budgets | Switching budget is a full reset that keeps a remembered PAT and returns to the budget picker. |
| 11 | Tag identity | `normalize('NFC').toLowerCase()`. |
| 12 | Smaller items | Keep naming transfer pairs in the total breakdown, the YNAB contract checks and the Unicode-category grammar. Cut the windowed fallback load, the build CSP guard, the deployment-header verifier and the Geist fonts. Keep the CSP in `vercel.json` and check it with `curl -I` at release. |
| 13 | Testing and release | About six domain property tests (no truncation, identity, rewrite round trip, span-only rewrites, apply-existing no-op, delta equals fresh read), plus new ones for split-line amounts and transfer pairs. Engine and store use example tests against a scripted `fetch`. End-to-end runs in Chromium plus one phone viewport: walkthrough, failures and boundary specs. The release bar is a live test-budget walkthrough plus the simulated-failure checks. |
| 14 | Build order | **Vertical slices.** Slice 1, a read-only tag reader, is first usable. |

### Build slices

1. **Read-only tag reader.** Connect with optional remembered PAT, full load, grammar, membership with split-line amounts, tag overview table, tag member list with transfer pairs, and near-duplicate and single-use markers. No writes. This is the first usable version.
2. **Register and tagging.** All-accounts and per-account views, search and filters, select all, existing-tag picker, apply and remove with preview, the safe write pipeline, the results view, Undo last, and refresh on demand and on return. The contract checks run before this slice.
3. **Vocabulary management.** Rename, merge-on-rename and delete across the budget, with impact preview.
4. **Release.** Vercel deploy, header check and live walkthrough.

## Deferred

- **Reimbursement extension** (issue #2): a schema over tags (for example `#owed-<person>`) with a dedicated management view. The v1 grammar already accepts any such naming, and v1 net totals already show a repaid group as zero.
- **OAuth.** The open choice is between the implicit flow (no server, two-hour sessions, no refresh) and the authorisation-code flow (refresh tokens, needs a small backend that relaxes the no-backend rule).
- **Multi-step undo**, like YNAB's own.
- **Split bill:** writing a new split with per-person tagged lines, which the API appears to allow when a transaction is first made a split. Needs a contract check.
- Respell chooser, tidy, warning dismissal and the merge-direction chooser.
- Full Unicode case folding, if non-English tags ever appear.
- Pause and Resume for interrupted writes, batch splitting, and automatic polling.

## Documents to amend

- `.opal/specs/ynab-tagging/requirements.md`, `design.md` and `tasks.md`, under `.opal/runtime/change-protocol.md`. `tasks.md` is to be regenerated as slices, replacing PR #22.
- ADR 0001 and ADR 0005 (split-line amounts), ADR 0002 (All accounts), ADR 0004 (identity is now NFC plus lowercase), plus new ADRs for PAT storage and write recovery.
- `CONTEXT.md`: **Split**, **Active Account**, **Register**, **Tag Association** and **Tag Total** change meaning under decisions 2 and 3.
