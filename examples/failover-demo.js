/**
 * Failover Demo for OmniDB
 * 
 * Demonstrates:
 * 1. Primary database "failing"
 * 2. Automatic switch to replica
 * 3. Primary recovering
 * 4. Automatic switch back
 */

import { Orchestrator } from '../src/index.js';

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
            interval: '50ms', // Very fast for demo
            timeout: '20ms'
        }
    });

    // Subscribe to events to see what's happening
    db.on('failover', ({ primary, backup }) => {
        console.log(`⚠️ FAILOVER: ${primary} is dead. Switched to ${backup}.`);
    });

    db.on('recovery', ({ primary, backup }) => {
        console.log(`✅ RECOVERY: ${primary} is back! Switched back from ${backup}.`);
    });

    await db.connect();

    // 1. Initial State
    console.log('1️⃣  Initial State: Both Healthy');
    let client = db.get('primary');
    console.log('   Querying:', await client.query()); // Should be Primary

    // 2. Simulate Failure
    console.log('\n2️⃣  Simulating Primary Failure...');
    primaryClient.setAlive(false);

    // Wait for health check to run (interval is 50ms)
    await new Promise(r => setTimeout(r, 100));

    // 3. Verify Failover
    const health = db.health();
    console.log('   Health:', health.primary.status, '(Failover to:', health.primary.failoverTo, ')');

    // get('primary') should now return the replica client transparently
    client = db.get('primary');
    const result = await client.query();
    console.log('   Querying "primary":', result);

    if (result !== 'ReplicaDB result') {
        throw new Error('Failover did not route to Replica!');
    }

    // 4. Simulate Recovery
    console.log('\n3️⃣  Simulating Primary Recovery...');
    primaryClient.setAlive(true);

    await new Promise(r => setTimeout(r, 100));

    client = db.get('primary');
    const recoveredResult = await client.query();
    console.log('   Querying "primary":', recoveredResult);

    if (recoveredResult !== 'PrimaryDB result') {
        throw new Error('Did not recover back to Primary!');
    }

    await db.disconnect();
    console.log('\n✨ Failover Demo Passed!');
}

main().catch(err => {
    console.error('❌ Demo failed:', err);
    process.exit(1);
});
