# Transaction selection prototype

> THROWAWAY PROTOTYPE — this branch answers issue #4 and is not production code.

Round three keeps the preferred **Find → Review → Apply** journey and compares three history boundaries for a dense transaction finder:

- `?variant=A` — a rolling 90-day register, with an explicit expansion to all history
- `?variant=B` — the complete register for one selected active account
- `?variant=C` — the entire budget history, with a virtual year navigator

The variants deliberately hold the rest of the design constant so the history boundary can be judged cleanly. All three include:

- a floating single-account facet rail with dynamic `matching of total` counts
- multi-tag queries with an AND/OR control
- non-tag memo text and clickable memo tags
- YNAB-style uncleared, cleared, and reconciled indicators
- a detailed parent inspector, including read-only split lines and their categories
- a tag inspector with inflow, outflow, net, average spend, clearance, and reimbursement state
- the same green palette, Geist typography, and a restrained Liquid Glass-inspired functional layer

The glass treatment follows the findings in [the Apple Liquid Glass web research note](../../docs/research/apple-liquid-glass-web.md): navigation and controls may float above the content, while transaction data and financial figures remain on stable, opaque surfaces. It also includes explicit reduced-transparency and reduced-motion fallbacks. This is a browser translation of Apple's hierarchy and material principles, not a claim of native Liquid Glass conformance.

Geist Sans and Geist Mono are self-hosted from the official `geist@1.7.0` package; its OFL license is included under `assets/`.

Run from the repository root:

```sh
python3 -m http.server 4173 -d prototypes/transaction-selection
```

Then open <http://localhost:4173/?variant=A>. Use the floating arrows or the keyboard left/right arrows to switch variants. The prototype uses in-memory sample data only; refresh resets it.
