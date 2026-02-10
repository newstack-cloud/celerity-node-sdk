# Contributing

## Prerequisites

- Node.js >= 22
- pnpm >= 9

## Getting Started

```bash
# Clone the repository
git clone git@github.com:newstack-cloud/celerity-node-sdk.git
cd celerity-node-sdk

# Install dependencies
pnpm install

# Set up git hooks for conventional commits
git config core.hooksPath .githooks

# Build all packages
pnpm run build

# Run unit tests
pnpm run test:unit:no-cov
```

## Development

```bash
# Type checking across all packages
pnpm run typecheck

# Run tests in watch mode
pnpm test

# Lint
pnpm run lint

# Format
pnpm run format

# Clean build artifacts
pnpm run clean
```

## Managing Dependencies

Use `--filter` to target a specific package:

```bash
# Add a runtime dependency to a package
pnpm --filter @celerity-sdk/core add reflect-metadata

# Add a dev dependency to a package
pnpm --filter @celerity-sdk/core add -D @swc/core

# Remove a dependency from a package
pnpm --filter @celerity-sdk/core remove @swc/core

# Add a workspace dependency (reference another package in the monorepo)
pnpm --filter @celerity-sdk/core add @celerity-sdk/types@workspace:*

# Run a script in a specific package
pnpm --filter @celerity-sdk/core run build
pnpm --filter @celerity-sdk/core run test
```

## Testing

All tests run globally across all packages via the root Vitest workspace. Coverage is included by default; use `:no-cov` variants to skip it.

```bash
# Unit tests with coverage (no Docker needed)
pnpm run test:unit

# Unit tests without coverage
pnpm run test:unit:no-cov

# Integration tests only with coverage (manages Docker lifecycle)
pnpm run test:integration

# Integration tests only without coverage (manages Docker lifecycle)
pnpm run test:integration:no-cov

# All tests with coverage (manages Docker lifecycle)
pnpm run test:all

# All tests without coverage (manages Docker lifecycle)
pnpm run test:all:no-cov

# Watch mode (unit tests only, no coverage)
pnpm test
```

All Docker-dependent commands (`test:integration`, `test:all` and their `:no-cov` variants) handle the full Docker Compose lifecycle automatically — starting services, running tests, and tearing down — so you never need to manage Docker manually.

You can pass filename patterns to target specific tests:

```bash
# Run only config package tests
pnpm run test:unit:no-cov config

# Run a specific test file
pnpm run test:unit:no-cov local-backend

# Run integration tests for a specific package
pnpm run test:integration:no-cov config
```

To manage Docker services manually for iterative development:

```bash
# Start services in the background
docker compose up -d --wait

# Run integration tests directly (services already running)
VITEST_INCLUDE_INTEGRATION=true vitest run tests/integration

# Stop services
docker compose down -v
```

### Adding Integration Tests to a Package

1. Create `tests/integration/` with test files and a `global-setup.ts` that seeds/tears down test data
2. Update the package's `vitest.config.ts` to conditionally include integration tests based on `VITEST_INCLUDE_INTEGRATION` env var:
   - When `true`: add `globalSetup`, `testTimeout`, `hookTimeout`, and service `env` vars
   - When `false` (default): add `exclude: ["tests/integration/**", "node_modules/**"]`
   - See `packages/config/vitest.config.ts` for the reference implementation

## Conventional Commits

This project uses [conventional commits](https://www.conventionalcommits.org/) enforced by commitlint.

Format: `type(scope): description`

**Types**: `feat`, `fix`, `build`, `revert`, `wip`, `chore`, `ci`, `docs`, `style`, `refactor`, `perf`, `test`, `instr`

**Scopes**: `types`, `config`, `core`, `bucket`, `queue`, `topic`, `datastore`, `sql-database`, `cache`, `cli`, `common`, `telemetry`

Examples:
```
feat(core): add HTTP handler decorator support
fix(bucket): resolve S3 client configuration issue
chore: update TypeScript to 5.8
```
