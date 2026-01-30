import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CircuitBreaker } from '../src/circuit-breaker.js';

describe('CircuitBreaker', () => {
    let circuit;

    beforeEach(() => {
        circuit = new CircuitBreaker({ threshold: 3, resetTimeout: 1000, halfOpenSuccesses: 2 });
    });

    describe('initial state', () => {
        it('should start in closed state', () => {
            expect(circuit.state).toBe('closed');
        });

        it('should have zero failures', () => {
            expect(circuit.failures).toBe(0);
        });

        it('should allow execution', () => {
            expect(circuit.canExecute()).toBe(true);
        });
    });

    describe('execute()', () => {
        it('should return result on success', async () => {
            const result = await circuit.execute(async () => 'hello');
            expect(result).toBe('hello');
        });

        it('should throw on failure and record it', async () => {
            await expect(circuit.execute(async () => {
                throw new Error('DB error');
            })).rejects.toThrow('DB error');

            expect(circuit.failures).toBe(1);
        });

        it('should open circuit after threshold failures', async () => {
            for (let i = 0; i < 3; i++) {
                await expect(circuit.execute(async () => {
                    throw new Error('fail');
                })).rejects.toThrow('fail');
            }

            expect(circuit.state).toBe('open');
        });

        it('should fast-fail when circuit is open', async () => {
            // Open the circuit
            for (let i = 0; i < 3; i++) {
                try {
                    await circuit.execute(async () => { throw new Error('fail'); });
                } catch { }
            }

            // Should throw circuit open error
            await expect(circuit.execute(async () => 'hello'))
                .rejects.toThrow('Circuit breaker is OPEN');
        });
    });

    describe('half-open state', () => {
        beforeEach(async () => {
            // Open the circuit
            for (let i = 0; i < 3; i++) {
                try {
                    await circuit.execute(async () => { throw new Error('fail'); });
                } catch { }
            }
        });

        it('should transition to half-open after resetTimeout', () => {
            vi.useFakeTimers();
            vi.advanceTimersByTime(1001);

            expect(circuit.state).toBe('half-open');
            expect(circuit.canExecute()).toBe(true);

            vi.useRealTimers();
        });

        it('should require multiple successes to close', async () => {
            vi.useFakeTimers();
            vi.advanceTimersByTime(1001);

            expect(circuit.state).toBe('half-open');

            // First success - should still be half-open
            await circuit.execute(async () => 'ok');
            expect(circuit.state).toBe('half-open');

            // Second success - should close
            await circuit.execute(async () => 'ok');
            expect(circuit.state).toBe('closed');

            vi.useRealTimers();
        });

        it('should reopen on failure in half-open', async () => {
            vi.useFakeTimers();
            vi.advanceTimersByTime(1001);

            expect(circuit.state).toBe('half-open');

            await expect(circuit.execute(async () => {
                throw new Error('fail');
            })).rejects.toThrow('fail');

            expect(circuit.state).toBe('open');

            vi.useRealTimers();
        });
    });

    describe('manual success/failure', () => {
        it('should track failures manually', () => {
            circuit.failure();
            circuit.failure();
            expect(circuit.failures).toBe(2);
        });

        it('should open on manual failures', () => {
            circuit.failure();
            circuit.failure();
            const opened = circuit.failure();

            expect(opened).toBe(true);
            expect(circuit.state).toBe('open');
        });

        it('should reset failures on manual success', () => {
            circuit.failure();
            circuit.failure();
            circuit.success();

            expect(circuit.failures).toBe(0);
        });
    });

    describe('reset', () => {
        it('should force close the circuit', async () => {
            for (let i = 0; i < 3; i++) {
                try {
                    await circuit.execute(async () => { throw new Error('fail'); });
                } catch { }
            }
            expect(circuit.state).toBe('open');

            circuit.reset();

            expect(circuit.state).toBe('closed');
            expect(circuit.failures).toBe(0);
        });
    });

    describe('configuration', () => {
        it('should use default threshold of 5', async () => {
            const defaultCircuit = new CircuitBreaker({});

            for (let i = 0; i < 4; i++) {
                try {
                    await defaultCircuit.execute(async () => { throw new Error('fail'); });
                } catch { }
            }
            expect(defaultCircuit.state).toBe('closed');

            try {
                await defaultCircuit.execute(async () => { throw new Error('fail'); });
            } catch { }
            expect(defaultCircuit.state).toBe('open');
        });

        it('should parse string resetTimeout', () => {
            const stringCircuit = new CircuitBreaker({
                threshold: 1,
                resetTimeout: '500ms',
            });

            stringCircuit.failure();
            expect(stringCircuit.state).toBe('open');

            vi.useFakeTimers();
            vi.advanceTimersByTime(501);
            expect(stringCircuit.state).toBe('half-open');
            vi.useRealTimers();
        });

        it('should use default halfOpenSuccesses of 2', async () => {
            const defaultCircuit = new CircuitBreaker({ threshold: 1, resetTimeout: 100 });

            defaultCircuit.failure();
            expect(defaultCircuit.state).toBe('open');

            vi.useFakeTimers();
            vi.advanceTimersByTime(101);

            // One success shouldn't close it
            await defaultCircuit.execute(async () => 'ok');
            expect(defaultCircuit.state).toBe('half-open');

            // Two successes should close it
            await defaultCircuit.execute(async () => 'ok');
            expect(defaultCircuit.state).toBe('closed');

            vi.useRealTimers();
        });
    });
});
