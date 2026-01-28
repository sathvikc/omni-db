/**
 * Retry Policy Demo
 * 
 * Demonstrates:
 * 1. Health checks retrying on failure
 * 2. Preventing "flapping" (unhealthy status) for transient errors
 */

import { Orchestrator } from '../src/index.js';
import { once } from 'node:events';

// Mock Client that fails N times then recovers
const createFlakyClient = (name, failuresBeforeSuccess) => {
    let attempts = 0;
    return {
        name,
        reset: () => attempts = 0,
        ping: async () => {
            attempts++;
            if (attempts <= failuresBeforeSuccess) {
                console.log(`   [${name}] Ping failed (Attempt ${attempts})`);
                return false; // Fail
            }
            console.log(`   [${name}] Ping succeeded (Attempt ${attempts})`);
            return true; // Success
        }
    };
};

async function main() {
    console.log('🚀 Starting Retry Policy Demo');

    const flakyClient = createFlakyClient('FlakyDB', 2); // Fails 2 times, succeeds on 3rd

    const db = new Orchestrator({
        connections: {
            flaky: flakyClient
        },
        healthCheck: {
            interval: '500ms',
            timeout: '100ms',
            retry: {
                retries: 2,     // Try 3 times total (Initial + 2 retries)
                delay: '50ms'   // Wait 50ms between retries
            },
            checks: {
                flaky: async (client) => client.ping()
            }
        }
    });

    console.log('1️⃣  Connecting (Initial check should pass explicitly or implicitly)...');
    // Note: connect() runs the first check. 
    // Our client fails 2 times.
    // Retry logic:
    // Attempt 1: Fail. Wait 50ms.
    // Attempt 2: Fail. Wait 50ms.
    // Attempt 3: Success.
    // Result: HEALTHY.

    // Reset counters before connect just to be sure
    flakyClient.reset();

    await db.connect();
    console.log('✅ Connected. Health:', db.health().flaky.status);

    if (db.health().flaky.status !== 'healthy') {
        throw new Error('Should have been healthy after retries!');
    }

    // 2. Test: Force a failure that exceeds retries
    console.log('\n2️⃣  Simulating Consistent Failure (> 2 retries)...');

    // Make it fail 5 times (Retries=2, so 3 attempts total. 5 > 3 -> Unhealthy)
    const unhealthyPromise = once(db, 'health:changed');

    // We need to reset the client state to fail again
    // But since the client state is just "attempts", currently it is at 3 (success).
    // We need a way to make it fail again. 
    // Let's replace the logic or just create a new client? 
    // Easier: Update the mock to support "force failure".

    // Re-creating the mock for simplicity of verification logic isn't easy with connected DB.
    // Let's modify the client object in place (JavaScript allows this).
    flakyClient.ping = async () => {
        console.log(`   [FlakyDB] Ping failing intentionally...`);
        return false;
    };

    console.log('   Waiting for health monitor to give up...');
    await unhealthyPromise;

    console.log('✅ Health changed to:', db.health().flaky.status);
    if (db.health().flaky.status !== 'unhealthy') {
        throw new Error('Should have become unhealthy!');
    }

    await db.disconnect();
    console.log('\n✨ Retry Demo Passed!');
    process.exit(0);
}

main().catch(err => {
    console.error('❌ Retry Demo failed:', err);
    process.exit(1);
});
