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
- Backup must exist in `connections`
- Failover only triggers if health checks are configured
- **Circular failover is detected and throws an error** (e.g., `a → b → a`)

## healthCheck (optional)

Configures periodic health monitoring.

```javascript
healthCheck: {
  interval: '30s',        // How often to check (default: '30s')
  timeout: '5s',          // Max time per check (default: '5s')
  retry: { ... },         // Optional: retry configuration
  checks: { ... },        // Custom check functions
}
```

### interval

How often to run health checks. Supports duration strings:

| Format | Examples |
|--------|----------|
| Seconds | `'5s'`, `'30s'` |
| Minutes | `'1m'`, `'5m'` |
| Hours | `'1h'` (max 24h) |
| Milliseconds | `'500ms'` |

**Note:** Zero and negative durations are rejected. Maximum duration is 24 hours.

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
- Functions can also return `'healthy'`, `'degraded'`, or `'unhealthy'` strings
- Thrown errors are caught and treated as unhealthy
- Connections without a check function are assumed healthy
- Health checks run in parallel for better performance

### retry

Optional retry configuration for health checks:

```javascript
retry: {
  retries: 2,      // Number of retries before marking unhealthy (default: 0)
  delay: '100ms',  // Delay between retries (default: '100ms')
}
```

## circuitBreaker (optional)

Configures circuit breaker protection to prevent cascading failures.

```javascript
circuitBreaker: {
  threshold: 5,           // Failures before opening (default: 5)
  resetTimeout: '30s',    // Time before half-open (default: 30000ms)
  halfOpenSuccesses: 2,   // Successes to close (default: 2)
}
```

### threshold

Number of consecutive failures before the circuit opens. **Must be >= 1.**

### resetTimeout

Time to wait before attempting to recover (half-open state). Accepts duration strings or milliseconds. **Must be positive.**

### halfOpenSuccesses

Number of successful operations required in half-open state to close the circuit. **Must be >= 1.**

### External Circuit Breakers

You can use external libraries like `opossum` or `cockatiel`:

```javascript
import CircuitBreaker from 'opossum';

circuitBreaker: {
  use: new CircuitBreaker(asyncFn, { timeout: 3000 })
}
```

**Note:** External circuit breakers are validated at construction time. They must have either an `execute()` or `fire()` method.

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
    retry: {
      retries: 2,
      delay: '100ms',
    },
    checks: {
      primary: async (c) => c.ping(),
      replica: async (c) => c.ping(),
      cache: async (c) => (await c.ping()) === 'PONG',
    },
  },
  circuitBreaker: {
    threshold: 5,
    resetTimeout: '30s',
    halfOpenSuccesses: 2,
  },
});
```

---

[← Previous: Getting Started](./getting-started.md) | [Next: Architecture →](./architecture.md)
