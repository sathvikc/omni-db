# Examples

Real-world examples of OmniDB in action.

## Table of Contents

- [Express.js API with Failover](#expressjs-api-with-failover)
- [Graceful Shutdown](#graceful-shutdown)
- [Health Check Endpoint](#health-check-endpoint)
- [MongoDB + Redis](#mongodb--redis)
- [Prisma with Read Replicas](#prisma-with-read-replicas)
- [Metrics Integration](#metrics-integration)

---

## Express.js API with Failover

Complete Express.js setup with PostgreSQL primary, replica, and Redis cache.

```javascript
import express from 'express';
import { Orchestrator } from 'omni-db';
import { Pool } from 'pg';
import { createClient } from 'redis';

// Create clients
const primary = new Pool({ connectionString: PRIMARY_URL });
const replica = new Pool({ connectionString: REPLICA_URL });
const redis = createClient({ url: REDIS_URL });

// Create orchestrator
const db = new Orchestrator({
  connections: { primary, replica, cache: redis },
  failover: { primary: 'replica' },
  healthCheck: {
    interval: '15s',
    timeout: '3s',
    checks: {
      primary: async (c) => { await c.query('SELECT 1'); return true; },
      replica: async (c) => { await c.query('SELECT 1'); return true; },
      cache: async (c) => (await c.ping()) === 'PONG',
    },
  },
});

// Setup logging
db.on('failover', ({ primary, backup }) => {
  console.log(`[FAILOVER] ${primary} → ${backup}`);
});

db.on('recovery', ({ primary }) => {
  console.log(`[RECOVERY] ${primary} restored`);
});

// Express app
const app = express();

app.get('/users', async (req, res) => {
  const pg = db.get('primary');  // Auto-fails over to replica
  const { rows } = await pg.query('SELECT * FROM users LIMIT 100');
  res.json(rows);
});

app.get('/users/:id', async (req, res) => {
  const cache = db.get('cache');
  const cached = await cache.get(`user:${req.params.id}`);
  
  if (cached) {
    return res.json(JSON.parse(cached));
  }
  
  const pg = db.get('primary');
  const { rows } = await pg.query('SELECT * FROM users WHERE id = $1', [req.params.id]);
  
  await cache.setEx(`user:${req.params.id}`, 300, JSON.stringify(rows[0]));
  res.json(rows[0]);
});

// Start
await db.connect();
app.listen(3000);
```

---

## Graceful Shutdown

Handle SIGTERM and SIGINT for clean shutdown.

```javascript
const db = new Orchestrator({ ... });

async function shutdown(signal) {
  console.log(`\nReceived ${signal}, shutting down...`);
  
  try {
    await db.disconnect();
    console.log('All connections closed');
    process.exit(0);
  } catch (err) {
    console.error('Error during shutdown:', err);
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

await db.connect();
```

---

## Health Check Endpoint

Expose database health for Kubernetes probes or load balancers.

```javascript
app.get('/health', (req, res) => {
  const health = db.health();
  
  // Check if any connection is unhealthy
  const allHealthy = Object.values(health)
    .every(conn => conn.status === 'healthy');
  
  if (allHealthy) {
    res.json({ status: 'healthy', connections: health });
  } else {
    res.status(503).json({ status: 'degraded', connections: health });
  }
});

app.get('/health/live', (req, res) => {
  // Liveness: app is running
  res.json({ status: 'live' });
});

app.get('/health/ready', (req, res) => {
  // Readiness: can serve traffic
  const hasPrimaryOrReplica = 
    db.health().primary?.status === 'healthy' ||
    db.health().replica?.status === 'healthy';
  
  if (hasPrimaryOrReplica) {
    res.json({ status: 'ready' });
  } else {
    res.status(503).json({ status: 'not ready' });
  }
});
```

---

## MongoDB + Redis

Managing MongoDB and Redis together.

```javascript
import { MongoClient } from 'mongodb';
import { createClient } from 'redis';
import { Orchestrator } from 'omni-db';

const mongo = new MongoClient(MONGO_URI);
const redis = createClient({ url: REDIS_URL });

const db = new Orchestrator({
  connections: {
    mongo,
    cache: redis,
  },
  healthCheck: {
    interval: '30s',
    checks: {
      mongo: async (c) => {
        await c.db().admin().ping();
        return true;
      },
      cache: async (c) => (await c.ping()) === 'PONG',
    },
  },
});

await db.connect();

// Usage
const users = db.get('mongo').db('app').collection('users');
const cache = db.get('cache');

await users.insertOne({ name: 'John', email: 'john@example.com' });
await cache.set('last_insert', Date.now().toString());
```

---

## Prisma with Read Replicas

Using Prisma with primary and read replica.

```typescript
import { PrismaClient } from '@prisma/client';
import { Orchestrator } from 'omni-db';

const primary = new PrismaClient();
const replica = new PrismaClient({
  datasources: { db: { url: REPLICA_DATABASE_URL } },
});

const db = new Orchestrator({
  connections: { primary, replica },
  failover: { primary: 'replica' },
  healthCheck: {
    checks: {
      primary: async (c) => { await c.$queryRaw`SELECT 1`; return true; },
      replica: async (c) => { await c.$queryRaw`SELECT 1`; return true; },
    },
  },
});

await db.connect();

// Writes always go to primary
async function createUser(data: UserInput) {
  return db.get('primary').user.create({ data });
}

// Reads can use replica for load distribution
// Or automatically failover if primary is down
async function getUsers() {
  return db.get('primary').user.findMany();  // Fails over to replica
}
```

---

## Metrics Integration

Send metrics to Prometheus/Datadog/etc.

```javascript
const db = new Orchestrator({ ... });

// Track health status
db.on('health:changed', ({ name, previous, current }) => {
  metrics.gauge('db.health', current === 'healthy' ? 1 : 0, {
    connection: name,
  });
  
  metrics.increment('db.health_changes', 1, {
    connection: name,
    from: previous,
    to: current,
  });
});

// Track failovers
db.on('failover', ({ primary, backup }) => {
  metrics.increment('db.failovers', 1, {
    primary,
    backup,
  });
});

// Track recoveries
db.on('recovery', ({ primary }) => {
  metrics.increment('db.recoveries', 1, { primary });
});

// Periodic health summary
setInterval(() => {
  const health = db.health();
  for (const [name, { status }] of Object.entries(health)) {
    metrics.gauge('db.status', status === 'healthy' ? 1 : 0, {
      connection: name,
    });
  }
}, 60000);
```

---

[← Previous: TypeScript](./typescript.md) | [Next: Best Practices →](./best-practices.md)

---

## More Resources

- [API Reference](/README.md#api-reference)
- [Configuration](./configuration.md)
- [GitHub Repository](https://github.com/sathvikc/omni-db)
