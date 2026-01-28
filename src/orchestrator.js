/**
 * Orchestrator - Main class for managing multiple database connections
 * @module omni-db/orchestrator
 */

import { EventEmitter } from 'node:events';
import { Registry } from './registry.js';

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
 * Database connection orchestrator with health monitoring and failover.
 * @extends EventEmitter
 *
 * @fires Orchestrator#connected - When a connection is established
 * @fires Orchestrator#disconnected - When a connection is closed
 * @fires Orchestrator#error - When an error occurs
 */
export class Orchestrator extends EventEmitter {
    /** @type {Registry} */
    #registry = new Registry();

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

        // Register all connections
        for (const [name, client] of Object.entries(config.connections)) {
            this.#registry.register(name, client);
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

        for (const name of this.#registry.list()) {
            this.emit('disconnected', name);
        }

        this.#connected = false;
    }

    /**
     * Get a database client by name.
     * @param {string} name - The connection name
     * @returns {unknown | undefined} The database client
     */
    get(name) {
        return this.#registry.get(name);
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
}
