# Limit first-version tags to transactions

YNAB remains Ynot's sole datastore, but its supported public API cannot update the subtransactions of an existing split. The first version therefore associates tags only with whole transactions rather than encoding split associations as hidden metadata in the parent's 500-character memo or introducing another datastore.

## Consequences

- A tag on a transaction containing splits describes the whole parent transaction, and its total includes the parent's full signed amount.
- Splits may be shown as context, but users cannot apply, remove, rename, or delete tags at split level.
- Split-level tagging can be reconsidered if YNAB exposes a supported update operation or Ynot deliberately changes its persistence boundary.
