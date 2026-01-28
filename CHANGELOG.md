# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

## [0.0.0] - 2026-01-28

Initial development release. Not yet published to npm.

[Unreleased]: https://github.com/sathvikc/omni-db/compare/v0.0.0...HEAD
[0.0.0]: https://github.com/sathvikc/omni-db/releases/tag/v0.0.0
