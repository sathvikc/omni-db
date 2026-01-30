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
db.on('connected', (name) => {
  console.log(`✓ ${name} ready`);
});

await db.connect();
// Output:
// ✓ primary ready
// ✓ replica ready
// ✓ cache ready
```

**Payload:** `string` — Connection name

### disconnected

Emitted for each connection when `disconnect()` is called.

```javascript
db.on('disconnected', (name) => {
  console.log(`✗ ${name} closed`);
});

await db.disconnect();
// Output:
// ✗ primary closed
// ✗ replica closed
// ✗ cache closed
```

**Payload:** `string` — Connection name

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

**HealthStatus:** `'healthy'` | `'degraded'` | `'unhealthy'`

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
  db.on('connected', (name) => {
    logger.info(`Database connected: ${name}`);
  });
  
  db.on('disconnected', (name) => {
    logger.info(`Database disconnected: ${name}`);
  });
  
  // Monitoring
  db.on('health:changed', ({ name, previous, current }) => {
    metrics.gauge('db.health', current === 'healthy' ? 1 : 0, {
      connection: name,
    });
    
    logger.warn(`Health change: ${name} ${previous} → ${current}`);
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
}
```

## TypeScript Event Types

Type-safe event handling with TypeScript:

```typescript
import type { FailoverEvent, RecoveryEvent, HealthChangedEvent } from 'omni-db';

db.on('failover', (event: FailoverEvent) => {
  console.log(event.primary, event.backup);
});

db.on('health:changed', (event: HealthChangedEvent) => {
  console.log(event.name, event.previous, event.current);
});
```

---

[← Previous: Failover](./failover.md) | [Next: Observability →](./observability.md)
