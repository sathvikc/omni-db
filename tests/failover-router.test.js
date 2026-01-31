import { describe, it, expect, beforeEach } from 'vitest';
import { FailoverRouter } from '../src/failover-router.js';

describe('FailoverRouter', () => {
    let router;

    describe('constructor', () => {
        it('should create empty router with no config', () => {
            router = new FailoverRouter();

            expect(router.getMappings()).toEqual({});
        });

        it('should accept failover configuration', () => {
            router = new FailoverRouter({
                primary: 'backup',
                main: 'secondary',
            });

            expect(router.getMappings()).toEqual({
                primary: 'backup',
                main: 'secondary',
            });
        });
    });

    describe('hasFailover()', () => {
        beforeEach(() => {
            router = new FailoverRouter({ primary: 'backup' });
        });

        it('should return true for configured connections', () => {
            expect(router.hasFailover('primary')).toBe(true);
        });

        it('should return false for non-configured connections', () => {
            expect(router.hasFailover('other')).toBe(false);
        });
    });

    describe('getBackup()', () => {
        beforeEach(() => {
            router = new FailoverRouter({ primary: 'backup' });
        });

        it('should return backup name for configured connection', () => {
            expect(router.getBackup('primary')).toBe('backup');
        });

        it('should return undefined for non-configured connection', () => {
            expect(router.getBackup('other')).toBeUndefined();
        });
    });

    describe('resolve()', () => {
        beforeEach(() => {
            router = new FailoverRouter({ primary: 'backup' });
        });

        it('should return original when healthy', () => {
            const getStatus = () => 'healthy';

            const result = router.resolve('primary', getStatus);

            expect(result).toEqual({ name: 'primary', isFailover: false });
        });

        it('should return original when no status tracking', () => {
            const getStatus = () => undefined;

            const result = router.resolve('primary', getStatus);

            expect(result).toEqual({ name: 'primary', isFailover: false });
        });

        it('should return backup when primary is unhealthy', () => {
            const statuses = { primary: 'unhealthy', backup: 'healthy' };
            const getStatus = (name) => statuses[name];

            const result = router.resolve('primary', getStatus);

            expect(result).toEqual({ name: 'backup', isFailover: true });
        });

        it('should return original when primary is degraded', () => {
            const statuses = { primary: 'degraded', backup: 'healthy' };
            const getStatus = (name) => statuses[name];

            const result = router.resolve('primary', getStatus);

            expect(result).toEqual({ name: 'primary', isFailover: false });
        });

        it('should return original when no failover configured', () => {
            const getStatus = () => 'unhealthy';

            const result = router.resolve('other', getStatus);

            expect(result).toEqual({ name: 'other', isFailover: false });
        });

        it('should return original when both primary and backup are unhealthy', () => {
            const statuses = { primary: 'unhealthy', backup: 'unhealthy' };
            const getStatus = (name) => statuses[name];

            const result = router.resolve('primary', getStatus);

            expect(result).toEqual({ name: 'primary', isFailover: false });
        });

        it('should use backup when backup is degraded but primary is unhealthy', () => {
            const statuses = { primary: 'unhealthy', backup: 'degraded' };
            const getStatus = (name) => statuses[name];

            const result = router.resolve('primary', getStatus);

            expect(result).toEqual({ name: 'backup', isFailover: true });
        });
    });

    describe('activateFailover() / deactivateFailover()', () => {
        beforeEach(() => {
            router = new FailoverRouter({ primary: 'backup' });
        });

        it('should track active failovers', () => {
            router.activateFailover('primary');

            expect(router.isInFailover('primary')).toBe(true);
        });

        it('should remove from tracking on deactivate', () => {
            router.activateFailover('primary');
            router.deactivateFailover('primary');

            expect(router.isInFailover('primary')).toBe(false);
        });

        it('should be idempotent for activate', () => {
            router.activateFailover('primary');
            router.activateFailover('primary');

            expect(router.getActiveFailovers()).toHaveLength(1);
        });

        it('should be safe to deactivate when not active', () => {
            expect(() => router.deactivateFailover('primary')).not.toThrow();
        });
    });

    describe('isInFailover()', () => {
        beforeEach(() => {
            router = new FailoverRouter({ primary: 'backup' });
        });

        it('should return false when not in failover', () => {
            expect(router.isInFailover('primary')).toBe(false);
        });

        it('should return true when in failover', () => {
            router.activateFailover('primary');

            expect(router.isInFailover('primary')).toBe(true);
        });
    });

    describe('getActiveFailovers()', () => {
        beforeEach(() => {
            router = new FailoverRouter({
                primary: 'backup',
                main: 'secondary',
            });
        });

        it('should return empty array when no active failovers', () => {
            expect(router.getActiveFailovers()).toEqual([]);
        });

        it('should return all active failovers', () => {
            router.activateFailover('primary');
            router.activateFailover('main');

            const active = router.getActiveFailovers();

            expect(active).toHaveLength(2);
            expect(active).toContain('primary');
            expect(active).toContain('main');
        });
    });

    describe('getMappings()', () => {
        it('should return all configured mappings', () => {
            router = new FailoverRouter({
                a: 'b',
                c: 'd',
            });

            expect(router.getMappings()).toEqual({ a: 'b', c: 'd' });
        });

        it('should return empty object when no mappings', () => {
            router = new FailoverRouter();

            expect(router.getMappings()).toEqual({});
        });
    });
});
