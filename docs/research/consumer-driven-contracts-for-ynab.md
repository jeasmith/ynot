# Consumer-driven contracts when YNAB will not verify them

Checked 2026-10-17 against the Pact documentation sources, the pact-js docs and npm READMEs, PactFlow's bi-directional example repositories and comparator README, the Specmatic READMEs, the OpenAPI 3.1.1 specification, and the npm registry. Answers [issue #31](https://github.com/jeasmith/ynot/issues/31).

## Answer

**Use option (c): one TypeScript conformance suite that runs against both `test/fakeYnab.ts` and the real API. Add OpenAPI schema validation as a cheap extra layer inside that suite. Do not adopt Pact or bi-directional contract testing.**

- **Pact's own docs rule this case out.** They say Pact is "not good for" testing "APIs where the team maintaining the other side of the integration will not also be using Pact", "public APIs", and cases where "you cannot load data into the provider without using the API that you're actually testing". For a public API, "the only way to set up the right provider state is to use the very API that you're actually testing, which will make the tests slower and more brittle". [Pact: When to use Pact](https://github.com/pact-foundation/docs.pact.io/blob/master/website/docs/getting_started/what_is_pact_good_for.md)
- **A contract test of either kind cannot see side effects.** Pact says "A contract test _does not check for side effects_" [Pact: Contract tests vs functional tests](https://github.com/pact-foundation/docs.pact.io/blob/master/website/docs/consumer/contract_tests_not_functional_tests.md). It also says that during verification Pact "just checks that the response body matches the expected response body" [Pact: When to use Pact](https://github.com/pact-foundation/docs.pact.io/blob/master/website/docs/getting_started/what_is_pact_good_for.md). All five checks under "Contract checks" in `.opal/specs/ynab-tagging/design.md` are about behaviour or side effects. Examples: a memo-only `PATCH` leaves other fields alone, the memo is stored as `""` or as `null`, and delta reads return changes to old transactions.
- **Bi-directional testing checks shape only, against a document YNAB wrote.** PactFlow compares the consumer's pact "against the provider's specification (OAS)" [PactFlow example: bi-directional consumer (MSW)](https://github.com/pactflow/example-bi-directional-consumer-msw/blob/master/README.md). That only shows the consumer "consumes a valid subset of the OAS" [PactFlow example: bi-directional provider (Dredd)](https://github.com/pactflow/example-bi-directional-provider-dredd/blob/master/README.md). The gaps in YNAB's documentation are exactly where the risk sits, and a document check cannot see them. For example, `memo` is typed as `string | null` with `maxLength: 500` (`openapi/ynab-1.87.0.yaml`), so both `""` and `null` pass.
- **Fowler's "contract test" describes this design.** Keep running your tests against the double, and periodically run a separate set of contract tests. These check that the calls against the double return the same results as the real service. They don't need to be in the deployment pipeline, and a failure should prompt follow-up rather than necessarily breaking the build. [Martin Fowler: ContractTest](https://martinfowler.com/bliki/ContractTest.html) The repo already has the seam for this: `src/ynab/client.ts` takes a `fetchImpl`, and the fake exposes one.
- **For the schema layer,** validate real responses and fake responses against `openapi/ynab-1.87.0.yaml` with `@hyperjump/json-schema` (its `openapi-3-1` dialect) or Ajv's 2020-12 build. Both are devDependencies imported only from `test/` and `scripts/`, so nothing reaches the browser bundle.

## Comparison

| | (a) Pact consumer tests, replayed against the real YNAB API | (b) Bi-directional: pact compared with YNAB's OpenAPI | (c) Shared TS conformance suite: fake and real API |
|---|---|---|---|
| New dependencies | `@pact-foundation/pact` 17.1.4 (16 runtime deps, including express, axios and graphql). It pulls in `@pact-foundation/pact-core` 20.2.0, a per-platform native Rust core of 17.9 MB on linux-x64-glibc | A Pact consumer (as in a), plus PactFlow (a hosted service) **or** `@pactflow/openapi-pact-comparator` 2.4.0 locally (15.9 MB, Node ≥ 22) | None for the behaviour checks. Optional schema layer: `@hyperjump/json-schema` 1.18.0 or `ajv` 8.20.0 + `ajv-formats` 3.0.1 |
| Ships to the browser | No, it's a test devDependency. The client's origin assertion means the Pact mock server must be reached through an injected `fetchImpl` | No | No |
| Catches undocumented behaviour (the five checks) | Weakly. One request per interaction, with no side-effect checks. Provider state has to be set up through YNAB itself, and Pact warns against relying on interaction order | No. Static comparison of shape against YNAB's own document | Yes. Each check is a multi-step script (read, `PATCH`, read again, compare) |
| Catches shape and schema drift | Only for the examples recorded | Yes, against the documented schema | Yes, with the optional schema layer |
| Proves the fake is faithful | No | No | Yes. The same assertions pass on both targets |
| Real-API request cost | 1 or more requests per interaction, plus state setup | 0 | About 10–30 requests per run (estimate), well under 200/hour |
| Maintenance | Two DSLs (Pact matchers and state handlers) for one consumer and an uncooperative provider | Pact DSL, plus re-vendoring the OAS, plus a hosted broker or the comparator | Plain Vitest code beside the fake |

## (a) Pact consumer tests replayed against the real API ourselves

**How it works.** In pact-js, `PactV4` (aliased as `Pact`) is the current consumer interface and supports Pact Specification v4 [pact-js consumer docs](https://github.com/pact-foundation/pact-js/blob/master/docs/consumer.md). The consumer test runs against a local mock server and writes a pact file. Our side then runs the `Verifier` with `providerBaseUrl: 'https://api.ynab.com'`. A `requestFilter` adds a bearer token that "can't be persisted in a pact file", and `stateHandlers` set up each `given(...)` state [pact-js provider docs](https://github.com/pact-foundation/pact-js/blob/master/docs/provider.md). pact-js documents Mocha examples and lists Jest and Mocha adapters but no Vitest adapter. The API itself doesn't depend on the test runner. [@pact-foundation/pact README](https://www.npmjs.com/package/@pact-foundation/pact)

**Weight.**
- `@pact-foundation/pact` 17.1.4 (published 2026-09-07) depends on `@pact-foundation/pact-core`, express, axios, graphql, lodash, ramda and `@scarf/scarf` [npm registry](https://registry.npmjs.org/@pact-foundation/pact).
- `pact-core` 20.2.0 (2026-09-16) wraps the Rust reference core [pact-core README](https://www.npmjs.com/package/@pact-foundation/pact-core). It ships seven optional per-platform binary packages; the linux-x64-glibc one unpacks to 17.9 MB [npm registry](https://registry.npmjs.org/@pact-foundation/pact-core).
- Windows arm64 is unsupported [@pact-foundation/pact README: Supported Platforms](https://www.npmjs.com/package/@pact-foundation/pact).
- The package collects install-time analytics through Scarf, plus an anonymous install event; both can be opted out of [@pact-foundation/pact README](https://www.npmjs.com/package/@pact-foundation/pact).

**Browser.** Nothing ships to the browser. However, `src/ynab/client.ts` refuses any URL outside `https://api.ynab.com` (`assertYnabOrigin`), so the consumer test would need a `fetchImpl` that rewrites the URL to the mock server.

**Undocumented behaviour.**
- Pact verifies one replayed request per interaction against its expected response. It "does not test the side effects of a request" [Pact: When to use Pact](https://github.com/pact-foundation/docs.pact.io/blob/master/website/docs/getting_started/what_is_pact_good_for.md).
- Check 1 needs "PATCH, then GET, then compare with the earlier state". That can only be approximated by a state handler that seeds a transaction through YNAB's own API. Pact advises against this for public APIs and says "Reliably ordering the interactions within the pact or during replay is not supported in all implementations" (same source).
- Pact is "contract by examples": every variation needs its own example [Pact FAQ](https://github.com/pact-foundation/docs.pact.io/blob/master/website/docs/faq.md).
- Verifying against a deployed provider gives up "fast feedback, easy debugging, reliable tests" (same source).

**Maintenance.** We would write and own both halves of the contract: the consumer pact and the provider verification. That costs two DSLs for no cross-team benefit. Pact's stated value assumes "You (or your team/organisation/partner organisation) control the development of both the consumer and the provider" [Pact: When to use Pact](https://github.com/pact-foundation/docs.pact.io/blob/master/website/docs/getting_started/what_is_pact_good_for.md).

## (b) Bi-directional: consumer contract compared with the published OpenAPI

**How it works.**
- The consumer publishes a pact, usually generated from its existing mocks, such as MSW. The provider publishes its OAS together with "the test results validating the OAS". PactFlow then "Compares the consumer's expectations (Pact) against the provider's specification (OAS)" [PactFlow example: bi-directional consumer (MSW)](https://github.com/pactflow/example-bi-directional-consumer-msw/blob/master/README.md).
- What the provider uploads is "an OpenAPI specification that represents what you actually tested". Cross-contract validation ensures "any consumer consumes a valid subset of the OAS for the provider". [PactFlow example: bi-directional provider (Dredd)](https://github.com/pactflow/example-bi-directional-provider-dredd/blob/master/README.md)
- It is "the Bi-Directional contract capability of PactFlow", a hosted service [PactFlow example: bi-directional consumer (MSW)](https://github.com/pactflow/example-bi-directional-consumer-msw/blob/master/README.md).

**Without PactFlow.** The comparison engine is published on its own as `@pactflow/openapi-pact-comparator` 2.4.0 (published 2026-10-15, MIT, Node ≥ 22, 15.9 MB unpacked, no runtime deps) [npm registry](https://registry.npmjs.org/@pactflow/openapi-pact-comparator). It "compares OpenAPI schemas and Pact contracts to determine if they are compatible" and replaces the older `swagger-mock-validator` [openapi-pact-comparator README](https://github.com/pactflow/openapi-pact-comparator/blob/main/README.md). The README does not state which OpenAPI versions it accepts, so it needs a trial against our 3.1.1 file before anyone relies on it. A consumer pact is still required, so the weight of (a) applies too.

**Undocumented behaviour.** None of it is caught.
- The provider half here is YNAB's document, and no test results from YNAB back it up. The "provider contract" that PactFlow assumes is the OAS plus the provider's own verification [PactFlow example: bi-directional consumer (MSW)](https://github.com/pactflow/example-bi-directional-consumer-msw/blob/master/README.md). For YNAB we would have only the first half.
- It cannot tell `""` from `null` on a `string | null` memo. It cannot see that an omitted `approved` silently unapproves a transaction; that is documented only in prose, see [YNAB API constraints](ynab-api-constraints.md). It cannot see delta coverage either.
- The vendored document also has OpenAPI 3.0 leftovers. `default_plan` uses `nullable: true` beside `allOf`, and 3.1 does not define `nullable`. So a strict 3.1 comparison can report false failures [OpenAPI 3.1.1: Schema Object is a superset of JSON Schema 2020-12](https://spec.openapis.org/oas/v3.1.1.html#schema-object).

**What it is good for here.** It catches drift between our expectations and a newly vendored YNAB document. The schema layer in (c) does the same job without a pact.

## (c) Shared TypeScript conformance suite run against the fake and the real API

**How it works.** Write each assertion once, as a function of a `fetchImpl` and a plan ID. Then run the suite twice:

1. **In `vp test`, against `fakeYnab.fetchImpl`.** This runs on every commit and costs nothing.
2. **In `scripts/contract-checks.ts`, against `globalThis.fetch`** on the controlled test budget, with the PAT taken from an environment variable. Run it by hand before slice 2's first write, and periodically after that.

Fowler describes this pattern: run your tests against the double, and "periodically run a separate set of contract tests" that check the double returns what the real service would. They "don't need to be in the regular deployment pipeline", and a failure "should prompt follow-up" rather than necessarily breaking the build [Martin Fowler: ContractTest](https://martinfowler.com/bliki/ContractTest.html). Pact's own documentation draws the same line: functional tests "ensure that the correct side effects have occurred" [Pact: Contract tests vs functional tests](https://github.com/pact-foundation/docs.pact.io/blob/master/website/docs/consumer/contract_tests_not_functional_tests.md).

**How the five design checks fit.**

| Design check | As a conformance test |
|---|---|
| 1. A memo-only `PATCH` leaves other fields unchanged | Read; `PATCH {id, memo, approved}`; read; compare `cleared`, `flag_color`, `category_id`, `payee_id`, `date` and the subtransactions |
| 2. `since_date = first_month` returns the earliest transactions | Fetch `first_month`; list with that `since_date`; assert the seeded oldest transaction is present |
| 3. `PATCH` batch of at least 50 | One `PATCH` of 50 memo-only updates; assert 200 and 50 saved IDs |
| 4. A delta read with `since_date` returns changes to old transactions | Take `server_knowledge`; edit an old transaction; delta read; assert it appears |
| 5. `""` versus `null` | `PATCH memo: ""`; read; record what comes back. The fake must then be made to match |

Each check needs only a handful of requests, so a full run stays far below the 200-per-hour limit [YNAB API constraints: Rate and failure constraints](ynab-api-constraints.md#rate-and-failure-constraints). The suite must not retry in a loop.

**Weight.** No new runtime or test-framework dependency, and nothing ships to the browser. The suite reuses Vitest and the existing `fetchImpl` seam.

**Maintenance.** When YNAB changes, the real-API run fails first, and the fix goes into `test/fakeYnab.ts`. A Pact or BDCT setup gives no comparable signal that the fake has drifted.

### Optional schema layer (inside c)

Validate every response body seen by both runs, and every request body sent, against the matching operation in `openapi/ynab-1.87.0.yaml`. This adds shape checking (status, required fields, enums, `maxLength`) at the cost of one devDependency. In OpenAPI 3.1, the Schema Object "is a superset of the JSON Schema Specification Draft 2020-12" [OpenAPI 3.1.1](https://spec.openapis.org/oas/v3.1.1.html#schema-object). A 3.1 document therefore needs a validator that supports 2020-12 and tolerates the OAS keywords (`discriminator`, `xml`, `externalDocs`, `example`) as well as this file's leftover `nullable`.

Library versions are from `dist-tags.latest` on registry.npmjs.org, checked 2026-10-17.

| Library | Latest | Published | OpenAPI 3.1 | Fit |
|---|---|---|---|---|
| [`@hyperjump/json-schema`](https://registry.npmjs.org/@hyperjump/json-schema) | 1.18.0 | 2026-10-05 | **Yes.** The `openapi-3-1` entry point validates "values against a schema from an OpenAPI document" [README](https://www.npmjs.com/package/@hyperjump/json-schema) | Best match for 3.1 semantics. JSON input only (YAML needs a plugin or a one-time conversion). Its browser build needs CSP `unsafe-eval`, which doesn't matter for test-only use |
| [`ajv`](https://registry.npmjs.org/ajv) + [`ajv-formats`](https://registry.npmjs.org/ajv-formats) | 8.20.0 / 3.0.1 | 2026-04-24 / 2024-03-30 | **Partly.** Draft 2020-12 is supported, plus the OpenAPI `discriminator` keyword [ajv README](https://www.npmjs.com/package/ajv) | A building block. We extract each operation's schema and resolve `$ref`s ourselves. Strict mode rejects unknown keywords, so register the OAS keywords as a vocabulary or relax `strictSchema` [ajv README: strict mode](https://www.npmjs.com/package/ajv) |
| [`openapi-backend`](https://registry.npmjs.org/openapi-backend) | 5.22.0 | 2026-10-16 | **Yes.** README lists "OpenAPI 3.1 support" and `validateResponse(res, operation)` [README](https://www.npmjs.com/package/openapi-backend) | Routing plus Ajv validation without a server. Heavier (lodash, qs, cookie, ref-parser). 5.22.0 is one day old; the previous release is 5.21.3 (2026-10-09) |
| [`@seriousme/openapi-schema-validator`](https://registry.npmjs.org/@seriousme/openapi-schema-validator) | 2.11.0 | 2026-09-25 | **Yes**, 2.0 to 3.2 [README](https://www.npmjs.com/package/@seriousme/openapi-schema-validator) | Validates the **OpenAPI document**, not requests or responses. Useful as a check when re-vendoring the YAML |
| [`@readme/openapi-parser`](https://registry.npmjs.org/@readme/openapi-parser) | 9.1.0 | 2026-10-06 | Yes, for documents [README](https://www.npmjs.com/package/@readme/openapi-parser) | Validates and dereferences documents only |
| [`@apidevtools/swagger-parser`](https://registry.npmjs.org/@apidevtools/swagger-parser) | 13.1.0 | 2026-09-20 | README headline: "Swagger 2.0 and OpenAPI 3.0" [README](https://www.npmjs.com/package/@apidevtools/swagger-parser) | Validates documents only |
| [`openapi-response-validator`](https://registry.npmjs.org/openapi-response-validator) / [`openapi-request-validator`](https://registry.npmjs.org/openapi-request-validator) | 12.1.3 | 2023-05-24 | No 3.1 claim. The examples use Swagger 2 `definitions` [README](https://www.npmjs.com/package/openapi-response-validator) | Stale; avoid |
| [`jest-openapi`](https://registry.npmjs.org/jest-openapi) / [`vitest-openapi`](https://registry.npmjs.org/vitest-openapi) | 0.14.2 / 1.0.3 | 2022-01-03 / 2023-10-02 | No 3.1 claim; built on `openapi-response-validator` [npm registry](https://registry.npmjs.org/vitest-openapi) | Stale; avoid |
| [`express-openapi-validator`](https://registry.npmjs.org/express-openapi-validator) | 5.6.2 | 2026-01-20 | Yes, from 5.4.0 [README](https://www.npmjs.com/package/express-openapi-validator) | Server middleware; the wrong shape for a client |

**Recommendation for the layer.** Use `@hyperjump/json-schema/openapi-3-1`, with the YAML converted to JSON at test time. Use plain Ajv 2020 instead if the extra dependency is unwanted. Keep both imports out of `src/` so `boundary.spec.ts` and the CSP stay as they are.

## Specmatic (considered, not recommended)

Specmatic turns an API specification into "executable contracts" [Specmatic README](https://github.com/specmatic/specmatic/blob/main/README.md).
- **Contract as test** "parses your API Specification files and based on this generates requests which are fired at your application" [specmatic (npm) README](https://www.npmjs.com/package/specmatic). Firing generated requests at the real YNAB budget would write to it and spend the request budget.
- **Contract as stub** emulates the provider from the specification (same source). That would duplicate `test/fakeYnab.ts` without the documented `approved` default or delta semantics.
- The npm package wraps a Java jar (`java -jar`). It is 2.55.3 (2026-10-05), with 85.7 MB unpacked and a JVM required [npm registry](https://registry.npmjs.org/specmatic).
- Like (b), it can only check what the specification says.

## Hosts blocked during research

- `docs.pact.io`, `docs.pactflow.io`, `support.smartbear.com`, `specmatic.io`, `docs.specmatic.io`, `martinfowler.com`, `ajv.js.org` and `spec.openapis.org` were blocked (proxy 403 or DNS failure). The GitHub API was not enabled for this session.
- I read the same Pact pages from the `pact-foundation/docs.pact.io` source repository, and the OpenAPI 3.1.1 text from `OAI/OpenAPI-Specification/versions/3.1.1.md`, through raw.githubusercontent.com.
- I could not open Fowler's ContractTest page. Its wording here comes from search-result summaries of that page.
- PactFlow's own bi-directional guide could not be read, so the bi-directional claims rest on PactFlow's example and comparator READMEs.
- Narrowest allowlist entries to fix this: `docs.pact.io`, `docs.pactflow.io` and `martinfowler.com`.

## Primary sources

- [Pact: When to use Pact](https://github.com/pact-foundation/docs.pact.io/blob/master/website/docs/getting_started/what_is_pact_good_for.md) ([docs.pact.io](https://docs.pact.io/getting_started/what_is_pact_good_for))
- [Pact: Contract tests vs functional tests](https://github.com/pact-foundation/docs.pact.io/blob/master/website/docs/consumer/contract_tests_not_functional_tests.md)
- [Pact FAQ](https://github.com/pact-foundation/docs.pact.io/blob/master/website/docs/faq.md)
- [pact-js consumer docs](https://github.com/pact-foundation/pact-js/blob/master/docs/consumer.md) and [provider docs](https://github.com/pact-foundation/pact-js/blob/master/docs/provider.md)
- [@pact-foundation/pact README](https://www.npmjs.com/package/@pact-foundation/pact) and [@pact-foundation/pact-core README](https://www.npmjs.com/package/@pact-foundation/pact-core)
- [PactFlow example: bi-directional consumer (MSW)](https://github.com/pactflow/example-bi-directional-consumer-msw/blob/master/README.md) and [provider (Dredd)](https://github.com/pactflow/example-bi-directional-provider-dredd/blob/master/README.md)
- [PactFlow openapi-pact-comparator README](https://github.com/pactflow/openapi-pact-comparator/blob/main/README.md)
- [Specmatic README](https://github.com/specmatic/specmatic/blob/main/README.md) and [specmatic (npm) README](https://www.npmjs.com/package/specmatic)
- [Martin Fowler: ContractTest](https://martinfowler.com/bliki/ContractTest.html)
- [OpenAPI Specification 3.1.1](https://spec.openapis.org/oas/v3.1.1.html) ([source](https://github.com/OAI/OpenAPI-Specification/blob/main/versions/3.1.1.md))
- npm registry metadata: `https://registry.npmjs.org/<name>` for every package named above
- [YNAB API constraints (this repo)](ynab-api-constraints.md) and `openapi/ynab-1.87.0.yaml`
