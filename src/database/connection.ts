import { Pool, PoolConfig } from 'pg';
import { config } from '../config/environment';

// Optimized database connection configuration
const poolConfig: PoolConfig = {
    host: config.database.host,
    port: config.database.port,
    database: config.database.name,
    user: config.database.user,
    password: config.database.password,
    ssl: config.database.ssl ? { rejectUnauthorized: false } : false,
    // Optimized pool settings for performance
    max: 50, // Increased maximum connections for better concurrency
    min: 5, // Minimum connections to keep alive
    idleTimeoutMillis: 60000, // Keep connections alive longer (1 minute)
    connectionTimeoutMillis: 5000, // Increased timeout for better reliability
    // Performance optimizations
    statement_timeout: 30000, // 30 second query timeout
    query_timeout: 30000, // 30 second query timeout
    keepAlive: true, // Enable TCP keep-alive
    keepAliveInitialDelayMillis: 10000, // Initial delay for keep-alive
};

// Create connection pool
export const pool = new Pool(poolConfig);

// Export function to get pool instance
export const getPool = (): Pool => pool;

// Enhanced pool error handling and monitoring
pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
    // Don't exit process immediately, log error and attempt recovery
    console.error('Pool error details:', {
        message: err.message,
        stack: err.stack,
        timestamp: new Date().toISOString()
    });
});

// Pool connection monitoring
pool.on('connect', (client) => {
    console.log('New client connected to database pool');
});

pool.on('acquire', (client) => {
    console.log('Client acquired from pool');
});

pool.on('remove', (client) => {
    console.log('Client removed from pool');
});

// Performance monitoring
export const getPoolStats = () => {
    return {
        totalCount: pool.totalCount,
        idleCount: pool.idleCount,
        waitingCount: pool.waitingCount
    };
};

// Test database connection
export const testConnection = async (): Promise<void> => {
    try {
        const client = await pool.connect();
        console.log('Database connected successfully');
        client.release();
    } catch (error) {
        console.error('Database connection failed:', error);
        throw error;
    }
};

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Closing database pool...');
    await pool.end();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('Closing database pool...');
    await pool.end();
    process.exit(0);
});