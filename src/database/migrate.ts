import { pool } from './connection';
import fs from 'fs';
import path from 'path';

interface Migration {
    id: number;
    filename: string;
    executed_at: Date;
}

// Create migrations tracking table
const createMigrationsTable = async (): Promise<void> => {
    const query = `
        CREATE TABLE IF NOT EXISTS migrations (
            id SERIAL PRIMARY KEY,
            filename VARCHAR(255) UNIQUE NOT NULL,
            executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `;

    try {
        await pool.query(query);
        console.log('Migrations table created or already exists');
    } catch (error) {
        console.error('Error creating migrations table:', error);
        throw error;
    }
};

// Get executed migrations
const getExecutedMigrations = async (): Promise<string[]> => {
    try {
        const result = await pool.query('SELECT filename FROM migrations ORDER BY id');
        return result.rows.map(row => row.filename);
    } catch (error) {
        console.error('Error fetching executed migrations:', error);
        throw error;
    }
};

// Record migration execution
const recordMigration = async (filename: string): Promise<void> => {
    try {
        await pool.query('INSERT INTO migrations (filename) VALUES ($1)', [filename]);
        console.log(`Migration ${filename} recorded`);
    } catch (error) {
        console.error(`Error recording migration ${filename}:`, error);
        throw error;
    }
};

// Execute a single migration file
const executeMigration = async (filename: string, filepath: string): Promise<void> => {
    try {
        const sql = fs.readFileSync(filepath, 'utf8');

        // Begin transaction
        await pool.query('BEGIN');

        // Execute migration SQL
        await pool.query(sql);

        // Record migration
        await recordMigration(filename);

        // Commit transaction
        await pool.query('COMMIT');

        console.log(`✓ Migration ${filename} executed successfully`);
    } catch (error) {
        // Rollback transaction on error
        await pool.query('ROLLBACK');
        console.error(`✗ Migration ${filename} failed:`, error);
        throw error;
    }
};

// Run all pending migrations
const runMigrations = async (): Promise<void> => {
    try {
        console.log('Starting database migrations...');

        // Create migrations table if it doesn't exist
        await createMigrationsTable();

        // Get list of executed migrations
        const executedMigrations = await getExecutedMigrations();

        // Get all migration files
        const migrationsDir = path.join(__dirname, 'migrations');
        const migrationFiles = fs.readdirSync(migrationsDir)
            .filter(file => file.endsWith('.sql'))
            .sort(); // Ensure migrations run in order

        console.log(`Found ${migrationFiles.length} migration files`);
        console.log(`${executedMigrations.length} migrations already executed`);

        // Execute pending migrations
        let executedCount = 0;
        for (const filename of migrationFiles) {
            if (!executedMigrations.includes(filename)) {
                const filepath = path.join(migrationsDir, filename);
                await executeMigration(filename, filepath);
                executedCount++;
            } else {
                console.log(`- Migration ${filename} already executed`);
            }
        }

        if (executedCount === 0) {
            console.log('No pending migrations to execute');
        } else {
            console.log(`✓ Successfully executed ${executedCount} migrations`);
        }

    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
};

// Initialize database (create database if it doesn't exist)
const initializeDatabase = async (): Promise<void> => {
    try {
        console.log('Initializing database...');

        // Test connection
        const client = await pool.connect();
        console.log('✓ Database connection successful');
        client.release();

        // Run migrations
        await runMigrations();

        console.log('✓ Database initialization complete');

    } catch (error) {
        console.error('Database initialization failed:', error);
        throw error;
    }
};

// CLI interface
const main = async (): Promise<void> => {
    const command = process.argv[2];

    try {
        switch (command) {
            case 'init':
                await initializeDatabase();
                break;
            case 'migrate':
                await runMigrations();
                break;
            case 'status':
                await createMigrationsTable();
                const executed = await getExecutedMigrations();
                console.log('Executed migrations:');
                executed.forEach(migration => console.log(`- ${migration}`));
                break;
            default:
                console.log('Usage: npm run migrate [init|migrate|status]');
                console.log('  init    - Initialize database and run all migrations');
                console.log('  migrate - Run pending migrations');
                console.log('  status  - Show migration status');
        }
    } catch (error) {
        console.error('Command failed:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
};

// Run if called directly
if (require.main === module) {
    main();
}

export { initializeDatabase, runMigrations };