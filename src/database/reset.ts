import { pool } from './connection';

/**
 * Database reset script
 * This script drops all tables and resets the database to a clean state
 */
const resetDatabase = async (): Promise<void> => {
    try {
        console.log('🧹 Resetting database...');

        // Drop tables in reverse order to handle foreign key constraints
        const dropQueries = [
            'DROP TABLE IF EXISTS attendance_logs CASCADE;',
            'DROP TABLE IF EXISTS students CASCADE;',
            'DROP TABLE IF EXISTS sections CASCADE;',
            'DROP TABLE IF EXISTS faculty CASCADE;',
            'DROP TABLE IF EXISTS migrations CASCADE;',
            'DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;',
            'DROP FUNCTION IF EXISTS update_section_student_count() CASCADE;'
        ];

        for (const query of dropQueries) {
            await pool.query(query);
            console.log(`✓ Executed: ${query}`);
        }

        console.log('✅ Database reset completed successfully!');

    } catch (error) {
        console.error('❌ Database reset failed:', error);
        throw error;
    }
};

// Run reset if called directly
if (require.main === module) {
    resetDatabase()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}

export { resetDatabase };