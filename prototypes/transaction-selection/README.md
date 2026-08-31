# Transaction selection prototype

> THROWAWAY PROTOTYPE — this branch answers issue #4 and is not production code.

Three structurally different parent-only bulk-tagging interactions live on one route:

- `?variant=A` — dense transaction register with a sticky action dock
- `?variant=B` — candidate list with a separate selection cart
- `?variant=C` — guided Find → Review → Apply flow

Run from the repository root:

```sh
python3 -m http.server 4173 -d prototypes/transaction-selection
```

Then open <http://localhost:4173/?variant=A>. Use the floating arrows or the keyboard left/right arrows to switch variants. The prototype uses in-memory sample data only; refresh resets it.
