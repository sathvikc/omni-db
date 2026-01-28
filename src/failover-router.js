/**
 * Failover Router - Routes to backup connections when primary is unhealthy
 * @module omni-db/failover-router
 */

/**
 * @typedef {'healthy' | 'degraded' | 'unhealthy'} HealthStatus
 */

/**
 * Routes connection requests to backups when primaries are unhealthy.
 */
export class FailoverRouter {
    /** @type {Map<string, string>} primary -> backup mapping */
    #failoverMap = new Map();

    /** @type {Set<string>} Currently active failovers */
    #activeFailovers = new Set();

    /**
     * Create a new FailoverRouter.
     * @param {Record<string, string>} [failoverConfig={}] - Mapping of primary to backup names
     */
    constructor(failoverConfig = {}) {
        for (const [primary, backup] of Object.entries(failoverConfig)) {
            this.#failoverMap.set(primary, backup);
        }
    }

    /**
     * Check if a connection has a failover configured.
     * @param {string} name - Connection name
     * @returns {boolean} True if failover is configured
     */
    hasFailover(name) {
        return this.#failoverMap.has(name);
    }

    /**
     * Get the backup name for a connection.
     * @param {string} name - Connection name
     * @returns {string | undefined} Backup name, or undefined if not configured
     */
    getBackup(name) {
        return this.#failoverMap.get(name);
    }

    /**
     * Resolve which connection to use based on health status.
     * @param {string} name - Requested connection name
     * @param {(name: string) => HealthStatus | undefined} getStatus - Function to get health status
     * @returns {{ name: string, isFailover: boolean }} Resolved connection info
     */
    resolve(name, getStatus) {
        const status = getStatus(name);

        // If healthy or no status tracking, return original
        if (status === 'healthy' || status === undefined) {
            return { name, isFailover: false };
        }

        // Check if failover is configured
        const backup = this.#failoverMap.get(name);
        if (!backup) {
            return { name, isFailover: false };
        }

        // Check backup health
        const backupStatus = getStatus(backup);
        if (backupStatus === 'unhealthy') {
            // Both unhealthy, return original
            return { name, isFailover: false };
        }

        // Use backup
        return { name: backup, isFailover: true };
    }

    /**
     * Mark a failover as active (primary -> backup).
     * @param {string} primary - Primary connection name
     */
    activateFailover(primary) {
        this.#activeFailovers.add(primary);
    }

    /**
     * Mark a failover as inactive (recovered).
     * @param {string} primary - Primary connection name
     */
    deactivateFailover(primary) {
        this.#activeFailovers.delete(primary);
    }

    /**
     * Check if a connection is in failover mode.
     * @param {string} name - Connection name
     * @returns {boolean} True if currently using failover
     */
    isInFailover(name) {
        return this.#activeFailovers.has(name);
    }

    /**
     * Get all connections currently in failover mode.
     * @returns {string[]} Array of primary connection names in failover
     */
    getActiveFailovers() {
        return [...this.#activeFailovers];
    }

    /**
     * Get all configured failover mappings.
     * @returns {Record<string, string>} Object mapping primary to backup names
     */
    getMappings() {
        return Object.fromEntries(this.#failoverMap);
    }
}
