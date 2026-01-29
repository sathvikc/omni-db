/**
 * Failover Demo for OmniDB
 * 
 * Demonstrates:
 * 1. Primary database "failing"
 * 2. Automatic switch to replica
 * 3. Primary recovering
 * 4. Automatic switch back
 */

import { Orchestrator } from 'omni-db';
import { once } from 'node:events'; // Standard Node.js helper for async events

// Mock Client that can be toggled to fail
const createToggleClient = (name) => {
    let isAlive = true;
    return {
        name,
        setAlive: (status) => isAlive = status,
        ping: async () => isAlive,
        query: async () => {
            if (!isAlive) throw new Error(`${name} is down!`);
            return `${name} result`;
        }
    };
};

async function main() {
    console.log('🚀 Starting Failover Demo');

    const primaryClient = createToggleClient('PrimaryDB');
    const replicaClient = createToggleClient('ReplicaDB');

    const db = new Orchestrator({
        connections: {
            primary: primaryClient,
            replica: replicaClient
        },
        failover: {
            primary: 'replica' // If primary fails, use replica
        },
        healthCheck: {
            interval: '50ms', // Fast for demo
            timeout: '20ms',
            checks: {
                primary: async (client) => client.ping(),
                replica: async (client) => client.ping()
            }
        }
    });

    await db.connect();

    // 1. Initial State
    console.log('1️⃣  Initial State: Both Healthy');
    let client = db.get('primary');
    console.log('   Querying:', await client.query()); // Should be Primary

    // 2. Simulate Failure
    console.log('\n2️⃣  Simulating Primary Failure...');

    // Wait for HEALTH change (proactive), not failover (lazy)
    const unhealthyPromise = once(db, 'health:changed');
    primaryClient.setAlive(false);

    console.log('   Waiting for health check...');
    await unhealthyPromise; // This will fire when monitor sees 'unhealthy'

    // 3. Verify Failover
    // Now that health is updated, calling get() should trigger internal failover logic
    console.log('   Triggering access to route to backup...');

    const health = db.health();
    console.log('   Health Status:', health.primary.status);

    client = db.get('primary');
    const result = await client.query();
    console.log('   Querying "primary":', result);

    if (result !== 'ReplicaDB result') {
        throw new Error('Failover did not route to Replica!');
    }

    // 4. Simulate Recovery
    console.log('\n3️⃣  Simulating Primary Recovery...');

    const healthyPromise = once(db, 'health:changed');
    primaryClient.setAlive(true);

    console.log('   Waiting for recovery health check...');
    await healthyPromise;

    // 5. Verify Recovery
    client = db.get('primary');
    const recoveredResult = await client.query();
    console.log('   Querying "primary":', recoveredResult);

    if (recoveredResult !== 'PrimaryDB result') {
        throw new Error('Did not recover back to Primary!');
    }

    await db.disconnect();
    console.log('\n✨ Failover Demo Passed!');
    process.exit(0);
}

main().catch(err => {
    console.error('❌ Demo failed:', err);
    process.exit(1);
});
