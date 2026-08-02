# Branch protection

The branching model contributors follow is in [CONTRIBUTING.md](../CONTRIBUTING.md). This page is the
maintainer half: the settings that make those rules real on GitHub, and how to apply them.

The point of every rule below is one sentence — **a change reaches `develop` or `main` only as a
reviewed pull request, merged by someone other than its author.** Everything else is detail.

## Current state

Protection is **applied** to `main` and `develop`. The commands below are what produced it; they are
recorded so the configuration can be audited, reproduced on a fork, or restored after a mistake.

Branch protection is free on public repositories. On a private one it needs GitHub Pro, and the API
answers `Upgrade to GitHub Pro or make this repository public (HTTP 403)` instead — worth knowing if
you fork this into a private repository and wonder why the same commands fail.

## Applying it

Run once as a repository admin, with `gh auth status` showing the `repo` scope.

```bash
REPO=zscontributor/open-rocket-chat-client

for BRANCH in main develop; do
  # `strict` on main only: a release branch is worth rebasing onto the latest
  # main, whereas requiring every feature branch to be up to date with develop
  # turns a busy day into a queue of re-runs.
  STRICT=$([ "$BRANCH" = main ] && echo true || echo false)

  gh api -X PUT "repos/$REPO/branches/$BRANCH/protection" --input - <<EOF
{
  "required_status_checks": {
    "strict": $STRICT,
    "contexts": [
      "Format, lint, typecheck, build",
      "Unit tests",
      "Dependency audit",
      "Branch and title policy"
    ]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": true,
    "required_approving_review_count": 1,
    "require_last_push_approval": true
  },
  "restrictions": null,
  "required_linear_history": false,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false,
  "required_conversation_resolution": true,
  "lock_branch": false,
  "allow_fork_syncing": false
}
EOF
done
```

Verify:

```bash
gh api repos/$REPO/branches/develop/protection | jq '{
  reviews: .required_pull_request_reviews,
  checks: .required_status_checks.contexts,
  force_push: .allow_force_pushes.enabled
}'
```

## Why each setting

**`required_approving_review_count: 1` with `require_code_owner_reviews`** — the rule that stops a
contributor merging their own work. [`CODEOWNERS`](../.github/CODEOWNERS) makes maintainers the owners
of every path, and GitHub does not count an author's approval of their own pull request, so a merge
always needs a second person.

**`dismiss_stale_reviews` and `require_last_push_approval`** — an approval covers the diff that was
reviewed. Pushing after it drops it, which closes the gap where a reviewed pull request grows an
unreviewed commit before it is merged.

**`enforce_admins: false`** — admins keep a bypass on purpose. Protection with no way out is how a
repository ends up locked during an incident, and the audit log records any use of it. It is for
recovery, not for skipping review.

**`restrictions: null`** — restricting _who_ may push needs an organisation-owned repository; on a
user account the field must be null. Required reviews are what enforce the policy here instead.

**`allow_force_pushes: false`, `allow_deletions: false`** — released history is not rewritten, and
neither long-lived branch can be deleted by accident.

**Required status checks — the fast, deterministic ones only.** Format/lint/typecheck/build, unit
tests, the dependency audit and the branch policy are required. **The Playwright suite is not**, even
though it runs on every pull request.

That is a deliberate trade. A required check that fails for reasons unrelated to the diff blocks a
contributor who cannot do anything about it, and an end-to-end suite driving a real Rocket.Chat is
the one job here with genuine flake in it. Keeping it visible-but-not-required means a reviewer still
sees the red cross and can decline to merge; it just is not GitHub that decides. Promote it once the
suite has been quiet for a while:

```bash
gh api -X PATCH "repos/$REPO/branches/develop/protection/required_status_checks" \
  -f 'contexts[]=Browser tests against the full stack'
```

The context strings are job _names_ from [`ci.yml`](../.github/workflows/ci.yml) and
[`branch-policy.yml`](../.github/workflows/branch-policy.yml); renaming a job there without updating
the protection leaves a required check that never reports, and pull requests hang waiting for it.

**No linear history requirement** — Git Flow merges release and hotfix branches into `main` with a
merge commit, which is what keeps a release visible as one event in the history.

## What GitHub cannot enforce

Branch protection has no concept of which branch a pull request may come _from_, so nothing native
stops a feature branch being pointed straight at `main`.
[`branch-policy.yml`](../.github/workflows/branch-policy.yml) covers that gap: it fails any pull
request into `main` whose head is not `develop`, `release/*` or `hotfix/*`, checks branch names for
contributors with push access, and checks that the title is a Conventional Commit — the title becomes
the squashed commit subject on `develop`, so it is the one that lands in the history.

Add it to the required checks (it is in the list above) so a red policy check blocks the merge button
rather than merely reporting.

## Repository settings that go with it

Already applied, and listed so a fork can match them:

- Squash merging **on** — the default for work landing in `develop`
- Merge commits **on** — releases and hotfixes into `main`
- Rebase merging **off**, so there is one obvious way to merge each kind of branch
- Head branches deleted automatically, so short-lived branches actually are
- The squash commit subject comes from the pull request title, which is why
  [`branch-policy.yml`](../.github/workflows/branch-policy.yml) checks it
- **Default branch `develop`**, so a new pull request is proposed against the right base and a fresh
  clone starts where the work happens

```bash
gh repo edit $REPO \
  --default-branch develop \
  --enable-squash-merge --enable-merge-commit --enable-rebase-merge=false \
  --delete-branch-on-merge
```
