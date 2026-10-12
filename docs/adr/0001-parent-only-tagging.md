# Limit first-version tags to transactions

YNAB remains Ynot's sole datastore, but its supported public API cannot update the subtransactions of an existing split. The first version therefore associates tags only with whole transactions rather than encoding split associations as hidden metadata in the parent's 500-character memo or introducing another datastore.

## Consequences

- A tag on a transaction containing splits describes the whole parent transaction, and its total includes the parent's full signed amount.
- Splits may be shown as context, but users cannot apply, remove, rename, or delete tags at split level.
- Split-level tagging can be reconsidered if YNAB exposes a supported update operation or Ynot deliberately changes its persistence boundary.

## Amendment, 2026-10-11

Writing stays parent-only, but a tag on a split line no longer stands for the whole parent amount. A split memo tag now contributes **only that split line's amount**. The motivating case is a group restaurant bill: the owner's share goes to its category, each person who owes money gets a split line tagged `#owed-<name>`, and each person's tag has to total their share, not the whole bill. The first consequence above is replaced by: *a tag in the parent memo describes the whole transaction and contributes the full parent amount; a tag only in split memos contributes the amounts of those split lines.* ADR 0005 defines the arithmetic. Tags on split lines are still typed in YNAB, because the API cannot update an existing split. Writing a *new* split with tagged lines may be possible and is deferred (`docs/problem-statement.md`).
