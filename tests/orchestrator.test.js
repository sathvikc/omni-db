import { describe, it, expect, beforeEach, vi } from 'vitest';
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
});
