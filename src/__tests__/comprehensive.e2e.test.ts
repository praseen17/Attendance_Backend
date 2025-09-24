/**
 * End-to-End Tests for Backend API
 * Tests complete user flows and system integration
 */

import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import app from '../index';
import { DatabaseService } from '../database';
import { generateToken } from '../utils/auth';
import WebSocket from 'ws';

describe('End-to-End API Tests', () => {
    let authToken: string;
    let facultyId: string;
    let sectionId: string;
    let studentId: string;
    let wsServer: any;

    beforeAll(async () => {
        // Initialize test database
        await DatabaseService.initialize();

        // Create test faculty
        const facultyResult = await DatabaseService.query(`
            INSERT INTO faculty (username, password_hash, name, email)
            VALUES ($1, $2, $3, $4)
            RETURNING id
        `, ['e2e_faculty', '$2b$10$test.hash.here', 'E2E Test Faculty', 'e2e@example.com']);

        facultyId = facultyResult.rows[0].id;
        authToken = generateToken({ userId: facultyId, username: 'e2e_faculty' });

        // Create test section
        const sectionResult = await DatabaseService.query(`
            INSERT INTO sections (name, grade, faculty_id)
            VALUES ($1, $2, $3)
            RETURNING id
        `, ['E2E Test Section', '10', facultyId]);

        sectionId = sectionResult.rows[0].id;

        // Create test student
        const studentResult = await DatabaseService.query(`
            INSERT INTO students (roll_number, name, section_id)
            VALUES ($1, $2, $3)
            RETURNING id
        `, ['E2E001', 'E2E Test Student', sectionId]);

        studentId = studentResult.rows[0].id;
    });

    afterAll(async () => {
        // Clean up test data
        await DatabaseService.query('DELETE FROM attendance_logs WHERE faculty_id = $1', [facultyId]);
        await DatabaseService.query('DELETE FROM students WHERE section_id = $1', [sectionId]);
        await DatabaseService.query('DELETE FROM sections WHERE faculty_id = $1', [facultyId]);
        await DatabaseService.query('DELETE FROM faculty WHERE id = $1', [facultyId]);

        await DatabaseService.close();
    });

    describe('Complete Authentication Flow', () => {
        it('should complete full authentication workflow', async () => {
            // Step 1: Login
            const loginResponse = await request(app)
                .post('/api/auth/login')
                .send({
                    username: 'e2e_faculty',
                    password: 'testpassword'
                });

            expect(loginResponse.status).toBe(200);
            expect(loginResponse.body.success).toBe(true);
            expect(loginResponse.body.token).toBeDefined();

            const token = loginResponse.body.token;

            // Step 2: Use token for authenticated request
            const profileResponse = await request(app)
                .get('/api/faculty/profile')
                .set('Authorization', `Bearer ${token}`);

            expect(profileResponse.status).toBe(200);
            expect(profileResponse.body.username).toBe('e2e_faculty');

            // Step 3: Refresh token
            const refreshResponse = await request(app)
                .post('/api/auth/refresh')
                .set('Authorization', `Bearer ${token}`);

            expect(refreshResponse.status).toBe(200);
            expect(refreshResponse.body.token).toBeDefined();
            expect(refreshResponse.body.token).not.toBe(token);
        });

        it('should handle token expiration gracefully', async () => {
            // Create an expired token
            const expiredToken = generateToken(
                { userId: facultyId, username: 'e2e_faculty' },
                '1ms' // Expires immediately
            );

            // Wait to ensure token is expired
            await new Promise(resolve => setTimeout(resolve, 10));

            const response = await request(app)
                .get('/api/faculty/profile')
                .set('Authorization', `Bearer ${expiredToken}`);

            expect(response.status).toBe(401);
            expect(response.body.error).toContain('expired');
        });
    });

    describe('Complete Attendance Capture Flow', () => {
        it('should complete full attendance capture and sync workflow', async () => {
            // Step 1: Get students for section
            const studentsResponse = await request(app)
                .get(`/api/students/section/${sectionId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(studentsResponse.status).toBe(200);
            expect(studentsResponse.body.length).toBeGreaterThan(0);
            expect(studentsResponse.body[0].rollNumber).toBe('E2E001');

            // Step 2: Capture attendance (simulate offline capture)
            const attendanceRecords = [
                {
                    studentId: studentId,
                    facultyId: facultyId,
                    sectionId: sectionId,
                    date: new Date().toISOString().split('T')[0],
                    status: 'present',
                    captureMethod: 'ml'
                }
            ];

            // Step 3: Sync attendance to server
            const syncResponse = await request(app)
                .post('/api/attendance/sync')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ records: attendanceRecords });

            expect(syncResponse.status).toBe(200);
            expect(syncResponse.body.success).toBe(true);
            expect(syncResponse.body.syncedCount).toBe(1);

            // Step 4: Verify attendance was stored
            const historyResponse = await request(app)
                .get(`/api/attendance/student/${studentId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(historyResponse.status).toBe(200);
            expect(historyResponse.body.length).toBe(1);
            expect(historyResponse.body[0].status).toBe('present');
            expect(historyResponse.body[0].captureMethod).toBe('ml');
        });

        it('should handle duplicate attendance records', async () => {
            const today = new Date().toISOString().split('T')[0];

            // First attendance record
            const firstRecord = {
                studentId: studentId,
                facultyId: facultyId,
                sectionId: sectionId,
                date: today,
                status: 'present',
                captureMethod: 'ml'
            };

            // Sync first record
            const firstSync = await request(app)
                .post('/api/attendance/sync')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ records: [firstRecord] });

            expect(firstSync.status).toBe(200);

            // Try to sync duplicate record with different status
            const duplicateRecord = {
                ...firstRecord,
                status: 'absent',
                captureMethod: 'manual'
            };

            const duplicateSync = await request(app)
                .post('/api/attendance/sync')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ records: [duplicateRecord] });

            expect(duplicateSync.status).toBe(200);
            expect(duplicateSync.body.conflicts).toBeDefined();
            expect(duplicateSync.body.conflicts.length).toBe(1);
        });
    });

    describe('WebSocket ML Integration Flow', () => {
        let wsClient: WebSocket;

        beforeEach((done) => {
            // Connect to WebSocket server
            wsClient = new WebSocket('ws://localhost:3001/ml');
            wsClient.on('open', done);
        });

        afterEach(() => {
            if (wsClient && wsClient.readyState === WebSocket.OPEN) {
                wsClient.close();
            }
        });

        it('should handle ML face recognition workflow', (done) => {
            const faceData = {
                type: 'face_data',
                imageData: 'base64-encoded-image-data',
                sectionId: sectionId
            };

            wsClient.on('message', (data) => {
                const response = JSON.parse(data.toString());

                if (response.type === 'student_identified') {
                    expect(response.studentId).toBeDefined();
                    expect(response.confidence).toBeGreaterThan(0);
                    done();
                } else if (response.type === 'recognition_failed') {
                    expect(response.error).toBeDefined();
                    done();
                }
            });

            wsClient.send(JSON.stringify(faceData));
        });

        it('should handle WebSocket connection errors gracefully', (done) => {
            wsClient.on('error', (error) => {
                expect(error).toBeDefined();
                done();
            });

            // Send invalid data to trigger error
            wsClient.send('invalid-json-data');
        });
    });

    describe('Error Handling and Recovery', () => {
        it('should handle database connection failures', async () => {
            // Temporarily close database connection
            await DatabaseService.close();

            const response = await request(app)
                .get(`/api/students/section/${sectionId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(500);
            expect(response.body.error).toContain('database');

            // Restore database connection
            await DatabaseService.initialize();
        });

        it('should handle malformed request data', async () => {
            const malformedData = {
                records: [
                    {
                        // Missing required fields
                        status: 'present'
                    }
                ]
            };

            const response = await request(app)
                .post('/api/attendance/sync')
                .set('Authorization', `Bearer ${authToken}`)
                .send(malformedData);

            expect(response.status).toBe(400);
            expect(response.body.error).toContain('validation');
        });

        it('should handle unauthorized access attempts', async () => {
            const response = await request(app)
                .get(`/api/students/section/${sectionId}`)
                .set('Authorization', 'Bearer invalid-token');

            expect(response.status).toBe(401);
            expect(response.body.error).toContain('unauthorized');
        });
    });

    describe('Performance and Load Testing', () => {
        it('should handle concurrent requests efficiently', async () => {
            const concurrentRequests = 10;
            const requests = Array.from({ length: concurrentRequests }, () =>
                request(app)
                    .get(`/api/students/section/${sectionId}`)
                    .set('Authorization', `Bearer ${authToken}`)
            );

            const startTime = Date.now();
            const responses = await Promise.all(requests);
            const endTime = Date.now();

            // All requests should succeed
            responses.forEach(response => {
                expect(response.status).toBe(200);
            });

            // Should complete within reasonable time (5 seconds for 10 requests)
            expect(endTime - startTime).toBeLessThan(5000);
        });

        it('should handle large attendance sync efficiently', async () => {
            // Create multiple students for bulk sync test
            const bulkStudents = [];
            for (let i = 0; i < 50; i++) {
                const studentResult = await DatabaseService.query(`
                    INSERT INTO students (roll_number, name, section_id)
                    VALUES ($1, $2, $3)
                    RETURNING id
                `, [`BULK${i.toString().padStart(3, '0')}`, `Bulk Student ${i}`, sectionId]);

                bulkStudents.push(studentResult.rows[0].id);
            }

            // Create bulk attendance records
            const bulkRecords = bulkStudents.map(studentId => ({
                studentId,
                facultyId,
                sectionId,
                date: new Date().toISOString().split('T')[0],
                status: 'present',
                captureMethod: 'ml'
            }));

            const startTime = Date.now();
            const response = await request(app)
                .post('/api/attendance/sync')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ records: bulkRecords });
            const endTime = Date.now();

            expect(response.status).toBe(200);
            expect(response.body.syncedCount).toBe(50);
            expect(endTime - startTime).toBeLessThan(10000); // Should complete within 10 seconds

            // Clean up bulk students
            await DatabaseService.query(
                'DELETE FROM students WHERE roll_number LIKE $1',
                ['BULK%']
            );
        });
    });

    describe('Data Integrity and Validation', () => {
        it('should maintain data consistency across operations', async () => {
            // Get initial counts
            const initialStats = await DatabaseService.query(`
                SELECT 
                    (SELECT COUNT(*) FROM students WHERE section_id = $1) as student_count,
                    (SELECT COUNT(*) FROM attendance_logs WHERE section_id = $1) as attendance_count
            `, [sectionId]);

            const initialStudentCount = parseInt(initialStats.rows[0].student_count);
            const initialAttendanceCount = parseInt(initialStats.rows[0].attendance_count);

            // Add new student
            const newStudentResult = await DatabaseService.query(`
                INSERT INTO students (roll_number, name, section_id)
                VALUES ($1, $2, $3)
                RETURNING id
            `, ['INTEGRITY001', 'Integrity Test Student', sectionId]);

            const newStudentId = newStudentResult.rows[0].id;

            // Add attendance for new student
            const attendanceRecord = {
                studentId: newStudentId,
                facultyId,
                sectionId,
                date: new Date().toISOString().split('T')[0],
                status: 'present',
                captureMethod: 'manual'
            };

            await request(app)
                .post('/api/attendance/sync')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ records: [attendanceRecord] });

            // Verify counts increased correctly
            const finalStats = await DatabaseService.query(`
                SELECT 
                    (SELECT COUNT(*) FROM students WHERE section_id = $1) as student_count,
                    (SELECT COUNT(*) FROM attendance_logs WHERE section_id = $1) as attendance_count
            `, [sectionId]);

            const finalStudentCount = parseInt(finalStats.rows[0].student_count);
            const finalAttendanceCount = parseInt(finalStats.rows[0].attendance_count);

            expect(finalStudentCount).toBe(initialStudentCount + 1);
            expect(finalAttendanceCount).toBe(initialAttendanceCount + 1);

            // Clean up
            await DatabaseService.query('DELETE FROM students WHERE id = $1', [newStudentId]);
        });

        it('should validate foreign key relationships', async () => {
            // Try to create attendance for non-existent student
            const invalidRecord = {
                studentId: 'non-existent-student-id',
                facultyId,
                sectionId,
                date: new Date().toISOString().split('T')[0],
                status: 'present',
                captureMethod: 'manual'
            };

            const response = await request(app)
                .post('/api/attendance/sync')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ records: [invalidRecord] });

            expect(response.status).toBe(400);
            expect(response.body.error).toContain('foreign key');
        });
    });
});