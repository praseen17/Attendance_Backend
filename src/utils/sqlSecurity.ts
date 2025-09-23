import { Pool, PoolClient, QueryResult } from 'pg';

/**
 * SQL Security utilities to prevent SQL injection attacks
 */

/**
 * Secure query interface that enforces parameterized queries
 */
export interface SecureQuery {
    text: string;
    values: any[];
}

/**
 * Validate that a query uses parameterized statements
 */
export function validateParameterizedQuery(query: string, values: any[]): {
    isValid: boolean;
    errors: string[];
} {
    const errors: string[] = [];

    // Check for potential SQL injection patterns
    const suspiciousPatterns = [
        /;\s*(drop|delete|truncate|alter|create|insert|update)\s+/i,
        /union\s+select/i,
        /'\s*or\s*'1'\s*=\s*'1/i,
        /'\s*or\s*1\s*=\s*1/i,
        /--\s*$/m,
        /\/\*.*\*\//s,
        /exec\s*\(/i,
        /xp_/i,
        /sp_/i
    ];

    for (const pattern of suspiciousPatterns) {
        if (pattern.test(query)) {
            errors.push('Query contains potentially malicious SQL patterns');
            break;
        }
    }

    // Count parameter placeholders
    const placeholderCount = (query.match(/\$\d+/g) || []).length;

    if (placeholderCount !== values.length) {
        errors.push(`Parameter count mismatch: query has ${placeholderCount} placeholders but ${values.length} values provided`);
    }

    // Check for string concatenation in query (potential injection point)
    if (query.includes("' + ") || query.includes('" + ')) {
        errors.push('Query appears to use string concatenation instead of parameters');
    }

    return {
        isValid: errors.length === 0,
        errors
    };
}

/**
 * Secure query builder that enforces parameterized queries
 */
export class SecureQueryBuilder {
    private query: string = '';
    private values: any[] = [];
    private parameterIndex: number = 1;

    /**
     * Add a SELECT clause
     */
    select(columns: string[]): this {
        // Validate column names to prevent injection
        const validColumns = columns.filter(col => /^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)?$/.test(col));

        if (validColumns.length !== columns.length) {
            throw new Error('Invalid column names detected');
        }

        this.query = `SELECT ${validColumns.join(', ')}`;
        return this;
    }

    /**
     * Add a FROM clause
     */
    from(table: string): this {
        // Validate table name
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) {
            throw new Error('Invalid table name');
        }

        this.query += ` FROM ${table}`;
        return this;
    }

    /**
     * Add a WHERE clause with parameterized condition
     */
    where(condition: string, value: any): this {
        const paramPlaceholder = `$${this.parameterIndex++}`;
        this.query += ` WHERE ${condition.replace('?', paramPlaceholder)}`;
        this.values.push(value);
        return this;
    }

    /**
     * Add an AND condition
     */
    and(condition: string, value: any): this {
        const paramPlaceholder = `$${this.parameterIndex++}`;
        this.query += ` AND ${condition.replace('?', paramPlaceholder)}`;
        this.values.push(value);
        return this;
    }

    /**
     * Add an OR condition
     */
    or(condition: string, value: any): this {
        const paramPlaceholder = `$${this.parameterIndex++}`;
        this.query += ` OR ${condition.replace('?', paramPlaceholder)}`;
        this.values.push(value);
        return this;
    }

    /**
     * Add ORDER BY clause
     */
    orderBy(column: string, direction: 'ASC' | 'DESC' = 'ASC'): this {
        // Validate column name and direction
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)?$/.test(column)) {
            throw new Error('Invalid column name for ORDER BY');
        }

        if (!['ASC', 'DESC'].includes(direction)) {
            throw new Error('Invalid sort direction');
        }

        this.query += ` ORDER BY ${column} ${direction}`;
        return this;
    }

    /**
     * Add LIMIT clause
     */
    limit(count: number): this {
        if (!Number.isInteger(count) || count < 0) {
            throw new Error('LIMIT must be a non-negative integer');
        }

        const paramPlaceholder = `$${this.parameterIndex++}`;
        this.query += ` LIMIT ${paramPlaceholder}`;
        this.values.push(count);
        return this;
    }

    /**
     * Add OFFSET clause
     */
    offset(count: number): this {
        if (!Number.isInteger(count) || count < 0) {
            throw new Error('OFFSET must be a non-negative integer');
        }

        const paramPlaceholder = `$${this.parameterIndex++}`;
        this.query += ` OFFSET ${paramPlaceholder}`;
        this.values.push(count);
        return this;
    }

    /**
     * Build the final secure query
     */
    build(): SecureQuery {
        const validation = validateParameterizedQuery(this.query, this.values);

        if (!validation.isValid) {
            throw new Error(`Invalid query: ${validation.errors.join(', ')}`);
        }

        return {
            text: this.query,
            values: this.values
        };
    }
}

/**
 * Secure database client wrapper
 */
export class SecureDatabaseClient {
    constructor(private client: Pool | PoolClient) { }

    /**
     * Execute a secure parameterized query
     */
    async query(queryText: string, values: any[] = []): Promise<QueryResult> {
        // Validate the query before execution
        const validation = validateParameterizedQuery(queryText, values);

        if (!validation.isValid) {
            throw new Error(`Unsafe query rejected: ${validation.errors.join(', ')}`);
        }

        // Sanitize values
        const sanitizedValues = values.map(value => this.sanitizeValue(value));

        return this.client.query(queryText, sanitizedValues);
    }

    /**
     * Execute a query built with SecureQueryBuilder
     */
    async executeSecureQuery(secureQuery: SecureQuery): Promise<QueryResult> {
        return this.query(secureQuery.text, secureQuery.values);
    }

    /**
     * Sanitize individual values to prevent injection
     */
    private sanitizeValue(value: any): any {
        if (typeof value === 'string') {
            // Remove null bytes and control characters
            return value.replace(/\x00/g, '').replace(/[\x01-\x1F\x7F]/g, '');
        }

        if (typeof value === 'number') {
            // Ensure it's a valid number
            if (!isFinite(value)) {
                throw new Error('Invalid number value');
            }
            return value;
        }

        if (value instanceof Date) {
            // Ensure it's a valid date
            if (isNaN(value.getTime())) {
                throw new Error('Invalid date value');
            }
            return value;
        }

        if (typeof value === 'boolean') {
            return value;
        }

        if (value === null || value === undefined) {
            return null;
        }

        // For other types, convert to string and sanitize
        return String(value).replace(/\x00/g, '').replace(/[\x01-\x1F\x7F]/g, '');
    }
}

/**
 * Create a secure query builder instance
 */
export function createSecureQuery(): SecureQueryBuilder {
    return new SecureQueryBuilder();
}

/**
 * Validate and sanitize table/column names
 */
export function validateIdentifier(identifier: string): boolean {
    // Allow only alphanumeric characters, underscores, and dots (for qualified names)
    return /^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)?$/.test(identifier);
}

/**
 * Escape identifier for use in dynamic queries (use sparingly)
 */
export function escapeIdentifier(identifier: string): string {
    if (!validateIdentifier(identifier)) {
        throw new Error('Invalid identifier');
    }

    // PostgreSQL identifier escaping
    return `"${identifier.replace(/"/g, '""')}"`;
}

/**
 * Common secure query patterns
 */
export const SecureQueryPatterns = {
    /**
     * Find by ID pattern
     */
    findById: (table: string, id: string): SecureQuery => {
        if (!validateIdentifier(table)) {
            throw new Error('Invalid table name');
        }

        return {
            text: `SELECT * FROM ${table} WHERE id = $1`,
            values: [id]
        };
    },

    /**
     * Find by field pattern
     */
    findByField: (table: string, field: string, value: any): SecureQuery => {
        if (!validateIdentifier(table) || !validateIdentifier(field)) {
            throw new Error('Invalid table or field name');
        }

        return {
            text: `SELECT * FROM ${table} WHERE ${field} = $1`,
            values: [value]
        };
    },

    /**
     * Insert pattern
     */
    insert: (table: string, fields: string[], values: any[]): SecureQuery => {
        if (!validateIdentifier(table)) {
            throw new Error('Invalid table name');
        }

        if (!fields.every(field => validateIdentifier(field))) {
            throw new Error('Invalid field names');
        }

        if (fields.length !== values.length) {
            throw new Error('Field count must match value count');
        }

        const placeholders = values.map((_, index) => `$${index + 1}`).join(', ');

        return {
            text: `INSERT INTO ${table} (${fields.join(', ')}) VALUES (${placeholders}) RETURNING *`,
            values
        };
    },

    /**
     * Update pattern
     */
    update: (table: string, fields: string[], values: any[], whereField: string, whereValue: any): SecureQuery => {
        if (!validateIdentifier(table) || !validateIdentifier(whereField)) {
            throw new Error('Invalid table or where field name');
        }

        if (!fields.every(field => validateIdentifier(field))) {
            throw new Error('Invalid field names');
        }

        if (fields.length !== values.length) {
            throw new Error('Field count must match value count');
        }

        const setClause = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');
        const whereClause = `${whereField} = $${values.length + 1}`;

        return {
            text: `UPDATE ${table} SET ${setClause} WHERE ${whereClause} RETURNING *`,
            values: [...values, whereValue]
        };
    }
};