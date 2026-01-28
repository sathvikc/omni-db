/**
 * Real PostgreSQL Example
 * 
 * Demonstrates:
 * 1. Connecting to Real Postgres (localhost:5432)
 * 2. Proper health checks using "SELECT 1"
 */

import { Orchestrator } from '../src/index.js';
import pg from 'pg';
const { Client } = pg;

async function main() {
    console.log('🚀 Starting Real Postgres Example');

    // Use environment variables for CI/Local flexibility
    const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres';

    const pgClient = new Client({ connectionString });

    // Prevent crash on connection error
    pgClient.on('error', () => { });

    const db = new Orchestrator({
        connections: {
            main: pgClient
        },
        healthCheck: {
            interval: '1s',
            checks: {
                main: async (client) => {
                    try {
                        const res = await client.query('SELECT 1');
                        return res.rowCount === 1;
                    } catch (err) {
                        return false;
                    }
                }
            }
        }
    });

    console.log('🔌 Connecting...');

    // Note: OmniDB connect() calls the check function. 
    // For PG, we need the client to be connected physically first usually, 
    // but OmniDB is agnostic. We'll connect the client manually here.
    try {
        await pgClient.connect();
        console.log('   (Physical PG connection established)');
    } catch (e) {
        console.log('   (Could not connect to PG - is it running? Health check will fail)');
    }

    await db.connect();

    // Wait for a health check
    await new Promise(r => setTimeout(r, 1100));

    const health = db.health();
    console.log('🏥 Health Status:', health);

    if (health.main.status === 'healthy') {
        const client = db.get('main');
        const res = await client.query('SELECT NOW() as now');
        console.log('🕒 DB Time:', res.rows[0].now);
    } else {
        console.log('⚠️  Database is unhealthy. Skipping query.');
    }

    await db.disconnect();
    await pgClient.end();
}

main().catch(console.error);
