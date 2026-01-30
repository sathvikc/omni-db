/**
 * OmniDB - Thin database orchestration library for Node.js
 * @module omni-db
 */

import { EventEmitter } from 'node:events';

// ============================================================================
// Core Types
// ============================================================================

/**
 * Health status of a database connection.
 */
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

/**
 * Health information for a single connection.
 */
export interface ConnectionHealth {
    /** Current health status */
    status: HealthStatus;
    /** Name of backup connection if currently in failover */
    failoverTo?: string;
}

/**
 * Custom health check function.
 * @param client The database client instance
 * @returns Promise resolving to true if healthy, false otherwise
 */
export type HealthCheckFunction<T = unknown> = (client: T) => Promise<boolean>;

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Retry configuration options.
 */
export interface RetryConfig {
    /**
     * Number of retries before marking unhealthy.
     * @default 0
     */
    retries?: number;

    /**
     * Delay between retries.
     * @example '100ms', '1s'
     * @default '100ms'
     */
    delay?: string;
}

/**
 * Health check configuration options.
 */
export interface HealthCheckConfig<TConnections extends Record<string, unknown> = Record<string, unknown>> {
    /**
     * Interval between health checks.
     * @example '30s', '1m', '5m'
     * @default '30s'
     */
    interval?: string;

    /**
     * Timeout for each health check.
     * @example '5s', '10s'
     * @default '5s'
     */
    timeout?: string;

    /**
     * Retry configuration.
     */
    retry?: RetryConfig;

    /**
     * Custom health check functions per connection.
     * @example { primary: async (client) => client.ping() }
     */
    checks?: {
        [K in keyof TConnections]?: HealthCheckFunction<TConnections[K]>;
    };
}

/**
 * Orchestrator configuration options.
 * @template TConnections Record of connection names to client types
 */
export interface OrchestratorConfig<TConnections extends Record<string, unknown>> {
    /**
     * Named database client instances.
     * @example { primary: pgClient, cache: redisClient }
     */
    connections: TConnections;

    /**
     * Failover mapping from primary to backup connection.
     * @example { primary: 'replica' }
     */
    failover?: Partial<Record<keyof TConnections, keyof TConnections>>;

    /**
     * Health check configuration.
     */
    healthCheck?: HealthCheckConfig<TConnections>;
}

// ============================================================================
// Event Types
// ============================================================================

/**
 * Failover event payload.
 */
export interface FailoverEvent {
    /** Name of the primary connection that failed */
    primary: string;
    /** Name of the backup connection being used */
    backup: string;
    /** Unix timestamp when the event occurred */
    timestamp: number;
}

/**
 * Recovery event payload.
 */
export interface RecoveryEvent {
    /** Name of the primary connection that recovered */
    primary: string;
    /** Name of the backup connection that was being used */
    backup: string;
    /** Unix timestamp when the event occurred */
    timestamp: number;
}

/**
 * Health change event payload.
 */
export interface HealthChangedEvent {
    /** Connection name */
    name: string;
    /** Previous health status */
    previous: HealthStatus;
    /** Current health status */
    current: HealthStatus;
    /** Unix timestamp when the event occurred */
    timestamp: number;
}

/**
 * Shutdown event payload.
 */
export interface ShutdownEvent {
    /** Signal that triggered the shutdown */
    signal: string;
    /** Unix timestamp when the event occurred */
    timestamp: number;
}

/**
 * Connected event payload.
 */
export interface ConnectedEvent {
    /** Connection name */
    name: string;
    /** Unix timestamp when the event occurred */
    timestamp: number;
}

/**
 * Disconnected event payload.
 */
export interface DisconnectedEvent {
    /** Connection name */
    name: string;
    /** Unix timestamp when the event occurred */
    timestamp: number;
}

/**
 * Shutdown options for graceful process termination.
 */
export interface ShutdownOptions {
    /** Signals to handle. @default ['SIGTERM', 'SIGINT'] */
    signals?: string[];
    /** Exit code after shutdown. @default 0 */
    exitCode?: number;
    /** Whether to call process.exit(). @default true */
    exitProcess?: boolean;
}

/**
 * Orchestrator event map for TypeScript event typing.
 */
export interface OrchestratorEvents {
    connected: [event: ConnectedEvent];
    disconnected: [event: DisconnectedEvent];
    failover: [event: FailoverEvent];
    recovery: [event: RecoveryEvent];
    'health:changed': [event: HealthChangedEvent];
    shutdown: [event: ShutdownEvent];
    error: [error: Error];
}

// ============================================================================
// Registry Class
// ============================================================================

/**
 * Map-based registry for storing named database connections.
 * Provides O(1) lookup performance.
 */
export declare class Registry {
    /**
     * Register a connection with a unique name.
     * @param name Unique identifier for the connection
     * @param client The database client instance
     * @throws Error if name is empty or not a string
     * @throws Error if client is null or undefined
     */
    register(name: string, client: unknown): void;

    /**
     * Retrieve a connection by name.
     * @param name The connection name
     * @returns The client instance, or undefined if not found
     */
    get<T = unknown>(name: string): T | undefined;

    /**
     * Check if a connection exists.
     * @param name The connection name
     * @returns True if the connection is registered
     */
    has(name: string): boolean;

    /**
     * Get all registered connection names.
     * @returns Array of connection names
     */
    list(): string[];

    /**
     * Get the number of registered connections.
     */
    readonly size: number;

    /**
     * Remove a connection by name.
     * @param name The connection name
     * @returns True if the connection was removed
     */
    delete(name: string): boolean;

    /**
     * Remove all registered connections.
     */
    clear(): void;

    /**
     * Iterate over all connections.
     * @returns Iterator of [name, client] pairs
     */
    entries(): IterableIterator<[string, unknown]>;
}

// ============================================================================
// Orchestrator Class
// ============================================================================

/**
 * Database connection orchestrator with health monitoring and failover.
 *
 * @template TConnections Record of connection names to client types
 *
 * @example
 * ```typescript
 * import { Orchestrator } from 'omni-db';
 * import { PrismaClient } from '@prisma/client';
 * import { createClient } from 'redis';
 *
 * const db = new Orchestrator({
 *   connections: {
 *     postgres: new PrismaClient(),
 *     redis: createClient(),
 *   },
 *   failover: { postgres: 'redis' },
 *   healthCheck: {
 *     interval: '30s',
 *     checks: {
 *       postgres: async (client) => {
 *         await client.$queryRaw`SELECT 1`;
 *         return true;
 *       },
 *       redis: async (client) => {
 *         const result = await client.ping();
 *         return result === 'PONG';
 *       },
 *     },
 *   },
 * });
 *
 * await db.connect();
 * const prisma = db.get('postgres'); // Type: PrismaClient
 * ```
 */
export declare class Orchestrator<
    TConnections extends Record<string, unknown> = Record<string, unknown>
> extends EventEmitter {
    /**
     * Create a new Orchestrator instance.
     * @param config Configuration object
     * @throws Error if config is not provided
     * @throws Error if connections is not an object or is empty
     */
    constructor(config: OrchestratorConfig<TConnections>);

    /**
     * Connect to all registered databases and start health monitoring.
     * @fires connected - For each connection
     */
    connect(): Promise<void>;

    /**
     * Disconnect from all databases and stop health monitoring.
     * @fires disconnected - For each connection
     */
    disconnect(): Promise<void>;

    /**
     * Get a database client by name.
     * When failover is configured and primary is unhealthy, returns backup.
     *
     * @param name The connection name
     * @returns The database client
     * @fires failover - If routing to backup
     * @fires recovery - If recovering from failover
     *
     * @example
     * ```typescript
     * const client = db.get('postgres');
     * // Type is inferred from connections config
     * ```
     */
    get<K extends keyof TConnections>(name: K): TConnections[K];
    get(name: string): unknown | undefined;

    /**
     * Get all registered connection names.
     * @returns Array of connection names
     */
    list(): (keyof TConnections)[];

    /**
     * Check if a connection exists.
     * @param name The connection name
     * @returns True if connection exists
     */
    has(name: keyof TConnections | string): boolean;

    /**
     * Get health status of all connections.
     * @returns Health status per connection
     *
     * @example
     * ```typescript
     * const health = db.health();
     * // { postgres: { status: 'healthy' }, redis: { status: 'degraded' } }
     * ```
     */
    health(): Record<keyof TConnections, ConnectionHealth>;

    /**
     * Check if orchestrator is connected.
     */
    readonly isConnected: boolean;

    /**
     * Get the number of registered connections.
     */
    readonly size: number;

    /**
     * Register signal handlers for graceful shutdown.
     * @param options Shutdown options
     * @returns Cleanup function to remove signal handlers
     *
     * @example
     * ```typescript
     * await db.connect();
     * db.shutdownOnSignal(); // Handles SIGTERM, SIGINT
     *
     * // Or with custom options:
     * db.shutdownOnSignal({ signals: ['SIGTERM'], exitProcess: false });
     * ```
     */
    shutdownOnSignal(options?: ShutdownOptions): () => void;

    // Event emitter overloads for type-safe events
    on<E extends keyof OrchestratorEvents>(
        event: E,
        listener: (...args: OrchestratorEvents[E]) => void
    ): this;
    on(event: string | symbol, listener: (...args: unknown[]) => void): this;

    once<E extends keyof OrchestratorEvents>(
        event: E,
        listener: (...args: OrchestratorEvents[E]) => void
    ): this;
    once(event: string | symbol, listener: (...args: unknown[]) => void): this;

    emit<E extends keyof OrchestratorEvents>(
        event: E,
        ...args: OrchestratorEvents[E]
    ): boolean;
    emit(event: string | symbol, ...args: unknown[]): boolean;

    off<E extends keyof OrchestratorEvents>(
        event: E,
        listener: (...args: OrchestratorEvents[E]) => void
    ): this;
    off(event: string | symbol, listener: (...args: unknown[]) => void): this;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Parse a duration string to milliseconds.
 * @param duration Duration string (e.g., '30s', '5m', '1h')
 * @returns Duration in milliseconds
 * @throws Error if format is invalid
 *
 * @example
 * ```typescript
 * parseDuration('30s'); // 30000
 * parseDuration('1m');  // 60000
 * parseDuration('1h');  // 3600000
 * ```
 */
export declare function parseDuration(duration: string): number;
