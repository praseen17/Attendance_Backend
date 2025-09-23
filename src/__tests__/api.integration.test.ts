/**
 * Comprehensive API Integration Tests
 * Tests all API endpoints with real database connections
 */

import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import app from '../index';
import { DatabaseService } from '../database';
import { generateToken } from '../utils/auth';

describe('API Integration Tests', () => {
    let authToken: string;
    let facultyId: string;
    let sectionId: string;
    let studentId: string;

    beforeAll(async () => {
        // Initialize test database
        await DatabaseService.initialize();
        
        // Create test faculty
        const facultyResult = await DatabaseService.query(`
            INSERT INTO faculty (username, password_hash, name, email)
            VALUES ($1, $2, $3, $4)
            RETURNING id
        `, ['testfaculty', '$2b$10$test.hash.here', 'Test Faculty', 'test@example.com']);
        
        facultyId = facultyResult.rows[0].id;
        authToken = generateToken({ userId: facultyId, username: 'testfaculty' });

        // Create test section
        const sectionResult = await DatabaseService.query(`
            INSERT INTO sections (name, grade, faculty_id)
            VALUES ($1, $2, $3)
            RETURNING id
        `, ['Test Section', '10', facultyId]);
        
        sectionId = sectionResult.rows[0].id;

        // Create test student
        const studentResult = await DatabaseService.query(`
            INSERT INTO students (roll_number, name, section_id)
            VALUES ($1, $2, $3)
            RETURNING id
        `, ['S001', 'Test Student', sectionId]);
        
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

    describe('Authentication Endpoints', () => {
        it('POST /api/auth/login - should authenticate valid credentials', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    username: 'testfaculty',
                    password: 'testpassword'
                });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.token).toBeDefined();
            expect(response.body.faculty).toBeDefined();
            expect(response.body.faculty.username).toBe('testfaculty');
        });

        it('POST /api/auth/login - should reject invalid credentials', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    username: 'testfaculty',
                    password: 'wrongpassword'
                });

            expect(response.status).toBe(401);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toBeDefined();
        });

        it('POST /api/auth/login - should validate required fields', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    username: 'testfaculty'
                    // Missing password
                });

            expect(response.status).toBe(400);
            expect(response.body.error).toContain('password');
        });

        it('POST /api/auth/refresh - should refresh valid tokens', async () => {
            const response = await request(app)
                .post('/api/auth/refresh')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body.token).toBeDefined();
            expect(response.body.token).not.toBe(authToken);
        });

        it('POST /api/auth/refresh - should reject invalid tokens', async () => {
            const response = await request(app)
                .post('/api/auth/refresh')
                .set('Authorization', 'Bearer invalid.token.here');

            expect(response.status).toBe(401);
        });
    });

    describe('Student Management Endpoints', () => {
        it('GET /api/students/section/:sectionId - should return students for valid section', async () => {
            const response = await request(app)
                .get(`/api/students/section/${sectionId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toBeInstanceOf(Array);
            expect(response.body.length).toBeGreaterThan(0);
            expect(response.body[0]).toHaveProperty('rollNumber');
            expect(response.body[0]).toHaveProperty('name');
        });

        it('GET /api/students/section/:sectionId - should require authentication', async () =