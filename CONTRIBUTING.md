# Contributing

Thanks for helping out.

## Setup

This repository is developed alongside
[open-rocket-chat-gateway](https://github.com/zscontributor/open-rocket-chat-gateway), which owns the shared
API contract. Until those packages are published to npm, this one resolves
`@open-rocket-chat/api-contract` through a pnpm `link:` override pointing at a sibling checkout, so the two
must share a parent directory:

```
your-workspace/
├── open-rocket-chat-client      ← this repository
└── open-rocket-chat-gateway
```

```bash
# gateway checkout
pnpm install && pnpm run build
pnpm run rc:up
pnpm --filter @open-rocket-chat/gateway dev

# here
pnpm install
pnpm --filter @open-rocket-chat/web dev
```

If `@open-rocket-chat/api-contract` cannot be resolved, the sibling checkout is missing or has not been built —
run `pnpm run build` in the gateway repository first.

## Branching model

This repository follows Git Flow. Two branches are permanent, everything else is short-lived and
deleted once it is merged.

| Branch        | What it is                                                                                                                                                     |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`main`**    | Released code, and nothing else. Every commit on it is a version that was tagged and shipped. It moves only when a release or a hotfix is merged into it.      |
| **`develop`** | The integration branch, and the base for all day-to-day work. It is where finished features accumulate between releases, and it is the branch you branch from. |

Both are protected. **Nobody pushes to them directly and nobody merges their own work into them** —
including maintainers, whose commits go through the same review as everyone else's. Changes arrive by
pull request, and a pull request is merged by a reviewer, not by its author.

If `git push` to `main` or `develop` is rejected, that is the protection doing its job rather than a
problem with your checkout. Move the commits onto a branch and open a pull request:

```bash
git switch -c feature/thread-search   # takes your commits with you
git push -u origin feature/thread-search
```

### Short-lived branches

| Prefix                          | Branch from | Merge into           | For                                         |
| ------------------------------- | ----------- | -------------------- | ------------------------------------------- |
| `feature/`                      | `develop`   | `develop`            | New behaviour                               |
| `fix/`                          | `develop`   | `develop`            | A bug that can wait for the next release    |
| `refactor/`                     | `develop`   | `develop`            | Restructuring with no behaviour change      |
| `docs/`                         | `develop`   | `develop`            | Documentation only                          |
| `test/`                         | `develop`   | `develop`            | Tests only                                  |
| `perf/`                         | `develop`   | `develop`            | Performance work                            |
| `chore/` `ci/` `build/` `deps/` | `develop`   | `develop`            | Tooling, pipelines, dependency bumps        |
| `release/`                      | `develop`   | `main` and `develop` | Stabilising a version — maintainers only    |
| `hotfix/`                       | `main`      | `main` and `develop` | An urgent fix to something already released |

Name the rest of the branch after the change, not the ticket: `feature/thread-search`, not
`feature/ORC-412`. Lowercase, hyphen-separated.

`main` accepts pull requests from `develop`, `release/*` and `hotfix/*` only. One aimed at it from a
feature branch is rejected by [the branch policy check](.github/workflows/branch-policy.yml) before a
reviewer ever sees it — retarget it at `develop` using **Edit** next to the pull request title, which
keeps the commits and any review already given.

### Working on a change

```bash
git switch develop
git pull --ff-only origin develop      # always start from the current develop
git switch -c feature/thread-search

# ... work, committing as you go ...

git fetch origin
git rebase origin/develop              # keep your branch on top of develop
git push -u origin feature/thread-search
```

Rebase your own branch onto `develop` rather than merging `develop` into it — the history that reaches
`develop` is then the change itself, not the change plus a record of every time you synced. Because
your branch is yours alone, force-pushing it after a rebase is fine (`--force-with-lease`, which
refuses if somebody else has pushed to it in the meantime).

### Commits and pull request titles

Commit messages and pull request titles follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(rooms): pin messages from the room header
fix(auth): keep the session when a second server is added
refactor(realtime): fold presence events through the query cache
```

Types: `feat` `fix` `docs` `style` `refactor` `perf` `test` `build` `ci` `chore` `revert`. Append `!`
after the type for a breaking change and explain it in the body.

The **pull request title matters most**: work merges into `develop` as a single squashed commit whose
subject is that title, so it is the line that ends up in the history and in the release notes. The
individual commits on your branch are yours to keep messy.

## Before opening a pull request

```bash
pnpm run format
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run build
pnpm run test:e2e
```

CI runs every one of those on each pull request **except the last**, and those checks are required —
so running them locally only saves you a round trip.

`pnpm run test:e2e` is the exception: **it runs on your machine only.** Driving a browser against a
real Rocket.Chat took more than twenty minutes per run on a hosted runner, which is long enough that
people stop reading the result — and a check nobody reads is worse than no check, because it looks
like coverage. Nothing enforces it, so if you touch anything the suite covers, run it and say in the
pull request that you did.

It assumes the stack the Compose file seeds. Three variables override that, and all three have
defaults, so a standard local setup needs none of them:

| Variable             | Default                 | What it is                        |
| -------------------- | ----------------------- | --------------------------------- |
| `E2E_WEB_URL`        | `http://localhost:5173` | Where this app is served          |
| `E2E_ADMIN_USERNAME` | `admin`                 | The account the suite signs in as |
| `E2E_ADMIN_PASSWORD` | `admin-password-123`    | Its password                      |

## Review and merging

- Target `develop`. The pull request template's checklist is the one a reviewer works through.
- One approving review from a code owner is required, and that approval is dismissed if you push
  again — a review approves a diff, not an intention.
- All conversations must be resolved, and all checks green.
- **The reviewer merges, not the author.** Waiting for someone else to press the button is the whole
  point of the rule; there is no case where merging your own pull request is the quick way through.
- Feature work is **squash-merged** into `develop`, and the branch is deleted afterwards. Release and
  hotfix branches are merged with a merge commit, so the release stays visible in the history.
- Keep pull requests small enough to review in one sitting. Two reviewable pull requests land sooner
  than one large one.

## Releases

Cutting a release is a maintainer task, recorded here so the branching model reads as a whole.

```bash
# 1. Branch from develop and stabilise there — version bump, changelog, release fixes only
git switch develop && git pull --ff-only origin develop
git switch -c release/0.2.0
pnpm version 0.2.0 --no-git-tag-version && git commit -am "chore(release): 0.2.0"
git push -u origin release/0.2.0

# 2. Pull request release/0.2.0 -> main, reviewed and merged like any other

# 3. Tag the merge commit on main
git switch main && git pull --ff-only origin main
git tag -a v0.2.0 -m "0.2.0" && git push origin v0.2.0

# 4. Merge main back into develop so the bump and any release fixes are not lost
```

Step 4 is the one that gets forgotten. Without it `develop` is missing the release commits and the
next release branch reintroduces bugs that were already fixed.

A **hotfix** is the same shape with `main` as the starting point: branch `hotfix/0.2.1` from `main`,
fix, pull request into `main`, tag, then merge back into `develop`. It exists so an urgent fix can
ship without dragging along whatever is half-finished on `develop`.

## Conventions

**Server data belongs in TanStack Query.** Rooms, messages and profiles are cached there and nowhere else.
Realtime events are folded into that cache by `features/realtime/realtime-provider.tsx`, which is why components
can ignore how a value arrived. Copying server data into Zustand reintroduces exactly the dual-source-of-truth
bugs this split avoids.

**Zustand holds only client-owned state**: theme, composer drafts, which thread is open, who is typing.

**Talk to the gateway through `packages/client-sdk`.** No `fetch` calls in components. If a route is missing
from the SDK, add it there.

**There is no direct-to-Rocket.Chat mode, and pull requests adding one will be declined.** A browser talking
to Rocket.Chat directly has to hold an `X-Auth-Token` that grants full account access, which is the exact
thing this architecture exists to prevent — see [the README](README.md#the-gateway-is-not-optional). If the
motivation is avoiding a backend, run one gateway for your organisation and point every client at it.

**No Rocket.Chat concepts in the UI.** If a component needs to know about `rid`, `_id` or single-letter room
types, the gateway's contract is missing something — fix it there instead of decoding it here.

**Accessibility is not optional.** Interactive elements need accessible names, focus must stay visible, and
status changes that matter (typing, connection state) should be announced. The Playwright suite queries by
role and label, so a component that is hard to test is usually a component that is hard to use.

## Styling

Tailwind v4, configured in `src/styles.css` via `@theme`. Use the semantic tokens (`surface`, `content`,
`accent`, `border-subtle`) rather than raw palette colours — they are what makes the dark theme work, and a
hard-coded `bg-white` will be invisible in it.

## Testing

Playwright drives the real stack rather than mocks. A mocked gateway would only restate our assumptions about
an API we do not control, and those assumptions are what tends to be wrong. Please extend `e2e/chat.spec.ts`
when you add a feature.

## Security

Please do not open a public issue for a vulnerability. See [SECURITY.md](SECURITY.md) — cross-site
scripting is the report this project cares about most, since a message body is attacker-controlled
text rendered on every reader's screen.

## Reporting bugs

Include your Rocket.Chat version, the gateway's error `code` if one was shown, and what you expected instead.
Browser console output and a failing Playwright test are both very welcome.

## Licence

Contributions are accepted under the MIT licence.
