# Browse the tag vocabulary in a tag reader that warns about duplicate spellings

The tag vocabulary needs a home: somewhere to see every tag a budget contains, read one tag's transactions and signed totals, and run the global renames, merges, and deletes that are memo rewrites underneath. Three structurally different answers were prototyped against issue #7 — a dense sortable ledger of every tag, a persistent tag rail beside one open tag, and a command console leading with detected problems instead of with a list.

The tag reader is the chosen shape. Its rail mirrors the account rail the register already uses, so one navigation idea carries from browsing transactions to browsing tags, and it reads a single tag deeply — totals, matching parents, splits as context — which is most of what a tag is for. The ledger shows the whole vocabulary at once but never reads one tag well.

The console is not adopted, but its insight is. The vocabulary's real failure is not that it is hard to list; it is that it fragments. `#Household` and `#household` are one tag written twice, `#Home-Repair` and `#HomeRepair` are one idea spelled two ways, and nothing in a plain list makes either visible. Detecting that belongs in the first version; a command line to act on it does not.

## Consequences

- The tag rail is exclusive navigation, like the account rail. One tag is open at a time, and its header carries the management strip: rename globally, merge into another tag, delete.
- Vocabulary warnings appear in two places at once — a marker on each affected rail entry, and a collapsible "needs attention" group pinned to the top of the rail. Scanning the rail surfaces a problem in passing; the pinned group turns the whole set of them into a worklist.
- Warnings are ranked, not flat. Two spellings of one tag, whether a case collision or a near-duplicate, is the first-class signal, because that is what silently inflates the vocabulary. A tag used only once sits in a separate lower-priority section beneath them: it is a weak hint at a typo and must never crowd out a real duplicate.
- A warning is advisory. It names the conflict and offers the fix; nothing is renamed, merged, or deleted without an explicit action and its impact preview.
- Management is confirmed one operation at a time. The console's staged change plan — several operations applied under a single combined preview — is not adopted for the first version.
- A rename onto a tag that already exists becomes a merge, and says so. Refusing it and forcing an explicit merge is a defensible alternative, deferred until the first version is in use.
- Removing a hashtag from a memo closes the gap it leaves and changes nothing else. The prototype's first attempt at tidying also ate the space before a human `·` separator, turning "Weekly shop · Clubcard voucher used" into "Weekly shop· Clubcard voucher used". Silently rewriting a user's own prose is the worst outcome this feature can produce, so the rewrite stays deliberately conservative and every preview shows the literal before and after of each memo.
- Warnings are computed over the whole budget, not the active account, because the vocabulary is budget-wide (ADR 0002). Every impact preview continues to count how many affected transactions sit outside the active account.
