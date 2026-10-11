# Recover from failed writes by stopping, verifying and reporting

YNAB offers no conditional write and does not document bulk-update atomicity. Ynot therefore protects memos with checks around each write: re-read and compare against the confirmed preview before writing, send only `id`, `memo` and the current `approved`, verify afterwards with a delta read, and never claim an unverified success. The original design added a recovery machine on top of this:

- three pause reasons, with an explicit Resume that re-verified and continued the remaining work
- a persistent cancel flag
- detection of a rename that had turned into a merge mid-operation
- six per-transaction outcome states
- batch splitting after a whole-batch rejection
- eligibility fingerprints with relevance rules

None of it adds protection against memo loss. It automates continuing after a failure, which is rare for one person editing their own budget.

Write failures now follow one rule: **stop, verify, report.** On any failure (a non-success response, a timeout, a rate limit or a lost connection), Ynot sends nothing more for that operation and re-reads its transactions. Each one is then **done**, **unchanged** or **conflict**. If verification itself cannot complete, the operation stays an Unknown Outcome, offers *Verify again*, and blocks new writes.

## Consequences

- An **Operation Results** view replaces the outcome taxonomy. It shows one row per transaction, with date, payee, account, amount, memo before and after, status, and a plain-language reason. It can be filtered by status and keeps *Select unchanged/conflicts → run again*.
- Continuing after a failure means running the operation again on what is left. That gives a fresh preview and fresh checks, and transactions already done drop out because they no longer need the change. There is no Resume and no remaining-work bookkeeping.
- Cancel means stop after the request in flight, then verify.
- A whole-batch rejection is not split and retried. It is verified like any other failure, and anything still unchanged goes back to review, where the fit check runs again.
- The pre-write recheck skips a transaction when it is gone, when its memo differs from the preview, or when re-planning gives a different memo. Skipping too often is harmless, because the transaction is listed for review.
- **Undo** covers the last operation only. It runs as an ordinary operation with its own preview, checks and results, so it needs no separate write path. A multi-step undo like YNAB's own can be added later, because each undo is already an operation.
- One write runs at a time, and a second write is blocked, not queued. Both are unchanged.
