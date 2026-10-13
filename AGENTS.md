## Agent skills

### Issue tracker

Issues and PRDs live in GitHub Issues, operated with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default canonical labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repo: root `CONTEXT.md` and `docs/adr/`. See `docs/agents/domain.md`.

### Network access

If the environment's network policy blocks a request, report the blocked host and suggest the narrowest allowed-domains pattern that would permit it (for example `vercel.com`, not `*`). The owner reviews and updates the environment; don't work around the block.

<!-- OPALSPEC-INSTRUCTIONS-START -->
﻿# Project Agent Instructions

When a user prompt mentions the OpalSpec workflow, `.opal`, or spec-driven development for this repo, first read `.opal/runtime/spec-authoring-instructions.md` and follow it for that request.

OpalSpec requests are stage-based. Create or edit only the requested stage unless the user explicitly asks to continue:

- New spec stage (`/opal:new`): unified entry that gathers a kebab-case feature name and a description, then asks "Generate a draft requirements doc, or ask questions to clarify direction first?". Read `.opal/runtime/new-instructions.md` and follow it. Branch on the user's answer:
  - **Generate** → define mode: write `.opal/specs/<change-name>/requirements.md` in one pass following `spec-authoring-instructions.md`.
  - **Ask questions** → askme mode: follow `.opal/runtime/askme-instructions.md` to interview the user one question at a time, writing `requirements.md` inline.
- Design stage: read requirements first, then create or edit `.opal/specs/<change-name>/design.md`. After it is settled, ask: "Want to play back the design with `/opal:playback`, generate tasks with `/opal:tasks`, or run `/opal:build` directly?".
- Optional Preflight stage (after design, user-invoked): run a read-only second-agent review of `design.md` for issues, risks, red flags, missing checks, and key improvements. Read `.opal/runtime/preflight-instructions.md` and follow it. Do not edit specs or implement code. Trigger phrases: `/opal:preflight`, "preflight this design".
- Optional Playback stage (after design): walk the user through `design.md` section by section with Understood/Question/Don't-understand/Stop prompts. Read `.opal/runtime/playback-instructions.md` and follow it. Trigger phrases: `/opal:playback`, "play back the design".
- Tasks stage (optional): read requirements and design first, then create or edit `.opal/specs/<change-name>/tasks.md`.
- Build stage: read requirements, design, and `.opal/runtime/change-protocol.md` first. If `tasks.md` is present, treat it as the persistent resume ledger: implement tasks in order and update each completed task, subtask, or checkpoint checkbox immediately as work completes. If `tasks.md` is absent, build directly from `design.md` in dependency order. If reality diverges from the spec, follow the change protocol — stop, report, propose, get user agreement, update the affected docs, then resume. After build, offer `/opal:document <topic>` to write or update a dev guide.
- Optional Document stage (after build): write or update `.opal/docs/<topic>.md` per `.opal/runtime/document-instructions.md`. Multiple specs can update the same topic. Trigger phrases: `/opal:document`, "document this".

For all stages after `/opal:new` (`design`, `preflight`, `tasks`, `build`, `playback`, `document`), the spec name is optional — when omitted, follow the spec inference rule in `.opal/runtime/spec-authoring-instructions.md`.

Do not implement code while authoring requirements, design, or tasks unless the user explicitly asks for implementation.
<!-- OPALSPEC-INSTRUCTIONS-END -->

## Review guidelines

These apply to automated PR reviewers (Codex, `@claude`) and to local `/code-review` runs. CI already runs `vp check`, `vp test`, `vp build` and the Playwright suite, so don't report lint, formatting, type errors or failing tests.

Treat these as P0/P1 (blocking):

- **Money maths.** Amounts are YNAB milliunits. Flag float arithmetic, rounding or sign errors, and split-line amounts counted wrongly (ADR 0005).
- **Memo safety.** Ynot never damages memo prose: a tag that doesn't fit is skipped and reported, never truncated. A YNAB write must resend `approved` (ADR 0007).
- **Credentials.** The PAT goes only to the YNAB API. It is stored in `localStorage` only when the user opts in, and Disconnect or a 401 clears it (ADR 0006). Flag anything that logs it, sends it elsewhere, loosens the CSP, or loads a third-party script.
- **Tag grammar.** Tag identity is NFC plus lowercase (ADR 0004). Flag changes that break it.
- **Rate limit.** YNAB allows 200 requests per hour per token. Flag new request loops or retries that could exhaust it.

Everything else is a nit. Report at most five nits per review, and after the first review of a PR report only P0/P1 findings.

Skip entirely: `pnpm-lock.yaml`, `*.generated.ts`, `openapi/`, and wording in `.opal/` specs and `docs/` unless the prose contradicts the code. Don't ask for docstrings.
