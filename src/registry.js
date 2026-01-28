/**
 * Connection Registry - A Map-based store for named database connections
 * @module omni-db/registry
 */

/**
 * Registry for storing and retrieving named database connections.
 * Uses a Map internally for O(1) lookup performance.
 */
export class Registry {
    /** @type {Map<string, unknown>} */
    #connections = new Map();

    /**
     * Register a connection with a unique name.
     * @param {string} name - Unique identifier for the connection
     * @param {unknown} client - The database client instance
     * @throws {Error} If name is empty or not a string
     * @throws {Error} If client is null or undefined
     */
    register(name, client) {
        if (typeof name !== 'string' || name.trim() === '') {
            throw new Error('Connection name must be a non-empty string');
        }
        if (client === null || client === undefined) {
            throw new Error('Client cannot be null or undefined');
        }
        this.#connections.set(name, client);
    }

    /**
     * Retrieve a connection by name.
     * @param {string} name - The connection name
     * @returns {unknown | undefined} The client instance, or undefined if not found
     */
    get(name) {
        return this.#connections.get(name);
    }

    /**
     * Check if a connection exists.
     * @param {string} name - The connection name
     * @returns {boolean} True if the connection is registered
     */
    has(name) {
        return this.#connections.has(name);
    }

    /**
     * Get all registered connection names.
     * @returns {string[]} Array of connection names
     */
    list() {
        return [...this.#connections.keys()];
    }

    /**
     * Get the number of registered connections.
     * @returns {number} The count of connections
     */
    get size() {
        return this.#connections.size;
    }

    /**
     * Remove a connection by name.
     * @param {string} name - The connection name
     * @returns {boolean} True if the connection was removed
     */
    delete(name) {
        return this.#connections.delete(name);
    }

    /**
     * Remove all registered connections.
     */
    clear() {
        this.#connections.clear();
    }

    /**
     * Iterate over all connections.
     * @returns {IterableIterator<[string, unknown]>} Iterator of [name, client] pairs
     */
    entries() {
        return this.#connections.entries();
    }
}
