# Circuit Breaker

Prevent cascading failures by automatically failing fast when a database is repeatedly unavailable.

## Overview

A circuit breaker monitors operation failures and temporarily blocks requests when failures exceed a threshold. This prevents overwhelming an already-struggling service.

### States

| State | Behavior |
|-------|----------|
| **Closed** | Normal operation, requests pass through |
| **Open** | Fast-fail immediately, don't attempt operation |
| **Half-Open** | Allow test requests, needs N successes to close |

```
Closed ──[failures ≥ threshold]──► Open
  ▲                                  │
  │                         [resetTimeout]
  │                                  ▼
  └────[N successes]───────── Half-Open
                                     │
                              [failure]
                                     ▼
                                   Open
```

---

## Configuration

```javascript
import { Orchestrator } from 'omni-db';

const db = new Orchestrator({
  connections: { primary: pgPool, replica: pgReplica },
  circuitBreaker: {
    threshold: 5,           // Failures before opening (default: 5)
    resetTimeout: '30s',    // Time before half-open (default: 30s)
    halfOpenSuccesses: 2,   // Successes to close (default: 2)
  },
});
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `threshold` | `number` | `5` | Failures before circuit opens |
| `resetTimeout` | `string\|number` | `30000` | Time before trying half-open |
| `halfOpenSuccesses` | `number` | `2` | Successes needed to close |

---

## Events

```javascript
db.on('circuit:open', ({ name, timestamp }) => {
  console.log(`Circuit opened for ${name} at ${new Date(timestamp).toISOString()}`);
  // Alert ops team, switch to fallback, etc.
});

db.on('circuit:close', ({ name, timestamp }) => {
  console.log(`Circuit closed for ${name}`);
  // Resume normal operations
});
```

---

## Standalone Usage

Use `CircuitBreaker` directly without the Orchestrator:

```javascript
import { CircuitBreaker } from 'omni-db';

const circuit = new CircuitBreaker({
  threshold: 3,
  resetTimeout: '10s',
  halfOpenSuccesses: 2,
});

// Option 1: Wrapper pattern (recommended)
try {
  const result = await circuit.execute(async () => {
    return await db.query('SELECT * FROM users');
  });
} catch (err) {
  if (err.message === 'Circuit breaker is OPEN') {
    // Return cached data, show error page, etc.
  }
}

// Option 2: Manual tracking (for complex flows)
if (circuit.canExecute()) {
  try {
    await db.query(sql);
    circuit.success();
  } catch {
    circuit.failure();
    throw;
  }
}
```

---

## With Orchestrator

When configured, the Orchestrator creates a circuit per connection:

```javascript
const db = new Orchestrator({
  connections: { primary: pgPool },
  circuitBreaker: { threshold: 3 },
});

// get() returns undefined if circuit is open
const pg = db.get('primary');
if (!pg) {
  return res.status(503).json({ error: 'Database unavailable' });
}

// After operations, record result
try {
  const result = await pg.query(sql);
  db.recordSuccess('primary');
  return result;
} catch (err) {
  db.recordFailure('primary');
  throw err;
}
```

---

## Best Practices

### 1. Set Appropriate Thresholds

```javascript
// High-traffic API: fail fast
circuitBreaker: { threshold: 3, resetTimeout: '10s' }

// Batch job: more lenient
circuitBreaker: { threshold: 10, resetTimeout: '1m' }
```

### 2. Combine with Failover

```javascript
const db = new Orchestrator({
  connections: { primary: pgPool, replica: pgReplica },
  failover: { primary: 'replica' },
  circuitBreaker: { threshold: 5 },
});

// Failover kicks in first for health issues
// Circuit breaker protects against repeated query failures
```

### 3. Monitor Circuit Events

```javascript
import { Counter } from 'prom-client';

const circuitOpens = new Counter({
  name: 'omnidb_circuit_opens_total',
  help: 'Total circuit breaker opens',
  labelNames: ['connection'],
});

db.on('circuit:open', ({ name }) => {
  circuitOpens.inc({ connection: name });
});
```

### 4. Provide Fallbacks

```javascript
app.get('/users', async (req, res) => {
  const pg = db.get('primary');
  
  if (!pg) {
    // Circuit is open - return cached data
    const cached = await redis.get('users:all');
    if (cached) return res.json(JSON.parse(cached));
    return res.status(503).json({ error: 'Service unavailable' });
  }
  
  // Normal path
  const { rows } = await pg.query('SELECT * FROM users');
  await redis.set('users:all', JSON.stringify(rows), 'EX', 60);
  res.json(rows);
});
```

---

## API Reference

### CircuitBreaker

```typescript
class CircuitBreaker {
  constructor(config?: CircuitBreakerConfig);
  
  readonly state: 'closed' | 'open' | 'half-open';
  readonly failures: number;
  
  execute<T>(fn: () => Promise<T>): Promise<T>;
  canExecute(): boolean;
  success(): void;
  failure(): boolean;
  reset(): void;
}
```

### Orchestrator Methods

```typescript
// Record successful operation
db.recordSuccess(name: string): void;

// Record failed operation
db.recordFailure(name: string): void;
```

---

[← Previous: Best Practices](./best-practices.md) | [Back to README](../README.md)
