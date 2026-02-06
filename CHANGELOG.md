# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.2] - 2026-02-05

### Fixed
- **HIGH**: Fixed race condition in `execute()` where failover occurring during execution could record metrics against the wrong connection (TOCTOU)
- **HIGH**: Fixed resource leak in health checks by using `AbortController` to properly cancel timed-out checks
- **HIGH**: Fixed external circuit breaker wrapper to preserve original error details instead of masking them
- **MEDIUM**: Fixed race condition in `shutdownOnSignal()` where concurrent signals could trigger multiple disconnect attempts

## [0.5.1] - 2026-02-05

### Fixed
- **CRITICAL**: Fixed unhandled promise rejection in health checks that could crash Node.js process
- **HIGH**: Fixed memory leak from accumulating signal handlers when `shutdownOnSignal()` called multiple times
- **HIGH**: Fixed EventEmitter max listeners warning when attaching many monitoring listeners
- **MEDIUM**: Added circular failover detection to prevent infinite loops in misconfigured setups
- **MEDIUM**: Validate external circuit breakers at construction time instead of first execution
- Input validation for `CircuitBreaker` config (threshold, resetTimeout, halfOpenSuccesses)
- Input validation for `parseDuration` (reject zero and extremely large durations)

### Changed
- Health checks now run in parallel for better performance (5x faster for multiple connections)
- Circuit breakers now automatically close when health recovers
- `HealthMonitor.check()` now returns `{status, error}` object instead of just status
- Signal handlers are now cleaned up automatically on `disconnect()`

### Added
- Error events now emitted when health check functions throw (for observability)
- `circuit:close` event with `reason: 'health-recovered'` when health check passes after failure

## [0.5.0] - 2026-01-31

### Added
- **Health Logic**: 
  - Support for `degraded` health status (does not trigger failover).
  - Health checks can now return `'degraded', 'healthy', 'unhealthy'` strings.

### Changed
- **Breaking**: `Orchestrator.get(name)` now throws `Error` if the circuit is open (previously returned `undefined`).
  - *Note*: If failover is active and healthy, `get()` returns the backup connection without throwing.
- **Failover Logic**: Degraded connections are now treated as "usable" and do not trigger failover.

## [0.4.0] - 2026-01-31

### Added
- **Developer Experience (DX)**:
  - `Orchestrator.execute(name, fn)`: Wrapper for automatic circuit breaker protection and success/failure recording.
  - `Orchestrator.getStats()`: Comprehensive stats API (health, circuit state, failure counts).
- **External Circuit Breakers**:
  - Support for `circuitBreaker.use` config option to plug in `opossum`, `cockatiel`, or custom implementations.
  - Adapter normalizes `.fire()` (opossum) and `.execute()` (cockatiel) interfaces.
- **Integration**:
  - Health check failures now automatically trigger `circuit:open` with reason `health-check-failed`.
  - Added public `CircuitBreaker.open()` method.
- **Documentation**:
  - New `docs/architecture.md`: Component diagrams and execution flows.
  - New `docs/errors.md`: Complete error catalog with solutions.
  - New External Circuit Breakers section in `docs/circuit-breaker.md`.

### Changed
- Refactored `Orchestrator` to remove redundant internal try/catch blocks (lint fix).
- Circuit breaker now syncs state with health monitor (unhealthy = open).

## [0.3.0] - 2026-01-29

### Added
- **Circuit Breaker**: New independent `CircuitBreaker` class and Orchestrator integration to prevent cascading failures.
  - Configurable `threshold`, `resetTimeout`, and `halfOpenSuccesses`.
  - Support for `circuit:open` and `circuit:close` events.
  - `execute()` wrapper for simplified usage.
- **Event Timestamps**: All emitted events (`health-check`, `failover`, `recovery`, `error`) now include ISO `timestamp`.
- **Documentation**:
  - `docs/observability.md`: Guide for Prometheus monitoring and logging.
  - `docs/middleware.md`: Examples for Express, Fastify, Koa, Hono, and NestJS.
  - `docs/circuit-breaker.md`: Comprehensive guide to circuit breaker patterns.
  - Updated `README.md` with "Before & After" comparison section.

### Fixed
- **Documentation**: Removed incorrect references to "Chained Failover" (not currently linked in implementation).

## [0.2.0] - 2026-01-28

### Added

- **Retry Policy**: Health checks now support retries before marking unhealthy
  - `healthCheck.retry.retries` - Number of retry attempts
  - `healthCheck.retry.delay` - Delay between retries (e.g., `'100ms'`)
  
- **Graceful Shutdown**: `shutdownOnSignal()` method for clean process termination
  - Handles `SIGTERM` and `SIGINT` by default
  - Customizable signals, exit code, and exit behavior
  - Returns cleanup function to remove handlers
  - Emits `shutdown` event

- **TypeScript Enhancements**
  - `RetryConfig` interface
  - `ShutdownOptions` and `ShutdownEvent` interfaces
  - Type-check script: `npm run typecheck`

- **CI Improvements**
  - Parallel jobs (quality, test-matrix, verify-package)
  - Node.js version matrix (18, 20, 22)
  - Commit linting with conventional commits
  - MongoDB service container

- **Examples**
  - E-commerce API demo with PostgreSQL + Redis + MongoDB
  - TypeScript example (`basic-usage.ts`)
  - Updated all examples to use package imports

### Changed

- Updated `docs/08-best-practices.md` with new `shutdownOnSignal()` helper

## [0.1.0] - 2026-01-28

### Added
- **Core**
  - `Orchestrator` class for managing multiple database connections
  - `Registry` class with O(1) Map-based connection storage
  - Lifecycle methods: `connect()`, `disconnect()`
  - Connection accessors: `get()`, `list()`, `has()`, `size`

- **Health Monitoring**
  - `HealthMonitor` with periodic health checks
  - Configurable check intervals and timeouts
  - Custom health check functions per connection
  - Health status tracking: `healthy`, `degraded`, `unhealthy`
  - `health()` method for status dashboard

- **Failover**
  - `FailoverRouter` with health-based routing
  - Automatic failover to backup connections
  - Recovery detection when primary becomes healthy
  - `failover` and `recovery` events

- **Events**
  - `connected` / `disconnected` events
  - `health:changed` event for status transitions
  - `failover` / `recovery` events

- **TypeScript**
  - Full type definitions with generics
  - Type-safe event emitter overloads
  - Generic `Orchestrator<TConnections>` for typed access

- **Documentation**
  - Comprehensive README with API reference
  - 7 detailed guides in `docs/` folder
  - MIT License

[Unreleased]: https://github.com/sathvikc/omni-db/compare/v0.5.2...HEAD
[0.5.2]: https://github.com/sathvikc/omni-db/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/sathvikc/omni-db/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/sathvikc/omni-db/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/sathvikc/omni-db/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/sathvikc/omni-db/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/sathvikc/omni-db/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/sathvikc/omni-db/releases/tag/v0.1.0
