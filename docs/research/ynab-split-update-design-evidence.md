# Is the YNAB split-update limitation intentional?

Checked 2026-08-31 against YNAB's live API documentation and OpenAPI document, official SDKs and their Git history, and maintainer responses in the official JavaScript SDK repository. No access token or live account was used.

## Conclusion

**Yes, with high confidence: refusing updates to the subtransactions of an existing split is an intentional boundary of YNAB's supported public API, not merely an omission or a likely schema misreading.**

The strongest direct evidence is the live v1.86.0 OpenAPI contract. The `subtransactions` write property says that updating it on an existing split transaction is unsupported **and will return an error**. The public contract provides update operations only for parent transactions, not subtransactions, and the subtransaction write model has no `id` field with which to address an existing split. [Live YNAB OpenAPI document](https://api.ynab.com/papi/open_api_spec.yaml)

The historical evidence makes accidental wording unlikely. YNAB added split creation to its official SDK specification on 2020-03-11 and added the restriction in the same change: the new property was expressly for configuring a transaction as a split, while updating an existing split's `subtransactions` was declared unsupported. [Official SDK commit adding split support](https://github.com/ynab/ynab-sdk-js/commit/258b333f4563149b9aef7000809ee3be8e183fec) [Specification at that commit](https://github.com/ynab/ynab-sdk-js/blob/258b333f4563149b9aef7000809ee3be8e183fec/spec-v1-swagger.json#L2225-L2262)

This establishes a deliberate **public API policy**, not its internal rationale or permanence. YNAB's own product guide instructs users how to change the payee, category, or memo of an individual existing split in its apps. The limitation is therefore not evidence that YNAB's underlying system is incapable of the operation; the capability is withheld specifically from the supported public API. YNAB does not publicly explain why that boundary exists or promise that it will never change. [YNAB support: Edit Individual Splits](https://support.ynab.com/en_us/split-transactions-a-guide-SJLEKwY0q#edit-individual-splits)

## Direct evidence in the current contract

### Parent update operations do not make existing splits writable

The current public surface has two ordinary transaction update routes:

- `PUT /plans/{plan_id}/transactions/{transaction_id}` updates one parent transaction through `PutTransactionWrapper` and `ExistingTransaction`.
- `PATCH /plans/{plan_id}/transactions` updates multiple parent transactions through `PatchTransactionsWrapper`, identifying each by a parent `id` or `import_id`.

Both eventually use `SaveTransactionWithOptionalFields`. That shared schema contains `subtransactions`, but its description resolves the context-dependent meaning: the array can configure a transaction as a split, while updating it on a transaction that is **already split** is unsupported. The live specification now adds that such an attempt will return an error. [Live YNAB OpenAPI document: transaction paths and write schemas](https://api.ynab.com/papi/open_api_spec.yaml) [Official Python SDK's v1.86.0 specification](https://github.com/ynab/ynab-sdk-python/blob/4b3cb845b89a8c671f70cf2153240795ccb58cd7/open_api_spec.yaml#L2763-L2948)

The extra “will return an error” wording is present in the live v1.86.0 document but not yet in the checked-in official SDK snapshot generated from v1.86.0. This is source drift in the clarifying direction: the server-owned current contract is stronger than the generated client documentation, not weaker. [Live YNAB OpenAPI document](https://api.ynab.com/papi/open_api_spec.yaml) [Official Python SDK v1.86.0 generation](https://github.com/ynab/ynab-sdk-python/commit/4b3cb845b89a8c671f70cf2153240795ccb58cd7)

This reuse of one optional-field schema for new and existing transactions can make generated SDK types look more permissive than the operation actually is. The prose attached to the property is therefore part of the contract, not an incidental tutorial warning.

### A returned subtransaction ID is not a write identifier

Read and write models are deliberately asymmetric:

- `SubTransactionBase`, returned by reads, requires both `id` and parent `transaction_id`.
- `SaveSubTransaction`, accepted inside a write, requires `amount` and permits payee, category, and memo fields, but has **no `id` or `transaction_id` property**.

Consequently, placing a returned split ID into the documented write object is outside its schema. There is also no `/subtransactions`, `/subtransactions/{id}`, or nested transaction/subtransaction write path in the public OpenAPI path set. [Official Python SDK v1.86.0: `SaveSubTransaction`](https://github.com/ynab/ynab-sdk-python/blob/4b3cb845b89a8c671f70cf2153240795ccb58cd7/open_api_spec.yaml#L2911-L2948) [Official Python SDK v1.86.0: `SubTransactionBase`](https://github.com/ynab/ynab-sdk-python/blob/4b3cb845b89a8c671f70cf2153240795ccb58cd7/open_api_spec.yaml#L3376-L3415)

### Official maintainer responses confirm the entity boundary

In 2023, a developer tried both alternatives relevant to Ynot: sending a subtransaction ID to the bulk transaction endpoint, which returned `transaction does not exist in this budget`, and nesting a subtransaction under its parent, which failed validation. A YNAB repository member confirmed that subtransactions are logically different API entities and that the API supports `PATCH` on transactions, not subtransactions. [Official SDK issue #149 and maintainer response](https://github.com/ynab/ynab-sdk-js/issues/149#issuecomment-1376186691)

The maintainer directed that developer to submit the missing capability as a feature request, further distinguishing it from a documentation bug or an already-supported route. [Official SDK issue #149: feature-request direction](https://github.com/ynab/ynab-sdk-js/issues/149#issuecomment-1376303125)

In 2024, the same maintainer confirmed that deleting a subtransaction directly is also unsupported; only deleting the parent, which also deletes all its subtransactions, is supported, and again invited a feature request. [Official SDK issue #174 and maintainer response](https://github.com/ynab/ynab-sdk-js/issues/174#issuecomment-2318723986)

These are first-party clarifications of the API model rather than inferred behaviour from a third-party client.

## Historical evidence of deliberate scope

The restriction arrived with the capability itself:

1. Before the official SDK's 2020 split-support regeneration, the save model had no `subtransactions` property.
2. The 2020 change added `SaveSubTransaction`, added `subtransactions` to the transaction save model, described it as a way to configure a transaction as a split, and in that same description excluded updating an existing split.
3. The wording survived later server-spec regenerations and the SDK's 2023 migration from Swagger Codegen to OpenAPI Generator. [2020 split-support commit](https://github.com/ynab/ynab-sdk-js/commit/258b333f4563149b9aef7000809ee3be8e183fec) [2023 generator-migration commit](https://github.com/ynab/ynab-sdk-js/commit/60f6741c99a2e3bd2427ff0bdbd592ca6abbe67e)
4. It remains in the official Python SDK generated from server specification v1.86.0, and the live v1.86.0 document now strengthens it with “will return an error.” [Official Python SDK v1.86.0 generation commit](https://github.com/ynab/ynab-sdk-python/commit/4b3cb845b89a8c671f70cf2153240795ccb58cd7) [Live YNAB OpenAPI document](https://api.ynab.com/papi/open_api_spec.yaml)

Six years of retention across regenerations, model reshaping, and generator replacement is strong evidence of a maintained product boundary.

## Alternative interpretations tested

| Interpretation | Finding | Evidence level |
|---|---|---|
| Send `subtransactions` with `PUT` to the existing parent | The single-update route accepts an `ExistingTransaction`, but the shared property's current contract says an existing split update will error. | Direct contract |
| Send `subtransactions` with bulk `PATCH` | The bulk route reaches the same restricted property; changing the HTTP operation does not expose a split-update operation. | Direct contract |
| Supply every existing split rather than only the changed split | The current contract does not grant full-array replacement: it says updating `subtransactions` on an existing split will error. A historical maintainer comment creates some ambiguity, discussed below, but contains no successful test. | Direct current contract; historical ambiguity |
| Address the split by its returned `id` | IDs exist only in the response model. The request model has no split ID, the transaction endpoint does not resolve one, and a reported attempt returned `transaction does not exist in this budget`. | Direct schema plus first-party confirmation |
| Perform a memo-only parent update | The parent `memo` is independently writable. Omitting `subtransactions` may update the **parent** memo without trying to modify the split collection, but it cannot select or change an individual split memo. This is why parent-memo encoding remains technically possible. | Direct field contract; consequence by inference |
| Treat `SaveSubTransaction.memo` as evidence of editability | That model is usable when supplying splits as part of a supported configuration/create operation. Its presence does not override the explicit existing-split restriction, and its lack of `id` prevents targeting a returned split. | Direct contract |
| Read the v1.18.0 release note's “creating/updating split transactions” as existing-split editing | YNAB's official example first creates an unsplit transaction, then updates that parent with a new subtransaction array to convert it into a split. It never updates a parent that is already split. The release wording describes that conversion, consistently with the restriction introduced in the same release. [Official v1.18.0 release](https://github.com/ynab/ynab-sdk-js/releases/tag/v1.18.0) [Official split conversion example](https://github.com/ynab/ynab-sdk-js/blob/bf72e5809032f680d72b2887b04307acd9097278/examples/split-transaction/index.mts#L14-L45) | Direct example resolving ambiguous release wording |
| Use the old `/budgets/{budget_id}` endpoints | YNAB says these continue as backward-compatible aliases after `/plans/{plan_id}` became primary in v1.79.0. The historical `/budgets` surface had the same parent transaction operations and no subtransaction route; it is not a separate legacy capability. [YNAB API changelog v1.79.0](https://api.ynab.com/#v1.79.0) [2020 public specification](https://github.com/ynab/ynab-sdk-js/blob/258b333f4563149b9aef7000809ee3be8e183fec/spec-v1-swagger.json) | Direct changelog plus historical contract |
| Call an undocumented/internal route used by the YNAB app | No such route is part of the supported public surface. Even if one exists internally, YNAB's terms say the documentation defines permissible API interactions and its application requirements prohibit undocumented APIs without express written permission. [YNAB API Terms: permitted access and limitations](https://api.ynab.com/#terms) [YNAB application requirements](https://api.ynab.com/#oauth-requirements) | Direct policy; existence of internal routes unknown |
| Delete and recreate the parent | The API can delete the parent and thereby its splits, then create a new split transaction. That is replacement, not an update, and the public evidence does not promise preservation of parent/split IDs, import matching, transfer relationships, reconciliation state, or other identity-sensitive behaviour. It is not a safe way to edit a split memo. | Partly direct; preservation behaviour unknown |

Scheduled transactions have separate update schemas and routes. Even if their split templates can be changed, that does not provide a route for editing subtransactions of an already-posted ordinary transaction. [Live YNAB OpenAPI document: scheduled transaction paths](https://api.ynab.com/papi/open_api_spec.yaml)

## Counterevidence and remaining unknowns

The 2023 maintainer reply in issue #149 contains one sentence that can be read as saying an existing split might be replaceable if the caller supplies the complete subtransaction array. That reading conflicts with the explicit specification present both then and now. The issue contains only a failed partial-array request, not a successful complete-array example; the reply begins by saying the API does not support the requested operation and separately confirms there is no individual subtransaction patch. [Official SDK issue #149](https://github.com/ynab/ynab-sdk-js/issues/149)

The most responsible interpretation is therefore:

- the comment is authoritative confirmation that a split cannot be addressed directly;
- its full-array wording is historically ambiguous;
- the current live contract's later, explicit “will return an error” controls what Ynot can claim as supported now.

Only an authenticated integration test could establish the server's exact current response body and status for a fully valid existing-split replacement payload or for a split ID sent to a parent endpoint. Such a test could detect implementation drift, but success would still not make the operation supported while the contract rejects it. Direct confirmation from YNAB could establish the undocumented rationale, whether full-array replacement has ever been intentionally supported, and whether a supported split-update capability is planned. Neither is necessary to decide Ynot's v1 architecture against the present public contract.

## Consequence for Ynot

Ynot treats direct modification of an existing split memo as unavailable and limits the first version to parent transaction tags. It will not encode split-to-tag associations in the parent's memo or change the standing persistence boundary. [ADR: Limit first-version tags to transactions](../adr/0001-parent-only-tagging.md)

A tag on a transaction containing splits therefore applies to the whole parent transaction, and its total uses the parent's full signed amount. Splits may still be displayed as context but are not independently taggable.

## Primary sources

- [YNAB live API documentation, terms, and changelog](https://api.ynab.com/)
- [YNAB live OpenAPI v1.86.0 document](https://api.ynab.com/papi/open_api_spec.yaml)
- [Official YNAB JavaScript SDK](https://github.com/ynab/ynab-sdk-js)
- [Official YNAB Python SDK](https://github.com/ynab/ynab-sdk-python)
- [Official SDK issue #149: PATCH transactions does not work for subtransactions](https://github.com/ynab/ynab-sdk-js/issues/149)
- [Official SDK issue #174: Any way to delete/modify subtransactions?](https://github.com/ynab/ynab-sdk-js/issues/174)
