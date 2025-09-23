import { testConnection } from './connection';
import { initializeDatabase } from './migrate';

/**
 * Database initialization script
 * This script sets up the database connection and runs all migrations
 */
const init = async (): Promise<void> => {
    try {
        console.log('🚀 Starting database initialization...');

        // Test database connection
        console.log('📡 Testing database connection...');
        await testConnection();

        // Initialize database and run migrations
        console.log('📋 Running database migrations...');
        await initializeDatabase();

        console.log('✅ Database initialization completed successfully!');

    } catch (error) {
        console.error('❌ Database initialization failed:', error);

        // Provide helpful error messages
        if (error instanceof Error) {
            if (error.message.includes('ECONNREFUSED')) {
                console.error('💡 Make sure PostgreSQL is running and accessible');
                console.error('💡 Check your database configuration in .env file');
            } else if (error.message.includes('authentication failed')) {
                console.error('💡 Check your database credentials in .env file');
            } else if (error.message.includes('database') && error.message.includes('does not exist')) {
                console.error('💡 Create the database first or check DB_NAME in .env file');
            }
        }

        process.exit(1);
    }
};

// Run initialization if called directly
if (require.main === module) {
    init();
}

export { init };