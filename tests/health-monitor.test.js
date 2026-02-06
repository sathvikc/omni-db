import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HealthMonitor, parseDuration } from '../src/health-monitor.js';

describe('parseDuration', () => {
    it('should parse milliseconds', () => {
        expect(parseDuration('100ms')).toBe(100);
        expect(parseDuration('1000ms')).toBe(1000);
    });

    it('should parse seconds', () => {
        expect(parseDuration('1s')).toBe(1000);
        expect(parseDuration('30s')).toBe(30000);
    });

    it('should parse minutes', () => {
        expect(parseDuration('1m')).toBe(60000);
        expect(parseDuration('5m')).toBe(300000);
    });

    it('should parse hours', () => {
        expect(parseDuration('1h')).toBe(3600000);
        expect(parseDuration('2h')).toBe(7200000);
    });

    it('should throw for non-string input', () => {
        expect(() => parseDuration(123)).toThrow('Duration must be a string');
    });

    it('should throw for invalid format', () => {
        expect(() => parseDuration('invalid')).toThrow('Invalid duration format');
        expect(() => parseDuration('30')).toThrow('Invalid duration format');
        expect(() => parseDuration('30x')).toThrow('Invalid duration format');
        expect(() => parseDuration('')).toThrow('Invalid duration format');
    });

    it('should reject zero duration', () => {
        expect(() => parseDuration('0s')).toThrow(/positive|zero|must be/i);
        expect(() => parseDuration('0ms')).toThrow(/positive|zero|must be/i);
    });

    it('should reject extremely large durations (> 24h)', () => {
        expect(() => parseDuration('25h')).toThrow(/large|maximum|exceed/i);
        expect(() => parseDuration('100h')).toThrow(/large|maximum|exceed/i);
    });
});

describe('HealthMonitor', () => {
    let monitor;

    beforeEach(() => {
        monitor = new HealthMonitor();
    });

    afterEach(() => {
        monitor.stop();
    });

    describe('constructor', () => {
        it('should use default interval and timeout', () => {
            expect(monitor.interval).toBe(30000); // 30s
            expect(monitor.timeout).toBe(5000); // 5s
        });

        it('should accept custom interval and timeout', () => {
            const custom = new HealthMonitor({
                interval: '1m',
                timeout: '10s',
            });

            expect(custom.interval).toBe(60000);
            expect(custom.timeout).toBe(10000);
        });
    });

    describe('register()', () => {
        it('should register a connection with healthy status', () => {
            monitor.register('db1');

            expect(monitor.getStatus('db1')).toBe('healthy');
        });

        it('should register with custom check function', () => {
            const checkFn = async () => true;
            monitor.register('db1', checkFn);

            expect(monitor.getStatus('db1')).toBe('healthy');
        });
    });

    describe('unregister()', () => {
        it('should remove connection from monitoring', () => {
            monitor.register('db1');
            monitor.unregister('db1');

            expect(monitor.getStatus('db1')).toBeUndefined();
        });

        it('should be safe to call for non-existent connection', () => {
            expect(() => monitor.unregister('nonexistent')).not.toThrow();
        });
    });

    describe('getStatus()', () => {
        it('should return status for registered connection', () => {
            monitor.register('db1');

            expect(monitor.getStatus('db1')).toBe('healthy');
        });

        it('should return undefined for unregistered connection', () => {
            expect(monitor.getStatus('nonexistent')).toBeUndefined();
        });
    });

    describe('getAllStatus()', () => {
        it('should return empty object when no connections', () => {
            expect(monitor.getAllStatus()).toEqual({});
        });

        it('should return all statuses', () => {
            monitor.register('db1');
            monitor.register('db2');
            monitor.setStatus('db2', 'unhealthy');

            expect(monitor.getAllStatus()).toEqual({
                db1: 'healthy',
                db2: 'unhealthy',
            });
        });
    });

    describe('setStatus()', () => {
        it('should update status and return previous', () => {
            monitor.register('db1');

            const previous = monitor.setStatus('db1', 'unhealthy');

            expect(previous).toBe('healthy');
            expect(monitor.getStatus('db1')).toBe('unhealthy');
        });

        it('should return undefined for unregistered connection', () => {
            const result = monitor.setStatus('nonexistent', 'unhealthy');

            expect(result).toBeUndefined();
        });

        it('should not register unregistered connection', () => {
            monitor.setStatus('nonexistent', 'healthy');

            expect(monitor.getStatus('nonexistent')).toBeUndefined();
        });
    });

    describe('check()', () => {
        it('should return healthy when no check function registered', async () => {
            monitor.register('db1');

            const result = await monitor.check('db1', {});

            expect(result.status).toBe('healthy');
        });

        it('should return healthy when check passes', async () => {
            monitor.register('db1', async () => true);

            const result = await monitor.check('db1', {});

            expect(result.status).toBe('healthy');
        });

        it('should return unhealthy when check returns false', async () => {
            monitor.register('db1', async () => false);

            const result = await monitor.check('db1', {});

            expect(result.status).toBe('unhealthy');
        });

        it('should return degraded when check returns "degraded"', async () => {
            monitor.register('db1', async () => 'degraded');
            const result = await monitor.check('db1', {});
            expect(result.status).toBe('degraded');
        });

        it('should return unhealthy with error when check throws', async () => {
            monitor.register('db1', async () => {
                throw new Error('Connection failed');
            });

            const result = await monitor.check('db1', {});

            expect(result.status).toBe('unhealthy');
            expect(result.error).toBeInstanceOf(Error);
            expect(result.error.message).toBe('Connection failed');
        });

        it('should return unhealthy when check times out', async () => {
            const fastMonitor = new HealthMonitor({ timeout: '50ms' });
            fastMonitor.register('db1', async () => {
                await new Promise((resolve) => setTimeout(resolve, 200));
                return true;
            });

            const result = await fastMonitor.check('db1', {});

            expect(result.status).toBe('unhealthy');
        });

        it('should pass client to check function', async () => {
            const client = { name: 'testClient' };
            let receivedClient;

            monitor.register('db1', async (c) => {
                receivedClient = c;
                return true;
            });

            await monitor.check('db1', client);

            expect(receivedClient).toBe(client);
        });

        describe('retry logic', () => {
            beforeEach(() => {
                vi.useFakeTimers();
            });

            afterEach(() => {
                vi.useRealTimers();
            });

            it('should retry on failure and eventually succeed', async () => {
                const retryMonitor = new HealthMonitor({
                    retry: { retries: 2, delay: '100ms' }
                });

                let attempts = 0;
                retryMonitor.register('db1', async () => {
                    attempts++;
                    if (attempts <= 2) {
                        return false; // Fail first 2 times
                    }
                    return true; // Succeed on 3rd
                });

                const checkPromise = retryMonitor.check('db1', {});

                // Fast-forward through delays
                await vi.advanceTimersByTimeAsync(100); // Attempt 1 -> 2
                await vi.advanceTimersByTimeAsync(100); // Attempt 2 -> 3

                const result = await checkPromise;
                expect(result.status).toBe('healthy');
                expect(attempts).toBe(3);
            });

            it('should return unhealthy if retries exhausted', async () => {
                const retryMonitor = new HealthMonitor({
                    retry: { retries: 1, delay: '100ms' }
                });

                let attempts = 0;
                retryMonitor.register('db1', async () => {
                    attempts++;
                    return false;
                });

                const checkPromise = retryMonitor.check('db1', {});

                await vi.advanceTimersByTimeAsync(200);

                const result = await checkPromise;
                expect(result.status).toBe('unhealthy');
                expect(attempts).toBe(2); // Initial + 1 retry
            });

            it('should respect custom delay', async () => {
                const retryMonitor = new HealthMonitor({
                    retry: { retries: 1, delay: '500ms' }
                });

                let attempts = 0;
                retryMonitor.register('db1', async () => {
                    attempts++;
                    return false;
                });

                const checkPromise = retryMonitor.check('db1', {});

                // Should not have retried yet
                await vi.advanceTimersByTimeAsync(200);
                expect(attempts).toBe(1);

                // Now it should retry
                await vi.advanceTimersByTimeAsync(300);
                expect(attempts).toBe(2); // Retry happened after 500ms total

                await checkPromise;
            });

            it('should use defaults when retry config is partial', async () => {
                const retryMonitor = new HealthMonitor({
                    retry: {} // Should default to retries: 0, delay: '100ms'
                });

                let attempts = 0;
                retryMonitor.register('db1', async () => {
                    attempts++;
                    return false;
                });

                const result = await retryMonitor.check('db1', {});
                expect(result.status).toBe('unhealthy');
                expect(attempts).toBe(1); // 0 retries = 1 attempt
            });
        });
    });

    describe('start() / stop()', () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it('should start periodic checks', async () => {
            const checkAllFn = vi.fn();
            const fastMonitor = new HealthMonitor({ interval: '100ms' });

            fastMonitor.start(checkAllFn);

            expect(fastMonitor.isRunning).toBe(true);
            expect(checkAllFn).not.toHaveBeenCalled();

            await vi.advanceTimersByTimeAsync(100);
            expect(checkAllFn).toHaveBeenCalledTimes(1);

            await vi.advanceTimersByTimeAsync(100);
            expect(checkAllFn).toHaveBeenCalledTimes(2);

            fastMonitor.stop();
        });

        it('should stop periodic checks', async () => {
            const checkAllFn = vi.fn();
            const fastMonitor = new HealthMonitor({ interval: '100ms' });

            fastMonitor.start(checkAllFn);
            fastMonitor.stop();

            expect(fastMonitor.isRunning).toBe(false);

            await vi.advanceTimersByTimeAsync(200);
            expect(checkAllFn).not.toHaveBeenCalled();
        });

        it('should be idempotent for start', () => {
            const checkAllFn = vi.fn();
            const fastMonitor = new HealthMonitor({ interval: '100ms' });

            fastMonitor.start(checkAllFn);
            fastMonitor.start(checkAllFn);

            expect(fastMonitor.isRunning).toBe(true);
            fastMonitor.stop();
        });

        it('should be safe to stop when not running', () => {
            expect(() => monitor.stop()).not.toThrow();
            expect(monitor.isRunning).toBe(false);
        });
    });

    describe('isRunning', () => {
        it('should return false initially', () => {
            expect(monitor.isRunning).toBe(false);
        });
    });
});
