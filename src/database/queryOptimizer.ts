import { Pool, PoolClient } from 'pg';
import { pool } from './connection';

/**
 * Database query optimization utilities
 * Implements connection pooling, prepared statements, and query caching
 */

// Query cache for prepared statements
const preparedStatements = new Map<string, string>();

// Query performance monitoring
interface QueryMetrics {
    query: string;
    executionTime: number;
    timestamp: Date;
    rowCount?: number;
}

const queryMetrics: QueryMetrics[] = [];
const MAX_METRICS_HISTORY = 1000;

/**
 * Execute optimized query with connection pooling and prepared statements
 */
export async function executeOptimizedQuery<T = any>(
    query: string,
    params: any[] = [],
    queryName?: string
): Promise<{ rows: T[]; rowCount: number; executionTime: number }> {
    const startTime = Date.now();
    let client: PoolClient | null = null;

    try {
        // Get client from pool
        client = await pool.connect();

        // Use prepared statement if query name is provided
        let result;
        if (queryName && !preparedStatements.has(queryName)) {
            // Prepare statement for reuse
            await client.query(`PREPARE ${queryName} AS ${query}`);
            preparedStatements.set(queryName, query);
            result = await client.query(`EXECUTE ${queryName}`, params);
        } else if (queryName && preparedStatements.has(queryName)) {
            // Use existing prepared statement
            result = await client.query(`EXECUTE ${queryName}`, params);
        } else {
            // Execute regular query
            result = await client.query(query, params);
        }

        const executionTime = Date.now() - startTime;

        // Record metrics
        recordQueryMetrics({
            query: queryName || query.substring(0, 100),
            executionTime,
            timestamp: new Date(),
            rowCount: result.rowCount || 0
        });

        return {
            rows: result.rows,
            rowCount: result.rowCount || 0,
            executionTime
        };

    } catch (error) {
        const executionTime = Date.now() - startTime;

        // Record failed query metrics
        recordQueryMetrics({
            query: queryName || query.substring(0, 100),
            executionTime,
            timestamp: new Date(),
            rowCount: 0
        });

        console.error('Query execution failed:', {
            query: queryName || query.substring(0, 100),
            params: params.length,
            executionTime,
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        throw error;
    } finally {
        // Always release client back to pool
        if (client) {
            client.release();
        }
    }
}

/**
 * Execute batch operations with transaction support
 */
export async function executeBatchTransaction<T = any>(
    operations: Array<{ query: string; params: any[]; queryName?: string }>
): Promise<T[]> {
    const startTime = Date.now();
    let client: PoolClient | null = null;

    try {
        client = await pool.connect();

        // Begin transaction
        await client.query('BEGIN');

        const results: T[] = [];

        // Execute all operations in transaction
        for (const operation of operations) {
            const result = await client.query(operation.query, operation.params);
            results.push(result.rows as T);
        }

        // Commit transaction
        await client.query('COMMIT');

        const executionTime = Date.now() - startTime;
        console.log(`Batch transaction completed in ${executionTime}ms (${operations.length} operations)`);

        return results;

    } catch (error) {
        // Rollback transaction on error
        if (client) {
            try {
                await client.query('ROLLBACK');
            } catch (rollbackError) {
                console.error('Rollback failed:', rollbackError);
            }
        }

        const executionTime = Date.now() - startTime;
        console.error('Batch transaction failed:', {
            operationCount: operations.length,
            executionTime,
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        throw error;
    } finally {
        if (client) {
            client.release();
        }
    }
}

/**
 * Execute query with automatic retry logic
 */
export async function executeQueryWithRetry<T = any>(
    query: string,
    params: any[] = [],
    maxRetries: number = 3,
    retryDelay: number = 1000,
    queryName?: string
): Promise<{ rows: T[]; rowCount: number; executionTime: number }> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await executeOptimizedQuery<T>(query, params, queryName);
        } catch (error) {
            lastError = error as Error;

            console.warn(`Query attempt ${attempt}/${maxRetries} failed:`, {
                query: queryName || query.substring(0, 100),
                error: lastError.message
            });

            // Don't retry on certain types of errors
            if (isNonRetryableError(lastError)) {
                throw lastError;
            }

            // Wait before retry (except on last attempt)
            if (attempt < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
            }
        }
    }

    throw lastError || new Error('Query failed after all retry attempts');
}

/**
 * Check if error should not be retried
 */
function isNonRetryableError(error: Error): boolean {
    const nonRetryablePatterns = [
        'syntax error',
        'column does not exist',
        'relation does not exist',
        'duplicate key value',
        'foreign key constraint',
        'check constraint'
    ];

    const errorMessage = error.message.toLowerCase();
    return nonRetryablePatterns.some(pattern => errorMessage.includes(pattern));
}

/**
 * Record query performance metrics
 */
function recordQueryMetrics(metrics: QueryMetrics): void {
    queryMetrics.push(metrics);

    // Keep only recent metrics to prevent memory leaks
    if (queryMetrics.length > MAX_METRICS_HISTORY) {
        queryMetrics.splice(0, queryMetrics.length - MAX_METRICS_HISTORY);
    }
}

/**
 * Get query performance statistics
 */
export function getQueryPerformanceStats(): {
    totalQueries: number;
    averageExecutionTime: number;
    slowQueries: QueryMetrics[];
    recentQueries: QueryMetrics[];
} {
    if (queryMetrics.length === 0) {
        return {
            totalQueries: 0,
            averageExecutionTime: 0,
            slowQueries: [],
            recentQueries: []
        };
    }

    const totalExecutionTime = queryMetrics.reduce((sum, metric) => sum + metric.executionTime, 0);
    const averageExecutionTime = totalExecutionTime / queryMetrics.length;

    // Queries taking longer than 1 second are considered slow
    const slowQueries = queryMetrics
        .filter(metric => metric.executionTime > 1000)
        .sort((a, b) => b.executionTime - a.executionTime)
        .slice(0, 10);

    // Recent queries (last 50)
    const recentQueries = queryMetrics.slice(-50);

    return {
        totalQueries: queryMetrics.length,
        averageExecutionTime: Math.round(averageExecutionTime),
        slowQueries,
        recentQueries
    };
}

/**
 * Clear query performance metrics
 */
export function clearQueryMetrics(): void {
    queryMetrics.length = 0;
    console.log('Query performance metrics cleared');
}

/**
 * Optimize database indexes for common queries
 */
export async function createPerformanceIndexes(): Promise<void> {
    const indexes = [
        // Attendance logs indexes for faster queries
        'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_attendance_logs_student_date ON attendance_logs(student_id, date DESC)',
        'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_attendance_logs_faculty_date ON attendance_logs(faculty_id, date DESC)',
        'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_attendance_logs_section_date ON attendance_logs(section_id, date DESC)',
        'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_attendance_logs_date_status ON attendance_logs(date, status)',

        // Students indexes
        'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_students_section_active ON students(section_id, is_active)',
        'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_students_roll_number ON students(roll_number)',

        // Faculty indexes
        'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_faculty_username ON faculty(username)',
        'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_faculty_active ON faculty(is_active)',

        // Sections indexes
        'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sections_faculty ON sections(faculty_id)',
        'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sections_grade ON sections(grade)'
    ];

    console.log('Creating performance indexes...');

    for (const indexQuery of indexes) {
        try {
            await executeOptimizedQuery(indexQuery);
            console.log(`Created index: ${indexQuery.split(' ')[5]}`);
        } catch (error) {
            // Index might already exist, log but don't fail
            console.warn(`Index creation warning: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    console.log('Performance indexes creation completed');
}

/**
 * Analyze and optimize table statistics
 */
export async function analyzeTableStatistics(): Promise<void> {
    const tables = ['attendance_logs', 'students', 'faculty', 'sections'];

    console.log('Analyzing table statistics for query optimization...');

    for (const table of tables) {
        try {
            await executeOptimizedQuery(`ANALYZE ${table}`);
            console.log(`Analyzed table: ${table}`);
        } catch (error) {
            console.error(`Failed to analyze table ${table}:`, error);
        }
    }

    console.log('Table statistics analysis completed');
}