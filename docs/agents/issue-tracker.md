# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues. Use the GitHub REST API through `gh api` for every operation.

**Why REST, not `gh issue`:** `gh issue` and most `gh pr` subcommands use GitHub's GraphQL API, which Claude Code cloud sessions block (`HTTP 403: GitHub GraphQL is not available from Claude Code sessions`). `gh api` with REST paths works in cloud sessions and locally, so it is the one form to use everywhere.

`gh api` fills in `{owner}` and `{repo}` from the clone's remote, so the paths below work as written inside the repo.

## Conventions

- **Create an issue**: `gh api repos/{owner}/{repo}/issues -f title="..." -f body="..."`. Add `-f "labels[]=<label>"` per label. Use a heredoc with `-F body=@-` for multi-line bodies.
- **Read an issue**: `gh api repos/{owner}/{repo}/issues/<number> --jq '{number, title, state, author: .user.login, created_at, updated_at, body, labels: [.labels[].name], assignees: [.assignees[].login]}'`, then `gh api 'repos/{owner}/{repo}/issues/<number>/comments?per_page=100' --paginate --jq '.[] | {author: .user.login, created_at, body}'` for every comment, oldest first. Without `--paginate` only the first page comes back.
- **List issues**: `gh api 'repos/{owner}/{repo}/issues?state=open&per_page=100' --paginate --jq '.[] | select(.pull_request | not) | {number, title, author: .user.login, created_at, updated_at, body, labels: [.labels[].name], assignees: [.assignees[].login], blocked_by: (.issue_dependencies_summary.blocked_by // 0)}'`. Filter with `&labels=<label>` (comma-separated for several) and `state=open|closed|all`. The issues endpoint also returns pull requests, which the `select` drops.
- **Comment on an issue**: `gh api repos/{owner}/{repo}/issues/<number>/comments -f body="..."`
- **Apply / remove labels**: `gh api repos/{owner}/{repo}/issues/<number>/labels -f "labels[]=<label>"` / `gh api -X DELETE repos/{owner}/{repo}/issues/<number>/labels/<label>`
- **Close**: comment first, then `gh api -X PATCH repos/{owner}/{repo}/issues/<number> -f state=closed -f state_reason=completed` (`not_planned` for won't-fix).
- **Assign**: `gh api repos/{owner}/{repo}/issues/<number>/assignees -f "assignees[]=<login>"`

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues, using the `gh pr` equivalents:

- **Read a PR**: `gh api repos/{owner}/{repo}/pulls/<number>` and its `/issues/<number>/comments`; `gh pr diff <number>` for the diff (it uses REST and works everywhere).
- **List external PRs for triage**: `gh api 'repos/{owner}/{repo}/pulls?state=open&per_page=100' --paginate --jq '.[] | {number, title, body, labels: [.labels[].name], author: .user.login, author_association, created_at}'` then keep only `author_association` of `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`, or `NONE` (drop `OWNER`/`MEMBER`/`COLLABORATOR`).
- **Comment / label / close**: the issue endpoints above work on PR numbers too; close a PR with `gh api -X PATCH repos/{owner}/{repo}/pulls/<number> -f state=closed`.

GitHub shares one number space across issues and PRs, so a bare `#42` may be either — resolve with `gh api repos/{owner}/{repo}/issues/42 --jq '.pull_request != null'`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Read the issue and its comments as in **Read an issue** above.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. Create it as above with `-f "labels[]=wayfinder:map"`.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue (`gh api` on the sub-issues endpoint). Where sub-issues aren't enabled, add the child to a task list in the map body and put `Part of #<map>` at the top of the child body. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: GitHub's **native issue dependencies** — the canonical, UI-visible representation. Add an edge with `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, where `<blocker-db-id>` is the blocker's numeric **database id** (`gh api repos/<owner>/<repo>/issues/<n> --jq .id`, _not_ the `#number` or `node_id`). GitHub reports `issue_dependencies_summary.blocked_by` (open blockers only — the live gate). Where dependencies aren't available, fall back to a `Blocked by: #<n>, #<n>` line at the top of the child body. A ticket is unblocked when every blocker is closed.
- **Frontier query**: list the map's open children (**List issues** above, scoped to the map's sub-issues / task list), drop any with an open blocker (`blocked_by > 0` in that output, or an open issue in the `Blocked by` line) or a non-empty `assignees`; first in map order wins.
- **Claim**: **Assign** above with your own login (`gh api user --jq .login`) — the session's first write.
- **Resolve**: comment with the answer, then close (both above), then append a context pointer (gist + link) to the map's Decisions-so-far.
