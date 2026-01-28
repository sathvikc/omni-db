import { describe, it, expect } from 'vitest';
import { Orchestrator } from '../src/orchestrator.js';

/**
 * Integration tests for Orchestrator's health monitoring and failover features.
 */
describe('Orchestrator Integration', () => {
    describe('failover routing', () => {
        it('should return primary client when healthy (no failover)', () => {
            const primary = { name: 'primary' };
            const backup = { name: 'backup' };

            const db = new Orchestrator({
                connections: { primary, backup },
                failover: { primary: 'backup' },
            });

            // Get default (healthy) - should return primary
            const client = db.get('primary');
            expect(client).toBe(primary);
        });

        it('should work with non-failover connections', () => {
            const main = { name: 'main' };

            const db = new Orchestrator({
                connections: { main },
            });

            const client = db.get('main');
            expect(client).toBe(main);
        });
    });

    describe('health() method', () => {
        it('should return health status for all connections', () => {
            const db = new Orchestrator({
                connections: { db1: {}, db2: {} },
            });

            const health = db.health();

            expect(health.db1.status).toBe('healthy');
            expect(health.db2.status).toBe('healthy');
        });

        it('should not include failoverTo when not in failover', () => {
            const db = new Orchestrator({
                connections: { primary: {}, backup: {} },
                failover: { primary: 'backup' },
            });

            const health = db.health();

            expect(health.primary.failoverTo).toBeUndefined();
        });

        it('should include failoverTo when in active failover', async () => {
            let isHealthy = true;

            const db = new Orchestrator({
                connections: { primary: {}, backup: {} },
                failover: { primary: 'backup' },
                healthCheck: {
                    interval: '30ms',
                    checks: {
                        primary: async () => isHealthy,
                        backup: async () => true,
                    },
                },
            });

            await db.connect();

            // Make primary unhealthy
            isHealthy = false;

            // Wait for health check to run
            await new Promise((resolve) => setTimeout(resolve, 80));

            // Trigger failover
            db.get('primary');

            // Check health() shows failoverTo
            const health = db.health();
            expect(health.primary.failoverTo).toBe('backup');

            await db.disconnect();
        });
    });

    describe('connect/disconnect with health monitoring', () => {
        it('should start and stop health monitor', async () => {
            const db = new Orchestrator({
                connections: { main: {} },
                healthCheck: { interval: '1s' },
            });

            await db.connect();
            expect(db.isConnected).toBe(true);

            await db.disconnect();
            expect(db.isConnected).toBe(false);
        });
    });

    describe('custom health checks', () => {
        it('should register custom health check functions', async () => {
            let checkCalled = false;

            const db = new Orchestrator({
                connections: { main: { ping: async () => true } },
                healthCheck: {
                    interval: '50ms',
                    checks: {
                        main: async (client) => {
                            checkCalled = true;
                            return client.ping();
                        },
                    },
                },
            });

            await db.connect();

            // Give time for interval to fire
            await new Promise((resolve) => setTimeout(resolve, 100));

            await db.disconnect();

            expect(checkCalled).toBe(true);
        });

        it('should emit health:changed when check fails', async () => {
            let shouldFail = false;

            const db = new Orchestrator({
                connections: { main: {} },
                healthCheck: {
                    interval: '30ms',
                    timeout: '20ms',
                    checks: {
                        main: async () => {
                            if (shouldFail) {
                                throw new Error('Connection lost');
                            }
                            return true;
                        },
                    },
                },
            });

            let healthChanged = false;
            db.on('health:changed', (event) => {
                if (event.name === 'main' && event.current === 'unhealthy') {
                    healthChanged = true;
                }
            });

            await db.connect();

            // Make the check fail
            shouldFail = true;

            // Wait for at least one interval cycle
            await new Promise((resolve) => setTimeout(resolve, 80));

            await db.disconnect();

            expect(healthChanged).toBe(true);
        });

        it('should trigger failover and recovery events', async () => {
            let isHealthy = true;

            const db = new Orchestrator({
                connections: { primary: {}, backup: {} },
                failover: { primary: 'backup' },
                healthCheck: {
                    interval: '30ms',
                    checks: {
                        primary: async () => isHealthy,
                        backup: async () => true,
                    },
                },
            });

            const events = [];
            db.on('failover', (e) => events.push({ type: 'failover', ...e }));
            db.on('recovery', (e) => events.push({ type: 'recovery', ...e }));

            await db.connect();

            // Make primary unhealthy
            isHealthy = false;

            // Wait for health check to run
            await new Promise((resolve) => setTimeout(resolve, 80));

            // Trigger failover by getting primary
            db.get('primary');

            // Make primary healthy again
            isHealthy = true;

            // Wait for health check to run
            await new Promise((resolve) => setTimeout(resolve, 80));

            // Trigger recovery by getting primary
            db.get('primary');

            await db.disconnect();

            expect(events.length).toBe(2);
            expect(events[0].type).toBe('failover');
            expect(events[1].type).toBe('recovery');
        });
    });
});
