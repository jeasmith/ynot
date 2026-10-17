# PROTOTYPE: one scenario, two backends

Throwaway. Wayfinder ticket [Can one fixture definition seed both the fake and a real test budget?](https://github.com/jeasmith/ynot/issues/33), on the map [Testing infrastructure for the YNAB API](https://github.com/jeasmith/ynot/issues/29). Nothing in the test suites imports it.

```sh
pnpm prototype:scenario
```

## The question

Can a test scenario written once as data (accounts, categories, transactions with splits, transfers and tagged memos, plus the tag nets it should produce) drive both `createFakeYnab` and a seeding script for a real YNAB test budget? What does a seed cost in requests against the 200-per-hour limit, what needs a person in the YNAB app, and does a deterministic `import_id` make reseeding a no-op?

## What it shows

- `scenario.ts` is the portable part: a `Scenario` type, `toFakePlan` (scenario → fake seed data, including the transfer side YNAB would create), `planSeed` (scenario + what the budget already holds → the request list, manual steps, rule breaks and undocumented behaviour) and `householdScenario`, the e2e fixture budget restated with switchable features.
- `tui.ts` toggles the features and re-renders: the seed plan for a real budget, its request count, and a check that the same scenario loaded into the fake through the app's real `loadBudget` and `buildTagIndex` meets its declared tag nets.

## Early observations

- Dates are relative (`daysAgo`): YNAB refuses future dates, and "older than a year" moves with the run date.
- The household scenario seeds in about 13 requests; 2,000 extra transactions add one request per batch. A reseed finds everything by `import_id` and costs only the 4 reads.
- Three things need the YNAB app: closing an account, hiding a category, and creating the plan.
- A transfer's other side is created by YNAB with an id no response returns, so a memo on it costs a read and a PATCH.
