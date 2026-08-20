# Story Workflow Guide

> Complete guide for managing user stories in CapVeri.
> For critical development rules, see [CLAUDE.md](../../CLAUDE.md).

---

## Story Tracker

All user stories are tracked in `docs/stories/STORY_TRACKER.md`. Agents MUST:

### Before Starting Work
1. Check the tracker for `pending` stories in [STORY_TRACKER.md](../stories/STORY_TRACKER.md)
2. Verify all dependencies are `completed`
3. Update status to `in-progress` and add your assignee identifier

### During Work
1. Reference the individual story file at `docs/stories/epic-XX/story-XX.YY.md`
2. Follow acceptance criteria exactly as written
3. Update CLAUDE.md if the story includes CLAUDE.md additions
4. Never skip test writing (see [PROHIBITED BEHAVIORS](../../CLAUDE.md#prohibited-behaviors-read-this-carefully))

### After Completing
1. Update status to `completed` in the tracker
2. Add completion notes if there are important details
3. Verify all Definition of Done items are checked
4. **Commit and push changes** with a descriptive commit message referencing the story

---

## Commit Requirements

After verifying a story is complete (all tests pass, no placeholders), agents MUST commit and push:

```bash
# Stage all changes for the story
git add .

# Commit with story reference in message
git commit -m "feat(epic-XX): Complete story XX.YY - Brief description

- Implemented [main feature]
- Added tests for [components]
- Updated [any config/docs]

Story: XX.YY"

# Push to remote
git push origin <branch-name>
```

### Commit Message Format
- Use conventional commits: `feat`, `fix`, `test`, `docs`, `refactor`, `chore`
- Reference the epic and story number
- Keep first line under 72 characters
- Include bullet points for significant changes

### Example

```bash
git commit -m "feat(epic-02): Complete story 02.01 - Create core enums

- Added ExpenseType, CapType, RecoveryMethod enums
- Added comprehensive unit tests with 100% coverage
- Updated __init__.py exports

Story: 02.01"
```

**IMPORTANT**: Never push code that doesn't pass all verification checks.

---

## Story File Location

Individual story files follow this pattern:

```
docs/stories/epic-XX/story-XX.YY.md
```

### Examples
- Story 5.7 is at `docs/stories/epic-05/story-05.07-create-yardi-voyager-gl-parser.md`
- Story 12.3 is at `docs/stories/epic-12/story-12.3-placeholder-title.md`
- Story 4.5.2 is at `docs/stories/epic-04.5/story-04.5.2-set-up-openapi-typescript-codegen.md`

---

## Epic Navigation

Use the **Epic Index** for quick navigation:

- **[Epic Index](../stories/_epic-index.md)** - Complete epic overview with dependencies
- **[Story Tracker](../stories/STORY_TRACKER.md)** - Master story status tracking
- **[5-Agent Parallelization Plan](../archive/5-agent-parallelization-plan.md)** - Strategy for 5 agents working in parallel without conflicts

---

## Story Status Transitions

```
pending → in-progress → review → completed
                ↓
            blocked (with notes)
```

### Status Definitions
- `pending` - Not started, ready to be claimed
- `in-progress` - Currently being worked on by an agent
- `review` - Implementation complete, needs review
- `completed` - Done and verified (all tests passing)
- `blocked` - Cannot proceed (document reason in Notes column)

---

## Claiming Stories

### Rules for Claiming
1. Only claim stories whose dependencies are `completed`
2. One agent should work on one story at a time
3. Mark story as `in-progress` immediately when starting
4. If blocked, update status and notes, then move to another story
5. Never claim a story that's already `in-progress` by another agent

---

## Story File Format

Each story file contains:

| Section | Description |
|---------|-------------|
| Story Info | Epic name, hours estimate, dependencies, status |
| User Story | As a [role] I want [capability] so that [benefit] |
| Acceptance Criteria | Testable requirements (checkboxes) |
| Technical Specifications | Implementation details and code patterns |
| Test Cases | Required test coverage |
| Definition of Done | Completion checklist |

---

## Updating the Tracker

To update a story's status in the tracker:

1. Open `docs/stories/STORY_TRACKER.md`
2. Find your story in the epic section
3. Update the Status column (use exact status values from legend)
4. Add your identifier to Assignee column (e.g., "agent-alpha", "dev-john")
5. Add notes if blocked or if there are important details

### Example Tracker Entry

```markdown
| 5.7 | Create Generic Mapping Parser | `in-progress` | agent-alpha | Testing edge cases |
```
