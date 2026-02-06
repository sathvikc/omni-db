/**
 * Circuit Breaker - Prevents cascading failures by fast-failing when errors exceed threshold
 * @module omni-db/circuit-breaker
 */

/**
 * @typedef {'closed' | 'open' | 'half-open'} CircuitState
 */

/**
 * @typedef {Object} CircuitBreakerConfig
 * @property {number} [threshold=5] - Number of failures before opening circuit
 * @property {string|number} [resetTimeout=30000] - Time in ms before attempting half-open
 * @property {number} [halfOpenSuccesses=2] - Successes needed to close from half-open
 */

import { parseDuration } from './health-monitor.js';

/**
 * Simple circuit breaker implementation for preventing cascading failures.
 * 
 * States:
 * - closed: Normal operation, requests pass through
 * - open: Fast-fail immediately, don't attempt operation
 * - half-open: Allow test requests to check if service recovered
 * 
 * @example
 * const circuit = new CircuitBreaker({ threshold: 3, resetTimeout: '10s' });
 * 
 * const result = await circuit.execute(async () => {
 *   return await db.query('SELECT * FROM users');
 * });
 */
export class CircuitBreaker {
    /** @type {CircuitState} */
    #state = 'closed';

    /** @type {number} */
    #failures = 0;

    /** @type {number} */
    #successCount = 0;

    /** @type {number|null} */
    #nextAttemptTime = null;

    /** @type {number} */
    #threshold;

    /** @type {number} */
    #resetTimeout;

    /** @type {number} */
    #halfOpenSuccesses;

    /**
     * Create a new CircuitBreaker.
     * @param {CircuitBreakerConfig} [config={}]
     * @throws {Error} If configuration values are invalid
     */
    constructor(config = {}) {
        // Validate threshold
        const threshold = config.threshold ?? 5;
        if (typeof threshold !== 'number' || threshold < 1) {
            throw new Error('threshold must be a positive number (>= 1)');
        }
        this.#threshold = Math.floor(threshold);

        // Validate and parse resetTimeout
        if (typeof config.resetTimeout === 'string') {
            this.#resetTimeout = parseDuration(config.resetTimeout);
        } else {
            const timeout = config.resetTimeout ?? 30000;
            if (typeof timeout !== 'number' || timeout < 0) {
                throw new Error('resetTimeout must be a positive number or duration string');
            }
            this.#resetTimeout = timeout;
        }

        // Validate halfOpenSuccesses
        const halfOpenSuccesses = config.halfOpenSuccesses ?? 2;
        if (typeof halfOpenSuccesses !== 'number' || halfOpenSuccesses < 1) {
            throw new Error('halfOpenSuccesses must be a positive number (>= 1)');
        }
        this.#halfOpenSuccesses = Math.floor(halfOpenSuccesses);
    }

    /**
     * Execute a function with circuit breaker protection.
     * @template T
     * @param {() => Promise<T>} fn - Async function to execute
     * @returns {Promise<T>} Result of the function
     * @throws {Error} If circuit is open or function throws
     */
    async execute(fn) {
        // Check if circuit should transition to half-open
        this.#tryTransitionToHalfOpen();

        // Fast-fail if circuit is open
        if (this.#state === 'open') {
            throw new Error('Circuit breaker is OPEN');
        }

        try {
            const result = await fn();
            this.#onSuccess();
            return result;
        } catch (err) {
            this.#onFailure();
            throw err;
        }
    }

    /**
     * Get current circuit state.
     * @returns {CircuitState}
     */
    get state() {
        this.#tryTransitionToHalfOpen();
        return this.#state;
    }

    /**
     * Attempt to transition from open to half-open if timeout valid.
     */
    #tryTransitionToHalfOpen() {
        if (this.#state === 'open' && this.#nextAttemptTime && Date.now() >= this.#nextAttemptTime) {
            this.#state = 'half-open';
            this.#successCount = 0;
        }
    }

    /**
     * Get current failure count.
     * @returns {number}
     */
    get failures() {
        return this.#failures;
    }

    /**
     * Check if the circuit allows execution.
     * @returns {boolean} True if execution is allowed
     */
    canExecute() {
        const state = this.state; // Triggers half-open check
        return state === 'closed' || state === 'half-open';
    }

    /**
     * Manually record a successful operation.
     * Use this when you can't use execute() wrapper.
     */
    success() {
        this.#onSuccess();
    }

    /**
     * Manually record a failed operation.
     * Use this when you can't use execute() wrapper.
     * @returns {boolean} True if failure caused circuit to open
     */
    failure() {
        return this.#onFailure();
    }

    /**
     * Force the circuit to close.
     */
    reset() {
        this.#state = 'closed';
        this.#failures = 0;
        this.#successCount = 0;
        this.#nextAttemptTime = null;
    }

    /**
     * Force the circuit to open.
     * Use this when external health checks indicate failure.
     */
    open() {
        this.#state = 'open';
        this.#nextAttemptTime = Date.now() + this.#resetTimeout;
    }

    /**
     * Handle successful operation.
     */
    #onSuccess() {
        this.#failures = 0;

        if (this.#state === 'half-open') {
            this.#successCount++;
            if (this.#successCount >= this.#halfOpenSuccesses) {
                this.#state = 'closed';
            }
        }
    }

    /**
     * Handle failed operation.
     * @returns {boolean} True if circuit opened
     */
    #onFailure() {
        this.#failures++;

        if (this.#state === 'half-open') {
            // Failed during half-open, go back to open
            this.#state = 'open';
            this.#nextAttemptTime = Date.now() + this.#resetTimeout;
            return true;
        }

        if (this.#failures >= this.#threshold) {
            // Too many failures, open the circuit
            this.#state = 'open';
            this.#nextAttemptTime = Date.now() + this.#resetTimeout;
            return true;
        }

        return false;
    }
}
