# E-commerce API Demo

A realistic example showcasing **OmniDB orchestrating 3 databases**:

| Database | Role | Technology |
|----------|------|------------|
| PostgreSQL | Products, Orders | Relational, ACID |
| Redis | Shopping Cart | Fast cache |
| MongoDB | Reviews | Document store |

## Quick Start

```bash
# Start databases (requires Docker)
docker run -d --name postgres -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres
docker run -d --name redis -p 6379:6379 redis
docker run -d --name mongodb -p 27017:27017 mongo

# Install and run
cd examples/ecommerce-api
npm install
npm start
```

## API Endpoints

| Method | Endpoint | Database | Description |
|--------|----------|----------|-------------|
| GET | `/health` | All | Health status of all databases |
| GET | `/products` | PostgreSQL | List products |
| GET | `/cart/:userId` | Redis | Get user's cart |
| POST | `/cart/:userId` | Redis | Add item to cart |
| GET | `/reviews/:productId` | MongoDB | Get product reviews |
| POST | `/reviews` | MongoDB | Submit a review |

## OmniDB Features Demonstrated

1. **Unified Access**: Single `db.get('name')` for any database
2. **Health Monitoring**: `/health` shows all database statuses
3. **Retry Policy**: Failed health checks retry before marking unhealthy
4. **Graceful Shutdown**: Clean disconnect on SIGTERM/SIGINT
