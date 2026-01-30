# TypeScript

OmniDB provides comprehensive TypeScript definitions with generics for type-safe database access.

## Installation

TypeScript definitions are included in the package — no additional installation needed.

```bash
npm install omni-db
```

## Basic Usage

```typescript
import { Orchestrator } from 'omni-db';
import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';

const db = new Orchestrator({
  connections: {
    postgres: new PrismaClient(),
    redis: new Redis(),
  },
});

// Types are inferred!
const prisma = db.get('postgres');  // Type: PrismaClient
const redis = db.get('redis');       // Type: Redis
```

## Generic Configuration

The `Orchestrator` class accepts a generic type parameter for your connections:

```typescript
interface MyConnections {
  primary: PrismaClient;
  replica: PrismaClient;
  cache: Redis;
}

const db = new Orchestrator<MyConnections>({
  connections: {
    primary: new PrismaClient(),
    replica: new PrismaClient(),
    cache: new Redis(),
  },
});

// Fully typed
const primary = db.get('primary');  // PrismaClient
const cache = db.get('cache');      // Redis

// Type errors caught at compile time
db.get('nonexistent');  // Error: Argument of type '"nonexistent"' is not assignable
```

## Type Definitions

### Core Types

```typescript
import type {
  Orchestrator,
  Registry,
  HealthStatus,
  ConnectionHealth,
  OrchestratorConfig,
  HealthCheckConfig,
  HealthCheckFunction,
} from 'omni-db';
```

### HealthStatus

```typescript
type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';
```

### ConnectionHealth

```typescript
interface ConnectionHealth {
  status: HealthStatus;
  failoverTo?: string;  // Present when in failover
}
```

### Event Types

```typescript
import type {
  ConnectedEvent,
  DisconnectedEvent,
  FailoverEvent,
  RecoveryEvent,
  HealthChangedEvent,
  ShutdownEvent,
  OrchestratorEvents,
} from 'omni-db';

// All events include a timestamp (Unix milliseconds)
interface ConnectedEvent {
  name: string;
  timestamp: number;
}

interface DisconnectedEvent {
  name: string;
  timestamp: number;
}

interface FailoverEvent {
  primary: string;
  backup: string;
  timestamp: number;
}

interface RecoveryEvent {
  primary: string;
  backup: string;
  timestamp: number;
}

interface HealthChangedEvent {
  name: string;
  previous: HealthStatus;
  current: HealthStatus;
  timestamp: number;
}

interface ShutdownEvent {
  signal: string;
  timestamp: number;
}
```

## Type-Safe Events

Events are fully typed and include timestamps:

```typescript
db.on('connected', (event) => {
  // event is typed as ConnectedEvent
  console.log(`${event.name} connected at ${event.timestamp}`);
});

db.on('failover', (event) => {
  // event is typed as FailoverEvent
  console.log(`${event.primary} → ${event.backup} at ${new Date(event.timestamp).toISOString()}`);
});

db.on('health:changed', (event) => {
  // event is typed as HealthChangedEvent
  console.log(`[${event.timestamp}] ${event.name}: ${event.previous} → ${event.current}`);
});
```

## Typed Health Checks

Health check functions are typed based on your connections:

```typescript
const db = new Orchestrator({
  connections: {
    postgres: new PrismaClient(),
    redis: new Redis(),
  },
  healthCheck: {
    checks: {
      // client is typed as PrismaClient
      postgres: async (client) => {
        await client.$queryRaw`SELECT 1`;
        return true;
      },
      // client is typed as Redis
      redis: async (client) => {
        return (await client.ping()) === 'PONG';
      },
    },
  },
});
```

## Typed health() Response

```typescript
const health = db.health();
// Type: Record<'postgres' | 'redis', ConnectionHealth>

health.postgres.status;      // Type: HealthStatus
health.postgres.failoverTo;  // Type: string | undefined
```

## Utility Function

```typescript
import { parseDuration } from 'omni-db';

const ms = parseDuration('30s');  // Type: number
// Returns: 30000
```

## Complete Example

```typescript
import { Orchestrator, HealthStatus, FailoverEvent } from 'omni-db';
import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';

interface DatabaseClients {
  primary: PrismaClient;
  replica: PrismaClient;
  cache: Redis;
}

async function createDatabase(): Promise<Orchestrator<DatabaseClients>> {
  const db = new Orchestrator<DatabaseClients>({
    connections: {
      primary: new PrismaClient(),
      replica: new PrismaClient(),
      cache: new Redis(),
    },
    failover: {
      primary: 'replica',
    },
    healthCheck: {
      interval: '30s',
      timeout: '5s',
      checks: {
        primary: async (client) => {
          await client.$connect();
          return true;
        },
        replica: async (client) => {
          await client.$connect();
          return true;
        },
        cache: async (client) => {
          return (await client.ping()) === 'PONG';
        },
      },
    },
  });

  db.on('failover', (event: FailoverEvent) => {
    console.log(`Failover: ${event.primary} → ${event.backup}`);
  });

  await db.connect();
  return db;
}
```

---

[← Previous: Middleware](./middleware.md) | [Next: Examples →](./examples.md)
