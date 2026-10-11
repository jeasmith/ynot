# Scope transaction discovery to one active account's complete register

Ynot's finder needs a history boundary: the register cannot render a whole budget's transactions at once, so something must bound what is loaded and searched. Three boundaries were prototyped against issue #4 — a rolling recent date window, one account's complete register, and the entire budget history behind a virtual scroller.

The active-account register is the chosen boundary. One account owns the context, and its register is complete: search and facets narrow within it rather than changing what is included. A rolling date window silently hides older transactions at exactly the moment a user is trying to organize history, and a whole-budget virtual scroller makes position and completeness hard to reason about without solving a harder problem than the first version needs.

## Consequences

- The account rail is exclusive navigation. Exactly one account is active at a time; it is not a composable multi-account filter.
- The register for the active account has no date cutoff. A year control moves position within that register but never removes transactions from its scope.
- Search, category, status, and tag facets narrow within the active account. They do not cross accounts.
- Tag membership and Tag Totals remain budget-wide. A tag spans accounts, so the tag inspector must report across the whole budget and state plainly that it is not scoped to the active account. This tension is inherent to the choice and must stay visible in the interface rather than being resolved by quietly scoping tags to the account.
- Cross-account discovery is reachable through a tag, but not through a register view. Finding untagged transactions across accounts requires visiting each account in turn. Reconsider this boundary if that traversal becomes the common case.

## Amendment, 2026-10-11

The traversal named in the last consequence turned out to be the common case. A trip or a project usually spans a current account, a credit card and cash, so finding and tagging it one account at a time repeats the same search for every account. The account rail therefore gains an **All accounts** entry. It is still exclusive navigation, one scope at a time, and a single account stays the default, so the focused, complete per-account register this ADR chose is unchanged. All accounts is the same complete, uncut register across the whole budget. Search, facets and Select all work in whichever scope is chosen, and in All accounts each row shows its account. The year control is removed, because search and scrolling cover moving through history. Untagged transactions can now be found across accounts through the register as well as through a tag.
