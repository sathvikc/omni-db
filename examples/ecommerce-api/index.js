/**
 * E-commerce API Demo
 * 
 * Showcases OmniDB orchestrating 3 databases:
 * - PostgreSQL: Products & Orders
 * - Redis: Shopping Cart
 * - MongoDB: Product Reviews
 */

import express from 'express';
import { db, getProductsDB, getCartDB, getReviewsDB, shutdown } from './db.js';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ─────────────────────────────────────────────────────────────
// HEALTH CHECK - Shows OmniDB health monitoring
// ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
    const health = db.health();
    const allHealthy = Object.values(health).every(h => h.status === 'healthy');

    res.status(allHealthy ? 200 : 503).json({
        status: allHealthy ? 'healthy' : 'degraded',
        databases: health,
        timestamp: new Date().toISOString()
    });
});

// ─────────────────────────────────────────────────────────────
// PRODUCTS (PostgreSQL)
// ─────────────────────────────────────────────────────────────
app.get('/products', async (req, res) => {
    try {
        const pg = getProductsDB();
        const result = await pg.query('SELECT * FROM products LIMIT 10');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch products', details: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// CART (Redis)
// ─────────────────────────────────────────────────────────────
app.get('/cart/:userId', async (req, res) => {
    try {
        const redis = getCartDB();
        const cart = await redis.get(`cart:${req.params.userId}`);
        res.json(cart ? JSON.parse(cart) : { items: [] });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch cart', details: err.message });
    }
});

app.post('/cart/:userId', async (req, res) => {
    try {
        const redis = getCartDB();
        const { productId, quantity } = req.body;

        // Get existing cart or create new
        const existing = await redis.get(`cart:${req.params.userId}`);
        const cart = existing ? JSON.parse(existing) : { items: [] };

        // Add/update item
        const itemIndex = cart.items.findIndex(i => i.productId === productId);
        if (itemIndex >= 0) {
            cart.items[itemIndex].quantity += quantity;
        } else {
            cart.items.push({ productId, quantity });
        }

        // Save with 1 hour TTL
        await redis.set(`cart:${req.params.userId}`, JSON.stringify(cart), 'EX', 3600);
        res.json(cart);
    } catch (err) {
        res.status(500).json({ error: 'Failed to update cart', details: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// REVIEWS (MongoDB)
// ─────────────────────────────────────────────────────────────
app.get('/reviews/:productId', async (req, res) => {
    try {
        const mongo = getReviewsDB();
        const reviews = await mongo
            .db('ecommerce')
            .collection('reviews')
            .find({ productId: req.params.productId })
            .toArray();
        res.json(reviews);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch reviews', details: err.message });
    }
});

app.post('/reviews', async (req, res) => {
    try {
        const mongo = getReviewsDB();
        const { productId, userId, rating, comment } = req.body;

        const result = await mongo
            .db('ecommerce')
            .collection('reviews')
            .insertOne({
                productId,
                userId,
                rating,
                comment,
                createdAt: new Date()
            });

        res.status(201).json({ id: result.insertedId });
    } catch (err) {
        res.status(500).json({ error: 'Failed to create review', details: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// SERVER LIFECYCLE
// ─────────────────────────────────────────────────────────────
async function start() {
    console.log('🚀 Starting E-commerce API Demo');
    console.log('📦 Connecting to databases...');

    try {
        await db.connect();
        console.log('✅ All databases connected');

        app.listen(PORT, () => {
            console.log(`🌐 Server running at http://localhost:${PORT}`);
            console.log('\nEndpoints:');
            console.log('  GET  /health           - Check all database health');
            console.log('  GET  /products         - List products (PostgreSQL)');
            console.log('  GET  /cart/:userId     - Get cart (Redis)');
            console.log('  POST /cart/:userId     - Add to cart (Redis)');
            console.log('  GET  /reviews/:id      - Get reviews (MongoDB)');
            console.log('  POST /reviews          - Create review (MongoDB)');
        });
    } catch (err) {
        console.error('❌ Failed to start:', err);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

start();
