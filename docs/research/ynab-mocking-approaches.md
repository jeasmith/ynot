# Mocking approaches for Ynot's test layers

Checked 2026-10-17 against msw 3.0.3, @msw/playwright 0.7.0, @msw/source 0.7.0, msw-auto-mock 0.32.1, @stoplight/prism-cli 5.16.0, openapi-backend 5.22.0 and 5.21.2, Ajv 8.20.0, the Playwright docs on `main`, and this repo at `9676896` (`test/fakeYnab.ts`, `e2e/fixtures.ts`, `src/ynab/client.ts`, `openapi/ynab-1.87.0.yaml`). The openapi-backend findings come from a scratch trial that ran its validator on every exchange between `createYnabClient` and `createFakeYnab`. The trial was not committed. Answers [issue #32](https://github.com/jeasmith/ynot/issues/32).

## Answer

**Keep the hand-written fake as the only YNAB backend for every layer that talks to the network. Keep `page.route` as its end-to-end transport. Add OpenAPI validation inside the fake, in Node, with openapi-backend. Do not adopt MSW, Prism or a generated mock server now.**

- **Behaviour.** No candidate replaces the behaviour the fake encodes: per-entity `server_knowledge` stamps, deltas with tombstones, the `approved` default, the 500-code-point memo rule, and faults that commit and then hang. Prism is stateless; "Data Persistence" is still an open item on its roadmap ([Prism README: Roadmap](https://raw.githubusercontent.com/stoplightio/prism/master/README.md)). Generated mocks (openapi-backend's `mockResponseForOperation`, msw-auto-mock, @msw/source) build bodies from examples or from the schema ([openapi-backend README: Mocking](https://raw.githubusercontent.com/openapistack/openapi-backend/main/README.md), [msw-auto-mock README](https://registry.npmjs.org/msw-auto-mock), [@msw/source](https://registry.npmjs.org/@msw/source)). `openapi/ynab-1.87.0.yaml` has no `example:` or `examples:` at all, so their output would be schema-shaped filler, not the fixture budget. MSW is a transport. With MSW you would still write all the state yourself, inside its handlers.
- **Transport.** The fake already plugs into both layers: `fetchImpl` for `vp test` and `routeHandler` for `page.route` (`test/fakeYnab.ts`). The MSW Playwright binding does the same thing: it "rel[ies] on the `page.route()` API" and does not register a worker ([@msw/playwright README](https://raw.githubusercontent.com/mswjs/playwright/main/README.md)). Browser MSW proper does not fit Ynot, for three reasons:
  - It needs worker code and `mockServiceWorker.js` in a client bundle.
  - Its Vite plugin removes both from production builds ([msw `src/vite/plugin.ts`](https://raw.githubusercontent.com/mswjs/msw/main/src/vite/plugin.ts)), and the e2e suite runs the production build under `vp preview`.
  - A service worker makes requests invisible to `page.route`, which `e2e/fixtures.ts` uses to record requests and enforce the boundary ([Playwright: Missing Network Events and Service Workers](https://raw.githubusercontent.com/microsoft/playwright/main/docs/src/network.md)).
- **Contract.** Put one hook in the fake's `run()`, which both transports go through. It validates every request the app sends and every response the fake returns against the YAML. The hook runs in the Node test process: under Vitest, and in the Playwright runner, where `routeHandler` executes. Nothing reaches `dist/`.

The trial found three problems you must handle, or the validator passes everything in silence:

1. **3.1 documents load as nothing by default.** openapi-backend checks the document with an OpenAPI **3.0** meta-schema (`new OpenAPISchemaValidator({ version: 3 })`, [`src/backend.ts`](https://raw.githubusercontent.com/openapistack/openapi-backend/main/src/backend.ts)). On our 3.1.1 YAML that check reports 644 errors, mostly 3.1 `type: [..., "null"]` arrays. In the default non-strict mode it only warns, and the router ends up with **zero operations**: every `matchOperation` returns `undefined`. Pass `quick: true` to skip that check. The README's "OpenAPI 3.1 support" holds for validation once the check is skipped.
2. **One 3.0 leftover in the YAML breaks Ajv.** `PlanSummaryResponse.data.default_plan` is `allOf: [PlanSummary]` plus `nullable: true` with no `type`. Ajv throws `"nullable" cannot be used without "type"` when it compiles any `getPlans` response ([Ajv `dataType.ts`](https://raw.githubusercontent.com/ajv-validator/ajv/master/lib/compile/validate/dataType.ts)). Ajv only supports `nullable` next to `type` ([Ajv: nullable](https://raw.githubusercontent.com/ajv-validator/ajv/master/docs/json-schema.md)). Rewrite `{…, nullable: true}` without `type` to `anyOf: [{…}, {type: 'null'}]` when you load the YAML.
3. **Undocumented statuses are not checked.** If the operation does not document a status, `validateResponse(body, op, status)` returns no errors; the warning is commented out ([`src/validation.ts`](https://raw.githubusercontent.com/openapistack/openapi-backend/main/src/validation.ts)). In the trial, the fake's 429 on `getPlans` and its 404 on `PATCH /transactions` both passed unchecked. The spec documents only 200 and 400 for the PATCH. The hook must validate any undocumented status against `#/components/schemas/ErrorResponse`, and should report statuses outside an allowlist.

With those handled, the trial passed every read and write the client makes, including deltas, the PATCH and a 429. It caught a PATCH body with `memo: 5`. It also caught the fake echoing that memo back in its 200: today's fake accepts a non-string memo. It rejected a memo of 501 code points and accepted one of 500, because Ajv counts surrogate pairs as one character ([Ajv: maxLength](https://raw.githubusercontent.com/ajv-validator/ajv/master/docs/json-schema.md)). That matches the fake's rule.

## Comparison

Criteria:
- **3.1 validation**: can it check requests and responses against `openapi/ynab-1.87.0.yaml`?
- **State and deltas**: does it keep state and delta semantics?
- **Scripted faults**: does it support scripted faults?
- **Production build and CSP**: does it work with the `vp preview` production build and its CSP?

| Approach | 3.1 validation | State and deltas | Scripted faults | Production build and CSP | Maintenance |
|---|---|---|---|---|---|
| **Hand-written fake (today)** | None at run time. Compile-time wire types only, and `body: unknown` and the casts bypass them | Yes, purpose-built | Yes: `429`, `5xx`, `400`, `timeoutAfterCommit`, `dropBeforeCommit`, `externalEdit` | Yes, through `page.route` in Node | About 650 lines, owned by us. Drift from the real API goes unnoticed |
| **Fake + openapi-backend hook (proposed)** | Requests and responses, once the three problems above are handled | Unchanged | Unchanged. Fault bodies get checked too | Yes. Validation runs in Node, nothing in the page | One adapter of about 80 lines and 2–3 devDependencies. Regenerate nothing when the YAML is bumped |
| **MSW, `msw/node` (`setupServer`)** | None built in | Only if you write it in handlers, which means porting the fake | `HttpResponse.error()`, `delay('infinite')` ([`http-response.ts`](https://raw.githubusercontent.com/mswjs/msw/main/src/http/http-response.ts), [`delay.ts`](https://raw.githubusercontent.com/mswjs/msw/main/src/utils/delay.ts)) | Not applicable | It patches global `fetch`, which `client.ts` already lets us inject. That is an extra layer for no gain |
| **MSW browser (`setupWorker`)** | None built in | Same as above | Same as above | **Poor fit.** It needs worker code in the bundle and a same-origin worker script. The Vite plugin strips both from production builds. It hides traffic from `page.route` | You would maintain a separate test build, and lose "the e2e suite tests the shipped artifact" |
| **@msw/playwright** | None built in | Same as above | Same as above | Yes, because it is `page.route` underneath | A pre-1.0 package (0.7.0, 2026-09-28) wrapping what `routeHandler` already does |
| **Prism (`mock` / `proxy`)** | Yes, 3.1. Mock mode validates requests. Proxy mode validates both directions ([Prism docs: request validation](https://raw.githubusercontent.com/stoplightio/prism/master/docs/guides/02-request-validation.md), [proxy](https://raw.githubusercontent.com/stoplightio/prism/master/docs/guides/03-validation-proxy.md)) | **No.** Stateless ([roadmap](https://raw.githubusercontent.com/stoplightio/prism/master/README.md)) | Only by status, with `Prefer: code=429`. The app cannot send that without test code. No hang-after-commit | Needs a separate HTTP server. e2e would chain `page.route`, then Prism proxy, then the fake over HTTP | A second process, a Node ≥ 24.18 requirement, and a heavy dependency tree (`@stoplight/prism-cli` 5.16.0) |
| **Generated mocks** (openapi-backend mock, msw-auto-mock, @msw/source) | openapi-backend validates. The MSW generators do not | No. Random or example data | No | Same as the underlying transport | Our spec has no examples, so the generated data is random. That makes it unusable for totals or deltas |
| **Plain `page.route` with inline handlers** | None | Per-test, by hand | Yes: `route.abort`, never fulfilling | Yes, and it sees the CSP-enforced page ([Playwright `page.route`](https://raw.githubusercontent.com/microsoft/playwright/main/docs/src/api/class-page.md)) | Duplicates the fake in every spec. Use it only for one-off boundary probes |

## Per-layer guidance

### Pure unit (`src/domain/**`, `ynab/delta.ts`, `memo/rewrite.ts`)

- **Domain tests.** No HTTP mocking. Domain functions take wire or domain objects. Build those with `test/wire.ts` and `test/arbitraries.ts`. Optionally assert that `wire*` builders produce schema-valid objects, through the same contract module's `validateSchema('TransactionDetail', obj)`.
- **`client.ts`.** Keep the small recorder `fetchImpl` stubs in `client.test.ts`. They test fetch-init details (`credentials: 'omit'`, origin assertion, abort reasons) that a stateful fake would only hide.
- **Faults and deltas.** Anything that needs faults or deltas (`writeEngine`, the property 18 delta-merge test) uses `createFakeYnab().fetchImpl`, as now. The contract hook then covers those tests for free.

### Component (React Testing Library in jsdom)

- **Transport.** Inject `fake.fetchImpl` through `createSessionStore({ fetchImpl })`, as `src/ui/App.test.tsx` does now. Do not add `msw/node`: the store already has a seam, and an interceptor would only add globals to reset.
- **Validation.** It runs in the same Node process under the jsdom environment. Load the definition as an object, not a path, so nothing depends on the jsdom realm.

### End-to-end (Playwright, production build, strict CSP)

- **Transport.** Keep `page.route('https://api.ynab.com/**', fake.routeHandler)` in the auto `observed` fixture. It sees the real CSP-enforced page, and it keeps the request recorder and the boundary assertions working.
- **Service workers.** Do not register a service worker. If one ever appears, set `serviceWorkers: 'block'` in `playwright.config.ts`: Playwright documents that `page.route` "will not intercept requests intercepted by Service Worker" ([`class-page.md`](https://raw.githubusercontent.com/microsoft/playwright/main/docs/src/api/class-page.md), [`TestOptions.serviceWorkers`](https://raw.githubusercontent.com/microsoft/playwright/main/docs/src/test-api/class-testoptions.md)).
- **CSP and browser MSW.** The CSP itself would not block a same-origin MSW worker. `worker-src` falls back to `child-src`, then `script-src`, then `default-src` ([MDN: `worker-src`](https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/http/reference/headers/content-security-policy/worker-src/index.md)). `vercel.json` sets `script-src 'self'`. So the obstacle is shipping or forking the build, not the CSP.
- **Teardown.** In the fixture teardown, assert `fake.contractViolations` is empty, next to the existing CSP and origin checks. This turns every e2e run into a check of the **browser's real requests** against the spec. The `Authorization` header and the JSON body come from Chromium, not from a stub.

## Adding OpenAPI validation to the fake

**Dependencies (devDependencies only, exact pins, at least two weeks old).**
- `openapi-backend` 5.21.2 (2026-09-29). The trial showed the same behaviour on 5.22.0, published 2026-10-16.
- `yaml`, to parse the document.
- Optionally `ajv-formats` 3.0.1, for `date` and `date-time`. openapi-backend registers only `int32`, `int64`, `float` and `double`, and ignores unknown formats ([`src/validation.ts`](https://raw.githubusercontent.com/openapistack/openapi-backend/main/src/validation.ts)). Do not enable `uuid` yet: the spec marks plan, account, category and `account_id` values `format: uuid`. The fixture IDs (`plan-household`, `acc-checking`) fail it, as the trial showed. Either switch the fixtures to UUIDs in a later change, or leave `uuid` off.

**New module `test/ynabContract.ts`, Node only, never imported from non-test `src/`.**
- Read `openapi/ynab-1.87.0.yaml` and parse it.
- Rewrite `nullable: true` without `type` into `anyOf [X, {type: 'null'}]`.
- Construct `new OpenAPIBackend({ definition, apiRoot: '/v1', quick: true, customizeAjv })` and `await api.init()`. `apiRoot` matches `servers: https://api.ynab.com/v1`.
- Export `checkRequest(rec): string[]`. It skips `OPTIONS` (CORS preflight is not in the spec), then calls `matchOperation`; an unmatched request is itself a violation. It then calls `validateRequest({ method, path, query, headers, body })`. `RecordedRequest` already has exactly these fields.
- Export `checkResponse(rec, status, body): string[]`. If the operation documents the status, it calls `validateResponse(body, op, status)`. Otherwise it validates against `ErrorResponse` and flags any status outside `{401, 403, 404, 429, 500, 503}`, YNAB's generic error table ([YNAB API: Errors](https://api.ynab.com/#errors), summarised in [ynab-api-constraints.md](./ynab-api-constraints.md#rate-and-failure-constraints)).
- Use top-level `await`. The repo is `"type": "module"`, so Vitest and Playwright both load it as ESM.

**Hook in `test/fakeYnab.ts`.**
- Add `contract?: YnabContract` to `FakeYnabOptions`, and default it to the shared instance.
- In `run(rec)`:
  1. After `record()`, call `checkRequest(rec)`.
  2. After `handle(rec)`, if the outcome is a `'response'`, call `checkResponse(rec, outcome.status, outcome.body)`. `'hang'` and `'drop'` outcomes have no body, so they get only the request check.
  3. Push the results onto a new `contractViolations: string[]` on `FakeYnab`. Do not throw: a throw inside `routeHandler` would surface as a broken route, not a readable failure.
- Because both `fetchImpl` and `routeHandler` call `run()`, this one hook covers unit, component and e2e.

**Failing the tests.**
- **Vitest.** Add a `test.setupFiles` entry with `afterEach(() => expect(takeAllViolations()).toEqual([]))`. To make this work, `createFakeYnab` registers each instance in a module-level set.
- **Playwright.** Add `expect(fake.contractViolations, 'OpenAPI contract').toEqual([])` to the `observed` teardown in `e2e/fixtures.ts`.
- **Deliberate violations.** Tests that send invalid input on purpose drain the list with `fake.takeContractViolations()` and assert what they expect. For example, `fakeYnab.test.ts` sends a 501-code-point memo to check the fake's 400.

**What the schema cannot check. Keep the existing behavioural tests for these.**
- **Omitted `approved`.** It is schema-valid, because `approved` is optional. Only the PATCH assertions in the `writeEngine` tests enforce ADR 0007.
- **Delta correctness and split-line amounts.** Neither is a schema property.
- **The 200-requests-per-hour limit.** The hook adds no requests. If wanted, a request counter per token in the fake is a separate change.

**Keeping it out of the browser bundle.**
- **Why it is already out.**
  - `vp build` bundles only what `index.html` reaches.
  - `test/` is imported only from `*.test.*` files and `e2e/`.
  - The Playwright route handler runs in the runner process, not the page.
- **Guards.** Make the boundary mechanical with an oxlint override on `src/**` that excludes `*.test.*`. It applies `no-restricted-imports` for `openapi-backend`, `ajv*`, `yaml` and `**/test/**`. Optionally, a post-build check can confirm that `dist/assets/*.js` contains no `openapi-backend` or `mockServiceWorker`. None of this changes the CSP or the PAT path.

## Primary sources

- [Mock Service Worker README](https://raw.githubusercontent.com/mswjs/msw/main/README.md). Also [`src/vite/plugin.ts`](https://raw.githubusercontent.com/mswjs/msw/main/src/vite/plugin.ts), [`src/utils/delay.ts`](https://raw.githubusercontent.com/mswjs/msw/main/src/utils/delay.ts), [`src/http/http-response.ts`](https://raw.githubusercontent.com/mswjs/msw/main/src/http/http-response.ts), and [npm metadata for msw 3.0.3](https://registry.npmjs.org/msw)
- [@msw/playwright README](https://raw.githubusercontent.com/mswjs/playwright/main/README.md) and [@msw/source](https://registry.npmjs.org/@msw/source)
- [msw-auto-mock README and metadata](https://registry.npmjs.org/msw-auto-mock)
- [Stoplight Prism README](https://raw.githubusercontent.com/stoplightio/prism/master/README.md). Also its guides: [mocking](https://raw.githubusercontent.com/stoplightio/prism/master/docs/guides/01-mocking.md), [request validation](https://raw.githubusercontent.com/stoplightio/prism/master/docs/guides/02-request-validation.md), [validation proxy](https://raw.githubusercontent.com/stoplightio/prism/master/docs/guides/03-validation-proxy.md), [CLI](https://raw.githubusercontent.com/stoplightio/prism/master/docs/getting-started/03-cli.md)
- [openapi-backend README](https://raw.githubusercontent.com/openapistack/openapi-backend/main/README.md). Also [`src/backend.ts`](https://raw.githubusercontent.com/openapistack/openapi-backend/main/src/backend.ts), [`src/validation.ts`](https://raw.githubusercontent.com/openapistack/openapi-backend/main/src/validation.ts), and [npm metadata](https://registry.npmjs.org/openapi-backend)
- Ajv docs: [JSON Schema keywords (nullable, maxLength)](https://raw.githubusercontent.com/ajv-validator/ajv/master/docs/json-schema.md) and [options](https://raw.githubusercontent.com/ajv-validator/ajv/master/docs/options.md). Also [`lib/compile/validate/dataType.ts`](https://raw.githubusercontent.com/ajv-validator/ajv/master/lib/compile/validate/dataType.ts)
- Playwright docs: [Network: service workers](https://raw.githubusercontent.com/microsoft/playwright/main/docs/src/network.md), [`Page.route`](https://raw.githubusercontent.com/microsoft/playwright/main/docs/src/api/class-page.md), [`TestOptions.serviceWorkers`](https://raw.githubusercontent.com/microsoft/playwright/main/docs/src/test-api/class-testoptions.md)
- [MDN: CSP `worker-src`](https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/http/reference/headers/content-security-policy/worker-src/index.md)
- [YNAB API v1.87.0 OpenAPI document](../../openapi/ynab-1.87.0.yaml) and [YNAB API documentation: Errors](https://api.ynab.com/#errors)

These hosts were blocked by the proxy and not consulted directly: `mswjs.io`, `github.com`, `unpkg.com` and `cdn.jsdelivr.net`. The same files were read from `raw.githubusercontent.com` and `registry.npmjs.org` instead.
