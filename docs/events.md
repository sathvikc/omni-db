# Events

Complete reference for all events emitted by the Orchestrator.

## Overview

OmniDB uses Node.js EventEmitter to notify your application about connection lifecycle, health changes, and failover events.

```javascript
db.on('eventName', (payload) => {
  // Handle event
});
```

## Connection Events

### connected

Emitted for each connection when `connect()` is called.

```javascript
db.on('connected', ({ name, timestamp }) => {
  console.log(`✓ ${name} ready at ${new Date(timestamp).toISOString()}`);
});

await db.connect();
// Output:
// ✓ primary ready at 2026-02-05T10:30:00.000Z
// ✓ replica ready at 2026-02-05T10:30:00.001Z
// ✓ cache ready at 2026-02-05T10:30:00.002Z
```

**Payload:**

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | Connection name |
| `timestamp` | `number` | Unix timestamp (ms) |

### disconnected

Emitted for each connection when `disconnect()` is called.

```javascript
db.on('disconnected', ({ name, timestamp }) => {
  console.log(`✗ ${name} closed`);
});

await db.disconnect();
// Output:
// ✗ primary closed
// ✗ replica closed
// ✗ cache closed
```

**Payload:**

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | Connection name |
| `timestamp` | `number` | Unix timestamp (ms) |

## Health Events

### health:changed

Emitted when a connection's health status changes.

```javascript
db.on('health:changed', ({ name, previous, current }) => {
  console.log(`${name}: ${previous} → ${current}`);
  
  if (current === 'unhealthy') {
    alerting.notify(`${name} is down!`);
  }
  
  if (previous === 'unhealthy' && current === 'healthy') {
    alerting.resolve(`${name} recovered`);
  }
});
```

**Payload:**

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | Connection name |
| `previous` | `HealthStatus` | Previous status |
| `current` | `HealthStatus` | New status |
| `timestamp` | `number` | Unix timestamp (ms) |

**HealthStatus:** `'healthy'` | `'degraded'` | `'unhealthy'`

## Circuit Breaker Events

### circuit:open

Emitted when a circuit breaker opens (too many failures or health check failed).

```javascript
db.on('circuit:open', ({ name, reason, timestamp }) => {
  console.log(`⚡ ${name} circuit opened: ${reason || 'failures threshold reached'}`);
});
```

**Payload:**

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | Connection name |
| `reason` | `string?` | Reason for opening (e.g., `'health-check-failed'`) |
| `timestamp` | `number` | Unix timestamp (ms) |

### circuit:close

Emitted when a circuit breaker closes (service recovered).

```javascript
db.on('circuit:close', ({ name, reason, timestamp }) => {
  console.log(`✓ ${name} circuit closed: ${reason || 'recovery successful'}`);
});
```

**Payload:**

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | Connection name |
| `reason` | `string?` | Reason for closing (e.g., `'health-recovered'`) |
| `timestamp` | `number` | Unix timestamp (ms) |

## Failover Events

### failover

Emitted when routing switches from primary to backup.

```javascript
db.on('failover', ({ primary, backup }) => {
  console.log(`⚠️ ${primary} failed, using ${backup}`);
  
  metrics.increment('db.failover', {
    primary,
    backup,
  });
});
```

**Payload:**

| Property | Type | Description |
|----------|------|-------------|
| `primary` | `string` | Primary connection that failed |
| `backup` | `string` | Backup connection now active |
| `timestamp` | `number` | Unix timestamp (ms) |

### recovery

Emitted when routing reverts from backup to primary.

```javascript
db.on('recovery', ({ primary, backup }) => {
  console.log(`✓ ${primary} recovered, was using ${backup}`);
});
```

**Payload:**

| Property | Type | Description |
|----------|------|-------------|
| `primary` | `string` | Primary connection that recovered |
| `backup` | `string` | Backup that was being used |
| `timestamp` | `number` | Unix timestamp (ms) |

## Shutdown Event

### shutdown

Emitted when a shutdown signal is received (via `shutdownOnSignal()`).

```javascript
db.on('shutdown', ({ signal, timestamp }) => {
  console.log(`Shutting down due to ${signal}`);
});
```

**Payload:**

| Property | Type | Description |
|----------|------|-------------|
| `signal` | `string` | Signal received (e.g., `'SIGTERM'`) |
| `timestamp` | `number` | Unix timestamp (ms) |

## Error Event

### error

Emitted when an error occurs during health checks or other operations.

```javascript
db.on('error', ({ name, error, context, message, timestamp }) => {
  logger.error(`Error in ${context} for ${name}: ${message}`, { error });
});
```

**Payload:**

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | Connection name |
| `error` | `Error` | The error object |
| `context` | `string` | Where the error occurred (e.g., `'health-check'`) |
| `message` | `string` | Error message |
| `timestamp` | `number` | Unix timestamp (ms) |

## Event Methods

OmniDB extends `EventEmitter`, so all standard methods are available:

```javascript
// Add listener
db.on('connected', handler);
db.addListener('connected', handler);

// Add one-time listener
db.once('connected', handler);

// Remove listener
db.off('connected', handler);
db.removeListener('connected', handler);

// Remove all listeners
db.removeAllListeners('connected');
db.removeAllListeners();  // All events
```

## Complete Example

```javascript
function setupEventHandlers(db) {
  // Logging
  db.on('connected', ({ name }) => {
    logger.info(`Database connected: ${name}`);
  });

  db.on('disconnected', ({ name }) => {
    logger.info(`Database disconnected: ${name}`);
  });

  // Error handling
  db.on('error', ({ name, context, message }) => {
    logger.error(`Error in ${context} for ${name}: ${message}`);
  });

  // Monitoring
  db.on('health:changed', ({ name, previous, current }) => {
    metrics.gauge('db.health', current === 'healthy' ? 1 : 0, {
      connection: name,
    });

    logger.warn(`Health change: ${name} ${previous} → ${current}`);
  });

  // Circuit breaker
  db.on('circuit:open', ({ name, reason }) => {
    metrics.increment('db.circuit.open', { connection: name, reason });
  });

  db.on('circuit:close', ({ name }) => {
    metrics.increment('db.circuit.close', { connection: name });
  });

  // Alerting
  db.on('failover', ({ primary, backup }) => {
    pagerduty.trigger({
      title: `Database Failover: ${primary}`,
      severity: 'high',
      details: { primary, backup },
    });
  });

  db.on('recovery', ({ primary, backup }) => {
    pagerduty.resolve(`Database Failover: ${primary}`);
    logger.info(`Recovered: ${primary}`);
  });

  // Shutdown
  db.on('shutdown', ({ signal }) => {
    logger.info(`Graceful shutdown initiated by ${signal}`);
  });
}
```

## TypeScript Event Types

Type-safe event handling with TypeScript:

```typescript
import type {
  FailoverEvent,
  RecoveryEvent,
  HealthChangedEvent,
  ErrorEvent,
  ShutdownEvent,
  CircuitEvent
} from 'omni-db';

db.on('failover', (event: FailoverEvent) => {
  console.log(event.primary, event.backup, event.timestamp);
});

db.on('health:changed', (event: HealthChangedEvent) => {
  console.log(event.name, event.previous, event.current);
});

db.on('error', (event: ErrorEvent) => {
  console.log(event.name, event.context, event.message);
});

db.on('circuit:open', (event: CircuitEvent & { reason?: string }) => {
  console.log(event.name, event.reason);
});
```

---

[← Previous: Circuit Breaker](./circuit-breaker.md) | [Next: Observability →](./observability.md)
