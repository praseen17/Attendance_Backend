import request from 'supertest';
import express from 'express';
import { pool } from '../database/connection';
import { AuthService } from '../services/authService';
import { generateTokenPair } from '../utils/auth';
import sectionRoutes from './sections';
import { errorHandler } from '../middleware/errorHandler';

const app = express();
app.use(express.json());
app.use('/api/sections', sectionRoutes);
app.use(errorHandler);

describe('Sections API Integration Tests', () => {
    let authService: AuthService;
    let testFacultyId: string;
    let authToken: string;
    let testSectionId: string;

    beforeAll(async () => {
        authService = new AuthService();

        // Create test faculty
        const faculty = await authService.createFaculty({
            username: 'test_faculty_sections_api',
            password_hash: 'password123',
            name: 'Test Faculty',
            email: 'test_faculty_sections_api@example.com'
        });
        testFacultyId = faculty!.id;

        // Generate auth token
        const tokens = generateTokenPair(testFacultyId, 'test_faculty_sections_api');
        authToken = tokens.accessToken;
    });

    afterAll(async () => {
        // Clean up test data
        await pool.query('DELETE FROM sections WHERE faculty_id = $1', [testFacultyId]);
        await pool.query('DELETE FROM faculty WHERE id = $1', [testFacultyId]);
    });

    afterEach(async () => {
        // Clean up sections after each test
        await pool.query('DELETE FROM sections WHERE faculty_id = $1', [testFacultyId]);
    });

    describe('POST /api/sections', () => {
        it('should create a new section', async () => {
            const sectionData = {
                name: 'Test Section',
                grade: '10',
                facultyId: testFacultyId
            };

            const response = await request(app)
                .post('/api/sections')
                .set('Authorization', `Bearer ${authToken}`)
                .send(sectionData)
                .expect(201);

            expect(response.body.success).toBe(true);
            expect(response.body.data.name).toBe('Test Section');
            expect(response.body.data.grade).toBe('10');
            expect(response.body.data.facultyId).toBe(testFacultyId);
            expect(response.body.data.studentCount).toBe(0);
            expect(response.body.data.id).toBeDefined();

            testSectionId = response.body.data.id;
        });

        it('should return 400 for missing required fields', async () => {
            const sectionData = {
                name: 'Test Section'
                // Missing grade and facultyId
            };

            const response = await request(app)
                .post('/api/sections')
                .set('Authorization', `Bearer ${authToken}`)
                .send(sectionData)
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toContain('required');
        });

        it('should return 404 for non-existent faculty', async () => {
            const sectionData = {
                name: 'Test Section',
                grade: '10',
                facultyId: 'non-existent-faculty-id'
            };

            const response = await request(app)
                .post('/api/sections')
                .set('Authorization', `Bearer ${authToken}`)
                .send(sectionData)
                .expect(404);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toBe('Faculty not found');
        });

        it('should return 409 for duplicate section name for same faculty', async () => {
            // Create first section
            const sectionData1 = {
                name: 'Duplicate Section',
                grade: '10',
                facultyId: testFacultyId
            };

            await request(app)
                .post('/api/sections')
                .set('Authorization', `Bearer ${authToken}`)
                .send(sectionData1)
                .expect(201);

            // Try to create second section with same name
            const sectionData2 = {
                name: 'Duplicate Section',
                grade: '11',
                facultyId: testFacultyId
            };

            const response = await request(app)
                .post('/api/sections')
                .set('Authorization', `Bearer ${authToken}`)
                .send(sectionData2)
                .expect(409);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toContain('already exists');
        });

        it('should return 401 without authentication token', async () => {
            const sectionData = {
                name: 'Test Section',
                grade: '10',
                facultyId: testFacultyId
            };

            await request(app)
                .post('/api/sections')
                .send(sectionData)
                .expect(401);
        });
    });

    describe('GET /api/sections/faculty/:facultyId/sections', () => {
        beforeEach(async () => {
            // Create test sections
            const sections = [
                { name: 'Section A', grade: '9', facultyId: testFacultyId },
                { name: 'Section B', grade: '10', facultyId: testFacultyId }
            ];

            for (const section of sections) {
                await request(app)
                    .post('/api/sections')
                    .set('Authorization', `Bearer ${authToken}`)
                    .send(section);
            }
        });

        it('should return all sections for a faculty', async () => {
            const response = await request(app)
                .get(`/api/sections/faculty/${testFacultyId}/sections`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.faculty).toBeDefined();
            expect(response.body.data.faculty.name).toBe('Test Faculty');
            expect(response.body.data.sections).toHaveLength(2);
            expect(response.body.data.sections[0].grade).toBe('9'); // Should be ordered by grade
            expect(response.body.data.sections[1].grade).toBe('10');
        });

        it('should return 404 for non-existent faculty', async () => {
            const response = await request(app)
                .get('/api/sections/faculty/non-existent-faculty-id/sections')
                .set('Authorization', `Bearer ${authToken}`)
                .expect(404);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toBe('Faculty not found');
        });
    });

    describe('GET /api/sections/:sectionId', () => {
        beforeEach(async () => {
            // Create test section
            const response = await request(app)
                .post('/api/sections')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    name: 'Test Section',
                    grade: '10',
                    facultyId: testFacultyId
                });
            testSectionId = response.body.data.id;
        });

        it('should return section by ID', async () => {
            const response = await request(app)
                .get(`/api/sections/${testSectionId}`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.id).toBe(testSectionId);
            expect(response.body.data.name).toBe('Test Section');
            expect(response.body.data.grade).toBe('10');
        });

        it('should return section with students when includeStudents=true', async () => {
            const response = await request(app)
                .get(`/api/sections/${testSectionId}?includeStudents=true`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.students).toBeDefined();
            expect(response.body.data.faculty).toBeDefined();
            expect(response.body.data.faculty.name).toBe('Test Faculty');
        });

        it('should return 404 for non-existent section', async () => {
            const response = await request(app)
                .get('/api/sections/non-existent-section-id')
                .set('Authorization', `Bearer ${authToken}`)
                .expect(404);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toBe('Section not found');
        });
    });

    describe('GET /api/sections', () => {
        beforeEach(async () => {
            // Create test sections
            const sections = [
                { name: 'Section A', grade: '9', facultyId: testFacultyId },
                { name: 'Section B', grade: '10', facultyId: testFacultyId }
            ];

            for (const section of sections) {
                await request(app)
                    .post('/api/sections')
                    .set('Authorization', `Bearer ${authToken}`)
                    .send(section);
            }
        });

        it('should return all sections', async () => {
            const response = await request(app)
                .get('/api/sections')
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.length).toBeGreaterThanOrEqual(2);
        });

        it('should return sections with faculty when includeFaculty=true', async () => {
            const response = await request(app)
                .get('/api/sections?includeFaculty=true')
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            const testSections = response.body.data.filter((s: any) => s.facultyId === testFacultyId);
            expect(testSections.length).toBeGreaterThanOrEqual(2);
            expect(testSections[0].faculty).toBeDefined();
            expect(testSections[0].faculty.name).toBe('Test Faculty');
        });
    });

    describe('PUT /api/sections/:sectionId', () => {
        beforeEach(async () => {
            // Create test section
            const response = await request(app)
                .post('/api/sections')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    name: 'Original Section',
                    grade: '9',
                    facultyId: testFacultyId
                });
            testSectionId = response.body.data.id;
        });

        it('should update section information', async () => {
            const updateData = {
                name: 'Updated Section',
                grade: '10'
            };

            const response = await request(app)
                .put(`/api/sections/${testSectionId}`)
                .set('Authorization', `Bearer ${authToken}`)
                .send(updateData)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.name).toBe('Updated Section');
            expect(response.body.data.grade).toBe('10');
        });

        it('should return 404 for non-existent section', async () => {
            const updateData = { name: 'Updated Name' };

            const response = await request(app)
                .put('/api/sections/non-existent-section-id')
                .set('Authorization', `Bearer ${authToken}`)
                .send(updateData)
                .expect(404);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toBe('Section not found');
        });
    });

    describe('DELETE /api/sections/:sectionId', () => {
        beforeEach(async () => {
            // Create test section
            const response = await request(app)
                .post('/api/sections')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    name: 'Test Section',
                    grade: '10',
                    facultyId: testFacultyId
                });
            testSectionId = response.body.data.id;
        });

        it('should delete section with no students', async () => {
            const response = await request(app)
                .delete(`/api/sections/${testSectionId}`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.message).toContain('deleted successfully');

            // Verify section is deleted
            await request(app)
                .get(`/api/sections/${testSectionId}`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(404);
        });

        it('should return 404 for non-existent section', async () => {
            const response = await request(app)
                .delete('/api/sections/non-existent-section-id')
                .set('Authorization', `Bearer ${authToken}`)
                .expect(404);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toBe('Section not found');
        });
    });

    describe('POST /api/sections/:sectionId/update-student-count', () => {
        beforeEach(async () => {
            // Create test section
            const response = await request(app)
                .post('/api/sections')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    name: 'Test Section',
                    grade: '10',
                    facultyId: testFacultyId
                });
            testSectionId = response.body.data.id;
        });

        it('should update student count', async () => {
            const response = await request(app)
                .post(`/api/sections/${testSectionId}/update-student-count`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.message).toContain('updated successfully');
            expect(response.body.data.sectionId).toBe(testSectionId);
            expect(response.body.data.studentCount).toBe(0);
        });

        it('should return 404 for non-existent section', async () => {
            const response = await request(app)
                .post('/api/sections/non-existent-section-id/update-student-count')
                .set('Authorization', `Bearer ${authToken}`)
                .expect(404);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toBe('Section not found');
        });
    });
});