# Health Monitoring

Learn how OmniDB monitors connection health and status transitions.

## Overview

OmniDB can periodically check the health of your database connections and track their status. This enables:

- Automatic failover to backup connections
- Health status dashboard via `health()`
- Event notifications when status changes

## Enabling Health Monitoring

Health monitoring starts automatically when you call `connect()` if `healthCheck` is configured:

```javascript
const db = new Orchestrator({
  connections: { primary: client },
  healthCheck: {
    interval: '30s',
  },
});

await db.connect();  // Health monitoring starts
await db.disconnect();  // Health monitoring stops
```

## Custom Health Check Functions

Define how each connection should be tested:

```javascript
healthCheck: {
  checks: {
    postgres: async (client) => {
      await client.$queryRaw`SELECT 1`;
      return true;
    },
    redis: async (client) => {
      return (await client.ping()) === 'PONG';
    },
    mysql: async (client) => {
      const [rows] = await client.execute('SELECT 1');
      return rows.length > 0;
    },
  },
}
```

### Health Check Rules

| Return/Behavior | Status |
|-----------------|--------|
| Returns `true` | healthy |
| Returns `false` | unhealthy |
| Throws error | unhealthy |
| Times out | unhealthy |
| No check defined | healthy (assumed) |

## Health Status Values

Each connection can be in one of three states:

| Status | Description |
|--------|-------------|
| `healthy` | Check passed, connection is working |
| `degraded` | Check shows warnings (partial functionality) |
| `unhealthy` | Check failed, connection is down |

## Checking Health Status

Use the `health()` method to get current status of all connections:

```javascript
const status = db.health();
console.log(status);
// {
//   primary: { status: 'healthy' },
//   replica: { status: 'healthy' },
//   cache: { status: 'degraded' }
// }
```

When a connection is in failover:

```javascript
{
  primary: { status: 'unhealthy', failoverTo: 'replica' },
  replica: { status: 'healthy' }
}
```

## Listening for Health Changes

Subscribe to health status changes:

```javascript
db.on('health:changed', ({ name, previous, current }) => {
  console.log(`${name}: ${previous} → ${current}`);
  
  if (current === 'unhealthy') {
    // Alert your monitoring system
    alerting.notify(`Database ${name} is down!`);
  }
});
```

## Timeouts

Set a maximum duration for health checks:

```javascript
healthCheck: {
  timeout: '5s',  // Checks taking >5s are marked unhealthy
}
```

This prevents slow connections from blocking the check cycle.

## Best Practices

### 1. Use Lightweight Queries

```javascript
// Good - minimal overhead
checks: {
  postgres: async (c) => {
    await c.$queryRaw`SELECT 1`;
    return true;
  },
}

// Bad - heavy operation
checks: {
  postgres: async (c) => {
    await c.$queryRaw`SELECT COUNT(*) FROM large_table`;
    return true;
  },
}
```

### 2. Set Reasonable Intervals

```javascript
// Development - faster feedback
healthCheck: { interval: '5s' }

// Production - less overhead
healthCheck: { interval: '30s' }
```

### 3. Handle Connection Pools

Many clients use connection pools. Test the actual connection:

```javascript
checks: {
  pg: async (pool) => {
    const client = await pool.connect();
    try {
      await client.query('SELECT 1');
      return true;
    } finally {
      client.release();
    }
  },
}
```

---

[← Previous: Architecture](./architecture.md) | [Next: Failover →](./failover.md)
