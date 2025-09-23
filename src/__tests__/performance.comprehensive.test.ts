import { Pool } from 'pg';
import { getPool } from '../database/connection';
import { AttendanceService } from '../services/attendanceService';
import { StudentService } from '../services/studentService';
import { AuthService } from '../services/authService';

describe('Performance Tests', () => {
    let pool: Pool;
    let attendanceService: AttendanceService;
    let studentService: StudentService;
    let authService: AuthService;
    let testFacultyId: string;
    let testSectionId: string;
    let testStudentIds: string[] = [];

    beforeAll(async () => {
        pool = getPool();
        attendanceService = new AttendanceService();
        studentService = new StudentService();
        authService = new AuthService();

        // Create test faculty
        const facultyResult = await pool.query(`
            INSERT INTO faculty (username, password_hash, name, email)
            VALUES ($1, $2, $3, $4)
            RETURNING id
        `, ['perftest', '$2b$10$test.hash', 'Performance Test Faculty', 'perftest@example.com']);

        testFacultyId = facultyResult.rows[0].id;

        // Create test section
        const sectionResult = await pool.query(`
            INSERT INTO sections (name, grade, faculty_id)
            VALUES ($1, $2, $3)
            RETURNING id
        `, ['Performance Test Section', '10', testFacultyId]);

        testSectionId = sectionResult.rows[0].id;

        // Create test students (100 students for performance testing)
        for (let i = 1; i <= 100; i++) {
            const studentResult = await pool.query(`
                INSERT INTO students (roll_number, name, section_id)
                VALUES ($1, $2, $3)
                RETURNING id
            `, [`PERF${i.toString().padStart(3, '0')}`, `Performance Test Student ${i}`, testSectionId]);

            testStudentIds.push(studentResult.rows[0].id);
        }
    });

    afterAll(async () => {
        // Clean up test data
        await pool.query('DELETE FROM attendance_logs WHERE faculty_id = $1', [testFacultyId]);
        await pool.query('DELETE FROM students WHERE section_id = $1', [testSectionId]);
        await pool.query('DELETE FROM sections WHERE id = $1', [testSectionId]);
        await pool.query('DELETE FROM faculty WHERE id = $1', [testFacultyId]);
        await pool.end();
    });

    describe('Large Dataset Sync Performance', () => {
        it('should handle 1000 attendance records sync within acceptable time', async () => {
            const startTime = Date.now();

            // Generate 1000 attendance records (10 days × 100 students)
            const attendanceRecords = [];
            for (let day = 0; day < 10; day++) {
                for (let studentIndex = 0; studentIndex < 100; studentIndex++) {
                    const timestamp = new Date();
                    timestamp.setDate(timestamp.getDate() - day);

                    attendanceRecords.push({
                        studentId: testStudentIds[studentIndex],
                        facultyId: testFacultyId,
                        sectionId: testSectionId,
                        timestamp,
                        status: Math.random() > 0.1 ? 'present' : 'absent', // 90% attendance rate
                        captureMethod: Math.random() > 0.3 ? 'ml' : 'manual', // 70% ML, 30% manual
                        syncStatus: 'pending' as const
                    });
                }
            }

            // Sync all records
            const syncResult = await attendanceService.syncAttendanceRecords(attendanceRecords);

            const endTime = Date.now();
            const duration = endTime - startTime;

            // Assertions
            expect(syncResult.success).toBe(true);
            expect(syncResult.syncedCount).toBe(1000);
            expect(syncResult.failedCount).toBe(0);
            expect(duration).toBeLessThan(30000); // Should complete within 30 seconds

            console.log(`Synced 1000 records in ${duration}ms (${(1000 / (duration / 1000)).toFixed(2)} records/sec)`);
        }, 60000);

        it('should handle batch sync with concurrent operations', async () => {
            const startTime = Date.now();

            // Create 5 batches of 200 records each
            const batches = [];
            for (let batch = 0; batch < 5; batch++) {
                const batchRecords = [];
                for (let i = 0; i < 200; i++) {
                    const studentIndex = i % testStudentIds.length;
                    const timestamp = new Date();
                    timestamp.setHours(timestamp.getHours() - batch);

                    batchRecords.push({
                        studentId: testStudentIds[studentIndex],
                        facultyId: testFacultyId,
                        sectionId: testSectionId,
                        timestamp,
                        status: 'present' as const,
                        captureMethod: 'ml' as const,
                        syncStatus: 'pending' as const
                    });
                }
                batches.push(batchRecords);
            }

            // Sync all batches concurrently
            const syncPromises = batches.map(batch =>
                attendanceService.syncAttendanceRecords(batch)
            );

            const results = await Promise.all(syncPromises);

            const endTime = Date.now();
            const duration = endTime - startTime;

            // Verify all batches succeeded
            const totalSynced = results.reduce((sum, result) => sum + result.syncedCount, 0);
            const totalFailed = results.reduce((sum, result) => sum + result.failedCount, 0);

            expect(totalSynced).toBe(1000);
            expect(totalFailed).toBe(0);
            expect(duration).toBeLessThan(20000); // Concurrent should be faster

            console.log(`Synced 1000 records in 5 concurrent batches in ${duration}ms`);
        }, 60000);

        it('should maintain performance with database under load', async () => {
            // First, populate database with existing data
            const existingRecords = [];
            for (let i = 0; i < 5000; i++) {
                const studentIndex = i % testStudentIds.length;
                const daysAgo = Math.floor(i / testStudentIds.length);
                const timestamp = new Date();
                timestamp.setDate(timestamp.getDate() - daysAgo);

                existingRecords.push({
                    studentId: testStudentIds[studentIndex],
                    facultyId: testFacultyId,
                    sectionId: testSectionId,
                    timestamp,
                    status: 'present' as const,
                    captureMethod: 'ml' as const,
                    syncStatus: 'pending' as const
                });
            }

            // Sync existing records first
            await attendanceService.syncAttendanceRecords(existingRecords);

            // Now test performance with loaded database
            const startTime = Date.now();

            const newRecords = [];
            for (let i = 0; i < 500; i++) {
                const studentIndex = i % testStudentIds.length;

                newRecords.push({
                    studentId: testStudentIds[studentIndex],
                    facultyId: testFacultyId,
                    sectionId: testSectionId,
                    timestamp: new Date(),
                    status: 'present' as const,
                    captureMethod: 'ml' as const,
                    syncStatus: 'pending' as const
                });
            }

            const syncResult = await attendanceService.syncAttendanceRecords(newRecords);

            const endTime = Date.now();
            const duration = endTime - startTime;

            expect(syncResult.success).toBe(true);
            expect(syncResult.syncedCount).toBe(500);
            expect(duration).toBeLessThan(15000); // Should still be fast with loaded DB

            console.log(`Synced 500 records with loaded database in ${duration}ms`);
        }, 120000);
    });

    describe('Query Performance Tests', () => {
        beforeAll(async () => {
            // Populate with test data for query performance tests
            const records = [];
            for (let day = 0; day < 30; day++) { // 30 days of data
                for (let studentIndex = 0; studentIndex < testStudentIds.length; studentIndex++) {
                    const timestamp = new Date();
                    timestamp.setDate(timestamp.getDate() - day);

                    records.push({
                        studentId: testStudentIds[studentIndex],
                        facultyId: testFacultyId,
                        sectionId: testSectionId,
                        timestamp,
                        status: Math.random() > 0.15 ? 'present' : 'absent',
                        captureMethod: 'ml' as const,
                        syncStatus: 'pending' as const
                    });
                }
            }

            await attendanceService.syncAttendanceRecords(records);
        });

        it('should retrieve student attendance history efficiently', async () => {
            const startTime = Date.now();

            // Query attendance for all students
            const promises = testStudentIds.map(studentId =>
                attendanceService.getAttendanceHistory(studentId)
            );

            const results = await Promise.all(promises);

            const endTime = Date.now();
            const duration = endTime - startTime;

            // Verify results
            expect(results).toHaveLength(testStudentIds.length);
            expect(results.every(history => history.length > 0)).toBe(true);
            expect(duration).toBeLessThan(5000); // Should complete within 5 seconds

            console.log(`Retrieved attendance history for ${testStudentIds.length} students in ${duration}ms`);
        });

        it('should calculate attendance statistics efficiently', async () => {
            const startTime = Date.now();

            const startDate = new Date();
            startDate.setDate(startDate.getDate() - 30);
            const endDate = new Date();

            const statistics = await attendanceService.getAttendanceStatistics(
                testSectionId,
                startDate.toISOString().split('T')[0],
                endDate.toISOString().split('T')[0]
            );

            const endTime = Date.now();
            const duration = endTime - startTime;

            // Verify results
            expect(statistics).toHaveLength(testStudentIds.length);
            expect(statistics.every(stat => stat.attendance_percentage >= 0)).toBe(true);
            expect(statistics.every(stat => stat.attendance_percentage <= 100)).toBe(true);
            expect(duration).toBeLessThan(3000); // Should complete within 3 seconds

            console.log(`Calculated attendance statistics for ${testStudentIds.length} students in ${duration}ms`);
        });

        it('should handle complex queries with joins efficiently', async () => {
            const startTime = Date.now();

            // Complex query: Get students with their attendance summary
            const query = `
                SELECT 
                    s.id,
                    s.name,
                    s.roll_number,
                    COUNT(al.id) as total_records,
                    COUNT(CASE WHEN al.status = 'present' THEN 1 END) as present_count,
                    ROUND(
                        (COUNT(CASE WHEN al.status = 'present' THEN 1 END) * 100.0) / COUNT(al.id), 
                        2
                    ) as attendance_percentage
                FROM students s
                LEFT JOIN attendance_logs al ON s.id = al.student_id
                WHERE s.section_id = $1
                AND al.date >= CURRENT_DATE - INTERVAL '30 days'
                GROUP BY s.id, s.name, s.roll_number
                ORDER BY attendance_percentage DESC
            `;

            const result = await pool.query(query, [testSectionId]);

            const endTime = Date.now();
            const duration = endTime - startTime;

            // Verify results
            expect(result.rows).toHaveLength(testStudentIds.length);
            expect(result.rows.every(row => row.attendance_percentage >= 0)).toBe(true);
            expect(duration).toBeLessThan(2000); // Should complete within 2 seconds

            console.log(`Complex join query completed in ${duration}ms`);
        });
    });

    describe('Memory Usage Tests', () => {
        it('should handle large result sets without memory issues', async () => {
            const initialMemory = process.memoryUsage();

            // Query large dataset multiple times
            for (let i = 0; i < 10; i++) {
                const startDate = new Date();
                startDate.setDate(startDate.getDate() - 30);
                const endDate = new Date();

                await attendanceService.getAttendanceStatistics(
                    testSectionId,
                    startDate.toISOString().split('T')[0],
                    endDate.toISOString().split('T')[0]
                );

                // Force garbage collection if available
                if (global.gc) {
                    global.gc();
                }
            }

            const finalMemory = process.memoryUsage();
            const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

            // Memory increase should be reasonable (less than 50MB)
            expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);

            console.log(`Memory increase after 10 large queries: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);
        });

        it('should handle concurrent database connections efficiently', async () => {
            const startTime = Date.now();

            // Create multiple concurrent operations
            const concurrentOperations = [];

            for (let i = 0; i < 20; i++) {
                concurrentOperations.push(
                    studentService.getStudentsBySection(testSectionId)
                );
            }

            const results = await Promise.all(concurrentOperations);

            const endTime = Date.now();
            const duration = endTime - startTime;

            // Verify all operations completed successfully
            expect(results).toHaveLength(20);
            expect(results.every(students => students.length === testStudentIds.length)).toBe(true);
            expect(duration).toBeLessThan(5000); // Should handle concurrent operations efficiently

            console.log(`20 concurrent database operations completed in ${duration}ms`);
        });
    });

    describe('Database Connection Pool Performance', () => {
        it('should handle connection pool under stress', async () => {
            const startTime = Date.now();

            // Create many concurrent database operations
            const operations = [];

            for (let i = 0; i < 100; i++) {
                operations.push(
                    pool.query('SELECT COUNT(*) FROM attendance_logs WHERE faculty_id = $1', [testFacultyId])
                );
            }

            const results = await Promise.all(operations);

            const endTime = Date.now();
            const duration = endTime - startTime;

            // Verify all operations completed
            expect(results).toHaveLength(100);
            expect(results.every(result => result.rows.length > 0)).toBe(true);
            expect(duration).toBeLessThan(10000); // Should handle 100 concurrent queries

            console.log(`100 concurrent database queries completed in ${duration}ms`);
        });

        it('should recover from connection pool exhaustion', async () => {
            // Exhaust connection pool
            const connections = [];

            try {
                // Try to create more connections than pool allows
                for (let i = 0; i < 50; i++) {
                    connections.push(pool.connect());
                }

                await Promise.all(connections);
            } catch (error) {
                // Expected to fail when pool is exhausted
                console.log('Connection pool exhausted as expected');
            }

            // Release connections
            const clients = await Promise.allSettled(connections);
            clients.forEach(result => {
                if (result.status === 'fulfilled') {
                    result.value.release();
                }
            });

            // Verify pool recovers
            const testQuery = await pool.query('SELECT 1 as test');
            expect(testQuery.rows[0].test).toBe(1);
        });
    });

    describe('Index Performance Tests', () => {
        it('should utilize database indexes effectively', async () => {
            // Test query that should use student_id index
            const startTime = Date.now();

            const query = `
                EXPLAIN ANALYZE
                SELECT * FROM attendance_logs 
                WHERE student_id = $1 
                ORDER BY date DESC
            `;

            const result = await pool.query(query, [testStudentIds[0]]);

            const endTime = Date.now();
            const duration = endTime - startTime;

            // Verify query plan uses index
            const queryPlan = result.rows.map(row => row['QUERY PLAN']).join('\n');
            expect(queryPlan).toContain('Index'); // Should use index scan
            expect(duration).toBeLessThan(100); // Should be very fast with index

            console.log(`Indexed query completed in ${duration}ms`);
        });

        it('should perform efficiently on date range queries', async () => {
            const startTime = Date.now();

            const startDate = new Date();
            startDate.setDate(startDate.getDate() - 7);
            const endDate = new Date();

            const query = `
                SELECT COUNT(*) as count
                FROM attendance_logs 
                WHERE date BETWEEN $1 AND $2
                AND section_id = $3
            `;

            const result = await pool.query(query, [
                startDate.toISOString().split('T')[0],
                endDate.toISOString().split('T')[0],
                testSectionId
            ]);

            const endTime = Date.now();
            const duration = endTime - startTime;

            expect(result.rows[0].count).toBeGreaterThan(0);
            expect(duration).toBeLessThan(500); // Should be fast with proper indexing

            console.log(`Date range query completed in ${duration}ms`);
        });
    });
});