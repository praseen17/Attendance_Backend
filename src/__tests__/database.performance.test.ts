import { getPool } from '../database/connection';
import { AttendanceService } from '../services/attendanceService';
import { StudentService } from '../services/studentService';
import { SectionService } from '../services/sectionService';

describe('Database Performance Tests', () => {
    let pool: any;
    let attendanceService: AttendanceService;
    let studentService: StudentService;
    let sectionService: SectionService;

    beforeAll(async () => {
        pool = getPool();
        attendanceService = new AttendanceService();
        studentService = new StudentService();
        sectionService = new SectionService();
    });

    afterAll(async () => {
        if (pool) {
            await pool.end();
        }
    });

    describe('Large Dataset Sync Performance', () => {
        const LARGE_DATASET_SIZE = 1000;
        const PERFORMANCE_THRESHOLD_MS = 5000; // 5 seconds

        beforeEach(async () => {
            // Clean up test data
            await pool.query('DELETE FROM attendance_logs WHERE faculty_id = $1', ['perf-test-faculty']);
            await pool.query('DELETE FROM students WHERE section_id = $1', ['perf-test-section']);
            await pool.query('DELETE FROM sections WHERE id = $1', ['perf-test-section']);
            await pool.query('DELETE FROM faculty WHERE id = $1', ['perf-test-faculty']);
        });

        afterEach(async () => {
            // Clean up test data
            await pool.query('DELETE FROM attendance_logs WHERE faculty_id = $1', ['perf-test-faculty']);
            await pool.query('DELETE FROM students WHERE section_id = $1', ['perf-test-section']);
            await pool.query('DELETE FROM sections WHERE id = $1', ['perf-test-section']);
            await pool.query('DELETE FROM faculty WHERE id = $1', ['perf-test-faculty']);
        });

        it('should handle bulk attendance sync within performance threshold', async () => {
            // Setup test data
            await pool.query(`
                INSERT INTO faculty (id, username, password_hash, name, email)
                VALUES ($1, $2, $3, $4, $5)
            `, ['perf-test-faculty', 'perftest', 'hash', 'Performance Test Faculty', 'perf@test.com']);

            await pool.query(`
                INSERT INTO sections (id, name, grade, faculty_id)
                VALUES ($1, $2, $3, $4)
            `, ['perf-test-section', 'Performance Test Section', '10', 'perf-test-faculty']);

            // Create large number of students
            const studentInserts = [];
            for (let i = 0; i < LARGE_DATASET_SIZE; i++) {
                studentInserts.push([
                    `perf-student-${i}`,
                    `ROLL${i.toString().padStart(4, '0')}`,
                    `Student ${i}`,
                    'perf-test-section'
                ]);
            }

            const studentQuery = `
                INSERT INTO students (id, roll_number, name, section_id)
                VALUES ${studentInserts.map((_, i) => `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4})`).join(', ')}
            `;
            await pool.query(studentQuery, studentInserts.flat());

            // Create large attendance dataset
            const attendanceRecords = [];
            const today = new Date().toISOString().split('T')[0];

            for (let i = 0; i < LARGE_DATASET_SIZE; i++) {
                attendanceRecords.push({
                    studentId: `perf-student-${i}`,
                    facultyId: 'perf-test-faculty',
                    sectionId: 'perf-test-section',
                    date: today,
                    status: i % 10 === 0 ? 'absent' : 'present', // 10% absent
                    captureMethod: i % 5 === 0 ? 'manual' : 'ml' // 20% manual
                });
            }

            // Measure sync performance
            const startTime = Date.now();

            const result = await attendanceService.syncAttendanceRecords(attendanceRecords);

            const endTime = Date.now();
            const duration = endTime - startTime;

            console.log(`Bulk sync of ${LARGE_DATASET_SIZE} records took ${duration}ms`);

            expect(duration).toBeLessThan(PERFORMANCE_THRESHOLD_MS);
            expect(result.success).toBe(true);
            expect(result.syncedCount).toBe(LARGE_DATASET_SIZE);
        });

        it('should handle concurrent sync operations efficiently', async () => {
            // Setup test data
            await pool.query(`
                INSERT INTO faculty (id, username, password_hash, name, email)
                VALUES ($1, $2, $3, $4, $5)
            `, ['perf-test-faculty', 'perftest', 'hash', 'Performance Test Faculty', 'perf@test.com']);

            await pool.query(`
                INSERT INTO sections (id, name, grade, faculty_id)
                VALUES ($1, $2, $3, $4)
            `, ['perf-test-section', 'Performance Test Section', '10', 'perf-test-faculty']);

            // Create students
            const studentCount = 100;
            const studentInserts = [];
            for (let i = 0; i < studentCount; i++) {
                studentInserts.push([
                    `perf-student-${i}`,
                    `ROLL${i.toString().padStart(4, '0')}`,
                    `Student ${i}`,
                    'perf-test-section'
                ]);
            }

            const studentQuery = `
                INSERT INTO students (id, roll_number, name, section_id)
                VALUES ${studentInserts.map((_, i) => `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4})`).join(', ')}
            `;
            await pool.query(studentQuery, studentInserts.flat());

            // Create multiple concurrent sync operations
            const concurrentOperations = 5;
            const recordsPerOperation = 50;
            const today = new Date().toISOString().split('T')[0];

            const syncPromises = [];

            for (let op = 0; op < concurrentOperations; op++) {
                const attendanceRecords = [];

                for (let i = 0; i < recordsPerOperation; i++) {
                    const studentIndex = (op * recordsPerOperation + i) % studentCount;
                    attendanceRecords.push({
                        studentId: `perf-student-${studentIndex}`,
                        facultyId: 'perf-test-faculty',
                        sectionId: 'perf-test-section',
                        date: today,
                        status: 'present',
                        captureMethod: 'ml'
                    });
                }

                syncPromises.push(attendanceService.syncAttendanceRecords(attendanceRecords));
            }

            const startTime = Date.now();
            const results = await Promise.all(syncPromises);
            const endTime = Date.now();
            const duration = endTime - startTime;

            console.log(`Concurrent sync of ${concurrentOperations} operations took ${duration}ms`);

            expect(duration).toBeLessThan(PERFORMANCE_THRESHOLD_MS);
            results.forEach(result => {
                expect(result.success).toBe(true);
            });
        });

        it('should efficiently query large attendance datasets', async () => {
            // Setup test data with historical attendance
            await pool.query(`
                INSERT INTO faculty (id, username, password_hash, name, email)
                VALUES ($1, $2, $3, $4, $5)
            `, ['perf-test-faculty', 'perftest', 'hash', 'Performance Test Faculty', 'perf@test.com']);

            await pool.query(`
                INSERT INTO sections (id, name, grade, faculty_id)
                VALUES ($1, $2, $3, $4)
            `, ['perf-test-section', 'Performance Test Section', '10', 'perf-test-faculty']);

            await pool.query(`
                INSERT INTO students (id, roll_number, name, section_id)
                VALUES ($1, $2, $3, $4)
            `, ['perf-test-student', 'ROLL0001', 'Performance Test Student', 'perf-test-section']);

            // Create large historical attendance data (30 days)
            const attendanceInserts = [];
            const baseDate = new Date();

            for (let day = 0; day < 30; day++) {
                const date = new Date(baseDate);
                date.setDate(date.getDate() - day);
                const dateStr = date.toISOString().split('T')[0];

                attendanceInserts.push([
                    `perf-attendance-${day}`,
                    'perf-test-student',
                    'perf-test-faculty',
                    'perf-test-section',
                    dateStr,
                    day % 7 === 0 ? 'absent' : 'present', // Absent on "Sundays"
                    'ml'
                ]);
            }

            const attendanceQuery = `
                INSERT INTO attendance_logs (id, student_id, faculty_id, section_id, date, status, capture_method)
                VALUES ${attendanceInserts.map((_, i) => `($${i * 7 + 1}, $${i * 7 + 2}, $${i * 7 + 3}, $${i * 7 + 4}, $${i * 7 + 5}, $${i * 7 + 6}, $${i * 7 + 7})`).join(', ')}
            `;
            await pool.query(attendanceQuery, attendanceInserts.flat());

            // Test query performance
            const startTime = Date.now();

            const attendanceHistory = await attendanceService.getStudentAttendanceHistory(
                'perf-test-student',
                30 // last 30 days
            );

            const endTime = Date.now();
            const duration = endTime - startTime;

            console.log(`Query of 30 days attendance history took ${duration}ms`);

            expect(duration).toBeLessThan(1000); // Should be under 1 second
            expect(attendanceHistory.length).toBe(30);
        });
    });

    describe('Database Connection Pool Performance', () => {
        it('should handle multiple concurrent database connections', async () => {
            const concurrentQueries = 20;
            const startTime = Date.now();

            const queryPromises = Array.from({ length: concurrentQueries }, (_, i) =>
                pool.query('SELECT $1 as test_value', [i])
            );

            const results = await Promise.all(queryPromises);
            const endTime = Date.now();
            const duration = endTime - startTime;

            console.log(`${concurrentQueries} concurrent queries took ${duration}ms`);

            expect(duration).toBeLessThan(2000); // Should complete within 2 seconds
            expect(results).toHaveLength(concurrentQueries);
            results.forEach((result, i) => {
                expect(result.rows[0].test_value).toBe(i);
            });
        });
    });
});