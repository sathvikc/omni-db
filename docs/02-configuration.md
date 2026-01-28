# Configuration

Complete reference for all OmniDB configuration options.

## Configuration Object

```javascript
const db = new Orchestrator({
  connections: { ... },   // Required: your database clients
  failover: { ... },      // Optional: failover mappings
  healthCheck: { ... },   // Optional: health monitoring config
});
```

## connections (required)

A record of named database client instances. Each key becomes the connection name.

```javascript
connections: {
  primary: new PrismaClient(),
  replica: new PrismaClient({ datasources: { db: { url: REPLICA_URL } } }),
  cache: createClient({ url: 'redis://localhost' }),
  mongo: new MongoClient(MONGO_URI),
}
```

**Rules:**
- At least one connection is required
- Names must be non-empty strings
- Clients can be any object (OmniDB doesn't care about the type)

## failover (optional)

Maps primary connections to their backups. When a primary is unhealthy, `get()` automatically returns the backup.

```javascript
failover: {
  primary: 'replica',     // primary → replica
  'us-west': 'us-east',   // us-west → us-east
}
```

**Rules:**
- Both primary and backup must exist in `connections`
- Backup can also have its own backup (chained failover)
- Failover only triggers if health checks are configured

## healthCheck (optional)

Configures periodic health monitoring.

```javascript
healthCheck: {
  interval: '30s',        // How often to check (default: '30s')
  timeout: '5s',          // Max time per check (default: '5s')
  checks: { ... },        // Custom check functions
}
```

### interval

How often to run health checks. Supports duration strings:

| Format | Examples |
|--------|----------|
| Seconds | `'5s'`, `'30s'` |
| Minutes | `'1m'`, `'5m'` |
| Hours | `'1h'` |
| Milliseconds | `'500ms'` |

### timeout

Maximum time for each individual health check before it's considered failed.

```javascript
timeout: '5s'  // Checks taking longer are marked unhealthy
```

### checks

Custom health check functions per connection. Each function receives the client and should return `true` for healthy, `false` for unhealthy.

```javascript
checks: {
  postgres: async (client) => {
    await client.$queryRaw`SELECT 1`;
    return true;
  },
  redis: async (client) => {
    const pong = await client.ping();
    return pong === 'PONG';
  },
  mongo: async (client) => {
    await client.db().admin().ping();
    return true;
  },
}
```

**Rules:**
- Functions must return a boolean (or throw for unhealthy)
- Thrown errors are caught and treated as unhealthy
- Connections without a check function are assumed healthy

## Full Example

```javascript
import { Orchestrator } from 'omni-db';

const db = new Orchestrator({
  connections: {
    primary: primaryClient,
    replica: replicaClient,
    cache: redisClient,
  },
  failover: {
    primary: 'replica',
  },
  healthCheck: {
    interval: '30s',
    timeout: '5s',
    checks: {
      primary: async (c) => c.ping(),
      replica: async (c) => c.ping(),
      cache: async (c) => (await c.ping()) === 'PONG',
    },
  },
});
```

---

[← Previous: Getting Started](./01-getting-started.md) | [Next: Health Monitoring →](./03-health-monitoring.md)
