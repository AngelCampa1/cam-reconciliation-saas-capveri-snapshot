---
name: sync-master
description: |
  Pulls the latest master changes into the current branch/worktree, resolves conflicts,
  re-syncs hooks, and verifies the integration is clean. Use this whenever the user says
  "pull master changes", "merge latest master into your branch", "sync with master",
  "pull latest and wire it up", or "make sure you have the latest". Also invoke this
  automatically at the start of a review-merge, before submitting any PR, or after
  another agent has merged to master while you were working. If you've been on a branch
  for more than a day and haven't pulled master, run this proactively before merging.
---

# Sync with Master

Pull the latest master changes into your current working branch, resolve anything that
conflicts, and make sure your work is still coherent with the rest of the system.

## Steps

### 1. Check your current state

Before pulling anything, know what you have:

```bash
git status --short                  # any uncommitted changes?
git log master..HEAD --oneline      # your commits not yet on master
git log HEAD..origin/master --oneline  # master commits you're missing
```

If you have uncommitted changes, stash them first:

```bash
git stash push -m "wip: sync-master stash"
```

### 2. Fetch and merge master

```bash
git fetch origin master
git merge origin/master --no-edit
```

Prefer merge over rebase for worktrees — rebasing rewrites commit hashes, which causes
problems if another agent or CI already has a reference to your commits.

**If you get conflicts:**

1. Open each conflicted file and resolve carefully
2. Understand what both sides were trying to do before picking a resolution
3. For generated files (`tokens.css`, `tokens.py`) — regenerate from source:
   ```bash
   cd frontend && npm run tokens
   ```
4. For migration files — do not auto-merge; inspect manually and confirm the schema
   state is correct
5. Stage resolved files: `git add <file>` — then `git merge --continue`

### 3. Re-sync git hooks

Hook changes on master won't automatically apply to your worktree. Always copy after
syncing:

```bash
# Copy hooks from the main repo to this worktree
COMMON_GIT_DIR=$(git rev-parse --git-common-dir)
cp "$COMMON_GIT_DIR/hooks/"* .git/hooks/ 2>/dev/null || true
chmod +x .git/hooks/* 2>/dev/null || true
```

If that path doesn't resolve cleanly, check the hooks directly:

```bash
ls -la .git/hooks/
ls -la $(git rev-parse --git-common-dir)/hooks/
```

### 4. Restore stashed changes (if applicable)

```bash
git stash pop
```

If stash pop conflicts with the merged master changes, resolve those conflicts the same
way as step 2.

### 5. Verify the integration

Run a quick smoke check on the areas your branch touches:

```bash
# If your work is backend-only:
./scripts/check.sh backend

# If frontend-only:
./scripts/check.sh frontend

# If both:
./scripts/check.sh all
```

If check.sh isn't available, run the relevant test file(s) directly rather than the
full suite — the goal here is to catch integration breaks quickly, not full coverage.

### 6. Report

Tell the user:
- How many commits came in from master
- Whether there were any conflicts and how you resolved them
- Whether the smoke check passed
- Your branch's current status vs master

---

## When to run this automatically

- Before starting a `review-merge`
- When another agent notifies you they merged to master
- At the start of a new session on a long-running branch
- Before creating a PR or pushing to origin
- When the user pastes a merge conflict error

## What "properly wired" means

After syncing, verify that your work still connects to the rest of the system:

- **New API endpoints** — confirm the frontend is calling the right path
- **New DB tables/columns** — confirm the migration ran and models reflect the schema
- **New env variables** — confirm they're documented in `.env.example` and README
- **New shared types** — confirm both backend and frontend agree on the shape
- **Changed config** — confirm CLAUDE.md and skills are still accurate
