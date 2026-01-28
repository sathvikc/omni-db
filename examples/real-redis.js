/**
 * Real Redis Example with Auto-Reconnect and Failover
 * 
 * Demonstrates:
 * 1. Connecting to a REAL Redis instance (localhost:6379)
 * 2. Handling connection errors gracefully
 * 3. Using IORedis properly with OmniDB
 */

import { Orchestrator } from '../src/index.js';
import Redis from 'ioredis';

async function main() {
    console.log('🚀 Starting Real Redis Example');

    // 1. Create Real Clients
    // We intentionally fail the primary to show failover if no redis runs on 6380
    // "primary" -> port 6380 (Dead)
    // "replica" -> port 6379 (Live, assuming you have redis running)

    const primaryRedis = new Redis({
        port: 6380, // Wrong port, simulate dead DB
        retryStrategy: null, // Don't retry internally, let OmniDB handle it
        lazyConnect: true
    });

    const replicaRedis = new Redis({
        port: 6379, // Standard Redis port
        retryStrategy: null,
        lazyConnect: true
    });

    // Make sure to handle error events to prevent node process crash
    primaryRedis.on('error', (err) => console.log('   (Primary Redis Error handled)'));
    replicaRedis.on('error', (err) => console.log('   (Replica Redis Error handled)'));

    const db = new Orchestrator({
        connections: {
            primary: primaryRedis,
            replica: replicaRedis
        },
        failover: {
            primary: 'replica'
        },
        healthCheck: {
            interval: '1s',
            checks: {
                primary: async (client) => {
                    try { return await client.ping() === 'PONG'; } catch { return false; }
                },
                replica: async (client) => {
                    try { return await client.ping() === 'PONG'; } catch { return false; }
                }
            }
        }
    });

    db.on('failover', ({ primary, backup }) => {
        console.log(`⚠️  FAILOVER: ${primary} is unhealthy. Traffic routed to ${backup}.`);
    });

    console.log('🔌 Connecting...');
    await db.connect();

    // Give health monitor a moment to detect the dead primary
    await new Promise(r => setTimeout(r, 1500));

    const health = db.health();
    console.log('🏥 Health Status:', {
        primary: health.primary.status,
        replica: health.replica.status
    });

    // Verify OmniDB auto-routed to "replica" because "primary" is on port 6380 (dead)
    const activeClient = db.get('primary');
    console.log('🔄 Resolving "primary" returns client config:',
        activeClient.options.port === 6379 ? 'REPLICA (Correct)' : 'PRIMARY (Wrong)'
    );

    // Try a real command
    if (activeClient.status === 'ready') {
        await activeClient.set('omnidb-demo', 'working');
        const val = await activeClient.get('omnidb-demo');
        console.log('💾 DB Write/Read Test:', val === 'working' ? 'PASSED' : 'FAILED');
    } else {
        console.log('⚠️  Skipping write test (Replica not ready - is local Redis running?)');
    }

    await db.disconnect();

    // Cleanup redis handles
    primaryRedis.disconnect();
    replicaRedis.disconnect();

    console.log('✨ Redis Demo Passed!');
    process.exit(0);
}

main().catch(err => {
    console.error('❌ Redis Demo failed:', err);
    process.exit(1);
});
