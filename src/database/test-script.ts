import { testConnection, healthCheck, query, findMany } from './index';

/**
 * Database test script
 * This script tests the database connection and basic operations
 */
const testDatabase = async (): Promise<void> => {
    try {
        console.log('🧪 Testing database functionality...');

        // Test connection
        console.log('📡 Testing connection...');
        await testConnection();

        // Test health check
        console.log('🏥 Testing health check...');
        const health = await healthCheck();
        console.log('Health status:', health);

        // Test basic queries
        console.log('📊 Testing basic queries...');

        // Check if tables exist
        const tables = await query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_type = 'BASE TABLE'
            ORDER BY table_name
        `);

        console.log('Created tables:');
        tables.rows.forEach(row => console.log(`- ${row.table_name}`));

        // Test table structure
        console.log('\n📋 Testing table structures...');

        const facultyColumns = await query(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_name = 'faculty'
            ORDER BY ordinal_position
        `);

        console.log('Faculty table columns:');
        facultyColumns.rows.forEach(col => {
            console.log(`- ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
        });

        // Test indexes
        console.log('\n🔍 Testing indexes...');
        const indexes = await query(`
            SELECT indexname, tablename
            FROM pg_indexes
            WHERE schemaname = 'public'
            ORDER BY tablename, indexname
        `);

        console.log('Created indexes:');
        indexes.rows.forEach(idx => console.log(`- ${idx.tablename}.${idx.indexname}`));

        // Test triggers
        console.log('\n⚡ Testing triggers...');
        const triggers = await query(`
            SELECT trigger_name, event_object_table, action_timing, event_manipulation
            FROM information_schema.triggers
            WHERE trigger_schema = 'public'
            ORDER BY event_object_table, trigger_name
        `);

        console.log('Created triggers:');
        triggers.rows.forEach(trigger => {
            console.log(`- ${trigger.event_object_table}.${trigger.trigger_name} (${trigger.action_timing} ${trigger.event_manipulation})`);
        });

        console.log('\n✅ Database test completed successfully!');

    } catch (error) {
        console.error('❌ Database test failed:', error);
        throw error;
    }
};

// Run test if called directly
if (require.main === module) {
    testDatabase()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}

export { testDatabase };