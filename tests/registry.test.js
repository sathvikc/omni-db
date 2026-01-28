import { describe, it, expect, beforeEach } from 'vitest';
import { Registry } from '../src/registry.js';

describe('Registry', () => {
    let registry;

    beforeEach(() => {
        registry = new Registry();
    });

    describe('register()', () => {
        it('should register a connection with a valid name', () => {
            const client = { name: 'testClient' };
            registry.register('db1', client);

            expect(registry.has('db1')).toBe(true);
            expect(registry.get('db1')).toBe(client);
        });

        it('should allow overwriting an existing connection', () => {
            const client1 = { name: 'client1' };
            const client2 = { name: 'client2' };

            registry.register('db1', client1);
            registry.register('db1', client2);

            expect(registry.get('db1')).toBe(client2);
        });

        it('should throw if name is not a string', () => {
            expect(() => registry.register(123, {})).toThrow(
                'Connection name must be a non-empty string'
            );
        });

        it('should throw if name is an empty string', () => {
            expect(() => registry.register('', {})).toThrow(
                'Connection name must be a non-empty string'
            );
        });

        it('should throw if name is only whitespace', () => {
            expect(() => registry.register('   ', {})).toThrow(
                'Connection name must be a non-empty string'
            );
        });

        it('should throw if client is null', () => {
            expect(() => registry.register('db1', null)).toThrow(
                'Client cannot be null or undefined'
            );
        });

        it('should throw if client is undefined', () => {
            expect(() => registry.register('db1', undefined)).toThrow(
                'Client cannot be null or undefined'
            );
        });

        it('should accept any truthy value as client', () => {
            registry.register('string', 'stringClient');
            registry.register('number', 42);
            registry.register('object', {});
            registry.register('array', []);
            registry.register('function', () => { });

            expect(registry.size).toBe(5);
        });
    });

    describe('get()', () => {
        it('should return the registered client', () => {
            const client = { query: () => { } };
            registry.register('db1', client);

            expect(registry.get('db1')).toBe(client);
        });

        it('should return undefined for unregistered names', () => {
            expect(registry.get('nonexistent')).toBeUndefined();
        });

        it('should return undefined for empty registry', () => {
            expect(registry.get('anything')).toBeUndefined();
        });
    });

    describe('has()', () => {
        it('should return true for registered connections', () => {
            registry.register('db1', {});

            expect(registry.has('db1')).toBe(true);
        });

        it('should return false for unregistered names', () => {
            expect(registry.has('nonexistent')).toBe(false);
        });
    });

    describe('list()', () => {
        it('should return empty array for empty registry', () => {
            expect(registry.list()).toEqual([]);
        });

        it('should return all registered connection names', () => {
            registry.register('db1', {});
            registry.register('db2', {});
            registry.register('cache', {});

            const names = registry.list();
            expect(names).toHaveLength(3);
            expect(names).toContain('db1');
            expect(names).toContain('db2');
            expect(names).toContain('cache');
        });

        it('should return a new array each time', () => {
            registry.register('db1', {});

            const list1 = registry.list();
            const list2 = registry.list();

            expect(list1).not.toBe(list2);
            expect(list1).toEqual(list2);
        });
    });

    describe('size', () => {
        it('should return 0 for empty registry', () => {
            expect(registry.size).toBe(0);
        });

        it('should return correct count of connections', () => {
            registry.register('db1', {});
            registry.register('db2', {});

            expect(registry.size).toBe(2);
        });
    });

    describe('delete()', () => {
        it('should remove a registered connection', () => {
            registry.register('db1', {});

            const result = registry.delete('db1');

            expect(result).toBe(true);
            expect(registry.has('db1')).toBe(false);
        });

        it('should return false for non-existent connections', () => {
            const result = registry.delete('nonexistent');

            expect(result).toBe(false);
        });
    });

    describe('clear()', () => {
        it('should remove all connections', () => {
            registry.register('db1', {});
            registry.register('db2', {});

            registry.clear();

            expect(registry.size).toBe(0);
            expect(registry.list()).toEqual([]);
        });

        it('should be safe to call on empty registry', () => {
            expect(() => registry.clear()).not.toThrow();
        });
    });

    describe('entries()', () => {
        it('should iterate over all connections', () => {
            const client1 = { name: 'client1' };
            const client2 = { name: 'client2' };
            registry.register('db1', client1);
            registry.register('db2', client2);

            const entries = [...registry.entries()];

            expect(entries).toHaveLength(2);
            expect(entries).toContainEqual(['db1', client1]);
            expect(entries).toContainEqual(['db2', client2]);
        });

        it('should return empty iterator for empty registry', () => {
            const entries = [...registry.entries()];

            expect(entries).toHaveLength(0);
        });
    });
});
