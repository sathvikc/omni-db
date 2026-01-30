# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[Unreleased]: https://github.com/sathvikc/omni-db/compare/v0.3.0...HEAD 
[0.3.0]: https://github.com/sathvikc/omni-db/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/sathvikc/omni-db/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/sathvikc/omni-db/releases/tag/v0.1.0
