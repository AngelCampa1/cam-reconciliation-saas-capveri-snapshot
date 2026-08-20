# Story 25.5: Clean Git History of Credential Files

**Epic**: 25 - Production Readiness & Polish
**Estimated Hours**: 30 minutes
**Dependencies**: None
**Status**: `pending`
**Priority**: P3

---

## User Story

As a **security-conscious developer**, I want **credential files removed from git history** so that **we can safely open-source the repository without leaking secrets**.

---

## Acceptance Criteria

- [ ] `test-login.json` removed from git history
- [ ] `test-token.txt` removed from git history
- [ ] `.gitignore` updated to prevent future commits
- [ ] All team members notified to force-pull after history rewrite
- [ ] No broken commit references in pull requests/issues
- [ ] Repository integrity verified with `git fsck`

---

## Technical Specifications

### Current State

From Story 24.12 audit, these credential files exist in git history:
```bash
git log --all --full-history -- test-login.json
git log --all --full-history -- test-token.txt
```

**Risk**: If repository goes open-source or is shared with contractors, these credentials could be extracted from git history.

**Mitigation** (completed in Story 24.12):
- ✅ Files deleted from working directory
- ✅ Added to `.gitignore`
- ⚠️ Still in git history (this story)

### Implementation Approach

**Option 1: BFG Repo-Cleaner** (Recommended - Fast & Safe)
```bash
# Install BFG
# Windows: choco install bfg
# Mac: brew install bfg
# Linux: Download JAR from https://rtyley.github.io/bfg-repo-cleaner/

# Clone fresh copy
git clone --mirror https://github.com/your-org/capveri.git capveri-mirror.git
cd capveri-mirror.git

# Remove files from history
bfg --delete-files test-login.json
bfg --delete-files test-token.txt

# Clean up
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# Push cleaned history
git push --force
```

**Option 2: git filter-branch** (Built-in but slower)
```bash
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch test-login.json test-token.txt" \
  --prune-empty --tag-name-filter cat -- --all

git reflog expire --expire=now --all
git gc --prune=now --aggressive
git push --force
```

**Option 3: git filter-repo** (Modern alternative)
```bash
# Install: pip install git-filter-repo

git filter-repo --path test-login.json --invert-paths
git filter-repo --path test-token.txt --invert-paths
git push --force
```

### Pre-Flight Checklist

**Before rewriting history**:
1. [ ] Notify all team members (history rewrite requires force-pull)
2. [ ] Backup repository: `git clone --mirror capveri.git capveri-backup.git`
3. [ ] Close all open PRs (will need to rebase after rewrite)
4. [ ] Document affected commit SHAs (for reference)
5. [ ] Verify no production systems reference old commit SHAs

**Communication template**:
```markdown
**IMPORTANT: Git History Rewrite Scheduled**

When: [Date/Time]
Why: Removing credential files from git history
Impact: All team members must force-pull after rewrite

## Actions Required:
1. Commit and push all local changes BEFORE [Date/Time]
2. After rewrite, run:
   ```bash
   git fetch origin
   git reset --hard origin/main
   ```
3. If you have local branches, rebase them:
   ```bash
   git rebase origin/main
   ```

## DO NOT:
- Push to main during the maintenance window
- Merge PRs until history rewrite is complete

Questions? Contact: [Maintainer]
```

---

## Implementation Steps

### Step 1: Backup Repository (5 min)

```bash
# Create mirror backup
git clone --mirror https://github.com/your-org/capveri.git capveri-backup.git

# Verify backup
cd capveri-backup.git
git log --oneline | head -10
```

### Step 2: Run BFG Repo-Cleaner (10 min)

```bash
# Clone fresh mirror
git clone --mirror https://github.com/your-org/capveri.git capveri-clean.git
cd capveri-clean.git

# Remove credential files
bfg --delete-files test-login.json
bfg --delete-files test-token.txt

# Clean up unreachable objects
git reflog expire --expire=now --all
git gc --prune=now --aggressive
```

### Step 3: Verify Cleanup (5 min)

```bash
# Verify files removed from history
git log --all --full-history -- test-login.json
# Should return nothing

git log --all --full-history -- test-token.txt
# Should return nothing

# Verify repository integrity
git fsck --full
# Should show no errors

# Check repository size
du -sh .
# Should be smaller than before
```

### Step 4: Force Push (5 min)

```bash
# Push cleaned history
git push --force

# Verify remote
git clone https://github.com/your-org/capveri.git verify-clean
cd verify-clean
git log --all --full-history -- test-login.json
# Should return nothing
```

### Step 5: Team Notification (5 min)

Send notification to team:
```
✅ Git history rewrite complete!

All credential files removed from history.

ACTION REQUIRED:
1. Save your work
2. Run: git fetch origin
3. Run: git reset --hard origin/main

Open PRs will need to be rebased. Contact me if you need help.
```

---

## Test Cases

### Manual Verification

```bash
# Test 1: Files not in history
git log --all --full-history -- test-login.json
# Expected: (no output)

# Test 2: Files not in working directory
ls -la test-login.json test-token.txt
# Expected: No such file or directory

# Test 3: Files in .gitignore
grep "test-login.json" .gitignore
grep "test-token.txt" .gitignore
# Expected: Both found in .gitignore

# Test 4: Repository integrity
git fsck --full
# Expected: No errors

# Test 5: Commit history intact
git log --oneline | wc -l
# Expected: Same number of commits (or fewer if empty commits removed)
```

### Automated Verification

Create `scripts/verify-no-credentials.sh`:
```bash
#!/bin/bash
set -e

echo "Checking for credential files in git history..."

FILES=("test-login.json" "test-token.txt")

for file in "${FILES[@]}"; do
  if git log --all --full-history -- "$file" | grep -q "commit"; then
    echo "❌ FAIL: $file found in git history"
    exit 1
  else
    echo "✅ PASS: $file not in git history"
  fi
done

echo "✅ All credential files removed from history"
```

---

## Definition of Done

- [ ] BFG Repo-Cleaner (or equivalent) executed successfully
- [ ] `test-login.json` removed from all commits
- [ ] `test-token.txt` removed from all commits
- [ ] Repository integrity verified (`git fsck` passes)
- [ ] Force push completed
- [ ] Team notified and force-pulled successfully
- [ ] Verification script passes
- [ ] `.gitignore` prevents future re-addition
- [ ] Story marked as `completed` in STORY_TRACKER.md

---

## Rollback Plan

If history rewrite causes issues:

```bash
# Restore from backup
cd capveri-backup.git
git push --mirror https://github.com/your-org/capveri.git

# Notify team
echo "History rewrite rolled back. Git pull to restore."
```

---

## Important Notes

### When to Execute This Story

**Execute ONLY if**:
- Planning to open-source the repository
- Sharing repository with external contractors
- Security audit requires credential removal
- Preparing for compliance certification

**Skip if**:
- Repository remains private indefinitely
- Credentials in history are already rotated/expired
- Team prefers to create fresh repository instead

### Alternative: Create Fresh Repository

Instead of rewriting history, consider:
```bash
# Export clean codebase without history
git archive --format=tar --prefix=capveri/ HEAD | gzip > capveri-clean.tar.gz

# Create new repository
mkdir capveri-new
cd capveri-new
git init
tar -xzf ../capveri-clean.tar.gz --strip-components=1
git add .
git commit -m "Initial commit (clean history)"
git remote add origin https://github.com/your-org/capveri-new.git
git push -u origin main
```

**Pros**: No force push, clean slate
**Cons**: Lose all commit history, issue references, PR links

---

## Resources

- [BFG Repo-Cleaner](https://rtyley.github.io/bfg-repo-cleaner/)
- [git-filter-repo Documentation](https://github.com/newren/git-filter-repo)
- [GitHub: Removing sensitive data](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)
- [Atlassian: Git history rewrite](https://www.atlassian.com/git/tutorials/rewriting-history)
