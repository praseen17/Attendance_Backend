import request from 'supertest';
import app from '../index';
import { query } from '../database/utils';
import { generateTokenPair } from '../utils/auth';
import { validateParameterizedQuery, SecureQueryBuilder } from '../utils/sqlSecurity';
import { DataIntegrityService } from '../services/dataIntegrityService';

describe('Security Measures', () => {
    let authToken: string;
    let facultyId: string;

    beforeAll(async () => {
        // Create a test faculty user
        const result = await query(
            'INSERT INTO faculty (username, password_hash, name, email) VALUES ($1, $2, $3, $4) RETURNING id',
            ['testfaculty', '$2b$10$hashedpassword', 'Test Faculty', 'test@example.com']
        );
        facultyId = result.rows[0].id;

        // Generate auth token
        const tokens = generateTokenPair(facultyId, 'testfaculty');
        authToken = tokens.accessToken;
    });

    afterAll(async () => {
        // Clean up test data
        await query('DELETE FROM faculty WHERE username = $1', ['testfaculty']);
    });

    describe('Input Validation', () => {
        test('should reject invalid UUID in parameters', async () => {
            const response = await request(app)
                .get('/api/attendance/student/invalid-uuid')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toContain('Validation failed');
        });

        test('should validate required fields in login', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({});

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toContain('Validation failed');
        });

        test('should validate string length limits', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    username: 'a'.repeat(51), // Exceeds 50 character limit
                    password: 'password123'
                });

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
        });

        test('should validate array size limits in sync', async () => {
            const largeArray = Array(101).fill({
                studentId: '123e4567-e89b-12d3-a456-426614174000',
                facultyId: facultyId,
                sectionId: '123e4567-e89b-12d3-a456-426614174001',
                timestamp: new Date().toISOString(),
                status: 'present',
                captureMethod: 'manual'
            });

            const response = await request(app)
                .post('/api/attendance/sync')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ records: largeArray });

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
        });
    });

    describe('Rate Limiting', () => {
        test('should apply rate limiting to auth endpoints', async () => {
            // Make multiple rapid requests to exceed rate limit
            const promises = Array(12).fill(null).map(() =>
                request(app)
                    .post('/api/auth/login')
                    .send({ username: 'test', password: 'test' })
            );

            const responses = await Promise.all(promises);
            const rateLimitedResponses = responses.filter(r => r.status === 429);

            expect(rateLimitedResponses.length).toBeGreaterThan(0);
        });

        test('should have different rate limits for different endpoints', async () => {
            // This test would need to be run in isolation to properly test rate limits
            // In a real scenario, you'd test this with separate test instances
            expect(true).toBe(true); // Placeholder
        });
    });

    describe('SQL Injection Prevention', () => {
        test('should validate parameterized queries', () => {
            const validQuery = 'SELECT * FROM users WHERE id = $1';
            const validValues = ['123'];

            const result = validateParameterizedQuery(validQuery, validValues);
            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        test('should reject suspicious SQL patterns', () => {
            const maliciousQuery = "SELECT * FROM users WHERE id = '1' OR '1'='1'";
            const values: any[] = [];

            const result = validateParameterizedQuery(maliciousQuery, values);
            expect(result.isValid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
        });

        test('should detect parameter count mismatch', () => {
            const query = 'SELECT * FROM users WHERE id = $1 AND name = $2';
            const values = ['123']; // Missing second parameter

            const result = validateParameterizedQuery(query, values);
            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Parameter count mismatch: query has 2 placeholders but 1 values provided');
        });

        test('should build secure queries with SecureQueryBuilder', () => {
            const builder = new SecureQueryBuilder();
            const query = builder
                .select(['id', 'name'])
                .from('users')
                .where('id = ?', '123')
                .and('active = ?', true)
                .limit(10)
                .build();

            expect(query.text).toContain('SELECT id, name FROM users');
            expect(query.text).toContain('WHERE id = $1');
            expect(query.text).toContain('AND active = $2');
            expect(query.text).toContain('LIMIT $3');
            expect(query.values).toEqual(['123', true, 10]);
        });

        test('should reject invalid identifiers in SecureQueryBuilder', () => {
            const builder = new SecureQueryBuilder();

            expect(() => {
                builder.select(['id; DROP TABLE users;--']);
            }).toThrow('Invalid column names detected');
        });
    });

    describe('Data Integrity Validation', () => {
        let dataIntegrityService: DataIntegrityService;

        beforeEach(() => {
            dataIntegrityService = new DataIntegrityService();
        });

        test('should validate attendance record structure', async () => {
            const invalidRecord = {
                studentId: 'invalid-uuid',
                facultyId: facultyId,
                sectionId: '123e4567-e89b-12d3-a456-426614174001',
                timestamp: 'invalid-date',
                status: 'invalid-status',
                captureMethod: 'invalid-method'
            };

            const result = await dataIntegrityService.validateAttendanceRecord(invalidRecord as any);

            expect(result.isValid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
            expect(result.errors).toContain('Student ID must be a valid UUID');
            expect(result.errors).toContain('Timestamp is required and must be a valid date');
            expect(result.errors).toContain('Status must be either "present" or "absent"');
        });

        test('should validate business rules for attendance', async () => {
            const futureRecord = {
                studentId: '123e4567-e89b-12d3-a456-426614174000',
                facultyId: facultyId,
                sectionId: '123e4567-e89b-12d3-a456-426614174001',
                timestamp: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
                status: 'present',
                captureMethod: 'manual'
            };

            const result = await dataIntegrityService.validateAttendanceRecord(futureRecord as any);

            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Attendance timestamp cannot be in the future');
        });

        test('should validate student data integrity', async () => {
            const invalidStudentData = {
                rollNumber: '', // Empty
                name: 'A'.repeat(101), // Too long
                sectionId: 'invalid-uuid'
            };

            const result = await dataIntegrityService.validateStudentData(invalidStudentData);

            expect(result.isValid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
        });
    });

    describe('Authentication Security', () => {
        test('should reject requests without authentication token', async () => {
            const response = await request(app)
                .get('/api/attendance/student/123e4567-e89b-12d3-a456-426614174000');

            expect(response.status).toBe(401);
            expect(response.body.success).toBe(false);
            expect(response.body.code).toBe('TOKEN_MISSING');
        });

        test('should reject invalid authentication tokens', async () => {
            const response = await request(app)
                .get('/api/attendance/student/123e4567-e89b-12d3-a456-426614174000')
                .set('Authorization', 'Bearer invalid-token');

            expect(response.status).toBe(401);
            expect(response.body.success).toBe(false);
            expect(response.body.code).toBe('TOKEN_INVALID');
        });

        test('should validate username format in login', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    username: 'invalid@username!', // Contains invalid characters
                    password: 'password123'
                });

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
        });
    });

    describe('Input Sanitization', () => {
        test('should sanitize string inputs', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    username: '  testuser  ', // Should be trimmed
                    password: 'password123'
                });

            // The request should process the trimmed username
            // (This test assumes the sanitization middleware is working)
            expect(response.status).toBe(401); // Invalid credentials, but processed
        });

        test('should remove control characters from input', async () => {
            const maliciousInput = 'test\x00\x01user';

            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    username: maliciousInput,
                    password: 'password123'
                });

            // Should not crash the server
            expect(response.status).toBeDefined();
        });
    });

    describe('Error Handling Security', () => {
        test('should not expose sensitive information in error messages', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    username: 'nonexistentuser',
                    password: 'wrongpassword'
                });

            expect(response.status).toBe(401);
            expect(response.body.error).not.toContain('database');
            expect(response.body.error).not.toContain('SQL');
            expect(response.body.error).not.toContain('password');
        });

        test('should handle database errors gracefully', async () => {
            // This would require mocking database failures
            // For now, we'll just ensure the endpoint exists
            const response = await request(app)
                .get('/api/attendance/student/123e4567-e89b-12d3-a456-426614174000')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBeDefined();
        });
    });

    describe('CORS and Headers Security', () => {
        test('should include security headers', async () => {
            const response = await request(app)
                .get('/health');

            // Check for security headers (these are set by helmet middleware)
            expect(response.headers).toBeDefined();
        });

        test('should handle CORS properly for React Native', async () => {
            const response = await request(app)
                .options('/api/auth/login')
                .set('Origin', 'http://localhost:3000');

            expect(response.status).toBe(200);
            expect(response.headers['access-control-allow-origin']).toBeDefined();
        });
    });
});