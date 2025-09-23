import { Pool, PoolClient, QueryResult } from 'pg';
import { pool } from './connection';

/**
 * Database utility functions for common operations
 */

// Generic query function with error handling
export const query = async (text: string, params?: any[]): Promise<QueryResult> => {
    try {
        const result = await pool.query(text, params);
        return result;
    } catch (error) {
        console.error('Database query error:', error);
        console.error('Query:', text);
        console.error('Params:', params);
        throw error;
    }
};

// Transaction wrapper
export const withTransaction = async <T>(
    callback: (client: PoolClient) => Promise<T>
): Promise<T> => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

// Check if a record exists
export const exists = async (table: string, condition: string, params: any[]): Promise<boolean> => {
    const result = await query(
        `SELECT EXISTS(SELECT 1 FROM ${table} WHERE ${condition})`,
        params
    );
    return result.rows[0].exists;
};

// Get a single record by ID
export const findById = async (table: string, id: string): Promise<any | null> => {
    const result = await query(`SELECT * FROM ${table} WHERE id = $1`, [id]);
    return result.rows[0] || null;
};

// Get multiple records with optional conditions
export const findMany = async (
    table: string,
    conditions?: string,
    params?: any[],
    orderBy?: string,
    limit?: number,
    offset?: number
): Promise<any[]> => {
    let queryText = `SELECT * FROM ${table}`;

    if (conditions) {
        queryText += ` WHERE ${conditions}`;
    }

    if (orderBy) {
        queryText += ` ORDER BY ${orderBy}`;
    }

    if (limit) {
        queryText += ` LIMIT ${limit}`;
    }

    if (offset) {
        queryText += ` OFFSET ${offset}`;
    }

    const result = await query(queryText, params);
    return result.rows;
};

// Insert a new record
export const insert = async (
    table: string,
    data: Record<string, any>
): Promise<any> => {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = keys.map((_, index) => `$${index + 1}`).join(', ');

    const queryText = `
        INSERT INTO ${table} (${keys.join(', ')})
        VALUES (${placeholders})
        RETURNING *
    `;

    const result = await query(queryText, values);
    return result.rows[0];
};

// Update a record by ID
export const updateById = async (
    table: string,
    id: string,
    data: Record<string, any>
): Promise<any | null> => {
    const keys = Object.keys(data);
    const values = Object.values(data);

    if (keys.length === 0) {
        throw new Error('No data provided for update');
    }

    const setClause = keys.map((key, index) => `${key} = $${index + 2}`).join(', ');

    const queryText = `
        UPDATE ${table}
        SET ${setClause}
        WHERE id = $1
        RETURNING *
    `;

    const result = await query(queryText, [id, ...values]);
    return result.rows[0] || null;
};

// Delete a record by ID
export const deleteById = async (table: string, id: string): Promise<boolean> => {
    const result = await query(`DELETE FROM ${table} WHERE id = $1`, [id]);
    return (result.rowCount ?? 0) > 0;
};

// Count records with optional conditions
export const count = async (
    table: string,
    conditions?: string,
    params?: any[]
): Promise<number> => {
    let queryText = `SELECT COUNT(*) FROM ${table}`;

    if (conditions) {
        queryText += ` WHERE ${conditions}`;
    }

    const result = await query(queryText, params);
    return parseInt(result.rows[0].count, 10);
};

// Batch insert multiple records
export const batchInsert = async (
    table: string,
    records: Record<string, any>[],
    onConflict?: string
): Promise<any[]> => {
    if (records.length === 0) {
        return [];
    }

    const keys = Object.keys(records[0]);
    const placeholders = records.map((_, recordIndex) => {
        const recordPlaceholders = keys.map((_, keyIndex) =>
            `$${recordIndex * keys.length + keyIndex + 1}`
        ).join(', ');
        return `(${recordPlaceholders})`;
    }).join(', ');

    const values = records.flatMap(record => Object.values(record));

    let queryText = `
        INSERT INTO ${table} (${keys.join(', ')})
        VALUES ${placeholders}
    `;

    if (onConflict) {
        queryText += ` ${onConflict}`;
    }

    queryText += ' RETURNING *';

    const result = await query(queryText, values);
    return result.rows;
};

// Execute raw SQL with parameters
export const raw = async (sql: string, params?: any[]): Promise<QueryResult> => {
    return query(sql, params);
};

// Health check function
export const healthCheck = async (): Promise<{ status: string; timestamp: Date }> => {
    try {
        await query('SELECT 1');
        return {
            status: 'healthy',
            timestamp: new Date()
        };
    } catch (error) {
        throw new Error(`Database health check failed: ${error}`);
    }
};