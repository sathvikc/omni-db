/**
 * Orchestrator - Main class for managing multiple database connections
 * @module omni-db/orchestrator
 */

import { EventEmitter } from 'node:events';
import { Registry } from './registry.js';
import { HealthMonitor } from './health-monitor.js';
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

    /** @type {OrchestratorConfig} */
    #config;

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

        this.#config = config;

        // Initialize health monitor
        this.#healthMonitor = new HealthMonitor(config.healthCheck);

        // Initialize failover router
        this.#failoverRouter = new FailoverRouter(config.failover);

        // Register all connections
        for (const [name, client] of Object.entries(config.connections)) {
            this.#registry.register(name, client);
            this.#healthMonitor.register(name, config.healthCheck?.checks?.[name]);
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
            this.emit('connected', name);
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
            this.emit('disconnected', name);
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
     */
    get(name) {
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
                });
            }
        } else if (this.#failoverRouter.isInFailover(name)) {
            // Was in failover, now recovered
            const backup = this.#failoverRouter.getBackup(name);
            this.#failoverRouter.deactivateFailover(name);
            this.emit('recovery', {
                primary: name,
                backup,
            });
        }

        return this.#registry.get(resolved.name);
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
                this.emit('health:changed', {
                    name,
                    previous: previousStatus,
                    current: newStatus,
                });
            }
        }
    }
}
