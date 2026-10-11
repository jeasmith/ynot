# Ynot

Ynot adds consistent organization across financial transactions without replacing the budgeting concepts owned by YNAB.

## Language

**Tag**:
A reusable, user-defined label associated with any number of transactions independently of their spending categories. A transaction may have zero or more tags.

**Transaction**:
A financial record originating in YNAB. A transaction may be unsplit or composed of multiple splits; its tags apply to the transaction as a whole.

**Split**:
A categorized portion of a transaction. Ynot cannot select a split or write its memo. A tag written into a split's memo associates the parent transaction, and only that split line's amount counts towards the tag's total. Because Ynot cannot write the memo, the association is read-only.

**Active Account**:
The single YNAB account whose register is open, when the user has picked one account rather than All accounts. It bounds what the register browses and searches. It does not bound tags: a tag spans accounts, so tag membership and Tag Totals stay budget-wide.

**All accounts**:
The register scope covering every account in the budget at once. It sits beside the individual accounts in the account navigation. A single account is the default scope.

**Register**:
The complete, uncut sequence of transactions in the current scope, either the active account or All accounts. Filters narrow what the register displays but never change which transactions it contains.

**Tag Vocabulary**:
The distinct tags currently present in a single YNAB budget. A tag leaves the vocabulary when its final association is removed.

**Canonical Spelling**:
The spelling of a tag that Ynot displays: the spelling carried by the most transactions, with ties broken toward the earliest transaction and then by code point. It is derived from the transactions rather than stored, and governs display only; membership and Tag Totals use the tag's identity: its text normalized to NFC and lowercased.

**Vocabulary Warning**:
An advisory signal that the Tag Vocabulary holds more distinct tags than intended. The main signal is a near-duplicate pair, two spellings of one idea that differ only by `-` or `_`; a weaker one is a tag used only once. A warning describes a suspicion and offers a fix; it never changes a tag on its own.

**Tag Association**:
The relationship that makes a transaction one of a tag's members, present when the tag's identity appears in the transaction's own memo or in any of its split memos. It is a set: repeated occurrences across a transaction form one association contributing once.

**Contribution**:
The amount one associated transaction adds to a tag's total. If the tag is in the transaction's own memo, the contribution is the full parent amount. If the tag appears only in split memos, the contribution is the sum of the amounts of the split lines carrying the tag. For example, in a split restaurant bill, the line tagged `#owed-alice` contributes only Alice's share.

**Tag Total**:
The net signed total of the contributions of the transactions associated with a tag, across every account in the budget and its whole history. It is always displayed with its outflow subtotal, inflow subtotal, and member count, and no filter narrows it.

**Tag Overview**:
A table of every tag in the Tag Vocabulary with its Tag Total, outflow subtotal, inflow subtotal, and member count.
