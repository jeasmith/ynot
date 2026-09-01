# Transaction selection prototype

> THROWAWAY PROTOTYPE — this branch answers issue #4 and is not production code.

Round two keeps the preferred **Find → Review → Apply** journey and compares three denser ways to find parent transactions:

- `?variant=A` — YNAB-like account rail with a compact transaction register
- `?variant=B` — search-first faceted workbench with a persistent batch tray
- `?variant=C` — compact register with a detail-on-demand transaction inspector

All variants expose account, category group, category, non-tag memo text, clickable tags, reconciliation status, and signed parent amount. The green palette changes subtly by variant. Geist Sans and Geist Mono are self-hosted from the official `geist@1.7.0` package; its OFL license is included under `assets/`.

Run from the repository root:

```sh
python3 -m http.server 4173 -d prototypes/transaction-selection
```

Then open <http://localhost:4173/?variant=A>. Use the floating arrows or the keyboard left/right arrows to switch variants. The prototype uses in-memory sample data only; refresh resets it.
