import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { pool, getPoolStats } from '../database/connection';
import { executeOptimizedQuery, getQueryPerformanceStats, createPerformanceIndexes } from '../database/queryOptimizer';
import { performanceMonitor } from '../utils/performanceMonitor';

/**
 * Simple performance tests to verify backend optimizations work
 */

describe('Backend Performance Optimizations', () => {
    beforeAll(async () => {
        // Test database connection
        await pool.connect();
    });

    afterAll(async () => {
        await pool.end();
    });

    describe('Database Connection Pooling', () => {
        it('should provide pool statistics', () => {
            const stats = getPoolStats();

            expect(stats.totalCount).toBeGreaterThanOrEqual(0);
            expect(stats.idleCount).toBeGreaterThanOrEqual(0);
            expect(stats.waitingCount).toBeGreaterThanOrEqual(0);

            console.log('Database pool stats:', stats);
        });

        it('should execute queries with connection pooling', async () => {
            const startTime = Date.now();

            const result = await executeOptimizedQuery(
                'SELECT 1 as test_value',
                [],
                'test_query'
            );

            const executionTime = Date.now() - startTime;

            expect(result.rows).toHaveLength(1);
            expect(result.rows[0].test_value).toBe(1);
            expect(result.executionTime).toBeGreaterThan(0);
            expect(executionTime).toBeLessThan(1000); // Should be fast

            console.log(`Query executed in ${result.executionTime}ms`);
        });

        it('should handle concurrent queries efficiently', async () => {
            const concurrentQueries = 5;
            const startTime = Date.now();

            const promises = Array.from({ length: concurrentQueries }, (_, i) =>
                executeOptimizedQuery(
                    'SELECT $1 as query_number',
                    [i],
                    `concurrent_query_${i}`
                )
            );

            const results = await Promise.all(promises);
            const totalTime = Date.now() - startTime;

            expect(results).toHaveLength(concurrentQueries);
            results.forEach((result, i) => {
                expect(result.rows[0].query_number).toBe(i);
            });

            expect(totalTime).toBeLessThan(2000); // Should complete quickly with pooling

            console.log(`${concurrentQueries} concurrent queries completed in ${totalTime}ms`);
        });
    });

    describe('Query Performance Monitoring', () => {
        it('should track query performance metrics', async () => {
            // Execute some queries to generate metrics
            await executeOptimizedQuery('SELECT COUNT(*) FROM pg_tables', [], 'count_tables');
            await executeOptimizedQuery('SELECT version()', [], 'get_version');

            const stats = getQueryPerformanceStats();

            expect(stats.totalQueries).toBeGreaterThan(0);
            expect(stats.averageExecutionTime).toBeGreaterThan(0);
            expect(stats.recentQueries).toBeInstanceOf(Array);

            console.log('Query performance stats:', {
                totalQueries: stats.totalQueries,
                averageTime: stats.averageExecutionTime,
                slowQueries: stats.slowQueries.length
            });
        });
    });

    describe('Performance Indexes', () => {
        it('should create performance indexes without errors', async () => {
            const startTime = Date.now();

            // This will create indexes if they don't exist, or skip if they do
            await createPerformanceIndexes();

            const executionTime = Date.now() - startTime;

            expect(executionTime).toBeLessThan(10000); // Should complete within 10 seconds

            console.log(`Performance indexes created/verified in ${executionTime}ms`);
        });
    });

    describe('System Performance Monitoring', () => {
        it('should collect system performance metrics', () => {
            const metrics = performanceMonitor.collectMetrics();

            expect(metrics.timestamp).toBeInstanceOf(Date);
            expect(metrics.database).toBeDefined();
            expect(metrics.database.connectionPool.totalConnections).toBeGreaterThanOrEqual(0);
            expect(metrics.websocket).toBeDefined();
            expect(metrics.memory).toBeDefined();
            expect(metrics.uptime).toBeGreaterThan(0);

            console.log('System performance metrics:', {
                uptime: metrics.uptime,
                memoryUsed: metrics.memory.used,
                dbConnections: metrics.database.connectionPool.totalConnections
            });
        });

        it('should provide performance summary', () => {
            const summary = performanceMonitor.getPerformanceSummary();

            expect(summary.current).toBeDefined();
            expect(summary.averages).toBeDefined();
            expect(summary.alerts).toBeInstanceOf(Array);

            console.log('Performance summary:', {
                alerts: summary.alerts.length,
                avgQueryTime: summary.averages.queryExecutionTime,
                avgMemoryUsage: summary.averages.memoryUsage
            });
        });

        it('should start and stop monitoring', () => {
            // Start monitoring
            performanceMonitor.startMonitoring(1000); // 1 second intervals

            // Stop monitoring
            performanceMonitor.stopMonitoring();

            // Should not throw errors
            expect(true).toBe(true);
        });
    });

    describe('Load Testing', () => {
        it('should handle multiple database operations efficiently', async () => {
            const operationCount = 20;
            const startTime = Date.now();

            const operations = Array.from({ length: operationCount }, (_, i) =>
                executeOptimizedQuery(
                    'SELECT $1 as operation_id, NOW() as timestamp',
                    [i],
                    `load_test_${i}`
                )
            );

            const results = await Promise.all(operations);
            const totalTime = Date.now() - startTime;

            expect(results).toHaveLength(operationCount);
            expect(totalTime).toBeLessThan(5000); // Should complete within 5 seconds

            console.log(`Load test: ${operationCount} operations in ${totalTime}ms`);
        });
    });
});