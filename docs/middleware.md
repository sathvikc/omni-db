# Framework Middleware

Common patterns for integrating OmniDB with popular web frameworks.

## Why Middleware?

OmniDB manages multiple database connections with health checks and failover. Attaching it to your request context gives every route handler easy access to the orchestrator.

```javascript
// Without middleware — import everywhere
import { db } from './db.js';

app.get('/users', async (req, res) => {
  const pg = db.get('primary');
});

// With middleware — cleaner, testable
app.get('/users', async (req, res) => {
  const pg = req.db.get('primary');
});
```

---

## Express.js

```javascript
import express from 'express';
import { Orchestrator } from 'omni-db';

// Create orchestrator once
const db = new Orchestrator({
  connections: { primary: pgPool, replica: pgReplica, cache: redis },
  failover: { primary: 'replica' },
  healthCheck: { interval: '30s' },
});

await db.connect();

const app = express();

// Middleware: attach to request
app.use((req, res, next) => {
  req.db = db;
  next();
});

// Routes
app.get('/users', async (req, res) => {
  const pg = req.db.get('primary');  // Auto-failover to replica
  const { rows } = await pg.query('SELECT * FROM users');
  res.json(rows);
});

app.get('/health', (req, res) => {
  res.json(req.db.health());
});

app.listen(3000);
```

---

## Fastify

```javascript
import Fastify from 'fastify';
import { Orchestrator } from 'omni-db';

const db = new Orchestrator({
  connections: { primary: pgPool, cache: redis },
  failover: { primary: 'replica' },
});

await db.connect();

const fastify = Fastify();

// Decorate: add to Fastify instance
fastify.decorate('db', db);

// Routes
fastify.get('/users', async (request, reply) => {
  const pg = fastify.db.get('primary');
  const { rows } = await pg.query('SELECT * FROM users');
  return rows;
});

fastify.get('/health', async () => {
  return fastify.db.health();
});

await fastify.listen({ port: 3000 });
```

---

## Koa

```javascript
import Koa from 'koa';
import Router from '@koa/router';
import { Orchestrator } from 'omni-db';

const db = new Orchestrator({
  connections: { primary: pgPool, cache: redis },
});

await db.connect();

const app = new Koa();
const router = new Router();

// Middleware: attach to context
app.use(async (ctx, next) => {
  ctx.db = db;
  await next();
});

// Routes
router.get('/users', async (ctx) => {
  const pg = ctx.db.get('primary');
  const { rows } = await pg.query('SELECT * FROM users');
  ctx.body = rows;
});

router.get('/health', (ctx) => {
  ctx.body = ctx.db.health();
});

app.use(router.routes());
app.listen(3000);
```

---

## Hono

```javascript
import { Hono } from 'hono';
import { Orchestrator } from 'omni-db';

const db = new Orchestrator({
  connections: { primary: pgPool, cache: redis },
});

await db.connect();

const app = new Hono();

// Middleware: attach to context
app.use('*', async (c, next) => {
  c.set('db', db);
  await next();
});

// Routes
app.get('/users', async (c) => {
  const pg = c.get('db').get('primary');
  const { rows } = await pg.query('SELECT * FROM users');
  return c.json(rows);
});

app.get('/health', (c) => {
  return c.json(c.get('db').health());
});

export default app;
```

---

## NestJS

```typescript
import { Injectable, Module, Global } from '@nestjs/common';
import { Orchestrator } from 'omni-db';

@Injectable()
export class DatabaseService {
  public readonly db: Orchestrator;

  constructor() {
    this.db = new Orchestrator({
      connections: { primary: pgPool, cache: redis },
      failover: { primary: 'replica' },
    });
  }

  async onModuleInit() {
    await this.db.connect();
  }

  async onModuleDestroy() {
    await this.db.disconnect();
  }

  get(name: string) {
    return this.db.get(name);
  }

  health() {
    return this.db.health();
  }
}

@Global()
@Module({
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
```

Usage in controllers:
```typescript
@Controller('users')
export class UsersController {
  constructor(private readonly dbService: DatabaseService) {}

  @Get()
  async findAll() {
    const pg = this.dbService.get('primary');
    const { rows } = await pg.query('SELECT * FROM users');
    return rows;
  }
}
```

---

## TypeScript Types

For Express, you can extend the Request type:

```typescript
import { Orchestrator } from 'omni-db';

declare global {
  namespace Express {
    interface Request {
      db: Orchestrator<MyConnections>;
    }
  }
}
```

---

[← Previous: Observability](./observability.md) | [Next: TypeScript →](./typescript.md)
