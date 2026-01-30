# Failover

Learn how OmniDB automatically routes to backup connections when primaries fail.

## Overview

Failover allows your application to continue working when a primary database becomes unavailable. OmniDB automatically routes requests to a backup connection and notifies you via events.

## Configuring Failover

Map primary connections to their backups:

```javascript
const db = new Orchestrator({
  connections: {
    primary: primaryClient,
    replica: replicaClient,
  },
  failover: {
    primary: 'replica',  // When primary fails, use replica
  },
  healthCheck: {
    interval: '10s',
    checks: {
      primary: async (c) => c.ping(),
      replica: async (c) => c.ping(),
    },
  },
});
```

## How Failover Works

1. **Health Check Fails** — Primary is marked `unhealthy`
2. **get() Called** — Application requests the primary
3. **Route to Backup** — OmniDB returns the replica instead
4. **Failover Event** — Event emitted for monitoring
5. **Recovery** — When primary is healthy again, routing reverts

```
┌─────────────┐         ┌─────────────┐
│   Primary   │ ──×──>  │   Backup    │
│  (unhealthy) │         │  (healthy)  │
└─────────────┘         └─────────────┘
        │                      │
        │    Failover!         │
        └──────────────────────┘
```

## Automatic Routing

When failover is active, `get()` returns the backup transparently:

```javascript
// Primary is unhealthy, this returns replica
const client = db.get('primary');

// Your code doesn't need to change
await client.query('SELECT * FROM users');
```

## Failover Events

### failover

Emitted when routing switches to a backup:

```javascript
db.on('failover', ({ primary, backup }) => {
  console.log(`⚠️ Switched from ${primary} to ${backup}`);
  
  // Notify your team
  slack.send(`Database failover: ${primary} → ${backup}`);
});
```

### recovery

Emitted when routing reverts to the primary:

```javascript
db.on('recovery', ({ primary, backup }) => {
  console.log(`✓ Recovered ${primary}, was using ${backup}`);
  
  slack.send(`Database recovered: ${primary}`);
});
```

## Checking Failover Status

Use `health()` to see current failover state:

```javascript
const status = db.health();

if (status.primary.failoverTo) {
  console.log(`Primary is down, using ${status.primary.failoverTo}`);
}
```

## Chained Failover

Backups can have their own backups:

```javascript
failover: {
  'us-west': 'us-east',
  'us-east': 'eu-west',
}
```

If `us-west` fails, routes to `us-east`. If `us-east` also fails, routes to `eu-west`.

## Failover Conditions

Failover triggers when:

| Primary Status | Backup Status | Result |
|----------------|---------------|--------|
| unhealthy | healthy | Route to backup |
| unhealthy | degraded | Route to backup |
| unhealthy | unhealthy | Stay on primary |
| degraded | healthy | Route to backup |
| healthy | any | Stay on primary |

## Example: Multi-Region Setup

```javascript
const db = new Orchestrator({
  connections: {
    'us-west-primary': usWestPrimary,
    'us-west-replica': usWestReplica,
    'us-east-primary': usEastPrimary,
  },
  failover: {
    'us-west-primary': 'us-west-replica',
    'us-west-replica': 'us-east-primary',
  },
  healthCheck: {
    interval: '15s',
    timeout: '3s',
    checks: {
      'us-west-primary': async (c) => c.ping(),
      'us-west-replica': async (c) => c.ping(),
      'us-east-primary': async (c) => c.ping(),
    },
  },
});

db.on('failover', ({ primary, backup }) => {
  metrics.increment('database.failover', { primary, backup });
});
```

## Best Practices

### 1. Always Configure Health Checks

Failover requires health monitoring to detect failures:

```javascript
// Won't work - no health checks
failover: { primary: 'replica' }

// Works - health checks configured
failover: { primary: 'replica' },
healthCheck: {
  checks: {
    primary: async (c) => c.ping(),
  },
}
```

### 2. Test Failover Regularly

Simulate failures in staging to verify your setup works.

### 3. Monitor Failover Events

Set up alerts when failover occurs:

```javascript
db.on('failover', ({ primary }) => {
  pagerduty.alert(`Database ${primary} failed over`);
});
```

---

[← Previous: Health Monitoring](./health-monitoring.md) | [Next: Events →](./events.md)
