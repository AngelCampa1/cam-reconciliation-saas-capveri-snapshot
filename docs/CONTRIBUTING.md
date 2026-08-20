# Contributing to CapVeri

Thank you for your interest in contributing to CapVeri! This document provides guidelines for contributing to the project.

## Table of Contents
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Before Committing](#before-committing)
- [Commit Message Format](#commit-message-format)
- [Testing Requirements](#testing-requirements)
- [Code Review Process](#code-review-process)

## Getting Started

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd capveri
   ```

2. **Read the project documentation**
   - [CLAUDE.md](../CLAUDE.md) - Complete development guidelines
   - [Architecture.md](./Architecture%20for%20CapVeri.md) - System architecture
   - [Story Tracker](./stories/STORY_TRACKER.md) - Current development tasks

3. **Set up your environment**
   - Backend: Python 3.11+, PostgreSQL (via Supabase)
   - Frontend: Node.js 18+, npm

4. **Install dependencies**
   ```bash
   # Backend
   cd backend
   pip install -e ".[dev]"

   # Frontend
   cd frontend
   npm install
   ```

5. **Install pre-commit hooks**
   ```bash
   pre-commit install
   ```

## Development Workflow

### 1. Choose a Task
- Check [Story Tracker](./stories/STORY_TRACKER.md) for pending stories
- Verify all dependencies are completed
- Mark the story as `in-progress` when you start

### 2. Create a Branch (Optional)
```bash
git checkout -b feature/story-XX.YY
```

### 3. Implement the Feature
- Follow TDD principles (write tests first!)
- Follow code standards in [CLAUDE.md](../CLAUDE.md)
- No placeholder code (`TODO`, `pass`, `NotImplementedError`)
- No excessive mocking in tests

### 4. Run Tests
```bash
# Backend
cd backend
pytest --cov=app --cov-fail-under=95

# Frontend
cd frontend
npm test
npm run typecheck
```

## Before Committing

**CRITICAL**: Always format and lint your code before committing!

### Quick Fix (Recommended)
```bash
# Unix/Mac
./scripts/pre-commit-fix.sh

# Windows
.\scripts\pre-commit-fix.bat
```

### Manual Fix
```bash
# Backend
cd backend
python -m black app tests
python -m isort app tests --profile black
python -m ruff check app tests --fix

# Frontend
cd frontend
npm run format
npm run lint:fix
```

### Test Pre-Commit Hooks (Optional)
```bash
pre-commit run --all-files
```

## Commit Message Format

Use [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `test`: Test additions or changes
- `refactor`: Code refactoring
- `chore`: Build/tooling changes

### Examples
```bash
feat(api): Add rate limiting to auth endpoints

- Add rate limiter with Redis backend
- Configure 5 attempts per 15 minutes
- Add rate limit reset endpoint for testing

Story: 12.3

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

```bash
fix(frontend): Fix mobile navigation z-index issue

Fixes bottom nav overlapping with modals on mobile devices.

Fix: #123
```

## Testing Requirements

### Minimum Coverage
- **Backend**: 95%+ line coverage
- **Frontend**: Best effort (focus on critical paths)

### Test Types Required
1. **Unit Tests**: Test individual functions with real logic
2. **Integration Tests**: Test components working together
3. **E2E Tests**: Test full user workflows (Playwright)

### What to Test
- All business logic functions
- All API endpoints
- Critical UI components
- User workflows

### What NOT to Test
- Framework internals
- Third-party libraries
- Trivial getters/setters

### Testing Anti-Patterns to Avoid
- Mocking the function being tested
- Mocking all dependencies (test real logic!)
- Tests with no assertions
- Tests that always pass

See [CLAUDE.md § PROHIBITED BEHAVIORS](../CLAUDE.md#prohibited-behaviors-read-this-carefully) for detailed guidelines.

## Code Review Process

### Before Submitting a PR
- [ ] All tests pass locally
- [ ] Code is formatted and linted
- [ ] Test coverage maintained (95%+)
- [ ] No placeholder code remains
- [ ] Documentation updated if needed
- [ ] Story updated to `completed` status

### PR Checklist
1. **Title**: Use conventional commit format
2. **Description**: Explain what changed and why
3. **Story Reference**: Link to story file (if applicable)
4. **Screenshots**: Include for UI changes
5. **Testing**: Describe how you tested the changes

### Review Guidelines
- Reviewers check for logic errors, security issues, and code quality
- Address all review comments before merging
- Squash commits if requested

## Common Issues

### Pre-Commit Hooks Failing
If pre-commit hooks fail:
1. Read the error message carefully
2. Run the formatters: `./scripts/pre-commit-fix.sh`
3. Re-stage files: `git add .`
4. Try committing again

### Tests Failing
If tests fail:
1. Run tests locally to reproduce
2. Check for actual bugs (not test issues)
3. Fix the code, not the tests
4. Ensure tests use real logic, not mocks

### Coverage Dropping
If coverage drops below 95%:
1. Add tests for new code
2. Don't remove existing tests
3. Check `backend/coverage.json` for gaps
4. Focus on untested functions

## Getting Help

- **Documentation**: Check [CLAUDE.md](../CLAUDE.md) and project docs
- **GitHub Issues**: Search for similar issues
- **GitHub Discussions**: Ask questions in Discussions tab
- **Story Tracker**: Check story dependencies and notes

## License

By contributing to CapVeri, you agree that your contributions will be licensed under the project's license.
