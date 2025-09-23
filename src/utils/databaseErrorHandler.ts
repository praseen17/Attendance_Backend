import { Pool, PoolClient } from 'pg';
import { createEnhancedError } from '../middleware/comprehensiveErrorHandler';

/**
 * Database Error Handler with Recovery Mechanisms
 * Requirements: 3.4, 3.5 - Database operation error handling and recovery
 */

export interface DatabaseError extends Error {
    code?: string;
    severity?: string;
    detail?: string;
    hint?: string;
    position?: string;
    internalPosition?: string;
    internalQuery?: string;
    where?: string;
    schema?: string;
    table?: string;
    column?: string;
    dataType?: string;
    constraint?: string;
    file?: string;
    line?: string;
    routine?: string;
}

export interface DatabaseOperation {
    type: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'TRANSACTION';
    table?: string;
    query: string;
    params?: any[];
    retryCount?: number;
    maxRetries?: number;
}

export interface DatabaseRecoveryResult {
    success: boolean;
    result?: any;
    error?: DatabaseError;
    recoveryAction?: string;
    retryCount: number;
}

export class DatabaseErrorHandler {
    private pool: Pool;
    private readonly MAX_RETRIES = 3;
    private readonly RETRY_DELAY_BASE = 1000; // 1 second
    private readonly CONNECTION_TIMEOUT = 30000; // 30 seconds

    constructor(pool: Pool) {
        this.pool = pool;
    }

    /**
     * Execute database operation with error handling and recovery
     * Requirements: 3.4, 3.5 - Database operation error handling and recovery
     */
    async executeWithRecovery<T>(operation: DatabaseOperation): Promise<DatabaseRecoveryResult> {
        let lastError: DatabaseError | null = null;
        let retryCount = 0;
        const maxRetries = operation.maxRetries || this.MAX_RETRIES;

        while (retryCount <= maxRetries) {
            try {
                const result = await this.executeOperation<T>(operation);
                return {
                    success: true,
                    result,
                    retryCount
                };
            } catch (error) {
                lastError = error as DatabaseError;

                // Log the error
                console.error(`Database operation failed (attempt ${retryCount + 1}):`, {
                    operation: operation.type,
                    table: operation.table,
                    error: lastError.message,
                    code: lastError.code,
                    severity: lastError.severity
                });

                // Check if error is retryable
                if (!this.isRetryableError(lastError) || retryCount >= maxRetries) {
                    break;
                }

                // Apply recovery action
                const recoveryAction = await this.applyRecoveryAction(lastError, operation);

                // Wait before retry with exponential backoff
                const delay = this.calculateRetryDelay(retryCount);
                await this.sleep(delay);

                retryCount++;
            }
        }

        return {
            success: false,
            error: lastError!,
            retryCount
        };
    }

    /**
     * Execute database operation
     */
    private async executeOperation<T>(operation: DatabaseOperation): Promise<T> {
        let client: PoolClient | null = null;

        try {
            client = await this.pool.connect();

            switch (operation.type) {
                case 'SELECT':
                    const selectResult = await client.query(operation.query, operation.params);
                    return selectResult.rows as T;

                case 'INSERT':
                case 'UPDATE':
                case 'DELETE':
                    const modifyResult = await client.query(operation.query, operation.params);
                    return modifyResult as T;

                case 'TRANSACTION':
                    await client.query('BEGIN');
                    try {
                        const transactionResult = await client.query(operation.query, operation.params);
                        await client.query('COMMIT');
                        return transactionResult as T;
                    } catch (transactionError) {
                        await client.query('ROLLBACK');
                        throw transactionError;
                    }

                default:
                    throw new Error(`Unsupported operation type: ${operation.type}`);
            }
        } finally {
            if (client) {
                client.release();
            }
        }
    }

    /**
     * Determine if database error is retryable
     * Requirements: 3.4 - Error classification for recovery decisions
     */
    private isRetryableError(error: DatabaseError): boolean {
        const retryableCodes = [
            '08000', // connection_exception
            '08003', // connection_does_not_exist
            '08006', // connection_failure
            '08001', // sqlclient_unable_to_establish_sqlconnection
            '08004', // sqlserver_rejected_establishment_of_sqlconnection
            '53300', // too_many_connections
            '53400', // configuration_limit_exceeded
            '57P01', // admin_shutdown
            '57P02', // crash_shutdown
            '57P03', // cannot_connect_now
            '40001', // serialization_failure
            '40P01', // deadlock_detected
        ];

        const retryableMessages = [
            'connection terminated',
            'connection reset',
            'connection timed out',
            'server closed the connection',
            'connection refused',
            'temporary failure',
            'resource temporarily unavailable'
        ];

        // Check error codes
        if (error.code && retryableCodes.includes(error.code)) {
            return true;
        }

        // Check error messages
        const errorMessage = error.message?.toLowerCase() || '';
        return retryableMessages.some(msg => errorMessage.includes(msg));
    }

    /**
     * Apply recovery action based on error type
     * Requirements: 3.5 - Database recovery mechanisms
     */
    private async applyRecoveryAction(error: DatabaseError, operation: DatabaseOperation): Promise<string> {
        const errorCode = error.code;
        const errorMessage = error.message?.toLowerCase() || '';

        // Connection-related errors
        if (errorCode?.startsWith('08') || errorMessage.includes('connection')) {
            return await this.handleConnectionError(error);
        }

        // Deadlock errors
        if (errorCode === '40P01' || errorMessage.includes('deadlock')) {
            return await this.handleDeadlockError(error, operation);
        }

        // Serialization failure
        if (errorCode === '40001' || errorMessage.includes('serialization')) {
            return await this.handleSerializationError(error);
        }

        // Resource limit errors
        if (errorCode?.startsWith('53') || errorMessage.includes('limit exceeded')) {
            return await this.handleResourceLimitError(error);
        }

        // Lock timeout errors
        if (errorMessage.includes('lock timeout') || errorMessage.includes('lock wait timeout')) {
            return await this.handleLockTimeoutError(error);
        }

        return 'generic_retry';
    }

    /**
     * Handle connection-related errors
     */
    private async handleConnectionError(error: DatabaseError): Promise<string> {
        console.log('Applying connection recovery action');

        // Test pool connectivity
        try {
            const client = await this.pool.connect();
            client.release();
            return 'connection_restored';
        } catch (testError) {
            console.error('Connection test failed:', testError);
            return 'connection_retry';
        }
    }

    /**
     * Handle deadlock errors
     */
    private async handleDeadlockError(error: DatabaseError, operation: DatabaseOperation): Promise<string> {
        console.log('Applying deadlock recovery action');

        // Add random delay to reduce deadlock probability
        const randomDelay = Math.random() * 1000;
        await this.sleep(randomDelay);

        return 'deadlock_retry_with_delay';
    }

    /**
     * Handle serialization failure errors
     */
    private async handleSerializationError(error: DatabaseError): Promise<string> {
        console.log('Applying serialization failure recovery action');

        // Add delay and retry with lower isolation level if possible
        await this.sleep(500);

        return 'serialization_retry';
    }

    /**
     * Handle resource limit errors
     */
    private async handleResourceLimitError(error: DatabaseError): Promise<string> {
        console.log('Applying resource limit recovery action');

        // Wait longer for resources to become available
        await this.sleep(2000);

        return 'resource_limit_retry';
    }

    /**
     * Handle lock timeout errors
     */
    private async handleLockTimeoutError(error: DatabaseError): Promise<string> {
        console.log('Applying lock timeout recovery action');

        // Wait and retry with exponential backoff
        await this.sleep(1000);

        return 'lock_timeout_retry';
    }

    /**
     * Calculate retry delay with exponential backoff
     */
    private calculateRetryDelay(retryCount: number): number {
        const delay = this.RETRY_DELAY_BASE * Math.pow(2, retryCount);
        const jitter = Math.random() * 0.1 * delay; // Add 10% jitter
        return Math.min(delay + jitter, 30000); // Max 30 seconds
    }

    /**
     * Sleep utility
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Validate database operation parameters
     * Requirements: 3.4 - Input validation for database operations
     */
    validateOperation(operation: DatabaseOperation): void {
        if (!operation.query || typeof operation.query !== 'string') {
            throw createEnhancedError(
                'Invalid database query',
                400,
                'VALIDATION'
            );
        }

        if (operation.type === 'INSERT' || operation.type === 'UPDATE') {
            if (!operation.table) {
                throw createEnhancedError(
                    'Table name required for INSERT/UPDATE operations',
                    400,
                    'VALIDATION'
                );
            }
        }

        // Check for potential SQL injection patterns
        const suspiciousPatterns = [
            /;\s*(drop|delete|truncate|alter)\s+/i,
            /union\s+select/i,
            /'\s*or\s+'1'\s*=\s*'1/i,
            /--\s*$/,
            /\/\*.*\*\//
        ];

        const hasSuspiciousPattern = suspiciousPatterns.some(pattern =>
            pattern.test(operation.query)
        );

        if (hasSuspiciousPattern) {
            throw createEnhancedError(
                'Potentially malicious SQL detected',
                400,
                'SECURITY',
                true
            );
        }
    }

    /**
     * Get database health status
     * Requirements: 3.5 - Database health monitoring
     */
    async getDatabaseHealth(): Promise<{
        status: 'healthy' | 'degraded' | 'unhealthy';
        connectionCount: number;
        totalConnections: number;
        idleConnections: number;
        waitingCount: number;
        responseTime: number;
    }> {
        const startTime = Date.now();

        try {
            const client = await this.pool.connect();

            try {
                // Test query
                await client.query('SELECT 1');

                const responseTime = Date.now() - startTime;

                return {
                    status: responseTime < 1000 ? 'healthy' : 'degraded',
                    connectionCount: this.pool.totalCount,
                    totalConnections: this.pool.totalCount,
                    idleConnections: this.pool.idleCount,
                    waitingCount: this.pool.waitingCount,
                    responseTime
                };
            } finally {
                client.release();
            }
        } catch (error) {
            return {
                status: 'unhealthy',
                connectionCount: this.pool.totalCount,
                totalConnections: this.pool.totalCount,
                idleConnections: this.pool.idleCount,
                waitingCount: this.pool.waitingCount,
                responseTime: Date.now() - startTime
            };
        }
    }

    /**
     * Execute query with automatic retry and error handling
     * Requirements: 3.4, 3.5 - Simplified interface for common operations
     */
    async query<T>(
        query: string,
        params?: any[],
        options?: {
            maxRetries?: number;
            table?: string;
            operation?: DatabaseOperation['type'];
        }
    ): Promise<T> {
        const operation: DatabaseOperation = {
            type: options?.operation || 'SELECT',
            table: options?.table,
            query,
            params,
            maxRetries: options?.maxRetries
        };

        this.validateOperation(operation);

        const result = await this.executeWithRecovery<T>(operation);

        if (!result.success) {
            throw createEnhancedError(
                `Database operation failed: ${result.error?.message}`,
                500,
                'DATABASE'
            );
        }

        return result.result!;
    }

    /**
     * Execute transaction with automatic retry and error handling
     * Requirements: 3.4, 3.5 - Transaction error handling
     */
    async transaction<T>(
        queries: Array<{ query: string; params?: any[] }>,
        options?: { maxRetries?: number }
    ): Promise<T[]> {
        let client: PoolClient | null = null;
        let retryCount = 0;
        const maxRetries = options?.maxRetries || this.MAX_RETRIES;

        while (retryCount <= maxRetries) {
            try {
                client = await this.pool.connect();
                await client.query('BEGIN');

                const results: T[] = [];

                for (const { query, params } of queries) {
                    const result = await client.query(query, params);
                    results.push(result as T);
                }

                await client.query('COMMIT');
                return results;

            } catch (error) {
                if (client) {
                    try {
                        await client.query('ROLLBACK');
                    } catch (rollbackError) {
                        console.error('Rollback failed:', rollbackError);
                    }
                }

                const dbError = error as DatabaseError;

                if (!this.isRetryableError(dbError) || retryCount >= maxRetries) {
                    throw createEnhancedError(
                        `Transaction failed: ${dbError.message}`,
                        500,
                        'DATABASE'
                    );
                }

                await this.applyRecoveryAction(dbError, {
                    type: 'TRANSACTION',
                    query: queries.map(q => q.query).join('; ')
                });

                const delay = this.calculateRetryDelay(retryCount);
                await this.sleep(delay);
                retryCount++;

            } finally {
                if (client) {
                    client.release();
                    client = null;
                }
            }
        }

        throw createEnhancedError(
            'Transaction failed after maximum retries',
            500,
            'DATABASE'
        );
    }
}

/**
 * Create database error handler instance
 */
export function createDatabaseErrorHandler(pool: Pool): DatabaseErrorHandler {
    return new DatabaseErrorHandler(pool);
}