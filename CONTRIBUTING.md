# Contributing to OmniDB

Thank you for your interest in contributing to OmniDB! This document provides guidelines and instructions for contributing.

## Code of Conduct

Be respectful, inclusive, and considerate in all interactions.

## Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/omni-db.git
   cd omni-db
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Run tests to verify setup:
   ```bash
   npm test
   ```

## Development Workflow

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Code Style

```bash
# Check linting
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format
```

### Coverage Requirements

All code must maintain **100% test coverage**:
- Lines: 100%
- Functions: 100%
- Branches: 100%
- Statements: 100%

Use `/* c8 ignore next -- reason */` for defensive code that's unreachable in tests.

## Commit Messages

We follow [Angular Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): description

[optional body]
```

### Types

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation |
| `test` | Tests |
| `chore` | Maintenance |
| `refactor` | Code refactoring |

### Examples

```
feat(health): add degraded status detection
fix(failover): prevent duplicate recovery events
docs: update configuration examples
test: add edge case for empty registry
```

## Pull Request Process

1. **Create a branch** from `main`:
   ```bash
   git checkout -b feat/your-feature
   ```

2. **Make your changes** with tests

3. **Ensure all tests pass**:
   ```bash
   npm run test:coverage
   ```

4. **Commit with conventional message**

5. **Push and create PR**:
   ```bash
   git push origin feat/your-feature
   ```

6. **PR Description** should include:
   - What the change does
   - Why it's needed
   - Any breaking changes

## Project Structure

```
omni-db/
├── src/
│   ├── index.js          # Package exports
│   ├── registry.js       # Connection registry
│   ├── orchestrator.js   # Main orchestrator
│   ├── health-monitor.js # Health checking
│   └── failover-router.js # Failover routing
├── tests/                 # Test files
├── types/                 # TypeScript definitions
└── docs/                  # Documentation
```

## Design Principles

1. **Stay Thin** — OmniDB orchestrates, doesn't abstract
2. **Zero Dependencies** — No runtime dependencies
3. **100% Coverage** — All code is tested
4. **Type-Safe** — Full TypeScript support
5. **Event-Driven** — Notify, don't block

## Questions?

Open an issue for questions or discussion.
