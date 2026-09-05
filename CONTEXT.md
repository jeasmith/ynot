# Ynot

Ynot adds consistent organization across financial transactions without replacing the budgeting concepts owned by YNAB.

## Language

**Tag**:
A reusable, user-defined label associated with any number of transactions independently of their spending categories. A transaction may have zero or more tags.

**Transaction**:
A financial record originating in YNAB. A transaction may be unsplit or composed of multiple splits; its tags apply to the transaction as a whole.

**Split**:
A categorized portion of a transaction. A split provides transaction context but is not independently taggable.

**Active Account**:
The single YNAB account whose register is currently open. Exactly one account is active at a time, and it bounds which transactions the register browses and searches. It does not bound tags: a tag spans accounts, so tag membership and Tag Totals stay budget-wide.

**Register**:
The complete, uncut sequence of transactions belonging to the active account. Filters narrow what the register displays but never change which transactions it contains.

**Tag Vocabulary**:
The distinct tags currently present in a single YNAB budget. A tag leaves the vocabulary when its final association is removed.

**Tag Total**:
The signed total of the transaction amounts associated with a tag.
