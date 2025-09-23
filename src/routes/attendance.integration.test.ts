import request from 'supertest';
import app from '../index';
import { query } from '../database/utils';
import { hashPassword, generateTokenPair } from '../utils/auth';
import { v4 as uuidv4 } from 'uuid';

describe('Attendance Routes Integration Tests', () => {
    let authToken: string;
    let facultyId: string;
    let studentId: string;
    let sectionId: string;

    beforeAll(async () => {
        // Create test faculty
        const hashedPassword = await hashPassword('testpassword');
        facultyId = uuidv4();

        await query(
            `INSERT INTO faculty (id, username, password_hash, name, email)
             VALUES ($1, $2, $3, $4, $5)`,
            [facultyId, 'testfaculty', hashedPassword, 'Test Faculty', 'test@example.com']
        );

        // Create test section
        sectionId = uuidv4();
        await query(
            `INSERT INTO sections (id, name, grade, faculty_id)
             VALUES ($1, $2, $3, $4)`,
            [sectionId, 'Test Section', '10', facultyId]
        );

        // Create test student
        studentId = uuidv4();
        await query(
            `INSERT INTO students (id, roll_number, name, section_id)
             VALUES ($1, $2, $3, $4)`,
            [studentId, 'ST001', 'Test Student', sectionId]
        );

        // Generate auth token
        const tokens = generateTokenPair(facultyId, 'testfaculty');
        authToken = `Bearer ${tokens.accessToken}`;
    });

    afterAll(async () => {
        // Clean up test data
        await query('DELETE FROM attendance_logs WHERE faculty_id = $1', [facultyId]);
        await query('DELETE FROM students WHERE id = $1', [studentId]);
        await query('DELETE FROM sections WHERE id = $1', [sectionId]);
        await query('DELETE FROM faculty WHERE id = $1', [facultyId]);
    });

    describe('POST /api/attendance/sync', () => {
        afterEach(async () => {
            // Clean up attendance records after each test
            await query('DELETE FROM attendance_logs WHERE faculty_id = $1', [facultyId]);
        });

        it('should sync attendance records successfully', async () => {
            const attendanceRecords = [
                {
                    id: 1,
                    studentId,
                    facultyId,
                    sectionId,
                    timestamp: new Date().toISOString(),
                    status: 'present' as const,
                    captureMethod: 'ml' as const
                }
            ];

            const response = await request(app)
                .post('/api/attendance/sync')
                .set('Authorization', authToken)
                .send({ records: attendanceRecords });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.result.totalRecords).toBe(1);
            expect(response.body.result.syncedRecords).toBe(1);
            expect(response.body.result.failedRecords).toBe(0);

            // Verify record was inserted
            const dbResult = await query(
                'SELECT * FROM attendance_logs WHERE student_id = $1 AND faculty_id = $2',
                [studentId, facultyId]
            );
            expect(dbResult.rows).toHaveLength(1);
            expect(dbResult.rows[0].status).toBe('present');
            expect(dbResult.rows[0].capture_method).toBe('ml');
        });

        it('should handle duplicate records with conflict resolution', async () => {
            const today = new Date().toISOString();

            // First sync
            const firstRecord = {
                id: 1,
                studentId,
                facultyId,
                sectionId,
                timestamp: today,
                status: 'absent' as const,
                captureMethod: 'manual' as const
            };

            await request(app)
                .post('/api/attendance/sync')
                .set('Authorization', authToken)
                .send({ records: [firstRecord] });

            // Second sync with updated status
            const updatedRecord = {
                id: 2,
                studentId,
                facultyId,
                sectionId,
                timestamp: today,
                status: 'present' as const,
                captureMethod: 'ml' as const
            };

            const response = await request(app)
                .post('/api/attendance/sync')
                .set('Authorization', authToken)
                .send({ records: [updatedRecord] });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.result.syncedRecords).toBe(1);

            // Verify record was updated, not duplicated
            const dbResult = await query(
                'SELECT * FROM attendance_logs WHERE student_id = $1 AND date = $2',
                [studentId, new Date(today).toDateString()]
            );
            expect(dbResult.rows).toHaveLength(1);
            expect(dbResult.rows[0].status).toBe('present'); // Updated status
            expect(dbResult.rows[0].capture_method).toBe('ml'); // Updated method
        });

        it('should handle mixed valid and invalid records', async () => {
            const mixedRecords = [
                {
                    id: 1,
                    studentId,
                    facultyId,
                    sectionId,
                    timestamp: new Date().toISOString(),
                    status: 'present' as const,
                    captureMethod: 'ml' as const
                },
                {
                    id: 2,
                    studentId: '', // Invalid
                    facultyId,
                    sectionId,
                    timestamp: new Date().toISOString(),
                    status: 'present' as const,
                    captureMethod: 'ml' as const
                },
                {
                    id: 3,
                    studentId: 'non-existent-student',
                    facultyId,
                    sectionId,
                    timestamp: new Date().toISOString(),
                    status: 'absent' as const,
                    captureMethod: 'manual' as const
                }
            ];

            const response = await request(app)
                .post('/api/attendance/sync')
                .set('Authorization', authToken)
                .send({ records: mixedRecords });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.result.totalRecords).toBe(3);
            expect(response.body.result.syncedRecords).toBe(1); // Only first record (valid student)
            expect(response.body.result.failedRecords).toBe(2); // Second record (invalid studentId) and third record (non-existent student)

            // Verify only valid records were inserted
            const dbResult = await query(
                'SELECT * FROM attendance_logs WHERE faculty_id = $1',
                [facultyId]
            );
            expect(dbResult.rows).toHaveLength(1);
        });
    });

    describe('GET /api/attendance/student/:studentId', () => {
        beforeEach(async () => {
            // Insert test attendance records
            const today = new Date();
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);

            await query(
                `INSERT INTO attendance_logs (id, student_id, faculty_id, section_id, date, status, capture_method)
                 VALUES ($1, $2, $3, $4, $5, $6, $7), ($8, $9, $10, $11, $12, $13, $14)`,
                [
                    uuidv4(), studentId, facultyId, sectionId, today.toDateString(), 'present', 'ml',
                    uuidv4(), studentId, facultyId, sectionId, yesterday.toDateString(), 'absent', 'manual'
                ]
            );
        });

        afterEach(async () => {
            // Clean up attendance records
            await query('DELETE FROM attendance_logs WHERE faculty_id = $1', [facultyId]);
        });

        it('should return attendance history for valid student', async () => {
            const response = await request(app)
                .get(`/api/attendance/student/${studentId}`)
                .set('Authorization', authToken);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveLength(2);
            expect(response.body.data[0].student_name).toBe('Test Student');
            expect(response.body.data[0].roll_number).toBe('ST001');
            expect(response.body.data[0].faculty_name).toBe('Test Faculty');
            expect(response.body.data[0].section_name).toBe('Test Section');
            expect(response.body.pagination.total).toBe(2);
        });

        it('should handle date range filtering', async () => {
            const today = new Date();
            const todayStr = today.toISOString().split('T')[0];

            const response = await request(app)
                .get(`/api/attendance/student/${studentId}`)
                .query({
                    startDate: todayStr,
                    endDate: todayStr
                })
                .set('Authorization', authToken);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveLength(1);
            expect(response.body.data[0].status).toBe('present');
        });

        it('should handle pagination', async () => {
            const response = await request(app)
                .get(`/api/attendance/student/${studentId}`)
                .query({
                    limit: '1',
                    offset: '0'
                })
                .set('Authorization', authToken);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveLength(1);
            expect(response.body.pagination.total).toBe(2);
            expect(response.body.pagination.hasMore).toBe(true);
        });

        it('should return 404 for non-existent student', async () => {
            const nonExistentStudentId = uuidv4();

            const response = await request(app)
                .get(`/api/attendance/student/${nonExistentStudentId}`)
                .set('Authorization', authToken);

            expect(response.status).toBe(404);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toBe('Student not found or inactive');
        });

        it('should return empty array for student with no attendance records', async () => {
            // Create another student with no attendance
            const anotherStudentId = uuidv4();
            await query(
                `INSERT INTO students (id, roll_number, name, section_id)
                 VALUES ($1, $2, $3, $4)`,
                [anotherStudentId, 'ST002', 'Another Student', sectionId]
            );

            const response = await request(app)
                .get(`/api/attendance/student/${anotherStudentId}`)
                .set('Authorization', authToken);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveLength(0);
            expect(response.body.pagination.total).toBe(0);

            // Clean up
            await query('DELETE FROM students WHERE id = $1', [anotherStudentId]);
        });
    });

    describe('Authentication', () => {
        it('should reject requests without authentication token', async () => {
            const response = await request(app)
                .post('/api/attendance/sync')
                .send({ records: [] });

            expect(response.status).toBe(401);
            expect(response.body.success).toBe(false);
        });

        it('should reject requests with invalid authentication token', async () => {
            const response = await request(app)
                .post('/api/attendance/sync')
                .set('Authorization', 'Bearer invalid-token')
                .send({ records: [] });

            expect(response.status).toBe(401);
            expect(response.body.success).toBe(false);
        });
    });
});