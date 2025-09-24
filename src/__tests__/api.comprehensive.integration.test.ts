import request from 'supertest';
import { app } from '../index';
import { getPool } from '../database/connection';
import { Pool } from 'pg';

describe('API Integration Tests', () => {
    let pool: Pool;
    let authToken: string;
    let testFacultyId: string;
    let testSectionId: string;
    let testStudentId: string;

    beforeAll(async () => {
        pool = getPool();

        // Create test faculty
        const facultyResult = await pool.query(`
            INSERT INTO faculty (username, password_hash, name, email)
            VALUES ($1, $2, $3, $4)
            RETURNING id
        `, ['testfaculty', '$2b$10$test.hash', 'Test Faculty', 'test@example.com']);

        testFacultyId = facultyResult.rows[0].id;

        // Create test section
        const sectionResult = await pool.query(`
            INSERT INTO sections (name, grade, faculty_id)
            VALUES ($1, $2, $3)
            RETURNING id
        `, ['Test Section', '10', testFacultyId]);

        testSectionId = sectionResult.rows[0].id;

        // Create test student
        const studentResult = await pool.query(`
            INSERT INTO students (roll_number, name, section_id)
            VALUES ($1, $2, $3)
            RETURNING id
        `, ['ROLL001', 'Test Student', testSectionId]);

        testStudentId = studentResult.rows[0].id;

        // Get auth token
        const loginResponse = await request(app)
            .post('/api/auth/login')
            .send({
                username: 'testfaculty',
                password: 'testpassword'
            });

        authToken = loginResponse.body.tokens.accessToken;
    });

    afterAll(async () => {
        // Clean up test data
        await pool.query('DELETE FROM attendance_logs WHERE faculty_id = $1', [testFacultyId]);
        await pool.query('DELETE FROM students WHERE section_id = $1', [testSectionId]);
        await pool.query('DELETE FROM sections WHERE id = $1', [testSectionId]);
        await pool.query('DELETE FROM faculty WHERE id = $1', [testFacultyId]);
        await pool.end();
    });

    describe('Authentication Endpoints', () => {
        describe('POST /api/auth/login', () => {
            it('should authenticate valid credentials', async () => {
                const response = await request(app)
                    .post('/api/auth/login')
                    .send({
                        username: 'testfaculty',
                        password: 'testpassword'
                    });

                expect(response.status).toBe(200);
                expect(response.body.success).toBe(true);
                expect(response.body.user).toBeDefined();
                expect(response.body.tokens).toBeDefined();
                expect(response.body.tokens.accessToken).toBeDefined();
                expect(response.body.tokens.refreshToken).toBeDefined();
            });

            it('should reject invalid credentials', async () => {
                const response = await request(app)
                    .post('/api/auth/login')
                    .send({
                        username: 'testfaculty',
                        password: 'wrongpassword'
                    });

                expect(response.status).toBe(401);
                expect(response.body.success).toBe(false);
                expect(response.body.error).toBe('Invalid username or password');
            });

            it('should reject non-existent user', async () => {
                const response = await request(app)
                    .post('/api/auth/login')
                    .send({
                        username: 'nonexistent',
                        password: 'password'
                    });

                expect(response.status).toBe(401);
                expect(response.body.success).toBe(false);
            });

            it('should validate required fields', async () => {
                const response = await request(app)
                    .post('/api/auth/login')
                    .send({
                        username: 'testfaculty'
                        // Missing password
                    });

                expect(response.status).toBe(400);
                expect(response.body.error).toContain('Password is required');
            });
        });

        describe('POST /api/auth/refresh', () => {
            it('should refresh valid token', async () => {
                // First login to get refresh token
                const loginResponse = await request(app)
                    .post('/api/auth/login')
                    .send({
                        username: 'testfaculty',
                        password: 'testpassword'
                    });

                const refreshToken = loginResponse.body.tokens.refreshToken;

                const response = await request(app)
                    .post('/api/auth/refresh')
                    .send({
                        refreshToken
                    });

                expect(response.status).toBe(200);
                expect(response.body.success).toBe(true);
                expect(response.body.tokens.accessToken).toBeDefined();
            });

            it('should reject invalid refresh token', async () => {
                const response = await request(app)
                    .post('/api/auth/refresh')
                    .send({
                        refreshToken: 'invalid.token.here'
                    });

                expect(response.status).toBe(401);
                expect(response.body.success).toBe(false);
            });
        });
    });

    describe('Student Management Endpoints', () => {
        describe('GET /api/students/section/:sectionId', () => {
            it('should return students for valid section', async () => {
                const response = await request(app)
                    .get(`/api/students/section/${testSectionId}`)
                    .set('Authorization', `Bearer ${authToken}`);

                expect(response.status).toBe(200);
                expect(response.body.success).toBe(true);
                expect(response.body.students).toBeDefined();
                expect(Array.isArray(response.body.students)).toBe(true);
                expect(response.body.students.length).toBeGreaterThan(0);
                expect(response.body.students[0].roll_number).toBe('ROLL001');
            });

            it('should return empty array for section with no students', async () => {
                // Create empty section
                const emptySectionResult = await pool.query(`
                    INSERT INTO sections (name, grade, faculty_id)
                    VALUES ($1, $2, $3)
                    RETURNING id
                `, ['Empty Section', '11', testFacultyId]);

                const emptySectionId = emptySectionResult.rows[0].id;

                const response = await request(app)
                    .get(`/api/students/section/${emptySectionId}`)
                    .set('Authorization', `Bearer ${authToken}`);

                expect(response.status).toBe(200);
                expect(response.body.students).toHaveLength(0);

                // Clean up
                await pool.query('DELETE FROM sections WHERE id = $1', [emptySectionId]);
            });

            it('should require authentication', async () => {
                const response = await request(app)
                    .get(`/api/students/section/${testSectionId}`);

                expect(response.status).toBe(401);
            });

            it('should validate section ID format', async () => {
                const response = await request(app)
                    .get('/api/students/section/invalid-uuid')
                    .set('Authorization', `Bearer ${authToken}`);

                expect(response.status).toBe(400);
                expect(response.body.error).toContain('Invalid section ID');
            });
        });
    });

    describe('Section Management Endpoints', () => {
        describe('GET /api/faculty/:facultyId/sections', () => {
            it('should return sections for faculty', async () => {
                const response = await request(app)
                    .get(`/api/faculty/${testFacultyId}/sections`)
                    .set('Authorization', `Bearer ${authToken}`);

                expect(response.status).toBe(200);
                expect(response.body.success).toBe(true);
                expect(response.body.sections).toBeDefined();
                expect(Array.isArray(response.body.sections)).toBe(true);
                expect(response.body.sections.length).toBeGreaterThan(0);
                expect(response.body.sections[0].name).toBe('Test Section');
            });

            it('should require authentication', async () => {
                const response = await request(app)
                    .get(`/api/faculty/${testFacultyId}/sections`);

                expect(response.status).toBe(401);
            });

            it('should validate faculty ID format', async () => {
                const response = await request(app)
                    .get('/api/faculty/invalid-uuid/sections')
                    .set('Authorization', `Bearer ${authToken}`);

                expect(response.status).toBe(400);
                expect(response.body.error).toContain('Invalid faculty ID');
            });
        });
    });

    describe('Attendance Sync Endpoints', () => {
        describe('POST /api/attendance/sync', () => {
            it('should sync attendance records successfully', async () => {
                const attendanceRecords = [
                    {
                        studentId: testStudentId,
                        facultyId: testFacultyId,
                        sectionId: testSectionId,
                        timestamp: new Date().toISOString(),
                        status: 'present',
                        captureMethod: 'ml',
                        syncStatus: 'pending'
                    }
                ];

                const response = await request(app)
                    .post('/api/attendance/sync')
                    .set('Authorization', `Bearer ${authToken}`)
                    .send({ records: attendanceRecords });

                expect(response.status).toBe(200);
                expect(response.body.success).toBe(true);
                expect(response.body.syncedCount).toBe(1);
                expect(response.body.failedCount).toBe(0);
            });

            it('should handle invalid attendance records', async () => {
                const invalidRecords = [
                    {
                        studentId: '', // Invalid empty student ID
                        facultyId: testFacultyId,
                        sectionId: testSectionId,
                        timestamp: new Date().toISOString(),
                        status: 'present',
                        captureMethod: 'ml',
                        syncStatus: 'pending'
                    }
                ];

                const response = await request(app)
                    .post('/api/attendance/sync')
                    .set('Authorization', `Bearer ${authToken}`)
                    .send({ records: invalidRecords });

                expect(response.status).toBe(200);
                expect(response.body.success).toBe(false);
                expect(response.body.failedCount).toBe(1);
                expect(response.body.errors).toHaveLength(1);
            });

            it('should require authentication', async () => {
                const response = await request(app)
                    .post('/api/attendance/sync')
                    .send({ records: [] });

                expect(response.status).toBe(401);
            });

            it('should validate request body', async () => {
                const response = await request(app)
                    .post('/api/attendance/sync')
                    .set('Authorization', `Bearer ${authToken}`)
                    .send({}); // Missing records array

                expect(response.status).toBe(400);
                expect(response.body.error).toContain('Records array is required');
            });

            it('should handle large batch sync', async () => {
                const largeRecordSet = Array.from({ length: 100 }, (_, i) => ({
                    studentId: testStudentId,
                    facultyId: testFacultyId,
                    sectionId: testSectionId,
                    timestamp: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
                    status: i % 2 === 0 ? 'present' : 'absent',
                    captureMethod: 'ml',
                    syncStatus: 'pending'
                }));

                const response = await request(app)
                    .post('/api/attendance/sync')
                    .set('Authorization', `Bearer ${authToken}`)
                    .send({ records: largeRecordSet });

                expect(response.status).toBe(200);
                expect(response.body.syncedCount).toBeGreaterThan(0);
            }, 10000); // Increase timeout for large batch
        });

        describe('GET /api/attendance/student/:studentId', () => {
            beforeEach(async () => {
                // Insert test attendance record
                await pool.query(`
                    INSERT INTO attendance_logs (student_id, faculty_id, section_id, date, status, capture_method)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    ON CONFLICT (student_id, date) DO NOTHING
                `, [testStudentId, testFacultyId, testSectionId, new Date().toISOString().split('T')[0], 'present', 'ml']);
            });

            it('should return attendance history for student', async () => {
                const response = await request(app)
                    .get(`/api/attendance/student/${testStudentId}`)
                    .set('Authorization', `Bearer ${authToken}`);

                expect(response.status).toBe(200);
                expect(response.body.success).toBe(true);
                expect(response.body.attendance).toBeDefined();
                expect(Array.isArray(response.body.attendance)).toBe(true);
                expect(response.body.attendance.length).toBeGreaterThan(0);
            });

            it('should return empty array for student with no attendance', async () => {
                // Create student with no attendance
                const newStudentResult = await pool.query(`
                    INSERT INTO students (roll_number, name, section_id)
                    VALUES ($1, $2, $3)
                    RETURNING id
                `, ['ROLL999', 'No Attendance Student', testSectionId]);

                const newStudentId = newStudentResult.rows[0].id;

                const response = await request(app)
                    .get(`/api/attendance/student/${newStudentId}`)
                    .set('Authorization', `Bearer ${authToken}`);

                expect(response.status).toBe(200);
                expect(response.body.attendance).toHaveLength(0);

                // Clean up
                await pool.query('DELETE FROM students WHERE id = $1', [newStudentId]);
            });

            it('should require authentication', async () => {
                const response = await request(app)
                    .get(`/api/attendance/student/${testStudentId}`);

                expect(response.status).toBe(401);
            });

            it('should validate student ID format', async () => {
                const response = await request(app)
                    .get('/api/attendance/student/invalid-uuid')
                    .set('Authorization', `Bearer ${authToken}`);

                expect(response.status).toBe(400);
                expect(response.body.error).toContain('Invalid student ID');
            });
        });
    });

    describe('Error Handling', () => {
        it('should handle database connection errors gracefully', async () => {
            // Temporarily close the pool to simulate connection error
            await pool.end();

            const response = await request(app)
                .get(`/api/students/section/${testSectionId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(500);
            expect(response.body.error).toContain('Database connection failed');

            // Restore connection for cleanup
            pool = getPool();
        });

        it('should handle malformed JSON requests', async () => {
            const response = await request(app)
                .post('/api/attendance/sync')
                .set('Authorization', `Bearer ${authToken}`)
                .set('Content-Type', 'application/json')
                .send('{ invalid json }');

            expect(response.status).toBe(400);
            expect(response.body.error).toContain('Invalid JSON');
        });

        it('should handle missing authorization header', async () => {
            const response = await request(app)
                .get(`/api/students/section/${testSectionId}`);

            expect(response.status).toBe(401);
            expect(response.body.error).toContain('Authorization header required');
        });

        it('should handle malformed authorization header', async () => {
            const response = await request(app)
                .get(`/api/students/section/${testSectionId}`)
                .set('Authorization', 'InvalidFormat');

            expect(response.status).toBe(401);
            expect(response.body.error).toContain('Invalid authorization format');
        });
    });

    describe('Rate Limiting', () => {
        it('should enforce rate limits on login attempts', async () => {
            const promises = Array.from({ length: 10 }, () =>
                request(app)
                    .post('/api/auth/login')
                    .send({
                        username: 'testfaculty',
                        password: 'wrongpassword'
                    })
            );

            const responses = await Promise.all(promises);
            const rateLimitedResponses = responses.filter(r => r.status === 429);

            expect(rateLimitedResponses.length).toBeGreaterThan(0);
        });
    });

    describe('CORS and React Native Compatibility', () => {
        it('should include CORS headers for React Native', async () => {
            const response = await request(app)
                .options('/api/auth/login')
                .set('Origin', 'http://localhost:8081'); // Expo default

            expect(response.headers['access-control-allow-origin']).toBeDefined();
            expect(response.headers['access-control-allow-methods']).toContain('POST');
            expect(response.headers['access-control-allow-headers']).toContain('Authorization');
        });

        it('should handle React Native specific headers', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .set('User-Agent', 'Expo/1.0 CFNetwork/1240.0.4 Darwin/20.6.0')
                .send({
                    username: 'testfaculty',
                    password: 'testpassword'
                });

            expect(response.status).toBe(200);
            expect(response.headers['content-type']).toContain('application/json');
        });
    });
});