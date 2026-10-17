# What the YNAB API can build in a test budget

Checked 2026-10-17 against YNAB's API documentation and changelog, the live OpenAPI document (v1.87.0, byte-identical to the repo copy at [`openapi/ynab-1.87.0.yaml`](../../openapi/ynab-1.87.0.yaml)), and the official JavaScript SDK README. Answers [issue #30](https://github.com/jeasmith/ynot/issues/30). General API constraints (auth, CORS, memo length, split-update limits, delta reads, error model) are in [ynab-api-constraints.md](ynab-api-constraints.md) and are not repeated here.

## Answer

A script can build most of a test budget's **contents** but none of its **structure-changing states**. It can create accounts (checking, savings, cash, credit card, other asset, other liability), category groups, categories, payees, and transactions of every kind the issue lists: splits with per-line memos, transfers, unapproved, flagged, uncleared, cleared and reconciled-status transactions, and old dates. It can then delete transactions. [OpenAPI: `SaveAccountType`, `PostCategoryGroupWrapper`, `NewCategory`, `PostPayee`, `NewTransaction`, `DELETE /plans/{plan_id}/transactions/{transaction_id}`](https://api.ynab.com/papi/open_api_spec.yaml)

A person has to do these in the YNAB app, because the API has no endpoint or field for them:

- create the plan itself (there is no `POST /plans` or plan delete)
- close an account, or delete one
- choose on-budget versus tracking explicitly (`SaveAccount` has no `on_budget`)
- hide or delete a category or category group
- delete a payee
- name a flag
- properly reconcile an account, as opposed to setting `cleared: reconciled` on a transaction

[OpenAPI: `/plans` paths, `SaveAccount`, `SaveCategory`, `SaveCategoryGroup`, `SavePayee`, `SaveTransactionWithOptionalFields`](https://api.ynab.com/papi/open_api_spec.yaml)

**The test plan is therefore a long-lived resource.** A person creates it once and sets up the manual states (a closed account, a hidden category and group, a deleted category). The script then seeds transactions into it repeatedly. `import_id` makes those transaction seeds idempotent. Without a plan delete, a full reset costs one request per transaction. Updating fixtures back to their seeded state in place is much cheaper: one `PATCH` per chunk.

## Capability table

"Undocumented" means the docs neither allow nor forbid it. The last section lists the contract checks that would settle each one.

| Thing | Create via API? | Change? | Delete? | Manual step | Source |
| --- | --- | --- | --- | --- | --- |
| Plan | No | No (settings read-only) | No | Create the test plan in the app; never delete it | [OpenAPI: `/plans`, `/plans/{plan_id}`, `/plans/{plan_id}/settings` are GET-only](https://api.ynab.com/papi/open_api_spec.yaml); [SDK method list](https://github.com/ynab/ynab-sdk-js#methods) |
| On-budget account | Yes: `checking`, `savings`, `cash`, `creditCard` | No (no PATCH) | No | None | [OpenAPI: `POST /plans/{plan_id}/accounts`, `SaveAccount`, `SaveAccountType`](https://api.ynab.com/papi/open_api_spec.yaml); [changelog v1.80.0](https://api.ynab.com/#v1.80.0) |
| Tracking account | Probably, via `otherAsset`/`otherLiability`, but whether those come out `on_budget: false` is undocumented | No | No | If the check fails, create it in the app | [OpenAPI: `SaveAccount` (no `on_budget`), `AccountBase.on_budget`](https://api.ynab.com/papi/open_api_spec.yaml); [changelog v1.82.0](https://api.ynab.com/#v1.82.0) |
| Loan/debt account (mortgage, autoLoan, ...) | No (not in `SaveAccountType`) | No | No | Create in the app if needed | [OpenAPI: `SaveAccountType` vs `AccountType`](https://api.ynab.com/papi/open_api_spec.yaml) |
| Closed account | No | No (no close field or route) | No | Close an account in the app | [OpenAPI: `AccountBase.closed` is response-only](https://api.ynab.com/papi/open_api_spec.yaml) |
| Category group | Yes (name, max 50 chars) | Rename only | No | Hide one group and delete one in the app | [OpenAPI: `SaveCategoryGroup`, `CategoryGroup.hidden`/`deleted`](https://api.ynab.com/papi/open_api_spec.yaml); [changelog v1.78.0](https://api.ynab.com/#v1.78.0) |
| Category | Yes (name, group, note, goal) | Name, note, group, goal; month `budgeted` | No | Hide one category and delete one in the app | [OpenAPI: `NewCategory`, `SaveCategory`, `SaveMonthCategory`, `CategoryBase.hidden`/`deleted`](https://api.ynab.com/papi/open_api_spec.yaml) |
| Payee | Yes (`POST /payees`, or implicitly through `payee_name` on a transaction) | Rename only | No | Delete in the app if a deleted payee is needed | [OpenAPI: `PostPayee`, `SavePayee`, `SaveTransactionWithOptionalFields.payee_name`](https://api.ynab.com/papi/open_api_spec.yaml); [changelog v1.81.0](https://api.ynab.com/#v1.81.0) |
| Transfer payee | Comes with each account automatically | No | No | None | [OpenAPI: `AccountBase.transfer_payee_id`, `Payee.transfer_account_id`](https://api.ynab.com/papi/open_api_spec.yaml) |
| Plain transaction | Yes, one at a time or as a `transactions` array | Yes (PUT one, PATCH many, by `id` or `import_id`) | Yes, one request each | None | [OpenAPI: `POST`/`PATCH /plans/{plan_id}/transactions`, `PUT`/`DELETE .../{transaction_id}`](https://api.ynab.com/papi/open_api_spec.yaml) |
| Split with per-line memos | Yes (`category_id: null` plus `subtransactions[]`, each with a `memo`) | Parent fields only: the lines, the split amount and the date are fixed | Yes (the whole transaction) | None | [OpenAPI: `SaveTransactionWithOptionalFields.subtransactions`/`amount`/`date`, `SaveSubTransaction.memo`](https://api.ynab.com/papi/open_api_spec.yaml); [constraints note](ynab-api-constraints.md#read-update-and-bulk-write-operations) |
| Transfer between on-budget accounts | Yes (`payee_id` = the target account's `transfer_payee_id`) | Yes | Yes. Whether deleting one side deletes the other is undocumented | None | [OpenAPI: `SaveTransactionWithOptionalFields.payee_id`](https://api.ynab.com/papi/open_api_spec.yaml) |
| Transfer to or from a tracking account | Implied: the spec says "a transfer to a tracking account can be a split". Transfers *from* tracking are not stated | Yes | Yes | None | [OpenAPI: `SaveTransactionWithOptionalFields.subtransactions`](https://api.ynab.com/papi/open_api_spec.yaml) |
| Split on a transfer | Only to a tracking account. Not allowed between on-budget accounts, or on a tracking account's own transactions | Lines cannot change | Yes | None | [OpenAPI: `SaveTransactionWithOptionalFields.subtransactions`](https://api.ynab.com/papi/open_api_spec.yaml) |
| Unapproved | Yes: send `approved: false`, or omit it (defaults to unapproved) | Yes | — | None | [OpenAPI: `SaveTransactionWithOptionalFields.approved`](https://api.ynab.com/papi/open_api_spec.yaml) |
| Flagged | Yes (`flag_color`: red, orange, yellow, green, blue or purple) | Yes | — | Flag *names* can only be set in the app (`flag_name` is response-only) | [OpenAPI: `TransactionFlagColor`, `TransactionSummaryBase.flag_name`](https://api.ynab.com/papi/open_api_spec.yaml) |
| Uncleared / cleared | Yes (`cleared`) | Yes | — | None | [OpenAPI: `TransactionClearedStatus`](https://api.ynab.com/papi/open_api_spec.yaml) |
| Reconciled | The status, yes (`cleared: reconciled`). Whether it moves `last_reconciled_at` or locks the transaction is undocumented | Yes | — | A real reconciliation (with an adjustment) is done in the app | [OpenAPI: `TransactionClearedStatus`, `AccountBase.last_reconciled_at`](https://api.ynab.com/papi/open_api_spec.yaml) |
| Deleted transaction | Create it, then `DELETE` it | — | Yes. It then appears only in delta reads | None | [OpenAPI: `TransactionSummaryBase.deleted`](https://api.ynab.com/papi/open_api_spec.yaml) |
| Date more than a year old | Yes as far as documented: only *future* dates are rejected. Reads must pass `since_date` | Yes, except on splits | — | None | [OpenAPI: `SaveTransactionWithOptionalFields.date`, `GET .../transactions` `since_date`](https://api.ynab.com/papi/open_api_spec.yaml) |
| Date before the plan's `first_month` | Undocumented. `first_month` is read-only, and there is no stated lower bound on `date` | — | — | If the check fails, make the plan's first month early enough in the app | [OpenAPI: `PlanSummary.first_month`](https://api.ynab.com/papi/open_api_spec.yaml) |
| Scheduled transaction | Yes, up to 5 years ahead (out of Ynot's scope) | Yes | Yes | None | [OpenAPI: `SaveScheduledTransaction.date`, scheduled-transaction paths](https://api.ynab.com/papi/open_api_spec.yaml) |

Other limits a seed must respect:

- A transaction's `category_id` cannot be a Credit Card Payment category. One is ignored if sent.
- `payee_name` resolves to an existing payee with the same name before it creates a new one, so a seed can name payees without creating them first.

[OpenAPI: `SaveTransactionWithOptionalFields.category_id`/`payee_name`](https://api.ynab.com/papi/open_api_spec.yaml)

## Idempotency

**Transactions.** On a new transaction, `import_id` is an optional string of up to 36 characters. It is unique per account. Two documented behaviours make a seed safe to re-run:

- A single-transaction `POST` whose `import_id` already exists on that account returns **409**.
- A `transactions: [...]` `POST` creates the new ones and lists the skipped ones in `duplicate_import_ids` in its 201 response.

So a seed that gives every fixture a stable `import_id` such as `ynot-seed:v1:0001` can re-send the same batch, and it changes nothing that already exists. Don't use the `YNAB:[amount]:[date]:[n]` format: YNAB uses it for file-based and Direct Import, and sharing it invites collisions with those. A `PATCH` can also find a fixture by `import_id` instead of `id`, so the seed never needs to store the YNAB-assigned `id`s, which fits Ynot's no-persistence rule. `import_id` itself cannot be changed after creation. [OpenAPI: `NewTransaction.import_id`, `POST /plans/{plan_id}/transactions` 409, `SaveTransactionsResponse.duplicate_import_ids`, `SaveTransactionWithIdOrImportId`](https://api.ynab.com/papi/open_api_spec.yaml)

**The ±10-day match.** A new transaction that has an `import_id` is "imported". YNAB then tries to match it to an existing **user-entered** transaction on the same account, with the same amount, dated within 10 days either way. A transaction without an `import_id` is user-entered, and later imports can match it. [OpenAPI: `NewTransaction.import_id`](https://api.ynab.com/papi/open_api_spec.yaml)

This does risk merging seeded transactions. A seed that mixes user-entered and imported fixtures on one account could have an imported fixture matched to a user-entered one if they share an amount within that window. It also risks the test plan: a real file import or Direct Import into a seed account could match seeded user-entered fixtures. The docs only describe matching against user-entered transactions. To keep fixtures distinct:

1. Give every seeded transaction an `import_id`. Then none of them is user-entered, so none can be matched.
2. If a test needs a user-entered transaction, give it an amount that no other transaction on that account uses within ±10 days.
3. Never link seed accounts to a bank.
4. After seeding, check that every fixture has `matched_transaction_id: null`.

[OpenAPI: `TransactionSummaryBase.matched_transaction_id`](https://api.ynab.com/papi/open_api_spec.yaml)

Whether matching is also skipped between two imported transactions is not stated. Contract check C6 below settles it.

**Everything else** has no idempotency key. Accounts, category groups and categories have no `import_id`, and no name uniqueness is documented. The seed must read first (`GET /plans/{plan_id}` returns everything in one request) and create only names that are missing. Payees can be left to `payee_name` resolution. [OpenAPI: `PlanDetail`, `SaveAccount`, `SaveCategoryGroup`, `NewCategory`](https://api.ynab.com/papi/open_api_spec.yaml)

## Reset cost

There is no plan delete. There is also no account, category, category group or payee delete. A reset can therefore only remove transactions. [OpenAPI: all paths](https://api.ynab.com/papi/open_api_spec.yaml)

- **Full reset by deletion:** N transactions cost N `DELETE` requests, plus one read to list them. Nothing deletes in bulk, and `SaveTransactionWithOptionalFields` has no `deleted` field, so `PATCH` cannot delete either. With 200 requests per hour, about 190 transactions is the most one token can delete in an hour, and only if nothing else uses that token. [OpenAPI: `DELETE /plans/{plan_id}/transactions/{transaction_id}`, `SaveTransactionWithOptionalFields`](https://api.ynab.com/papi/open_api_spec.yaml); [rate limiting](https://api.ynab.com/#rate-limiting)
- **Reset in place (recommended):** a single `PATCH /plans/{plan_id}/transactions` can find each fixture by `import_id` and set its memo, flag, cleared, approved, payee and category back to the seeded values. The array has no documented size limit, so that is one request per chunk. Three limits apply:
  - Every item must resend `approved`, or the transaction becomes unapproved ([ADR 0007](../adr/0007-stop-verify-report-writes.md)).
  - A split's line memos, amount and date cannot be restored. Ynot only writes parent memos ([ADR 0001](../adr/0001-parent-only-tagging.md)), so its tests should not alter those.
  - A deleted fixture cannot be undeleted, only created again.

  [OpenAPI: `PATCH /plans/{plan_id}/transactions`, `SaveTransactionWithOptionalFields`](https://api.ynab.com/papi/open_api_spec.yaml)
- **Manual fixtures survive a reset.** The closed account, the hidden and deleted categories and groups, and flag names stay as they are, because the API can't change them. The seed should still read and confirm them before each run. Hidden is visible in `GET /categories`; deleted only in a delta read (`last_knowledge_of_server`). [OpenAPI: `CategoryGroup.deleted`, `CategoryBase.deleted`](https://api.ynab.com/papi/open_api_spec.yaml)

## Request budget

Each token gets 200 requests per hour in a rolling window. Going over returns 429 ([rate limiting](https://api.ynab.com/#rate-limiting)). The Ynot app under test uses the same token if it uses the same PAT, so the seed and the tests share one budget.

| Step | Requests (first run) | Requests (re-run) |
| --- | --- | --- |
| `GET /plans` (find the test plan, read `first_month`) | 1 | 1 |
| `GET /plans/{plan_id}` (all accounts, groups, categories and payees, plus `server_knowledge`) | 1 | 1 |
| Create missing accounts (e.g. 4: checking, savings, credit card, other asset) | 4 | 0 |
| Create missing category groups and categories (e.g. 2 + 8) | 10 | 0 |
| Payees | 0 (via `payee_name`) | 0 |
| `POST transactions: [...]` (all fixtures, chunked) | 1 to 3 | 1 to 3 (all reported as duplicates) |
| `DELETE` the deleted-transaction fixtures (e.g. 2) | 2 | 0 to 2 (see C5) |
| Verify: `GET .../transactions?since_date=<first_month>` plus one delta read for deleted fixtures | 2 | 2 |
| **Total** | **about 21 to 23** | **about 5 to 9** |

A reset in place adds one `PATCH` per chunk. A seed like this fits comfortably within an hour's 200 requests, and so do several re-runs. Bulk `POST` and `PATCH` are the only steps whose cost does not grow with the number of fixtures. Per-item creates of accounts and categories happen once, and per-item deletes are the only step that can use up the budget.

The size of a `transactions` array is **undocumented**: `PostTransactionsWrapper.transactions` sets no `maxItems`. The docs do warn of a 503 when a request runs longer than 30 seconds, and of `403 data_limit_reached` for anti-abuse limits that are not published. Start with modest chunks (for example 50 to 100) and treat a 503 or 403.4 as a signal to make them smaller. [OpenAPI: `PostTransactionsWrapper`](https://api.ynab.com/papi/open_api_spec.yaml); [errors](https://api.ynab.com/#errors); [constraints note](ynab-api-constraints.md#rate-and-failure-constraints)

## Open questions for contract checks

Each check is one or two requests against the test plan, run once and recorded here.

- **C1. Starting-balance transaction.** `SaveAccount.balance` is described only as "the current balance of the account". Whether a non-zero balance creates a "Starting Balance" transaction, and with what payee, category, cleared and approved values, is undocumented. Check: create an account with `balance: 100000`, then `GET /plans/{plan_id}/accounts/{account_id}/transactions`. Until that's known, create accounts with `balance: 0` so that they carry no transaction the seed didn't create.
- **C2. Tracking accounts from the API.** It is undocumented whether `otherAsset` and `otherLiability` accounts are created with `on_budget: false`. Check: create one of each and read `on_budget`.
- **C3. Dates before `first_month`.** Check: `POST` a transaction dated a month before `first_month`, then expect either a 400 or a 201. On a 201, re-read the plan to see whether `first_month` moved earlier. Also check a date several years old.
- **C4. Transfers.** Four things are undocumented:
  - whether a transfer *from* a tracking account to an on-budget account is accepted
  - whether a subtransaction can use a transfer payee (`SubTransactionBase.transfer_account_id` suggests it can)
  - whether `import_id` and `memo` copy to the other side of the transfer
  - whether deleting one side deletes the other

  Check: create each kind, read both sides, delete one side, then do a delta read.
- **C5. `import_id` after deletion.** Check: delete a fixture that has an `import_id`, then `POST` the same `import_id` again. A 201 means the deleted-fixture step costs a `DELETE` on every run. A `duplicate_import_ids` entry means the deleted fixture stays deleted, and re-runs cost nothing for it.
- **C6. Matching between imported transactions.** Check: `POST` two transactions with different `import_id`s, the same amount and account, and dates 3 days apart. Then read `matched_transaction_id` on both.
- **C7. Reconciled status.** Check: `POST` a transaction with `cleared: reconciled`, then read the account's `last_reconciled_at`, and try a `PUT` that changes its amount.
- **C8. Bulk size.** Check: `POST` batches of increasing size (100, 250, 500) to a throwaway account, and record the first 400, 403.4 or 503. Clearing up afterwards costs one `DELETE` per transaction, so budget the requests before running it.
- **C9. Duplicate names.** Check: `POST` a category, a category group and a payee whose names already exist. This shows whether the API rejects them, returns the existing one, or creates a duplicate.

The schema also defines `BulkResponse` and `BulkTransactions`, but no path uses them. They are leftovers of the old `/transactions/bulk` route and should not be relied on. [OpenAPI: `BulkResponse`, `BulkTransactions`](https://api.ynab.com/papi/open_api_spec.yaml)

## Primary sources

- [YNAB API documentation: errors, rate limiting, changelog](https://api.ynab.com/)
- [YNAB API v1.87.0 OpenAPI document](https://api.ynab.com/papi/open_api_spec.yaml) (repo copy: [`openapi/ynab-1.87.0.yaml`](../../openapi/ynab-1.87.0.yaml))
- [Official YNAB JavaScript SDK README](https://github.com/ynab/ynab-sdk-js/blob/main/README.md)
