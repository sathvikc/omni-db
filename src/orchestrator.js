/**
 * Orchestrator - Main class for managing multiple database connections
 * @module omni-db/orchestrator
 */

import { EventEmitter } from 'node:events';
import { Registry } from './registry.js';
import { HealthMonitor } from './health-monitor.js';
import { CircuitBreaker } from './circuit-breaker.js';
import { FailoverRouter } from './failover-router.js';

/**
 * @typedef {Object} OrchestratorConfig
 * @property {Record<string, unknown>} connections - Named database client instances
 * @property {HealthCheckConfig} [healthCheck] - Health check configuration
 * @property {Record<string, string>} [failover] - Failover mapping (primary -> backup)
 */

/**
 * @typedef {Object} HealthCheckConfig
 * @property {string} [interval='30s'] - Check interval (e.g., '30s', '1m')
 * @property {string} [timeout='5s'] - Check timeout
 * @property {Record<string, (client: unknown) => Promise<boolean>>} [checks] - Custom check functions
 */

/**
 * @typedef {'healthy' | 'degraded' | 'unhealthy'} HealthStatus
 */

/**
 * @typedef {Object} ConnectionHealth
 * @property {HealthStatus} status - Connection health status
 * @property {string} [failoverTo] - Name of connection being used as failover
 */

/**
 * Database connection orchestrator with health monitoring and failover.
 * @extends EventEmitter
 *
 * @fires Orchestrator#connected - When a connection is established
 * @fires Orchestrator#disconnected - When a connection is closed
 * @fires Orchestrator#health:changed - When health status changes
 * @fires Orchestrator#failover - When failover is activated
 * @fires Orchestrator#recovery - When failover is recovered
 * @fires Orchestrator#error - When an error occurs
 */
export class Orchestrator extends EventEmitter {
    /** @type {Registry} */
    #registry = new Registry();

    /** @type {HealthMonitor} */
    #healthMonitor;

    /** @type {FailoverRouter} */
    #failoverRouter;

    /** @type {Map<string, CircuitBreaker>} */
    #circuits = new Map();

    /** @type {boolean} */
    #connected = false;

    /**
     * Create a new Orchestrator instance.
     * @param {OrchestratorConfig} config - Configuration object
     * @throws {Error} If config is not provided
     * @throws {Error} If connections is not an object or is empty
     */
    constructor(config) {
        super();

        if (!config || typeof config !== 'object') {
            throw new Error('Config must be an object');
        }

        if (!config.connections || typeof config.connections !== 'object') {
            throw new Error('Config must include a connections object');
        }

        const connectionNames = Object.keys(config.connections);
        if (connectionNames.length === 0) {
            throw new Error('At least one connection must be provided');
        }



        // Initialize health monitor
        this.#healthMonitor = new HealthMonitor(config.healthCheck);

        // Initialize failover router
        this.#failoverRouter = new FailoverRouter(config.failover);

        // Register all connections
        for (const [name, client] of Object.entries(config.connections)) {
            this.#registry.register(name, client);
            this.#healthMonitor.register(name, config.healthCheck?.checks?.[name]);

            // Create circuit breaker per connection if enabled
            if (config.circuitBreaker) {
                this.#circuits.set(name, new CircuitBreaker(config.circuitBreaker));
            }
        }
    }

    /**
     * Connect to all registered databases.
     * Validates that connections are accessible.
     * @returns {Promise<void>}
     * @fires Orchestrator#connected
     */
    async connect() {
        if (this.#connected) {
            return;
        }

        for (const name of this.#registry.list()) {
            this.emit('connected', { name, timestamp: Date.now() });
        }

        // Start health monitoring
        this.#healthMonitor.start(() => this.#runHealthChecks());

        this.#connected = true;
    }

    /**
     * Disconnect from all databases.
     * @returns {Promise<void>}
     * @fires Orchestrator#disconnected
     */
    async disconnect() {
        if (!this.#connected) {
            return;
        }

        // Stop health monitoring
        this.#healthMonitor.stop();

        for (const name of this.#registry.list()) {
            this.emit('disconnected', { name, timestamp: Date.now() });
        }

        this.#connected = false;
    }

    /**
     * Get a database client by name.
     * When failover is configured and primary is unhealthy, returns backup.
     * @param {string} name - The connection name
     * @returns {unknown | undefined} The database client
     * @fires Orchestrator#failover - If routing to backup
     * @fires Orchestrator#recovery - If recovering from failover
     * @fires Orchestrator#circuit:open - If circuit opens due to failures
     */
    get(name) {
        // Check circuit breaker if enabled
        const circuit = this.#circuits.get(name);
        if (circuit && !circuit.canExecute()) {
            this.emit('error', new Error(`Circuit open for "${name}"`));
            return undefined;
        }

        const resolved = this.#failoverRouter.resolve(name, (n) =>
            this.#healthMonitor.getStatus(n)
        );

        if (resolved.isFailover) {
            // Check if this is a new failover
            if (!this.#failoverRouter.isInFailover(name)) {
                this.#failoverRouter.activateFailover(name);
                this.emit('failover', {
                    primary: name,
                    backup: resolved.name,
                    timestamp: Date.now(),
                });
            }
        } else if (this.#failoverRouter.isInFailover(name)) {
            // Was in failover, now recovered
            const backup = this.#failoverRouter.getBackup(name);
            this.#failoverRouter.deactivateFailover(name);
            this.emit('recovery', {
                primary: name,
                backup,
                timestamp: Date.now(),
            });
        }

        return this.#registry.get(resolved.name);
    }

    /**
     * Record a successful operation for a connection.
     * Use this after successful database operations to help circuit breaker recover.
     * @param {string} name - The connection name
     * @fires Orchestrator#circuit:close - If circuit closes after success
     */
    recordSuccess(name) {
        const circuit = this.#circuits.get(name);
        if (!circuit) return;

        const wasOpen = circuit.state !== 'closed';
        circuit.success();

        if (wasOpen) {
            this.emit('circuit:close', { name, timestamp: Date.now() });
        }
    }

    /**
     * Record a failed operation for a connection.
     * Use this after failed database operations to trigger circuit breaker.
     * @param {string} name - The connection name
     * @fires Orchestrator#circuit:open - If failure causes circuit to open
     */
    recordFailure(name) {
        const circuit = this.#circuits.get(name);
        if (!circuit) return;

        const opened = circuit.failure();

        if (opened) {
            this.emit('circuit:open', { name, timestamp: Date.now() });
        }
    }

    /**
     * Execute a function with automatic connection handling and circuit breaker protection.
     * Replaces manual get() + recordSuccess() / recordFailure() usage.
     * 
     * @template T
     * @param {string} name - The connection name
     * @param {(client: unknown) => Promise<T>} fn - Function to execute
     * @returns {Promise<T>} Result of the function
     * @throws {Error} If connection not found or circuit open
     */
    async execute(name, fn) {
        // Resolve connection (handles failover + health + circuit check)
        // We use .get() internally which already does circuit checks
        const client = this.get(name);

        if (!client) {
            // Error was already emitted by get() if circuit was open
            throw new Error(`Connection "${name}" is unavailable`);
        }

        // We need to know which actual connection verified by get() we are using 
        // to record metrics against the correct target (e.g. if failover happened)
        // However, .get() returns the *client*, not the name.
        // We need to re-resolve to be sure which name to record against.
        // Optimization: We could refactor get() to return { client, resolvedName } but that breaks API.
        // For now, let's re-resolve failover logic quickly or just assume we record against original 'name'
        // effectively treating failover as transparent to the caller?
        // Actually, if failover happens, we want to record against the *backup*.

        const resolved = this.#failoverRouter.resolve(name, (n) =>
            this.#healthMonitor.getStatus(n)
        );
        const targetName = resolved.name;

        // Use the circuit breaker for the TARGET connection
        // We can use the lower-level circuit wrapper if it exists
        const circuit = this.#circuits.get(targetName);

        if (circuit) {
            try {
                // Let the circuit breaker wrapper handle success/failure tracking
                return await circuit.execute(async () => fn(client));
            } catch (err) {
                // circuit.execute() already recorded the failure
                // We re-throw so user sees the error
                throw err;
            }
        } else {
            // No circuit breaker, fallback to manual try/catch
            try {
                const result = await fn(client);
                return result; // No stats to record
            } catch (err) {
                throw err;
            }
        }
    }

    /**
     * Get all registered connection names.
     * @returns {string[]} Array of connection names
     */
    list() {
        return this.#registry.list();
    }

    /**
     * Check if a connection exists.
     * @param {string} name - The connection name
     * @returns {boolean} True if connection exists
     */
    has(name) {
        return this.#registry.has(name);
    }

    /**
     * Get health status of all connections.
     * @returns {Record<string, ConnectionHealth>} Health status per connection
     */
    health() {
        const result = {};
        const allStatus = this.#healthMonitor.getAllStatus();

        for (const name of this.#registry.list()) {
            /* c8 ignore next -- defensive fallback; status is always set for registered connections */
            const status = allStatus[name] || 'healthy';
            const isInFailover = this.#failoverRouter.isInFailover(name);

            result[name] = {
                status,
                ...(isInFailover && { failoverTo: this.#failoverRouter.getBackup(name) }),
            };
        }

        return result;
    }

    /**
     * Get comprehensive statistics for all connections.
     * Includes health status, circuit breaker state, and failure counts.
     * @returns {Record<string, object>} Stats per connection
     */
    getStats() {
        const stats = {};
        const health = this.health();

        for (const name of this.#registry.list()) {
            const circuit = this.#circuits.get(name);
            stats[name] = {
                status: health[name].status,
                circuit: circuit ? circuit.state : 'n/a',
                failures: circuit ? circuit.failures : 0,
                failoverTo: health[name].failoverTo || null
            };
        }

        return stats;
    }

    /**
     * Check if orchestrator is connected.
     * @returns {boolean} True if connected
     */
    get isConnected() {
        return this.#connected;
    }

    /**
     * Get the number of registered connections.
     * @returns {number} Connection count
     */
    get size() {
        return this.#registry.size;
    }

    /**
     * Register signal handlers for graceful shutdown.
     * When a signal is received, calls disconnect() and optionally exits the process.
     * @param {Object} [options] - Shutdown options
     * @param {string[]} [options.signals=['SIGTERM', 'SIGINT']] - Signals to handle
     * @param {number} [options.exitCode=0] - Exit code after shutdown
     * @param {boolean} [options.exitProcess=true] - Whether to call process.exit()
     * @returns {() => void} Cleanup function to remove signal handlers
     */
    shutdownOnSignal(options = {}) {
        const {
            signals = ['SIGTERM', 'SIGINT'],
            exitCode = 0,
            exitProcess = true,
        } = options;

        const handler = async (signal) => {
            this.emit('shutdown', { signal, timestamp: Date.now() });
            await this.disconnect();
            if (exitProcess) {
                process.exit(exitCode);
            }
        };

        // Register handlers
        for (const signal of signals) {
            process.on(signal, handler);
        }

        // Return cleanup function
        return () => {
            for (const signal of signals) {
                process.off(signal, handler);
            }
        };
    }

    /**
     * Run health checks for all connections.
     * @private
     */
    async #runHealthChecks() {
        for (const name of this.#registry.list()) {
            const client = this.#registry.get(name);
            const previousStatus = this.#healthMonitor.getStatus(name);
            const newStatus = await this.#healthMonitor.check(name, client);

            if (newStatus !== previousStatus) {
                this.#healthMonitor.setStatus(name, newStatus);

                // SYNC: If health check fails, trip the circuit breaker immediately
                if (newStatus === 'unhealthy') {
                    const circuit = this.#circuits.get(name);
                    if (circuit && circuit.state !== 'open') {
                        circuit.open();
                        this.emit('circuit:open', {
                            name,
                            reason: 'health-check-failed',
                            timestamp: Date.now()
                        });
                    }
                }

                this.emit('health:changed', {
                    name,
                    previous: previousStatus,
                    current: newStatus,
                    timestamp: Date.now(),
                });
            }
        }
    }
}
