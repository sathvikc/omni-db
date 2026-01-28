/**
 * Basic Usage Example for OmniDB
 * 
 * Shows how to:
 * 1. Initialize the Orchestrator
 * 2. Connect to "databases" (mocked)
 * 3. performing health checks
 * 4. Disconnect
 */

import { Orchestrator } from '../src/index.js';

// 1. Mock Database Clients
const createMockClient = (name) => ({
    name,
    ping: async () => true,
    query: async (q) => console.log(`[${name}] Executing: ${q}`)
});

async function main() {
    console.log('🚀 Starting OmniDB Basic Demo');

    // 2. Initialize
    const db = new Orchestrator({
        connections: {
            primary: createMockClient('PrimaryDB'),
            analytics: createMockClient('AnalyticsDB')
        },
        healthCheck: {
            interval: '100ms', // Fast for demo
            checks: {
                primary: async (client) => client.ping(),
                analytics: async (client) => client.ping()
            }
        }
    });

    // 3. Connect
    await db.connect();
    console.log('✅ Connected to all databases');

    // 4. Use Connections
    const primary = db.get('primary');
    await primary.query('SELECT * FROM users');

    // 5. Check Health
    const health = db.health();
    console.log('🏥 Health Status:', JSON.stringify(health, null, 2));

    if (health.primary.status !== 'healthy') {
        throw new Error('Expected primary to be healthy');
    }

    // 6. Cleanup
    await db.disconnect();
    console.log('👋 Demo completed successfully');
    process.exit(0);
}

main().catch(err => {
    console.error('❌ Demo failed:', err);
    process.exit(1);
});
