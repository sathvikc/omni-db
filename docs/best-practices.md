# Best Practices & Patterns

To build production-grade applications with OmniDB, follow these recommended patterns.

## 1. Use `db.execute()` (Avoid Manual Tracking)

### 1. Handle Circuit Breaker Errors

When the circuit is open, `get()` throws an error. Always handle this or use `execute()` for automatic safety.

```javascript
// Good - Safe execution
await db.execute('primary', client => client.query(...));

// Good - Explicit handling
try {
  const pg = db.get('primary');
  await pg.query(...);
} catch (err) {
  // Handle circuit open / failover
}
```

### ✅ Pattern: Automatic Execution Wrapper
Use the `execute()` wrapper which handles connection lookup, circuit checks, and recording metrics automatically.

```javascript
// Do this
const result = await db.execute('primary', async (client) => {
  return await client.query('SELECT * FROM users');
});
```

## 2. Event-Driven Logic (Don't Sleep!)

### ❌ Anti-Pattern: Sleeping / Polling
Waiting for a fixed amount of time is brittle. In CI/CD or clouded environments, 100ms might not be enough, causing flaky tests.

```javascript
// Don't do this
primaryDB.failure();
await new Promise(r => setTimeout(r, 1000)); // Hoping 1s is enough...
checkHealth();
```

### ✅ Pattern: Wait for Events
Use OmniDB's event system to react exactly when state changes occur. This is faster and deterministic.

```javascript
import { once } from 'node:events';

// Do this
const failoverPromise = once(db, 'failover');
primaryDB.failure();
await failoverPromise; // Proceeds immediately after failover occurs
```

## 3. Prevent Flapping (Retry Policy)
Network glitches happen. Don't let a single failed check mark your DB as dead. configuration retries to suppress transient errors.

```javascript
healthCheck: {
    retry: {
        retries: 3,     // Try 4 times total
        delay: '100ms'  // Wait 100ms between attempts
    }
}
```

## 4. Robust Health Checks

Your health check function determines whether your app stays up or goes down. Make it robust.

### ❌ Weak Check (Connection Only)
Checking if the client object exists or "is connected" doesn't catch hung queries or locked tables.

```javascript
// Too simple
check: (client) => client.connected
```

### ✅ Strong Check (Round Trip)
Perform a minimal network operation ("Heartbeat").

- **SQL**: `SELECT 1`
- **Redis**: `PING`
- **Mongo**: `db.admin().ping()`

```javascript
check: async (client) => {
  // Set a strict timeout so the check doesn't hang forever
  const result = await Promise.race([
    client.query('SELECT 1'),
    new Promise((_, reject) => setTimeout(() => reject('Timeout'), 1000))
  ]);
  return true;
}
```

## 5. Read/Write Splitting

You can use OmniDB to route traffic to Read Replicas while keeping a specific Primary for writes.

```javascript
const db = new Orchestrator({
  connections: {
    writer: new PgClient(primaryUrl),
    reader1: new PgClient(replicaUrl1),
    reader2: new PgClient(replicaUrl2)
  }
});

function getReader() {
  // Simple random load balancing
  const replicas = ['reader1', 'reader2'];
  const randomReplica = replicas[Math.floor(Math.random() * replicas.length)];
  return db.get(randomReplica);
}

// Writes go to 'writer', Reads go to a random healthy replica
await db.get('writer').query('INSERT ...');
await getReader().query('SELECT ...');
```

## 6. Graceful Shutdown

Always ensure you disconnect OmniDB when your application stops (e.g., `SIGTERM`). This stops the health check timers and allows database connections to close cleanly.

### ✅ One-Liner with `shutdownOnSignal()`

```javascript
await db.connect();
db.shutdownOnSignal(); // Handles SIGTERM, SIGINT automatically
```

### Options

```javascript
db.shutdownOnSignal({
    signals: ['SIGTERM', 'SIGINT', 'SIGHUP'], // Custom signals
    exitCode: 0,                               // Exit code
    exitProcess: true                          // Whether to call process.exit()
});
```

The method returns a cleanup function if you need to remove the handlers later:

```javascript
const cleanup = db.shutdownOnSignal();
// Later...
cleanup(); // Removes signal handlers
```

### Manual Approach

If you need custom shutdown logic:

```javascript
process.on('SIGTERM', async () => {
    console.log('Shutting down...');
    await db.disconnect(); // Stops health checks
    await closeAllDbClients();
    process.exit(0);
});
```

---

[← Previous: Examples](./examples.md) | [Next: Error Reference →](./errors.md)
