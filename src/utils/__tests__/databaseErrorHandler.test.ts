import { Pool, PoolClient } from 'pg';
import {
    DatabaseErrorHandler,
    createDatabaseErrorHandler,
    DatabaseOperation,
    DatabaseError,
    DatabaseRecoveryResult
} from '../databaseErrorHandler';

// Mock pg Pool and PoolClient
const mockClient = {
    query: jest.fn(),
    release: jest.fn()
} as unknown as jest.Mocked<PoolClient>;

const mockPool = {
    connect: jest.fn(),
    totalCount: 10,
    idleCount: 5,
    waitingCount: 0
} as unknown as jest.Mocked<Pool>;

describe('DatabaseErrorHandler', () => {
    let errorHandler: DatabaseErrorHandler;

    beforeEach(() => {
        errorHandler = new DatabaseErrorHandler(mockPool);
        jest.clearAllMocks();

        // Default successful connection
        mockPool.connect.mockResolvedValue(mockClient);
        mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 } as any);
    });

    describe('Error Classification', () => {
        it('should identify retryable connection errors', () => {
            const connectionError: DatabaseError = new Error('connection terminated') as DatabaseError;
            connectionError.code = '08006';

            const isRetryable = errorHandler['isRetryableError'](connectionError);
            expect(isRetryable).toBe(true);
        });

        it('should identify retryable deadlock errors', () => {
            const deadlockError: DatabaseError = new Error('deadlock detected') as DatabaseError;
            deadlockError.code = '40P01';

            const isRetryable = errorHandler['isRetryableError'](deadlockError);
            expect(isRetryable).toBe(true);
        });

        it('should identify non-retryable syntax errors', () => {
            const syntaxError: DatabaseError = new Error('syntax error') as DatabaseError;
            syntaxError.code = '42601';

            const isRetryable = errorHandler['isRetryableError'](syntaxError);
            expect(isRetryable).toBe(false);
        });

        it('should identify retryable errors by message content', () => {
            const timeoutError: DatabaseError = new Error('connection timed out') as DatabaseError;

            const isRetryable = errorHandler['isRetryableError'](timeoutError);
            expect(isRetryable).toBe(true);
        });
    });

    describe('Operation Execution', () => {
        it('should execute SELECT operation successfully', async () => {
            const mockRows = [{ id: 1, name: 'test' }];
            mockClient.query.mockResolvedValue({ rows: mockRows } as any);

            const operation: DatabaseOperation = {
                type: 'SELECT',
                query: 'SELECT * FROM test',
                params: []
            };

            const result = await errorHandler.executeWithRecovery(operation);

            expect(result.success).toBe(true);
            expect(result.result).toEqual(mockRows);
            expect(result.retryCount).toBe(0);
        });

        it('should execute INSERT operation successfully', async () => {
            const mockResult = { rows: [{ id: 1 }], rowCount: 1 };
            mockClient.query.mockResolvedValue(mockResult as any);

            const operation: DatabaseOperation = {
                type: 'INSERT',
                table: 'test_table',
                query: 'INSERT INTO test_table (name) VALUES ($1)',
                params: ['test']
            };

            const result = await errorHandler.executeWithRecovery(operation);

            expect(result.success).toBe(true);
            expect(result.result).toEqual(mockResult);
        });

        it('should execute TRANSACTION operation with commit', async () => {
            mockClient.query
                .mockResolvedValueOnce(undefined as any) // BEGIN
                .mockResolvedValueOnce({ rows: [{ id: 1 }] } as any) // Main query
                .mockResolvedValueOnce(undefined as any); // COMMIT

            const operation: DatabaseOperation = {
                type: 'TRANSACTION',
                query: 'INSERT INTO test_table (name) VALUES ($1)',
                params: ['test']
            };

            const result = await errorHandler.executeWithRecovery(operation);

            expect(result.success).toBe(true);
            expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
            expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
        });

        it('should rollback transaction on error', async () => {
            mockClient.query
                .mockResolvedValueOnce(undefined as any) // BEGIN
                .mockRejectedValueOnce(new Error('Query failed')) // Main query fails
                .mockResolvedValueOnce(undefined as any); // ROLLBACK

            const operation: DatabaseOperation = {
                type: 'TRANSACTION',
                query: 'INSERT INTO test_table (name) VALUES ($1)',
                params: ['test']
            };

            const result = await errorHandler.executeWithRecovery(operation);

            expect(result.success).toBe(false);
            expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
            expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
        });
    });

    describe('Error Recovery', () => {
        it('should retry retryable errors with exponential backoff', async () => {
            const retryableError: DatabaseError = new Error('connection lost') as DatabaseError;
            retryableError.code = '08006';

            mockClient.query
                .mockRejectedValueOnce(retryableError)
                .mockRejectedValueOnce(retryableError)
                .mockResolvedValueOnce({ rows: [{ success: true }] } as any);

            const operation: DatabaseOperation = {
                type: 'SELECT',
                query: 'SELECT 1',
                maxRetries: 3
            };

            const result = await errorHandler.executeWithRecovery(operation);

            expect(result.success).toBe(true);
            expect(result.retryCount).toBe(2);
            expect(mockClient.query).toHaveBeenCalledTimes(3);
        });

        it('should stop retrying after max attempts', async () => {
            const retryableError: DatabaseError = new Error('connection lost') as DatabaseError;
            retryableError.code = '08006';

            mockClient.query.mockRejectedValue(retryableError);

            const operation: DatabaseOperation = {
                type: 'SELECT',
                query: 'SELECT 1',
                maxRetries: 2
            };

            const result = await errorHandler.executeWithRecovery(operation);

            expect(result.success).toBe(false);
            expect(result.retryCount).toBe(2);
            expect(result.error).toBe(retryableError);
        });

        it('should not retry non-retryable errors', async () => {
            const nonRetryableError: DatabaseError = new Error('syntax error') as DatabaseError;
            nonRetryableError.code = '42601';

            mockClient.query.mockRejectedValue(nonRetryableError);

            const operation: DatabaseOperation = {
                type: 'SELECT',
                query: 'INVALID SQL',
                maxRetries: 3
            };

            const result = await errorHandler.executeWithRecovery(operation);

            expect(result.success).toBe(false);
            expect(result.retryCount).toBe(0);
            expect(mockClient.query).toHaveBeenCalledTimes(1);
        });
    });

    describe('Recovery Actions', () => {
        it('should handle connection errors with connection test', async () => {
            const connectionError: DatabaseError = new Error('connection terminated') as DatabaseError;
            connectionError.code = '08006';

            // First connection fails, second succeeds
            mockPool.connect
                .mockRejectedValueOnce(connectionError)
                .mockResolvedValueOnce(mockClient);

            const recoveryAction = await errorHandler['applyRecoveryAction'](connectionError, {
                type: 'SELECT',
                query: 'SELECT 1'
            });

            expect(recoveryAction).toBe('connection_restored');
        });

        it('should handle deadlock errors with random delay', async () => {
            const deadlockError: DatabaseError = new Error('deadlock detected') as DatabaseError;
            deadlockError.code = '40P01';

            const recoveryAction = await errorHandler['applyRecoveryAction'](deadlockError, {
                type: 'UPDATE',
                query: 'UPDATE test SET value = 1'
            });

            expect(recoveryAction).toBe('deadlock_retry_with_delay');
        });

        it('should handle serialization failure errors', async () => {
            const serializationError: DatabaseError = new Error('serialization failure') as DatabaseError;
            serializationError.code = '40001';

            const recoveryAction = await errorHandler['applyRecoveryAction'](serializationError, {
                type: 'SELECT',
                query: 'SELECT * FROM test'
            });

            expect(recoveryAction).toBe('serialization_retry');
        });

        it('should handle resource limit errors', async () => {
            const resourceError: DatabaseError = new Error('too many connections') as DatabaseError;
            resourceError.code = '53300';

            const recoveryAction = await errorHandler['applyRecoveryAction'](resourceError, {
                type: 'SELECT',
                query: 'SELECT 1'
            });

            expect(recoveryAction).toBe('resource_limit_retry');
        });
    });

    describe('Operation Validation', () => {
        it('should validate operation parameters', () => {
            const invalidOperation: DatabaseOperation = {
                type: 'SELECT',
                query: '',
                params: []
            };

            expect(() => {
                errorHandler.validateOperation(invalidOperation);
            }).toThrow('Invalid database query');
        });

        it('should require table name for INSERT operations', () => {
            const invalidInsert: DatabaseOperation = {
                type: 'INSERT',
                query: 'INSERT INTO test (name) VALUES ($1)',
                params: ['test']
            };

            expect(() => {
                errorHandler.validateOperation(invalidInsert);
            }).toThrow('Table name required for INSERT/UPDATE operations');
        });

        it('should detect potential SQL injection', () => {
            const suspiciousOperation: DatabaseOperation = {
                type: 'SELECT',
                query: "SELECT * FROM users WHERE id = 1; DROP TABLE users; --",
                params: []
            };

            expect(() => {
                errorHandler.validateOperation(suspiciousOperation);
            }).toThrow('Potentially malicious SQL detected');
        });

        it('should allow valid operations', () => {
            const validOperation: DatabaseOperation = {
                type: 'SELECT',
                query: 'SELECT * FROM users WHERE id = $1',
                params: [1]
            };

            expect(() => {
                errorHandler.validateOperation(validOperation);
            }).not.toThrow();
        });
    });

    describe('Database Health Monitoring', () => {
        it('should report healthy status for fast responses', async () => {
            mockClient.query.mockResolvedValue({ rows: [{ result: 1 }] } as any);

            const health = await errorHandler.getDatabaseHealth();

            expect(health.status).toBe('healthy');
            expect(health.responseTime).toBeLessThan(1000);
            expect(health.connectionCount).toBe(10);
            expect(health.idleConnections).toBe(5);
        });

        it('should report degraded status for slow responses', async () => {
            // Simulate slow response
            mockClient.query.mockImplementation(() =>
                new Promise(resolve => setTimeout(() => resolve({ rows: [{ result: 1 }] } as any), 1500))
            );

            const health = await errorHandler.getDatabaseHealth();

            expect(health.status).toBe('degraded');
            expect(health.responseTime).toBeGreaterThan(1000);
        });

        it('should report unhealthy status for connection failures', async () => {
            mockPool.connect.mockRejectedValue(new Error('Connection failed'));

            const health = await errorHandler.getDatabaseHealth();

            expect(health.status).toBe('unhealthy');
            expect(health.responseTime).toBeGreaterThan(0);
        });
    });

    describe('Simplified Query Interface', () => {
        it('should execute simple query with error handling', async () => {
            const mockRows = [{ id: 1, name: 'test' }];
            mockClient.query.mockResolvedValue({ rows: mockRows } as any);

            const result = await errorHandler.query<typeof mockRows>(
                'SELECT * FROM test WHERE id = $1',
                [1],
                { table: 'test', operation: 'SELECT' }
            );

            expect(result).toEqual(mockRows);
            expect(mockClient.query).toHaveBeenCalledWith(
                'SELECT * FROM test WHERE id = $1',
                [1]
            );
        });

        it('should throw enhanced error for query failures', async () => {
            const dbError = new Error('Query failed');
            mockClient.query.mockRejectedValue(dbError);

            await expect(
                errorHandler.query('SELECT * FROM test')
            ).rejects.toThrow('Database operation failed: Query failed');
        });
    });

    describe('Transaction Interface', () => {
        it('should execute multiple queries in transaction', async () => {
            mockClient.query
                .mockResolvedValueOnce(undefined as any) // BEGIN
                .mockResolvedValueOnce({ rows: [{ id: 1 }] } as any) // First query
                .mockResolvedValueOnce({ rows: [{ id: 2 }] } as any) // Second query
                .mockResolvedValueOnce(undefined as any); // COMMIT

            const queries = [
                { query: 'INSERT INTO test (name) VALUES ($1)', params: ['test1'] },
                { query: 'INSERT INTO test (name) VALUES ($1)', params: ['test2'] }
            ];

            const results = await errorHandler.transaction(queries);

            expect(results).toHaveLength(2);
            expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
            expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
        });

        it('should retry failed transactions', async () => {
            const retryableError: DatabaseError = new Error('deadlock detected') as DatabaseError;
            retryableError.code = '40P01';

            mockClient.query
                .mockResolvedValueOnce(undefined as any) // BEGIN (first attempt)
                .mockRejectedValueOnce(retryableError) // First query fails
                .mockResolvedValueOnce(undefined as any) // ROLLBACK
                .mockResolvedValueOnce(undefined as any) // BEGIN (second attempt)
                .mockResolvedValueOnce({ rows: [{ id: 1 }] } as any) // First query succeeds
                .mockResolvedValueOnce(undefined as any); // COMMIT

            const queries = [
                { query: 'INSERT INTO test (name) VALUES ($1)', params: ['test'] }
            ];

            const results = await errorHandler.transaction(queries, { maxRetries: 2 });

            expect(results).toHaveLength(1);
            expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
            expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
        });

        it('should throw error after max transaction retries', async () => {
            const retryableError: DatabaseError = new Error('deadlock detected') as DatabaseError;
            retryableError.code = '40P01';

            mockClient.query
                .mockResolvedValue(undefined as any) // BEGIN calls
                .mockRejectedValue(retryableError); // All queries fail

            const queries = [
                { query: 'INSERT INTO test (name) VALUES ($1)', params: ['test'] }
            ];

            await expect(
                errorHandler.transaction(queries, { maxRetries: 1 })
            ).rejects.toThrow('Transaction failed after maximum retries');
        });
    });

    describe('Factory Function', () => {
        it('should create database error handler instance', () => {
            const handler = createDatabaseErrorHandler(mockPool);
            expect(handler).toBeInstanceOf(DatabaseErrorHandler);
        });
    });

    describe('Retry Delay Calculation', () => {
        it('should calculate exponential backoff with jitter', () => {
            const delay1 = errorHandler['calculateRetryDelay'](0);
            const delay2 = errorHandler['calculateRetryDelay'](1);
            const delay3 = errorHandler['calculateRetryDelay'](2);

            expect(delay1).toBeGreaterThanOrEqual(1000);
            expect(delay1).toBeLessThan(1500); // Base + 10% jitter

            expect(delay2).toBeGreaterThanOrEqual(2000);
            expect(delay2).toBeLessThan(2500);

            expect(delay3).toBeGreaterThanOrEqual(4000);
            expect(delay3).toBeLessThan(4500);
        });

        it('should cap retry delay at maximum', () => {
            const longDelay = errorHandler['calculateRetryDelay'](10);
            expect(longDelay).toBeLessThanOrEqual(30000);
        });
    });
});