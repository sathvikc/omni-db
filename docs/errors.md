# Error Reference

Complete list of errors thrown or emitted by OmniDB.

## Quick Reference

| Error Message | Thrown By | Cause |
|--------------|-----------|-------|
| `Connection "X" is unavailable` | `execute()` | Circuit open or connection not found |
| `Circuit breaker is OPEN` | `CircuitBreaker.execute()` | Circuit in open state |
| `Circuit open for "X"` | `get()` (emitted) | Circuit prevents access |
| `Config must be an object` | `Orchestrator` constructor | Invalid config |
| `Config must include a connections object` | `Orchestrator` constructor | Missing connections |
| `At least one connection must be provided` | `Orchestrator` constructor | Empty connections |
| `Name must be a non-empty string` | `Registry.register()` | Invalid name |
| `Client must not be null or undefined` | `Registry.register()` | Invalid client |

---

## Detailed Errors

### Orchestrator

#### `Connection "X" is unavailable`
```javascript
await db.execute('primary', fn);
// Error: Connection "primary" is unavailable
```
**Cause:** The circuit breaker for this connection is open, so `get()` returned `undefined`.

**Solution:** Handle circuit-open gracefully:
```javascript
try {
  await db.execute('primary', fn);
} catch (err) {
  if (err.message.includes('unavailable')) {
    // Use fallback, return cached data, etc.
  }
}
```

#### `Circuit open for "X"` (Event)
```javascript
db.on('error', (err) => {
  // err.message: 'Circuit open for "primary"'
});
```
**Cause:** Called `get()` while circuit is open. This is *emitted*, not thrown.

**Note:** `get()` returns `undefined` and emits this error event. Use `execute()` to get a thrown error instead.

---

### CircuitBreaker

#### `Circuit breaker is OPEN`
```javascript
const circuit = new CircuitBreaker({ threshold: 3 });
// After 3 failures...
await circuit.execute(fn);
// Error: Circuit breaker is OPEN
```
**Cause:** Too many failures caused the circuit to open.

**Solution:** Wait for `resetTimeout` (default 30s) for half-open state, or handle the error:
```javascript
try {
  return await circuit.execute(fn);
} catch (err) {
  if (err.message === 'Circuit breaker is OPEN') {
    return cachedResult;
  }
  throw err;
}
```

---

### Constructor Errors

These are thrown immediately when creating an Orchestrator:

| Error | Fix |
|-------|-----|
| `Config must be an object` | Pass `{ connections: {...} }` |
| `Config must include a connections object` | Add `connections` property |
| `At least one connection must be provided` | Add at least one connection |

---

### Registry Errors

#### `Name must be a non-empty string`
```javascript
registry.register('', client);  // Error
registry.register(123, client); // Error
```

#### `Client must not be null or undefined`
```javascript
registry.register('db', null);      // Error
registry.register('db', undefined); // Error
```

---

## Error Events

The Orchestrator emits these error-related events:

```javascript
db.on('error', (error) => {
  console.error('Error:', error.message);
});

db.on('circuit:open', ({ name, reason, timestamp }) => {
  // reason: 'health-check-failed' or undefined (threshold reached)
});

db.on('health:changed', ({ name, previous, current, timestamp }) => {
  if (current === 'unhealthy') {
    console.warn(`${name} is unhealthy`);
  }
});
```

---

## Error Handling Patterns

### Pattern 1: Handle at Execute Level
```javascript
try {
  const result = await db.execute('primary', fn);
  return result;
} catch (err) {
  if (err.message.includes('unavailable')) {
    return fallback();
  }
  throw err;
}
```

### Pattern 2: Listen to Events
```javascript
db.on('circuit:open', ({ name }) => {
  alertOpsTeam(`Circuit open for ${name}`);
});

db.on('error', (err) => {
  logger.error(err);
});
```

### Pattern 3: Check Before Execute
```javascript
const stats = db.getStats();
if (stats.primary.circuit === 'open') {
  return cachedData;
}
return await db.execute('primary', fn);
```

---

[← Architecture](./architecture.md) | [Back to README](../README.md)
