# Tag browsing prototype

> THROWAWAY PROTOTYPE — this branch answers issue #7 and is not production code.

Three structurally different answers to "how do you browse the tag vocabulary and manage it globally":

- `?variant=A` — **Vocabulary ledger.** One dense sortable table of every tag; rename and delete are row actions; clicking a row expands its totals and transactions inline.
- `?variant=B` — **Tag reader.** A persistent tag rail beside one open tag at a time, with a management strip in the tag's header. The register's account rail, applied to tags.
- `?variant=C` — **Vocabulary console.** No list. A command bar (`rename #Old #New`, `merge #Old #Keep`, `delete #Tag`), a vocabulary-health feed of detected problems, and a staged change plan applied as one reviewed batch.

They disagree about the primary affordance — a table, a rail, or a command line — and about whether management is per-tag or batched. That is the choice to make.

## What all three hold constant

- **Tags live in parent memos as hashtags**, so a global rename or delete is a memo rewrite. Every impact preview shows the literal before/after of each memo, because "will this eat my memo text?" is the question the real thing has to answer.
- **Signed totals** — inflow, outflow, and net — computed from full signed parent amounts, per [ADR 0001](../../docs/adr/0001-parent-only-tagging.md).
- **Splits render as read-only context** under their parent and are never independently selectable.
- **Tag identity is case-insensitive with a canonical display spelling.** `#Household` and `#household` are one tag with one total; the vocabulary picks the most-used spelling to display.
- **The budget-wide/account-scoped tension from [ADR 0002](../../docs/adr/0002-active-account-register-scope.md) is stated, not hidden.** A banner says tags span the whole budget, and every impact preview counts how many affected transactions sit outside the active register.
- Simulated write progress and session-only undo. Nothing contacts YNAB.

## Running it

From the repository root:

```sh
python3 -m http.server 4174 -d prototypes/tag-browsing
```

Then open <http://localhost:4174/?variant=A>. Use the floating arrows or the keyboard left/right arrows to switch variants. Sample data is in memory only; refresh resets it.

The sample vocabulary deliberately contains the messes worth designing for: a case collision (`#Household` / `#household`), a near-duplicate pair (`#Home-Repair` / `#HomeRepair`), several single-use tags, tags spanning two accounts, and a tag whose net total is positive (`#Tax`).

Palette, Geist typography, and the restrained glass treatment follow the [transaction selection prototype](https://github.com/jeasmith/ynot/tree/prototype/transaction-selection/prototypes/transaction-selection) so the two can be judged side by side. Geist Sans and Geist Mono are self-hosted from the official `geist@1.7.0` package; its OFL license is included under `assets/`.

## Open questions for the review

1. **Which primary affordance?** A table reads the whole vocabulary at once; a rail reads one tag deeply; a console leads with problems rather than with the list.
2. **Should management be per-tag or staged into a batch?** C's change plan gives one combined impact preview across several operations; A and B confirm each operation on its own.
3. **Is "used once" a problem worth flagging?** In the sample data it dominates the health feed. It may be pure noise, or the main way typos surface.
4. **Should a rename onto an existing tag silently become a merge** (as it does here, with a warning), or should it be refused and forced through an explicit merge?
5. **How loud should the budget-wide warning be?** It is currently a persistent banner plus a per-preview count of transactions outside the active register.
