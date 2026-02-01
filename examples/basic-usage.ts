/**
 * Basic Usage Example for OmniDB (TypeScript)
 * 
 * Shows how to:
 * 1. Initialize the Orchestrator with typed connections
 * 2. Use utility methods (list, has, size, isConnected)
 * 3. Connect to "databases" (mocked)
 * 4. Perform health checks
 * 5. Disconnect
 */

import { Orchestrator } from 'omni-db';

// Define typed mock client interface
interface MockClient {
    name: string;
    ping: () => Promise<boolean>;
    query: (q: string) => Promise<void>;
}

// 1. Mock Database Clients with proper types
const createMockClient = (name: string): MockClient => ({
    name,
    ping: async () => true,
    query: async (q: string) => console.log(`[${name}] Executing: ${q}`)
});

async function main(): Promise<void> {
    console.log('🚀 Starting OmniDB Basic Demo (TypeScript)');

    // 2. Initialize with typed connections
    const db = new Orchestrator({
        connections: {
            primary: createMockClient('PrimaryDB'),
            analytics: createMockClient('AnalyticsDB')
        },
        healthCheck: {
            interval: '100ms', // Fast for demo
            checks: {
                primary: async (client: MockClient) => client.ping(),
                analytics: async (client: MockClient) => client.ping()
            }
        }
    });

    // ─────────────────────────────────────────────────────────────
    // UTILITY METHODS (Demonstrating full API)
    // ─────────────────────────────────────────────────────────────

    console.log('\n📊 Utility Methods (Before Connect):');
    console.log('  db.list():', db.list());           // ['primary', 'analytics']
    console.log('  db.has("primary"):', db.has('primary'));   // true
    console.log('  db.has("missing"):', db.has('missing'));   // false
    console.log('  db.size:', db.size);               // 2
    console.log('  db.isConnected:', db.isConnected); // false

    // 3. Connect
    await db.connect();
    console.log('\n✅ Connected to all databases');
    console.log('  db.isConnected:', db.isConnected); // true

    // 4. Use Connections (Type-safe!)
    // Using execute() protects against open circuits handling errors automatically
    await db.execute('primary', async (primary) => {
        await primary.query('SELECT * FROM users');
    });

    // 5. Check Health
    const health = db.health();
    console.log('\n🏥 Health Status:', JSON.stringify(health, null, 2));

    if (health.primary.status !== 'healthy') {
        throw new Error('Expected primary to be healthy');
    }

    // 6. Cleanup
    await db.disconnect();
    console.log('\n👋 Demo completed successfully');
    console.log('  db.isConnected:', db.isConnected); // false
    process.exit(0);
}

main().catch((err: Error) => {
    console.error('❌ Demo failed:', err);
    process.exit(1);
});
