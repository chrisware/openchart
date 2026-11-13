# Git workflow

`main` mirrors upstream `origin/main`. Fast-forward it only; never merge local
features into it on the fork.

`integration/local-work` combines every local feature for development and
deployment. Push it to the fork, but never open a PR from it.

Each feature or fix lives on its own branch based on `origin/main`, with one
logical change per branch. Open PRs inside the fork first:

```bash
gh pr create --repo chrisware/openchart --base main --head <branch>
```

To submit upstream later, sync the fork `main`, rebase the feature branch onto
`origin/main`, push it to the fork, then open a cross-repository PR:

```bash
gh pr create --repo longsurf-ai/openchart --base main --head chrisware:<branch>
```

Never push to `origin` unless explicitly requested. Stacked branches name their
dependency branch as the PR base; retarget them after the dependency merges.

## Worktrees

Keep the repository root checked out on `integration/local-work`; that worktree
owns the running desktop app and local deployment.

Create one worktree per active feature branch:

```bash
git worktree add ../openchart-worktrees/hosted-providers feat/hosted-api-providers
cd ../openchart-worktrees/hosted-providers
bun install
```

Feature worktrees are for editing, tests, and typechecks. Do not run a second
desktop instance from them; ports, profiles, and `.artifacts` are shared.
Commit and push from the feature worktree, then merge the branch into the
integration worktree and verify the combined desktop there.

At the start of a session, run `git worktree list` and confirm the branch and
the PR it belongs to. Never make feature edits directly in the integration
worktree. For stacked work, merge the dependency branch into integration first.
