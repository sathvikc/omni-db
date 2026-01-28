# Getting Started

Learn how to install OmniDB and set up your first multi-database orchestration.

## Installation

```bash
npm install omni-db
```

**Requirements:**
- Node.js 18.0.0 or higher
- ESM support (use `"type": "module"` in package.json)

## Basic Usage

OmniDB is a thin orchestration layer for managing multiple database connections. You bring your own database clients — OmniDB handles connection management, health monitoring, and failover.

### Step 1: Import and Configure

```javascript
import { Orchestrator } from 'omni-db';

const db = new Orchestrator({
  connections: {
    postgres: postgresClient,
    redis: redisClient,
    mongo: mongoClient,
  },
});
```

### Step 2: Connect

```javascript
await db.connect();
console.log(`Managing ${db.size} connections`);
```

### Step 3: Use Your Clients

```javascript
const pg = db.get('postgres');
const cache = db.get('redis');

// Use clients as you normally would
await pg.query('SELECT * FROM users');
await cache.get('session:abc');
```

### Step 4: Disconnect

```javascript
await db.disconnect();
```

## Complete Example

```javascript
import { Orchestrator } from 'omni-db';
import { PrismaClient } from '@prisma/client';
import { createClient } from 'redis';

// Create your database clients
const prisma = new PrismaClient();
const redis = createClient({ url: 'redis://localhost:6379' });

// Create orchestrator
const db = new Orchestrator({
  connections: {
    primary: prisma,
    cache: redis,
  },
});

// Listen for events
db.on('connected', (name) => {
  console.log(`✓ ${name} connected`);
});

db.on('disconnected', (name) => {
  console.log(`✗ ${name} disconnected`);
});

// Connect and use
await db.connect();

try {
  const users = await db.get('primary').$queryRaw`SELECT * FROM users`;
  const cached = await db.get('cache').get('users');
  
  console.log('Users from DB:', users.length);
  console.log('Cached data:', cached);
} finally {
  await db.disconnect();
}
```

## What's Next?

Now that you have OmniDB running, explore:

- [Configuration](./02-configuration.md) — Learn all configuration options
- [Health Monitoring](./03-health-monitoring.md) — Set up health checks
- [Failover](./04-failover.md) — Configure automatic failover

---

[Next: Configuration →](./02-configuration.md)
