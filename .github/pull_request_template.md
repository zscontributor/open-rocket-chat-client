<!--
Base branch: `develop` for everything except a hotfix, which targets `main`.
A pull request straight from a feature branch into `main` will be closed — see
CONTRIBUTING.md, "Branching model".
-->

## What this changes

<!-- One or two sentences. What behaviour is different after this is merged? -->

## Why

<!-- The problem, not the patch. Link the issue if there is one: "Closes #123". -->

## How to check it

<!-- The steps a reviewer follows to see it working, or the test that covers it. -->

## Checklist

- [ ] Branched from `develop` (or from `main`, if this is a hotfix)
- [ ] Branch name follows `feature/…`, `fix/…`, `chore/…`, `docs/…`, `refactor/…`, `test/…`, `perf/…`, `ci/…` or `hotfix/…`
- [ ] Title follows Conventional Commits — `feat(rooms): …`, `fix(auth): …`
- [ ] `pnpm run format` · `pnpm run lint` · `pnpm run typecheck` · `pnpm run test` · `pnpm run build` all pass
- [ ] `pnpm run test:e2e` passes, and covers the new behaviour if it is user-facing
- [ ] No server data mirrored into Zustand, and no `fetch` outside `packages/client-sdk`
- [ ] Interactive elements have accessible names, and semantic Tailwind tokens are used rather than raw colours

## Breaking changes

<!-- Delete if none. Otherwise: what breaks, and what a user or deployer has to do about it. -->
