import request from 'supertest';
import { app } from '../index';
import { getPool } from '../database/connection';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';

describe('Security Tests', () => {
    let pool: Pool;
    let validToken: string;
    let testFacultyId: string;

    beforeAll(async () => {
        pool = getPool();

        // Create test faculty
        const facultyResult = await pool.query(`
            INSERT INTO faculty (username, password_hash, name, email)
            VALUES ($1, $2, $3, $4)
            RETURNING id
        `, ['securitytest', '$2b$10$test.hash', 'Security Test Faculty', 'security@example.com']);

        testFacultyId = facultyResult.rows[0].id;

        // Get valid token
        const loginResponse = await request(app)
            .post('/api/auth/login')
            .send({
                username: 'securitytest',
                password: 'testpassword'
            });

        validToken = loginResponse.body.tokens.accessToken;
    });

    afterAll(async () => {
        await pool.query('DELETE FROM faculty WHERE id = $1', [testFacultyId]);
        await pool.end();
    });

    describe('Authentication Security', () => {
        it('should reject requests without authorization header', async () => {
            const response = await request(app)
                .get('/api/faculty/test/sections');

            expect(response.status).toBe(401);
            expect(response.body.error).toContain('Authorization header required');
        });

        it('should reject malformed authorization headers', async () => {
            const malformedHeaders = [
                'InvalidFormat',
                'Bearer',
                'Bearer ',
                'Basic dGVzdDp0ZXN0', // Basic auth instead of Bearer
                'Bearer invalid.token.format'
            ];

            for (const header of malformedHeaders) {
                const response = await request(app)
                    .get('/api/faculty/test/sections')
                    .set('Authorization', header);

                expect(response.status).toBe(401);
            }
        });

        it('should reject expired tokens', async () => {
            // Create expired token
            const expiredToken = jwt.sign(
                { userId: testFacultyId, username: 'securitytest' },
                process.env.JWT_SECRET || 'test-secret',
                { expiresIn: '-1h' } // Expired 1 hour ago
            );

            const response = await request(app)
                .get('/api/faculty/test/sections')
                .set('Authorization', `Bearer ${expiredToken}`);

            expect(response.status).toBe(401);
            expect(response.body.error).toContain('Token expired');
        });

        it('should reject tokens with invalid signature', async () => {
            // Create token with wrong secret
            const invalidToken = jwt.sign(
                { userId: testFacultyId, username: 'securitytest' },
                'wrong-secret',
                { expiresIn: '1h' }
            );

            const response = await request(app)
                .get('/api/faculty/test/sections')
                .set('Authorization', `Bearer ${invalidToken}`);

            expect(response.status).toBe(401);
            expect(response.body.error).toContain('Invalid token');
        });

        it('should reject tokens with missing required claims', async () => {
            // Create token without userId
            const incompleteToken = jwt.sign(
                { username: 'securitytest' }, // Missing userId
                process.env.JWT_SECRET || 'test-secret',
                { expiresIn: '1h' }
            );

            const response = await request(app)
                .get('/api/faculty/test/sections')
                .set('Authorization', `Bearer ${incompleteToken}`);

            expect(response.status).toBe(401);
            expect(response.body.error).toContain('Invalid token claims');
        });
    });

    describe('SQL Injection Prevention', () => {
        it('should prevent SQL injection in login endpoint', async () => {
            const sqlInjectionAttempts = [
                "admin'; DROP TABLE faculty; --",
                "admin' OR '1'='1",
                "admin' UNION SELECT * FROM faculty --",
                "admin'; INSERT INTO faculty (username) VALUES ('hacker'); --"
            ];

            for (const maliciousUsername of sqlInjectionAttempts) {
                const response = await request(app)
                    .post('/api/auth/login')
                    .send({
                        username: maliciousUsername,
                        password: 'password'
                    });

                expect(response.status).toBe(401);
                expect(response.body.success).toBe(false);
            }

            // Verify faculty table is intact
            const facultyCount = await pool.query('SELECT COUNT(*) FROM faculty');
            expect(parseInt(facultyCount.rows[0].count)).toBeGreaterThan(0);
        });

        it('should prevent SQL injection in student queries', async () => {
            const maliciousSectionIds = [
                "test'; DROP TABLE students; --",
                "test' OR '1'='1",
                "test' UNION SELECT password_hash FROM faculty --"
            ];

            for (const maliciousSectionId of maliciousSectionIds) {
                const response = await request(app)
                    .get(`/api/students/section/${maliciousSectionId}`)
                    .set('Authorization', `Bearer ${validToken}`);

                // Should return 400 for invalid UUID format or 404 for not found
                expect([400, 404]).toContain(response.status);
            }

            // Verify students table is intact
            const studentsCount = await pool.query('SELECT COUNT(*) FROM students');
            expect(parseInt(studentsCount.rows[0].count)).toBeGreaterThanOrEqual(0);
        });

        it('should prevent SQL injection in attendance sync', async () => {
            const maliciousAttendanceRecord = {
                studentId: "test'; DROP TABLE attendance_logs; --",
                facultyId: testFacultyId,
                sectionId: "test'; DELETE FROM faculty; --",
                timestamp: new Date().toISOString(),
                status: 'present',
                captureMethod: 'ml',
                syncStatus: 'pending'
            };

            const response = await request(app)
                .post('/api/attendance/sync')
                .set('Authorization', `Bearer ${validToken}`)
                .send({ records: [maliciousAttendanceRecord] });

            // Should handle gracefully without executing malicious SQL
            expect(response.status).toBe(200);
            expect(response.body.failedCount).toBe(1);

            // Verify tables are intact
            const tablesExist = await pool.query(`
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name IN ('faculty', 'students', 'attendance_logs')
            `);
            expect(tablesExist.rows).toHaveLength(3);
        });
    });

    describe('Input Validation and Sanitization', () => {
        it('should validate and sanitize user input', async () => {
            const maliciousInputs = [
                '<script>alert("xss")</script>',
                '${process.env.SECRET}',
                '../../../etc/passwd',
                'javascript:alert("xss")',
                '<img src="x" onerror="alert(1)">'
            ];

            for (const maliciousInput of maliciousInputs) {
                const response = await request(app)
                    .post('/api/auth/login')
                    .send({
                        username: maliciousInput,
                        password: 'password'
                    });

                expect(response.status).toBe(401);

                // Response should not contain the malicious input
                const responseText = JSON.stringify(response.body);
                expect(responseText).not.toContain('<script>');
                expect(responseText).not.toContain('${process.env');
                expect(responseText).not.toContain('javascript:');
            }
        });

        it('should validate UUID formats strictly', async () => {
            const invalidUUIDs = [
                'not-a-uuid',
                '123',
                'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', // Invalid format
                '12345678-1234-1234-1234-123456789012', // Too long
                '12345678-1234-1234-1234-12345678901', // Too short
                '../admin',
                'null',
                'undefined'
            ];

            for (const invalidUUID of invalidUUIDs) {
                const response = await request(app)
                    .get(`/api/students/section/${invalidUUID}`)
                    .set('Authorization', `Bearer ${validToken}`);

                expect(response.status).toBe(400);
                expect(response.body.error).toContain('Invalid');
            }
        });

        it('should validate attendance record fields', async () => {
            const invalidRecords = [
                {
                    // Missing required fields
                    status: 'present'
                },
                {
                    studentId: 'valid-uuid',
                    facultyId: 'valid-uuid',
                    sectionId: 'valid-uuid',
                    timestamp: 'invalid-date',
                    status: 'present',
                    captureMethod: 'ml'
                },
                {
                    studentId: 'valid-uuid',
                    facultyId: 'valid-uuid',
                    sectionId: 'valid-uuid',
                    timestamp: new Date().toISOString(),
                    status: 'invalid-status', // Invalid status
                    captureMethod: 'ml'
                },
                {
                    studentId: 'valid-uuid',
                    facultyId: 'valid-uuid',
                    sectionId: 'valid-uuid',
                    timestamp: new Date().toISOString(),
                    status: 'present',
                    captureMethod: 'invalid-method' // Invalid capture method
                }
            ];

            for (const invalidRecord of invalidRecords) {
                const response = await request(app)
                    .post('/api/attendance/sync')
                    .set('Authorization', `Bearer ${validToken}`)
                    .send({ records: [invalidRecord] });

                expect(response.status).toBe(200);
                expect(response.body.failedCount).toBe(1);
                expect(response.body.errors).toHaveLength(1);
            }
        });
    });

    describe('Rate Limiting', () => {
        it('should enforce rate limits on login attempts', async () => {
            const promises = [];

            // Attempt 15 rapid login requests (should exceed rate limit)
            for (let i = 0; i < 15; i++) {
                promises.push(
                    request(app)
                        .post('/api/auth/login')
                        .send({
                            username: 'nonexistent',
                            password: 'wrongpassword'
                        })
                );
            }

            const responses = await Promise.all(promises);
            const rateLimitedResponses = responses.filter(r => r.status === 429);

            expect(rateLimitedResponses.length).toBeGreaterThan(0);
            expect(rateLimitedResponses[0].body.error).toContain('Too many requests');
        });

        it('should enforce rate limits on API endpoints', async () => {
            const promises = [];

            // Attempt many rapid API requests
            for (let i = 0; i < 100; i++) {
                promises.push(
                    request(app)
                        .get(`/api/faculty/${testFacultyId}/sections`)
                        .set('Authorization', `Bearer ${validToken}`)
                );
            }

            const responses = await Promise.all(promises);
            const rateLimitedResponses = responses.filter(r => r.status === 429);

            expect(rateLimitedResponses.length).toBeGreaterThan(0);
        });
    });

    describe('Data Exposure Prevention', () => {
        it('should not expose sensitive information in error messages', async () => {
            // Attempt to access non-existent resource
            const response = await request(app)
                .get('/api/students/section/00000000-0000-0000-0000-000000000000')
                .set('Authorization', `Bearer ${validToken}`);

            expect(response.status).toBe(404);

            // Error message should not expose database structure or internal details
            const errorMessage = response.body.error.toLowerCase();
            expect(errorMessage).not.toContain('table');
            expect(errorMessage).not.toContain('column');
            expect(errorMessage).not.toContain('database');
            expect(errorMessage).not.toContain('sql');
            expect(errorMessage).not.toContain('query');
        });

        it('should not expose password hashes', async () => {
            // Even with valid token, password hashes should never be returned
            const response = await request(app)
                .get(`/api/faculty/${testFacultyId}/profile`)
                .set('Authorization', `Bearer ${validToken}`);

            if (response.status === 200) {
                expect(response.body.password_hash).toBeUndefined();
                expect(response.body.passwordHash).toBeUndefined();
                expect(JSON.stringify(response.body)).not.toContain('$2b$');
            }
        });

        it('should not expose internal server information', async () => {
            const response = await request(app)
                .get('/api/nonexistent-endpoint')
                .set('Authorization', `Bearer ${validToken}`);

            expect(response.status).toBe(404);

            // Should not expose server technology stack
            expect(response.headers['x-powered-by']).toBeUndefined();
            expect(response.headers['server']).not.toContain('Express');
            expect(response.headers['server']).not.toContain('Node.js');
        });
    });

    describe('Authorization and Access Control', () => {
        it('should enforce proper authorization for faculty resources', async () => {
            // Create another faculty user
            const otherFacultyResult = await pool.query(`
                INSERT INTO faculty (username, password_hash, name, email)
                VALUES ($1, $2, $3, $4)
                RETURNING id
            `, ['otherfaculty', '$2b$10$test.hash', 'Other Faculty', 'other@example.com']);

            const otherFacultyId = otherFacultyResult.rows[0].id;

            // Try to access other faculty's sections with current token
            const response = await request(app)
                .get(`/api/faculty/${otherFacultyId}/sections`)
                .set('Authorization', `Bearer ${validToken}`);

            expect(response.status).toBe(403);
            expect(response.body.error).toContain('Access denied');

            // Clean up
            await pool.query('DELETE FROM faculty WHERE id = $1', [otherFacultyId]);
        });

        it('should validate resource ownership', async () => {
            // Create section for another faculty
            const otherFacultyResult = await pool.query(`
                INSERT INTO faculty (username, password_hash, name, email)
                VALUES ($1, $2, $3, $4)
                RETURNING id
            `, ['tempfaculty', '$2b$10$test.hash', 'Temp Faculty', 'temp@example.com']);

            const otherFacultyId = otherFacultyResult.rows[0].id;

            const sectionResult = await pool.query(`
                INSERT INTO sections (name, grade, faculty_id)
                VALUES ($1, $2, $3)
                RETURNING id
            `, ['Other Section', '11', otherFacultyId]);

            const otherSectionId = sectionResult.rows[0].id;

            // Try to access other faculty's section students
            const response = await request(app)
                .get(`/api/students/section/${otherSectionId}`)
                .set('Authorization', `Bearer ${validToken}`);

            expect(response.status).toBe(403);

            // Clean up
            await pool.query('DELETE FROM sections WHERE id = $1', [otherSectionId]);
            await pool.query('DELETE FROM faculty WHERE id = $1', [otherFacultyId]);
        });
    });

    describe('Session Security', () => {
        it('should invalidate tokens on logout', async () => {
            // Login to get fresh token
            const loginResponse = await request(app)
                .post('/api/auth/login')
                .send({
                    username: 'securitytest',
                    password: 'testpassword'
                });

            const freshToken = loginResponse.body.tokens.accessToken;

            // Use token successfully
            const beforeLogout = await request(app)
                .get(`/api/faculty/${testFacultyId}/sections`)
                .set('Authorization', `Bearer ${freshToken}`);

            expect(beforeLogout.status).toBe(200);

            // Logout
            await request(app)
                .post('/api/auth/logout')
                .set('Authorization', `Bearer ${freshToken}`);

            // Try to use token after logout (should fail)
            const afterLogout = await request(app)
                .get(`/api/faculty/${testFacultyId}/sections`)
                .set('Authorization', `Bearer ${freshToken}`);

            expect(afterLogout.status).toBe(401);
        });

        it('should handle concurrent sessions securely', async () => {
            // Create multiple sessions
            const loginPromises = Array.from({ length: 5 }, () =>
                request(app)
                    .post('/api/auth/login')
                    .send({
                        username: 'securitytest',
                        password: 'testpassword'
                    })
            );

            const loginResponses = await Promise.all(loginPromises);
            const tokens = loginResponses.map(r => r.body.tokens.accessToken);

            // All tokens should be valid
            const validationPromises = tokens.map(token =>
                request(app)
                    .get(`/api/faculty/${testFacultyId}/sections`)
                    .set('Authorization', `Bearer ${token}`)
            );

            const validationResponses = await Promise.all(validationPromises);
            expect(validationResponses.every(r => r.status === 200)).toBe(true);

            // Logout one session
            await request(app)
                .post('/api/auth/logout')
                .set('Authorization', `Bearer ${tokens[0]}`);

            // First token should be invalid, others should still work
            const afterLogoutValidation = await Promise.all([
                request(app)
                    .get(`/api/faculty/${testFacultyId}/sections`)
                    .set('Authorization', `Bearer ${tokens[0]}`),
                request(app)
                    .get(`/api/faculty/${testFacultyId}/sections`)
                    .set('Authorization', `Bearer ${tokens[1]}`)
            ]);

            expect(afterLogoutValidation[0].status).toBe(401);
            expect(afterLogoutValidation[1].status).toBe(200);
        });
    });

    describe('HTTPS and Transport Security', () => {
        it('should set security headers', async () => {
            const response = await request(app)
                .get('/api/health')
                .set('Authorization', `Bearer ${validToken}`);

            // Check for security headers
            expect(response.headers['x-content-type-options']).toBe('nosniff');
            expect(response.headers['x-frame-options']).toBe('DENY');
            expect(response.headers['x-xss-protection']).toBe('1; mode=block');
            expect(response.headers['strict-transport-security']).toBeDefined();
        });

        it('should not expose sensitive headers', async () => {
            const response = await request(app)
                .get('/api/health');

            // Should not expose internal information
            expect(response.headers['x-powered-by']).toBeUndefined();
            expect(response.headers['server']).not.toContain('Express');
        });
    });

    describe('File Upload Security', () => {
        it('should validate file types and sizes', async () => {
            // Test with various malicious file types
            const maliciousFiles = [
                { filename: 'malware.exe', content: 'MZ\x90\x00' }, // PE header
                { filename: 'script.js', content: 'alert("xss")' },
                { filename: 'large.txt', content: 'A'.repeat(10 * 1024 * 1024) }, // 10MB
                { filename: '../../../etc/passwd', content: 'root:x:0:0:root:/root:/bin/bash' }
            ];

            for (const file of maliciousFiles) {
                const response = await request(app)
                    .post('/api/upload/face-data')
                    .set('Authorization', `Bearer ${validToken}`)
                    .attach('file', Buffer.from(file.content), file.filename);

                expect([400, 413, 415]).toContain(response.status); // Bad request, too large, or unsupported type
            }
        });
    });
});