/**
 * Health Monitor - Periodic health checks for database connections
 * @module omni-db/health-monitor
 */

/**
 * @typedef {'healthy' | 'degraded' | 'unhealthy'} HealthStatus
 */

/**
 * @typedef {Object} RetryConfig
 * @property {number} [retries=0] - Number of retries before marking unhealthy
 * @property {string} [delay='100ms'] - Delay between retries
 */

/**
 * @typedef {Object} HealthCheckOptions
 * @property {string} [interval='30s'] - Check interval
 * @property {string} [timeout='5s'] - Check timeout
 * @property {RetryConfig} [retry] - Retry configuration
 */

/**
 * Parse duration string to milliseconds.
 * @param {string} duration - Duration string (e.g., '30s', '5m', '1h')
 * @returns {number} Milliseconds
 */
export function parseDuration(duration) {
    if (typeof duration !== 'string') {
        throw new Error('Duration must be a string');
    }

    const match = duration.match(/^(\d+)(ms|s|m|h)$/);
    if (!match) {
        throw new Error(`Invalid duration format: ${duration}. Use format like '30s', '5m', '1h'`);
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    const multipliers = {
        ms: 1,
        s: 1000,
        m: 60 * 1000,
        h: 60 * 60 * 1000,
    };

    return value * multipliers[unit];
}

/**
 * Monitors health of database connections with periodic checks.
 */
export class HealthMonitor {
    /** @type {Map<string, HealthStatus>} */
    #status = new Map();

    /** @type {Map<string, (client: unknown) => Promise<boolean>>} */
    #checks = new Map();

    /** @type {number} */
    #intervalMs;

    /** @type {number} */
    #timeoutMs;

    /** @type {NodeJS.Timeout | null} */
    #intervalId = null;

    /** @type {boolean} */
    #running = false;

    /** @type {{ retries: number, delayMs: number } | null} */
    #retryConfig = null;

    /**
     * Create a new HealthMonitor.
     * @param {HealthCheckOptions} [options={}] - Configuration options
     */
    constructor(options = {}) {
        this.#intervalMs = parseDuration(options.interval || '30s');
        this.#timeoutMs = parseDuration(options.timeout || '5s');

        if (options.retry) {
            this.#retryConfig = {
                retries: options.retry.retries || 0,
                delayMs: parseDuration(options.retry.delay || '100ms')
            };
        }
    }

    /**
     * Register a connection for health monitoring.
     * @param {string} name - Connection name
     * @param {(client: unknown) => Promise<boolean>} [checkFn] - Custom health check function
     */
    register(name, checkFn) {
        this.#status.set(name, 'healthy');
        if (checkFn) {
            this.#checks.set(name, checkFn);
        }
    }

    /**
     * Unregister a connection from health monitoring.
     * @param {string} name - Connection name
     */
    unregister(name) {
        this.#status.delete(name);
        this.#checks.delete(name);
    }

    /**
     * Get the health status of a connection.
     * @param {string} name - Connection name
     * @returns {HealthStatus | undefined} The status, or undefined if not registered
     */
    getStatus(name) {
        return this.#status.get(name);
    }

    /**
     * Get all health statuses.
     * @returns {Record<string, HealthStatus>} Object mapping names to statuses
     */
    getAllStatus() {
        return Object.fromEntries(this.#status);
    }

    /**
     * Set the health status of a connection.
     * @param {string} name - Connection name
     * @param {HealthStatus} status - New status
     * @returns {HealthStatus | undefined} Previous status, or undefined if not registered
     */
    setStatus(name, status) {
        const previous = this.#status.get(name);
        if (previous !== undefined) {
            this.#status.set(name, status);
        }
        return previous;
    }

    /**
     * Check health of a single connection.
     * @param {string} name - Connection name
     * @param {unknown} client - The database client
     * @returns {Promise<HealthStatus>} The health status
     */
    async check(name, client) {
        const checkFn = this.#checks.get(name);

        if (!checkFn) {
            // No custom check, assume healthy
            return 'healthy';
        }

        let attempts = 0;
        const maxAttempts = (this.#retryConfig?.retries || 0) + 1;
        const delayMs = this.#retryConfig?.delayMs || 100;

        while (attempts < maxAttempts) {
            attempts++;
            try {
                const result = await Promise.race([
                    checkFn(client),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Health check timeout')), this.#timeoutMs)
                    ),
                ]);

                if (result === 'degraded') return 'degraded';
                if (result === true || result === 'healthy') return 'healthy';
            } catch {
                // Ignore error and retry
            }

            if (attempts < maxAttempts) {
                await new Promise((resolve) => setTimeout(resolve, delayMs));
            }
        }

        return 'unhealthy';
    }

    /**
     * Start periodic health checks.
     * @param {() => Promise<void>} checkAllFn - Function to check all connections
     */
    start(checkAllFn) {
        if (this.#running) {
            return;
        }

        this.#running = true;
        this.#intervalId = setInterval(async () => {
            await checkAllFn();
        }, this.#intervalMs);
    }

    /**
     * Stop periodic health checks.
     */
    stop() {
        if (this.#intervalId) {
            clearInterval(this.#intervalId);
            this.#intervalId = null;
        }
        this.#running = false;
    }

    /**
     * Check if health monitoring is running.
     * @returns {boolean} True if running
     */
    get isRunning() {
        return this.#running;
    }

    /**
     * Get the check interval in milliseconds.
     * @returns {number} Interval in ms
     */
    get interval() {
        return this.#intervalMs;
    }

    /**
     * Get the check timeout in milliseconds.
     * @returns {number} Timeout in ms
     */
    get timeout() {
        return this.#timeoutMs;
    }
}
