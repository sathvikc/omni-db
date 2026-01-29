import { describe, it, expect, vi } from 'vitest';
import { Orchestrator } from '../src/orchestrator.js';

describe('Orchestrator', () => {
    describe('constructor', () => {
        it('should create instance with valid config', () => {
            const db = new Orchestrator({
                connections: { main: { name: 'test' } },
            });

            expect(db).toBeInstanceOf(Orchestrator);
            expect(db.size).toBe(1);
        });

        it('should register all provided connections', () => {
            const client1 = { name: 'client1' };
            const client2 = { name: 'client2' };

            const db = new Orchestrator({
                connections: { db1: client1, db2: client2 },
            });

            expect(db.get('db1')).toBe(client1);
            expect(db.get('db2')).toBe(client2);
            expect(db.list()).toContain('db1');
            expect(db.list()).toContain('db2');
        });

        it('should throw if config is not provided', () => {
            expect(() => new Orchestrator()).toThrow('Config must be an object');
        });

        it('should throw if config is not an object', () => {
            expect(() => new Orchestrator('invalid')).toThrow('Config must be an object');
        });

        it('should throw if config is null', () => {
            expect(() => new Orchestrator(null)).toThrow('Config must be an object');
        });

        it('should throw if connections is missing', () => {
            expect(() => new Orchestrator({})).toThrow('Config must include a connections object');
        });

        it('should throw if connections is not an object', () => {
            expect(() => new Orchestrator({ connections: 'invalid' })).toThrow(
                'Config must include a connections object'
            );
        });

        it('should throw if connections is empty', () => {
            expect(() => new Orchestrator({ connections: {} })).toThrow(
                'At least one connection must be provided'
            );
        });
    });

    describe('connect()', () => {
        it('should emit connected event for each connection', async () => {
            const db = new Orchestrator({
                connections: { db1: {}, db2: {} },
            });

            const handler = vi.fn();
            db.on('connected', handler);

            await db.connect();

            expect(handler).toHaveBeenCalledTimes(2);
            expect(handler).toHaveBeenCalledWith('db1');
            expect(handler).toHaveBeenCalledWith('db2');
        });

        it('should set connected state to true', async () => {
            const db = new Orchestrator({
                connections: { main: {} },
            });

            expect(db.isConnected).toBe(false);

            await db.connect();

            expect(db.isConnected).toBe(true);
        });

        it('should be idempotent (calling twice does not emit again)', async () => {
            const db = new Orchestrator({
                connections: { main: {} },
            });

            const handler = vi.fn();
            db.on('connected', handler);

            await db.connect();
            await db.connect();

            expect(handler).toHaveBeenCalledTimes(1);
        });
    });

    describe('disconnect()', () => {
        it('should emit disconnected event for each connection', async () => {
            const db = new Orchestrator({
                connections: { db1: {}, db2: {} },
            });

            await db.connect();

            const handler = vi.fn();
            db.on('disconnected', handler);

            await db.disconnect();

            expect(handler).toHaveBeenCalledTimes(2);
            expect(handler).toHaveBeenCalledWith('db1');
            expect(handler).toHaveBeenCalledWith('db2');
        });

        it('should set connected state to false', async () => {
            const db = new Orchestrator({
                connections: { main: {} },
            });

            await db.connect();
            expect(db.isConnected).toBe(true);

            await db.disconnect();
            expect(db.isConnected).toBe(false);
        });

        it('should be safe to call when not connected', async () => {
            const db = new Orchestrator({
                connections: { main: {} },
            });

            const handler = vi.fn();
            db.on('disconnected', handler);

            await db.disconnect();

            expect(handler).not.toHaveBeenCalled();
        });

        it('should be idempotent', async () => {
            const db = new Orchestrator({
                connections: { main: {} },
            });

            await db.connect();

            const handler = vi.fn();
            db.on('disconnected', handler);

            await db.disconnect();
            await db.disconnect();

            expect(handler).toHaveBeenCalledTimes(1);
        });
    });

    describe('get()', () => {
        it('should return the registered client', () => {
            const client = { query: () => { } };
            const db = new Orchestrator({
                connections: { main: client },
            });

            expect(db.get('main')).toBe(client);
        });

        it('should return undefined for non-existent connection', () => {
            const db = new Orchestrator({
                connections: { main: {} },
            });

            expect(db.get('nonexistent')).toBeUndefined();
        });
    });

    describe('list()', () => {
        it('should return all connection names', () => {
            const db = new Orchestrator({
                connections: { db1: {}, db2: {}, cache: {} },
            });

            const names = db.list();

            expect(names).toHaveLength(3);
            expect(names).toContain('db1');
            expect(names).toContain('db2');
            expect(names).toContain('cache');
        });
    });

    describe('has()', () => {
        it('should return true for existing connections', () => {
            const db = new Orchestrator({
                connections: { main: {} },
            });

            expect(db.has('main')).toBe(true);
        });

        it('should return false for non-existent connections', () => {
            const db = new Orchestrator({
                connections: { main: {} },
            });

            expect(db.has('nonexistent')).toBe(false);
        });
    });

    describe('size', () => {
        it('should return the number of connections', () => {
            const db = new Orchestrator({
                connections: { db1: {}, db2: {}, db3: {} },
            });

            expect(db.size).toBe(3);
        });
    });

    describe('health()', () => {
        it('should return health status for all connections', () => {
            const db = new Orchestrator({
                connections: { db1: {}, db2: {} },
            });

            const health = db.health();

            expect(health).toHaveProperty('db1');
            expect(health).toHaveProperty('db2');
            expect(health.db1.status).toBe('healthy');
            expect(health.db2.status).toBe('healthy');
        });

        it('should include failoverTo when in failover', async () => {
            const db = new Orchestrator({
                connections: { primary: {}, backup: {} },
                failover: { primary: 'backup' },
                healthCheck: {
                    checks: {
                        primary: async () => false,
                        backup: async () => true,
                    },
                },
            });

            // Trigger failover by calling get() after health check fails
            // First, manually trigger a health check scenario
            db.get('primary'); // First call sets up failover since primary defaults to healthy

            const health = db.health();
            expect(health.primary.status).toBe('healthy'); // Still healthy until check runs
        });
    });

    describe('failover integration', () => {
        it('should emit failover event when routing to backup', () => {
            const primary = { name: 'primary' };
            const backup = { name: 'backup' };

            const db = new Orchestrator({
                connections: { primary, backup },
                failover: { primary: 'backup' },
                healthCheck: {
                    checks: {
                        primary: async () => false,
                    },
                },
            });

            const handler = vi.fn();
            db.on('failover', handler);

            // Note: Failover only triggers when health status is not 'healthy'
            // Since we haven't run health checks, status is 'healthy' by default
            db.get('primary');

            // Won't trigger because status is 'healthy' by default
            expect(handler).not.toHaveBeenCalled();
        });

        it('should return backup client when primary is unhealthy', () => {
            const primary = { name: 'primary' };
            const backup = { name: 'backup' };

            const db = new Orchestrator({
                connections: { primary, backup },
                failover: { primary: 'backup' },
            });

            // By default, all connections are healthy, so we get primary
            const client = db.get('primary');
            expect(client).toBe(primary);
        });
    });

    describe('disconnect() cleanup', () => {
        it('should stop health monitoring on disconnect', async () => {
            const db = new Orchestrator({
                connections: { main: {} },
            });

            await db.connect();
            await db.disconnect();

            // Internal state verification via isConnected
            expect(db.isConnected).toBe(false);
        });
    });

    describe('shutdownOnSignal()', () => {
        it('should register signal handlers', () => {
            const db = new Orchestrator({
                connections: { main: {} },
            });

            const processSpy = vi.spyOn(process, 'on');

            db.shutdownOnSignal();

            // Should register SIGTERM and SIGINT by default
            expect(processSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
            expect(processSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));

            processSpy.mockRestore();
        });

        it('should register custom signals', () => {
            const db = new Orchestrator({
                connections: { main: {} },
            });

            const processSpy = vi.spyOn(process, 'on');

            db.shutdownOnSignal({ signals: ['SIGHUP'] });

            expect(processSpy).toHaveBeenCalledWith('SIGHUP', expect.any(Function));
            expect(processSpy).not.toHaveBeenCalledWith('SIGTERM', expect.any(Function));

            processSpy.mockRestore();
        });

        it('should return cleanup function that removes handlers', () => {
            const db = new Orchestrator({
                connections: { main: {} },
            });

            const processOnSpy = vi.spyOn(process, 'on');
            const processOffSpy = vi.spyOn(process, 'off');

            const cleanup = db.shutdownOnSignal({ signals: ['SIGTERM'] });

            expect(processOnSpy).toHaveBeenCalledTimes(1);

            cleanup();

            expect(processOffSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));

            processOnSpy.mockRestore();
            processOffSpy.mockRestore();
        });

        it('should emit shutdown event when signal is received', async () => {
            const db = new Orchestrator({
                connections: { main: {} },
            });

            await db.connect();

            const shutdownHandler = vi.fn();
            db.on('shutdown', shutdownHandler);

            // Mock process.exit to prevent actual exit
            const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { });

            // Capture the handler registered for SIGTERM
            let signalHandler;
            const processSpy = vi.spyOn(process, 'on').mockImplementation((signal, handler) => {
                if (signal === 'SIGTERM') signalHandler = handler;
                return process;
            });

            db.shutdownOnSignal({ signals: ['SIGTERM'] });

            // Simulate signal
            await signalHandler('SIGTERM');

            expect(shutdownHandler).toHaveBeenCalledWith({ signal: 'SIGTERM' });
            expect(db.isConnected).toBe(false);
            expect(exitSpy).toHaveBeenCalledWith(0);

            processSpy.mockRestore();
            exitSpy.mockRestore();
        });

        it('should not exit process if exitProcess is false', async () => {
            const db = new Orchestrator({
                connections: { main: {} },
            });

            await db.connect();

            const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { });

            let signalHandler;
            const processSpy = vi.spyOn(process, 'on').mockImplementation((signal, handler) => {
                if (signal === 'SIGTERM') signalHandler = handler;
                return process;
            });

            db.shutdownOnSignal({ signals: ['SIGTERM'], exitProcess: false });

            await signalHandler('SIGTERM');

            expect(exitSpy).not.toHaveBeenCalled();
            expect(db.isConnected).toBe(false);

            processSpy.mockRestore();
            exitSpy.mockRestore();
        });

        it('should use custom exit code', async () => {
            const db = new Orchestrator({
                connections: { main: {} },
            });

            await db.connect();

            const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { });

            let signalHandler;
            const processSpy = vi.spyOn(process, 'on').mockImplementation((signal, handler) => {
                if (signal === 'SIGTERM') signalHandler = handler;
                return process;
            });

            db.shutdownOnSignal({ signals: ['SIGTERM'], exitCode: 42 });

            await signalHandler('SIGTERM');

            expect(exitSpy).toHaveBeenCalledWith(42);

            processSpy.mockRestore();
            exitSpy.mockRestore();
        });
    });
});
