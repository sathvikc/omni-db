/**
 * Database Orchestration Layer
 * 
 * Sets up OmniDB with 3 databases:
 * - PostgreSQL (products, orders)
 * - Redis (cart, sessions)  
 * - MongoDB (reviews, analytics)
 */

import { Orchestrator } from 'omni-db';
import pg from 'pg';
import Redis from 'ioredis';
import { MongoClient } from 'mongodb';

// Database connection configs (from environment or defaults)
const config = {
    postgres: {
        connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/ecommerce'
    },
    redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379')
    },
    mongodb: {
        url: process.env.MONGODB_URL || 'mongodb://localhost:27017',
        dbName: 'ecommerce'
    }
};

// Create database clients
const pgPool = new pg.Pool(config.postgres);
const redis = new Redis(config.redis);
const mongoClient = new MongoClient(config.mongodb.url);

// Create the orchestrator
export const db = new Orchestrator({
    connections: {
        products: pgPool,         // PostgreSQL for products/orders
        cart: redis,              // Redis for cart/sessions
        reviews: mongoClient      // MongoDB for reviews
    },
    healthCheck: {
        interval: '10s',
        timeout: '2s',
        retry: {
            retries: 2,
            delay: '500ms'
        },
        checks: {
            products: async (client) => {
                const result = await client.query('SELECT 1');
                return result.rows.length > 0;
            },
            cart: async (client) => {
                const pong = await client.ping();
                return pong === 'PONG';
            },
            reviews: async (client) => {
                await client.db('admin').command({ ping: 1 });
                return true;
            }
        }
    }
});

// Convenience getters with proper typing
export const getProductsDB = () => db.get('products');
export const getCartDB = () => db.get('cart');
export const getReviewsDB = () => db.get('reviews');

// Graceful shutdown helper
export async function shutdown() {
    console.log('🔌 Shutting down database connections...');
    await db.disconnect();
    await mongoClient.close();
    console.log('✅ All connections closed');
}
