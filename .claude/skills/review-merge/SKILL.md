---
name: review-merge
description: |
  Runs a full code review on all work in the current branch/worktree, fixes every issue
  found, then merges cleanly to master. Use this whenever the user says "spin a review
  agent", "review your work", "review and merge", "did you spin a review agent?",
  or any variation of "review my branch and merge". Also invoke this proactively when
  you've finished implementing a feature and are ready to integrate back to master — do
  not wait to be asked. If the user says "merge to master" without explicitly saying to
  skip review, run this skill, not a bare merge.
---

# Review and Merge

You are running a complete code review + merge workflow. This is a strict sequence — do
not skip or reorder steps, and do not declare "done" until the final git merge succeeds.

## The Sequence

### 1. Identify what you're reviewing

Establish your current context:

```bash
git branch --show-current          # confirm branch name
git log master..HEAD --oneline     # commits that will be reviewed
git diff master --stat             # files changed vs master
```

If you're in a worktree, confirm the worktree path and which branch it tracks.

### 2. Spin a code-reviewer subagent

Spawn the `feature-dev:code-reviewer` subagent (or `superpowers:code-reviewer`) with:

- The diff vs master as context (`git diff master`)
- The list of files modified
- Instruction to flag: critical bugs, logic errors, security issues, type errors,
  test gaps, and violations of project conventions in `CLAUDE.md`

Wait for the reviewer to return its findings before continuing.

### 3. Fix every issue found

Work through the reviewer's feedback in priority order:

- **Critical / security** — fix immediately, no exceptions
- **Important / should fix** — fix all of these too
- **Minor / nitpick** — use judgment; fix if quick, note if not

For each fix: make the change, then run the relevant test to confirm it didn't break
anything. Don't batch all fixes and test at the end — test incrementally.

If a finding seems wrong or unclear, reason through it explicitly before skipping it.
Skipping requires justification, not just silence.

### 4. Sync with master

Pull the latest master changes into your branch before merging:

```bash
git fetch origin master
git merge origin/master --no-edit
```

If there are conflicts:
1. Resolve each one carefully — don't just take "ours" or "theirs" blindly
2. After resolving, run tests on the affected files
3. Stage the resolved files and complete the merge commit

If the branch diverged significantly, rebase may be cleaner than merge — use judgment.

**Always sync `.git/hooks`** after pulling master, since hook changes are common:

```bash
cp .git/hooks/* "$(git rev-parse --git-common-dir)/hooks/" 2>/dev/null || true
```

### 5. Run quality gates

```bash
./scripts/check.sh all
```

If check.sh isn't available, run the stack manually:
- Backend: `ruff check app/ && black --check app/ && mypy app/ && pytest --cov=app`
- Frontend: `npm run lint && npx tsc --noEmit && npx vitest --coverage && npm run build`

**Do not proceed to merge if any check fails.** Fix the failure, then re-run from step 5.

### 6. Merge to master

```bash
git checkout master
git pull origin master              # one more pull to be safe
git merge <your-branch> --no-ff -m "Merge <branch>: <short description>"
git push origin master
```

Use `--no-ff` to preserve the branch history in the merge commit.

### 7. Report

Tell the user:
- What the reviewer flagged (summary)
- What you fixed
- Any findings you skipped and why
- The merge commit hash

---

## Common failure modes

**Review agent finds nothing suspicious** — double-check that it actually diffed against
master and didn't review only staged changes or the last commit.

**Merge conflicts in generated files** — `frontend/src/generated/tokens.css` and
`backend/app/services/email/tokens.py` are generated from `design-tokens.json`. If both
branches touched them, regenerate from the source: `cd frontend && npm run tokens`.

**Quality gate fails after merge sync** — this usually means the conflict resolution
broke something. Re-run the affected test file directly to isolate the failure before
running the full suite again.

**Pre-commit hook rejects the merge commit** — fix the issue the hook reports. Do not
use `--no-verify`. The hook is there for a reason.
