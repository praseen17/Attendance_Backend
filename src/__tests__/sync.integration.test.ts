import request from 'supertest';
import { app } from '../index';
import { getPool } from '../database/connection';
import { generateAccessToken } from '../utils/auth';

describe('Sync Integration Tests', () => {
    let pool: any;
    let authToken: string;
    const testFacultyId = 'sync-test-faculty';
    const testSectionId = 'sync-test-section';
    const testStudentId = 'sync-test-student';

    beforeAll(async () => {
        pool = getPool();
        authToken = generateAccessToken(testFacultyId, 'synctest');
    });

    afterAll(async () => {
        if (pool) {
            await pool.end();
        }
    });

    beforeEach(async () => {
        // Setup test data
        await pool.query(`
            INSERT INTO faculty (id, username, password_hash, name, email)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (id) DO NOTHING
        `, [testFacultyId, 'synctest', 'hash', 'Sync Test Faculty', 'sync@test.com']);

        await pool.query(`
            INSERT INTO sections (id, name, grade, faculty_id)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (id) DO NOTHING
        `, [testSectionId, 'Sync Test Section', '10', testFacultyId]);

        await pool.query(`
            INSERT INTO students (id, roll_number, name, section_id)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (id) DO NOTHING
        `, [testStudentId, 'SYNC001', 'Sync Test Student', testSectionId]);
    });

    afterEach(async () => {
        // Clean up test data
        await pool.query('DELETE FROM attendance_logs WHERE faculty_id = $1', [testFacultyId]);
    });

    describe('POST /api/attendance/sync', () => {
        it('should sync single attendance record successfully', async () => {
            const attendanceRecord = {
                studentId: testStudentId,
                facultyId: testFacultyId,
                sectionId: testSectionId,
                date: new Date().toISOString().split('T')[0],
                status: 'present',
                captureMethod: 'ml'
            };

            const response = await request(app)
                .post('/api/attendance/sync')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ records: [attendanceRecord] });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.syncedCount).toBe(1);
            expect(response.body.data.failedCount).toBe(0);

            // Verify record was inserted
            const result = await pool.query(
                'SELECT * FROM attendance_logs WHERE student_id = $1 AND faculty_id = $2',
                [testStudentId, testFacultyId]
            );
            expect(result.rows).toHaveLength(1);
            expect(result.rows[0].status).toBe('present');
        });

        it('should sync multiple attendance records in batch', async () => {
            const today = new Date().toISOString().split('T')[0];
            const attendanceRecords = [
                {
                    studentId: testStudentId,
                    facultyId: testFacultyId,
                    sectionId: testSectionId,
                    date: today,
                    status: 'present',
                    captureMethod: 'ml'
                },
                {
                    studentId: testStudentId,
                    facultyId: testFacultyId,
                    sectionId: testSectionId,
                    date: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0], // yesterday
                    status: 'absent',
                    captureMethod: 'manual'
                }
            ];

            const response = await request(app)
                .post('/api/attendance/sync')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ records: attendanceRecords });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.syncedCount).toBe(2);
            expect(response.body.data.failedCount).toBe(0);

            // Verify records were inserted
            const result = await pool.query(
                'SELECT * FROM attendance_logs WHERE student_id = $1 AND faculty_id = $2 ORDER BY date DESC',
                [testStudentId, testFacultyId]
            );
            expect(result.rows).toHaveLength(2);
            expect(result.rows[0].status).toBe('present');
            expect(result.rows[1].status).toBe('absent');
        });

        it('should handle duplicate records with conflict resolution', async () => {
            const today = new Date().toISOString().split('T')[0];
            const attendanceRecord = {
                studentId: testStudentId,
                facultyId: testFacultyId,
                sectionId: testSectionId,
                date: today,
                status: 'present',
                captureMethod: 'ml'
            };

            // First sync
            await request(app)
                .post('/api/attendance/sync')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ records: [attendanceRecord] });

            // Second sync with same record (should handle conflict)
            const duplicateRecord = {
                ...attendanceRecord,
                status: 'absent', // Different status
                captureMethod: 'manual'
            };

            const response = await request(app)
                .post('/api/attendance/sync')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ records: [duplicateRecord] });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);

            // Verify conflict resolution (should keep the latest record)
            const result = await pool.query(
                'SELECT * FROM attendance_logs WHERE student_id = $1 AND faculty_id = $2 AND date = $3',
                [testStudentId, testFacultyId, today]
            );
            expect(result.rows).toHaveLength(1);
            expect(result.rows[0].status).toBe('absent'); // Should be updated
            expect(result.rows[0].capture_method).toBe('manual');
        });

        it('should handle partial sync failures gracefully', async () => {
            const today = new Date().toISOString().split('T')[0];
            const attendanceRecords = [
                {
                    studentId: testStudentId,
                    facultyId: testFacultyId,
                    sectionId: testSectionId,
                    date: today,
                    status: 'present',
                    captureMethod: 'ml'
                },
                {
                    studentId: 'non-existent-student', // This should fail
                    facultyId: testFacultyId,
                    sectionId: testSectionId,
                    date: today,
                    status: 'present',
                    captureMethod: 'ml'
                }
            ];

            const response = await request(app)
                .post('/api/attendance/sync')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ records: attendanceRecords });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.syncedCount).toBe(1);
            expect(response.body.data.failedCount).toBe(1);
            expect(response.body.data.errors).toHaveLength(1);

            // Verify only valid record was inserted
            const result = await pool.query(
                'SELECT * FROM attendance_logs WHERE faculty_id = $1',
                [testFacultyId]
            );
            expect(result.rows).toHaveLength(1);
            expect(result.rows[0].student_id).toBe(testStudentId);
        });

        it('should validate attendance record data', async () => {
            const invalidRecord = {
                studentId: testStudentId,
                facultyId: testFacultyId,
                sectionId: testSectionId,
                date: 'invalid-date',
                status: 'invalid-status',
                captureMethod: 'invalid-method'
            };

            const response = await request(app)
                .post('/api/attendance/sync')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ records: [invalidRecord] });

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.code).toBe('VALIDATION_ERROR');
        });

        it('should require authentication for sync endpoint', async () => {
            const attendanceRecord = {
                studentId: testStudentId,
                facultyId: testFacultyId,
                sectionId: testSectionId,
                date: new Date().toISOString().split('T')[0],
                status: 'present',
                captureMethod: 'ml'
            };

            const response = await request(app)
                .post('/api/attendance/sync')
                .send({ records: [attendanceRecord] });

            expect(response.status).toBe(401);
            expect(response.body.success).toBe(false);
            expect(response.body.code).toBe('UNAUTHORIZED');
        });
    });

    describe('GET /api/attendance/student/:studentId', () => {
        beforeEach(async () => {
            // Insert test attendance data
            const dates = [];
            const today = new Date();
            for (let i = 0; i < 7; i++) {
                const date = new Date(today);
                date.setDate(date.getDate() - i);
                dates.push(date.toISOString().split('T')[0]);
            }

            for (const date of dates) {
                await pool.query(`
                    INSERT INTO attendance_logs (id, student_id, faculty_id, section_id, date, status, capture_method)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                `, [`test-attendance-${date}`, testStudentId, testFacultyId, testSectionId, date, 'present', 'ml']);
            }
        });

        it('should retrieve student attendance history', async () => {
            const response = await request(app)
                .get(`/api/attendance/student/${testStudentId}`)
                .set('Authorization', `Bearer ${authToken}`)
                .query({ days: 7 });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.attendance).toHaveLength(7);
            expect(response.body.data.student.id).toBe(testStudentId);
        });

        it('should filter attendance by date range', async () => {
            const response = await request(app)
                .get(`/api/attendance/student/${testStudentId}`)
                .set('Authorization', `Bearer ${authToken}`)
                .query({ days: 3 });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.attendance).toHaveLength(3);
        });

        it('should return 404 for non-existent student', async () => {
            const response = await request(app)
                .get('/api/attendance/student/non-existent')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(404);
            expect(response.body.success).toBe(false);
            expect(response.body.code).toBe('STUDENT_NOT_FOUND');
        });
    });
});