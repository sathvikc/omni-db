# Observability

OmniDB's event system makes it easy to integrate with monitoring tools like Prometheus, Datadog, or StatsD. This guide shows common patterns for observability.

## Prometheus Integration

### Setup
```javascript
import { Orchestrator } from 'omni-db';
import { Registry, Gauge, Counter, Histogram } from 'prom-client';

const register = new Registry();

// Metrics
const healthGauge = new Gauge({
    name: 'omnidb_connection_health',
    help: 'Connection health status (1=healthy, 0=unhealthy)',
    labelNames: ['connection'],
    registers: [register],
});

const failoverCounter = new Counter({
    name: 'omnidb_failover_total',
    help: 'Total number of failover events',
    labelNames: ['primary', 'backup'],
    registers: [register],
});

const healthCheckDuration = new Histogram({
    name: 'omnidb_health_check_duration_seconds',
    help: 'Health check duration in seconds',
    labelNames: ['connection'],
    registers: [register],
});
```

### Wire Up Events
```javascript
const db = new Orchestrator({
    connections: { primary: pgPool, replica: pgReplica, cache: redis },
    failover: { primary: 'replica' },
    healthCheck: { interval: '30s' }
});

// Health status changes
db.on('health:changed', (event) => {
    healthGauge.set(
        { connection: event.name },
        event.current === 'healthy' ? 1 : 0
    );
    console.log(`[${new Date(event.timestamp).toISOString()}] ${event.name}: ${event.current}`);
});

// Failover events
db.on('failover', (event) => {
    failoverCounter.inc({ primary: event.primary, backup: event.backup });
});

// Recovery events  
db.on('recovery', (event) => {
    console.log(`Recovered: ${event.primary} at ${event.timestamp}`);
});
```

### Expose Metrics Endpoint
```javascript
import express from 'express';

const app = express();

app.get('/metrics', async (req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
});
```

## StatsD / Datadog

```javascript
import StatsD from 'hot-shots';

const statsd = new StatsD({ host: 'localhost', port: 8125 });

db.on('health:changed', (event) => {
    statsd.gauge(`omnidb.health.${event.name}`, event.current === 'healthy' ? 1 : 0);
});

db.on('failover', (event) => {
    statsd.increment('omnidb.failover', { primary: event.primary });
});
```

## Structured Logging

```javascript
import pino from 'pino';

const logger = pino();

db.on('connected', (event) => {
    logger.info({ connection: event.name, timestamp: event.timestamp }, 'Database connected');
});

db.on('disconnected', (event) => {
    logger.info({ connection: event.name, timestamp: event.timestamp }, 'Database disconnected');
});

db.on('health:changed', (event) => {
    const level = event.current === 'healthy' ? 'info' : 'warn';
    logger[level]({
        connection: event.name,
        previous: event.previous,
        current: event.current,
        timestamp: event.timestamp
    }, 'Health status changed');
});

db.on('failover', (event) => {
    logger.error({
        primary: event.primary,
        backup: event.backup,
        timestamp: event.timestamp
    }, 'Failover activated');
});
```

## Event Reference

All events include a `timestamp` field (Unix milliseconds):

| Event | Payload | Description |
|-------|---------|-------------|
| `connected` | `{ name, timestamp }` | Connection registered |
| `disconnected` | `{ name, timestamp }` | Connection unregistered |
| `health:changed` | `{ name, previous, current, timestamp }` | Health status transition |
| `failover` | `{ primary, backup, timestamp }` | Switched to backup |
| `recovery` | `{ primary, backup, timestamp }` | Returned to primary |
| `shutdown` | `{ signal, timestamp }` | Process signal received |

## Example: Full Observability Stack

```javascript
import { Orchestrator } from 'omni-db';
import { Registry, Gauge, Counter } from 'prom-client';
import pino from 'pino';

const logger = pino();
const register = new Registry();

const healthGauge = new Gauge({
    name: 'omnidb_health',
    help: 'Connection health',
    labelNames: ['connection'],
    registers: [register],
});

const failoverCounter = new Counter({
    name: 'omnidb_failovers',
    help: 'Failover count',
    labelNames: ['primary', 'backup'],
    registers: [register],
});

const db = new Orchestrator({
    connections: { primary: pgPool, cache: redis },
    failover: { primary: 'replica' },
    healthCheck: { interval: '30s' }
});

// Set initial healthy state
db.on('connected', (e) => {
    healthGauge.set({ connection: e.name }, 1);
    logger.info({ connection: e.name }, 'connected');
});

db.on('health:changed', (e) => {
    healthGauge.set({ connection: e.name }, e.current === 'healthy' ? 1 : 0);
    logger.info({ ...e }, 'health changed');
});

db.on('failover', (e) => {
    failoverCounter.inc({ primary: e.primary, backup: e.backup });
    logger.error({ ...e }, 'failover');
});

await db.connect();
db.shutdownOnSignal();
```

## Dashboard Queries (PromQL)

```promql
# Unhealthy connections
omnidb_health{} == 0

# Failover rate (last hour)
increase(omnidb_failovers[1h])

# Alert: Connection unhealthy for 5 minutes
omnidb_health == 0 for 5m
```

---

[← Previous: Events](./events.md) | [Next: TypeScript →](./typescript.md)
