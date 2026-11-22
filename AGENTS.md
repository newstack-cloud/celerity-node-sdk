# Celerity Node SDK

A pnpm monorepo of the `@celerity-sdk/*` packages for building Celerity applications in Node.js.
Celerity's Node.js runtime images install them, the Celerity CLI runs the `celerity-extract`
tool from `@celerity-sdk/cli` and reads the handler manifest it writes, and celerity-docs
copies that manifest's schema.

## Workspace

This repo is one of NewStack's. NewStack's maintainers develop it alongside the others in a
shared workspace, using the NewStack Claude Code plugin for how work is planned, reviewed,
committed and coordinated across repos. The plugin isn't public, and nothing here depends on it:
this file and the repo's own docs cover what a contribution needs.

## Layout

Each package is in `packages/<name>` and published as `@celerity-sdk/<name>`.

| Package | Holds |
|---|---|
| `types`, `common` | Shared types and behavioural interfaces; shared runtime utilities. No internal dependencies |
| `config` | Configuration resolution, secret access, platform detection |
| `core` | Application factory, decorators, DI, layers, guards, handler adapters; uses the runtime binding `@celerity-sdk/runtime` |
| `bucket`, `queue`, `topic`, `datastore`, `sql-database`, `cache` | Resource abstractions, each with cloud provider SDKs as optional peer dependencies |
| `serverless-aws` | AWS Lambda adapter and event mapping |
| `telemetry` | pino logger, OpenTelemetry tracing and auto-instrumentation |
| `cli` | `celerity-extract`, which writes the handler manifest (schema in `packages/cli/schemas/`) |
| `testing` | Test harness for applications: test app, mocks, resource clients, and WebSocket testing through `@celerity-sdk/ws-client` |

`docs/design/` is gitignored: maintainers' working notes, not present in every checkout.

## Checks

Commands are in [CONTRIBUTING.md](CONTRIBUTING.md); all run across every package from the root.

- **Tools:** Node 24 (`.node-version`; `engines` requires >= 24), pnpm 9.15.4 (`packageManager`),
  docker for integration tests. Run `pnpm install` first; the git hooks need it.
- **Build first:** packages import each other through their built `dist/`, so tests and
  `typecheck` run against the last `pnpm run build`. Rebuild after changing a package that
  another one's tests or types use.
- **Tests:** `pnpm test` is Vitest in watch mode and never exits; use `pnpm run test:unit:no-cov`
  (or `test:unit` for coverage).
  - `test:integration` and `test:all` start `docker-compose.yml` (Valkey on 6399, LocalStack on
    4566, Postgres on 5499), run with `VITEST_INCLUDE_INTEGRATION=true`, and stop the stack
    with `docker compose down -v` after. The AWS suites reach only LocalStack.
  - Run one stack at a time. The compose project name is fixed (`celerity-sdk-integration`), so
    a run in another worktree shares the stack and its teardown removes it, and the ports clash
    with other stacks, such as the Go SDK's or Bluelink's LocalStack. If startup fails, the
    containers it started are left running.
- **Lint and types:** `pnpm run lint` (all of `packages/`), `pnpm run format:check` (package
  `src` only), `pnpm run build`, `pnpm run typecheck`.
- **Gates:**
  - With `git config core.hooksPath .githooks`, pre-commit runs `lint` and `format:check` over
    the repo when staged changes touch `packages/`, and commit-msg runs commitlint.
  - CI (`ci.yml`) runs format, `pnpm audit --audit-level high`, lint, build, typecheck,
    `test:all` and SonarQube on pull requests and pushes to `main`. `codeql.yml` runs CodeQL on
    the same triggers and weekly, and `security.yml` runs actionlint on pull requests.

## Compatibility

- **Package APIs:** pre-1.0; every package shares one version (release-please
  `linked-versions`), and a breaking change bumps the minor version. Resource contracts are
  kept at parity with the Go and Python SDKs; a contract change says what each other SDK needs.
- **Handler manifest and `celerity-extract`:** the Celerity CLI depends on the extractor's
  command line and on handler-manifest.v1, and the Python SDK's extractor writes the same
  format. Additive only; anything else needs a matching change in the Celerity CLI first. Every
  object in the schema sets `additionalProperties: false`, so a new field must also be declared
  in `packages/cli/schemas/handler-manifest.v1.schema.json`, or the CLI package's
  schema-validation tests reject the output.
- **Runtime binding:** `@celerity-sdk/runtime` is published from celerity's
  `libs/runtime/sdk/node`; a change there reaches this repo by version bump.
- **Persisted state:** none.

## Conventions

- Commits: conventional, with the types and scopes in `commitlint.config.js`.
- Releases: one release pull request for all packages. Merging it publishes every package to
  npm with provenance; `release-please.yml` can also publish chosen packages by hand. Don't
  edit `CHANGELOG.md` files, versions or `.release-please-manifest.json` by hand.
- Dependency updates: Renovate (`renovate.json`).
- `.npmrc` sets `auto-install-peers=false`: a package's optional cloud SDK peers aren't
  installed for it, so add one to the package's dev dependencies to test against it.
- `type` for data shapes, options and results; `interface` only for behavioural contracts
  classes implement (`CelerityLayer`, `ServerlessAdapter`).
- A layer that configures itself from environment variables reads them once, on first
  initialisation, into a typed config object, and uses only that object afterwards, never
  `process.env`.

## Safety

- Don't publish packages, create tags or releases, or merge release pull requests.

## Known mistakes

<!-- One line per mistake an agent has made here, phrased as the rule that prevents it. -->
