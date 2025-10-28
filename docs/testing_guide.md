# Testing Guide

This repository uses **Jest** and **ts-jest** for automated testing of the TypeScript codebase. Tests are located in the `tests/` directory and may be organized into subdirectories for different levels of testing.

## Test Types

### Unit Tests
- Validate individual functions or modules in isolation.
- Implemented with Jest and run quickly without external dependencies.
- Use mocks to replace network calls, file I/O, or other side effects.

### Integration Tests
- Verify that multiple modules work together as expected.
- May require lightweight test databases or local services.
- Jest is also used for integration tests; create clear setup/teardown hooks.

### End-to-End (E2E) Tests
- Simulate real user workflows across the entire system.
- Tools such as Playwright or similar frameworks can be used alongside Jest.
- Run these tests against staging environments to ensure realistic behavior.

## Running Tests
```bash
npm test
```

To collect coverage information:
```bash
npm test -- --coverage
```

The project expects a **minimum coverage of 80%** across lines, branches, functions, and statements.

## Mocks and Fixtures
- Prefer `jest.mock` or manual stubs to isolate unit tests from external systems.
- Place reusable test data or objects in `tests/fixtures` for clarity and reuse.
- Use `beforeEach`/`afterEach` hooks to reset mocks and clean up state between tests.

Keeping tests deterministic and well-isolated ensures reliable CI results and easier debugging.
