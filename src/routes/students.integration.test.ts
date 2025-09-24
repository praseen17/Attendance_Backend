import request from 'supertest';
import express from 'express';
import { pool } from '../database/connection';
import { AuthService } from '../services/authService';
import { SectionService } from '../services/sectionService';
import { generateTokenPair } from '../utils/auth';
import studentRoutes from './students';
import { errorHandler } from '../middleware/errorHandler';

const app = express();
app.use(express.json());
app.use('/api/students', studentRoutes);
app.use(errorHandler);

describe('Students API Integration Tests', () => {
    let authService: AuthService;
    let sectionService: SectionService;
    let testFacultyId: string;
    let testSectionId: string;
    let authToken: string;
    let testStudentId: string;

    beforeAll(async () => {
        authService = new AuthService();
        sectionService = new SectionService();

        // Create test faculty
        const faculty = await authService.createFaculty({
            username: 'test_faculty_students_api',
            password_hash: 'password123',
            name: 'Test Faculty',
            email: 'test_faculty_students_api@example.com'
        });
        testFacultyId = faculty!.id;

        // Create test section
        const section = await sectionService.createSection({
            name: 'Test Section API',
            grade: '10',
            faculty_id: testFacultyId
        });
        testSectionId = section.id;

        // Generate auth token
        const tokens = generateTokenPair(testFacultyId, 'test_faculty_students_api');
        authToken = tokens.accessToken;
    });

    afterAll(async () => {
        // Clean up test data
        await pool.query('DELETE FROM students WHERE section_id = $1', [testSectionId]);
        await pool.query('DELETE FROM sections WHERE id = $1', [testSectionId]);
        await pool.query('DELETE FROM faculty WHERE id = $1', [testFacultyId]);
    });

    afterEach(async () => {
        // Clean up students after each test
        await pool.query('DELETE FROM students WHERE section_id = $1', [testSectionId]);
    });

    describe('POST /api/students', () => {
        it('should create a new student', async () => {
            const studentData = {
                rollNumber: '001',
                name: 'Test Student',
                sectionId: testSectionId,
                isActive: true
            };

            const response = await request(app)
                .post('/api/students')
                .set('Authorization', `Bearer ${authToken}`)
                .send(studentData)
                .expect(201);

            expect(response.body.success).toBe(true);
            expect(response.body.data.rollNumber).toBe('001');
            expect(response.body.data.name).toBe('Test Student');
            expect(response.body.data.sectionId).toBe(testSectionId);
            expect(response.body.data.id).toBeDefined();

            testStudentId = response.body.data.id;
        });

        it('should return 400 for missing required fields', async () => {
            const studentData = {
                name: 'Test Student'
                // Missing rollNumber and sectionId
            };

            const response = await request(app)
                .post('/api/students')
                .set('Authorization', `Bearer ${authToken}`)
                .send(studentData)
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toContain('required');
        });

        it('should return 404 for non-existent section', async () => {
            const studentData = {
                rollNumber: '001',
                name: 'Test Student',
                sectionId: 'non-existent-section-id'
            };

            const response = await request(app)
                .post('/api/students')
                .set('Authorization', `Bearer ${authToken}`)
                .send(studentData)
                .expect(404);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toBe('Section not found');
        });

        it('should return 409 for duplicate roll number in same section', async () => {
            // Create first student
            const studentData1 = {
                rollNumber: '002',
                name: 'Student One',
                sectionId: testSectionId
            };

            await request(app)
                .post('/api/students')
                .set('Authorization', `Bearer ${authToken}`)
                .send(studentData1)
                .expect(201);

            // Try to create second student with same roll number
            const studentData2 = {
                rollNumber: '002',
                name: 'Student Two',
                sectionId: testSectionId
            };

            const response = await request(app)
                .post('/api/students')
                .set('Authorization', `Bearer ${authToken}`)
                .send(studentData2)
                .expect(409);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toContain('already exists');
        });

        it('should return 401 without authentication token', async () => {
            const studentData = {
                rollNumber: '001',
                name: 'Test Student',
                sectionId: testSectionId
            };

            await request(app)
                .post('/api/students')
                .send(studentData)
                .expect(401);
        });
    });

    describe('GET /api/students/section/:sectionId', () => {
        beforeEach(async () => {
            // Create test students
            const students = [
                { rollNumber: '001', name: 'Student One', sectionId: testSectionId },
                { rollNumber: '002', name: 'Student Two', sectionId: testSectionId }
            ];

            for (const student of students) {
                await request(app)
                    .post('/api/students')
                    .set('Authorization', `Bearer ${authToken}`)
                    .send(student);
            }
        });

        it('should return all students in a section', async () => {
            const response = await request(app)
                .get(`/api/students/section/${testSectionId}`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.section).toBeDefined();
            expect(response.body.data.students).toHaveLength(2);
            expect(response.body.data.students[0].rollNumber).toBe('001');
            expect(response.body.data.students[1].rollNumber).toBe('002');
        });

        it('should return 404 for non-existent section', async () => {
            const response = await request(app)
                .get('/api/students/section/non-existent-section-id')
                .set('Authorization', `Bearer ${authToken}`)
                .expect(404);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toBe('Section not found');
        });
    });

    describe('GET /api/students/:studentId', () => {
        beforeEach(async () => {
            // Create test student
            const response = await request(app)
                .post('/api/students')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    rollNumber: '001',
                    name: 'Test Student',
                    sectionId: testSectionId
                });
            testStudentId = response.body.data.id;
        });

        it('should return student by ID', async () => {
            const response = await request(app)
                .get(`/api/students/${testStudentId}`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.id).toBe(testStudentId);
            expect(response.body.data.rollNumber).toBe('001');
            expect(response.body.data.name).toBe('Test Student');
        });

        it('should return 404 for non-existent student', async () => {
            const response = await request(app)
                .get('/api/students/non-existent-student-id')
                .set('Authorization', `Bearer ${authToken}`)
                .expect(404);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toBe('Student not found');
        });
    });

    describe('PUT /api/students/:studentId', () => {
        beforeEach(async () => {
            // Create test student
            const response = await request(app)
                .post('/api/students')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    rollNumber: '001',
                    name: 'Original Student',
                    sectionId: testSectionId
                });
            testStudentId = response.body.data.id;
        });

        it('should update student information', async () => {
            const updateData = {
                name: 'Updated Student',
                rollNumber: '002'
            };

            const response = await request(app)
                .put(`/api/students/${testStudentId}`)
                .set('Authorization', `Bearer ${authToken}`)
                .send(updateData)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.name).toBe('Updated Student');
            expect(response.body.data.rollNumber).toBe('002');
        });

        it('should return 404 for non-existent student', async () => {
            const updateData = { name: 'Updated Name' };

            const response = await request(app)
                .put('/api/students/non-existent-student-id')
                .set('Authorization', `Bearer ${authToken}`)
                .send(updateData)
                .expect(404);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toBe('Student not found');
        });
    });

    describe('DELETE /api/students/:studentId', () => {
        beforeEach(async () => {
            // Create test student
            const response = await request(app)
                .post('/api/students')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    rollNumber: '001',
                    name: 'Test Student',
                    sectionId: testSectionId
                });
            testStudentId = response.body.data.id;
        });

        it('should delete student', async () => {
            const response = await request(app)
                .delete(`/api/students/${testStudentId}`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.message).toContain('deleted successfully');

            // Verify student is deleted
            await request(app)
                .get(`/api/students/${testStudentId}`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(404);
        });

        it('should return 404 for non-existent student', async () => {
            const response = await request(app)
                .delete('/api/students/non-existent-student-id')
                .set('Authorization', `Bearer ${authToken}`)
                .expect(404);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toBe('Student not found');
        });
    });
});