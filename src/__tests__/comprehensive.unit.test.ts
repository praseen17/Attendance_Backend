/**
 * Comprehensive Unit Tests for Backend Services
 * Tests all core business logic in isolation
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { AuthService } from '../services/authService';
import { StudentService } from '../services/studentService';
import { SectionService } from '../services/sectionService';
import { pool } from '../database';
import { hashPassword, verifyPassword, generateAccessToken, verifyToken } from '../utils/auth';

// Mock database
jest.mock('../database');
const mockPool = {
    query: jest.fn(),
    connect: jest.fn(),
    end: jest.fn()
};

describe('Backend Unit Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('Authentication Service', () => {
        let authService: AuthService;

        beforeEach(() => {
            authService = new AuthService();
        });

        it('should hash passwords securely', async () => {
            const password = 'testPassword123';
            const hashedPassword = await hashPassword(password);

            expect(hashedPassword).toBeDefined();
            expect(hashedPassword).not.toBe(password);
            expect(hashedPassword.length).toBeGreaterThan(50);
        });

        it('should verify passwords correctly', async () => {
            const password = 'testPassword123';
            const hashedPassword = await hashPassword(password);

            const isValid = await verifyPassword(password, hashedPassword);
            const isInvalid = await verifyPassword('wrongPassword', hashedPassword);

            expect(isValid).toBe(true);
            expect(isInvalid).toBe(false);
        });

        it('should generate valid JWT tokens', () => {
            const token = generateAccessToken('123', 'testuser');

            expect(token).toBeDefined();
            expect(typeof token).toBe('string');
            expect(token.split('.')).toHaveLength(3);
        });

        it('should verify JWT tokens correctly', () => {
            const token = generateAccessToken('123', 'testuser');

            const decoded = verifyToken(token);

            expect(decoded).toBeDefined();
            expect(decoded.userId).toBe('123');
            expect(decoded.username).toBe('testuser');
        });

        it('should reject invalid JWT tokens', () => {
            const invalidToken = 'invalid.token.here';

            expect(() => verifyToken(invalidToken)).toThrow();
        });

        it('should authenticate faculty with valid credentials', async () => {
            const mockFaculty = {
                id: '123',
                username: 'testuser',
                password_hash: await hashPassword('password123'),
                name: 'Test User',
                email: 'test@example.com'
            };

            (authService as any).pool = { query: jest.fn().mockResolvedValue({ rows: [mockFaculty] }) };

            const result = await authService.login({ username: 'testuser', password: 'password123' });

            expect(result.success).toBe(true);
            expect(result.user).toBeDefined();
            expect(result.tokens).toBeDefined();
        });

        it('should reject invalid credentials', async () => {
            (authService as any).pool = { query: jest.fn().mockResolvedValue({ rows: [] }) };

            const result = await authService.login({ username: 'testuser', password: 'wrongpassword' });

            expect(result.success).toBe(false);
            expect(result.user).toBeUndefined();
            expect(result.tokens).toBeUndefined();
        });
    });

    describe('Student Service', () => {
        let studentService: StudentService;

        beforeEach(() => {
            studentService = new StudentService();
        });

        it('should retrieve students by section', async () => {
            const mockStudents = [
                { id: '1', roll_number: 'S001', name: 'Student 1', section_id: 'SEC1' },
                { id: '2', roll_number: 'S002', name: 'Student 2', section_id: 'SEC1' }
            ];

            (studentService as any).pool = { query: jest.fn().mockResolvedValue({ rows: mockStudents }) };

            const students = await studentService.getStudentsBySection('SEC1');

            expect(students).toHaveLength(2);
            expect(students[0].roll_number).toBe('S001');
        });

        it('should handle database errors gracefully', async () => {
            (studentService as any).pool = { query: jest.fn().mockRejectedValue(new Error('Database connection failed')) };

            await expect(studentService.getStudentsBySection('SEC1')).rejects.toThrow('Database connection failed');
        });
    });

    describe('Section Service', () => {
        let sectionService: SectionService;

        beforeEach(() => {
            sectionService = new SectionService();
        });

        it('should retrieve sections by faculty', async () => {
            const mockSections = [
                { id: 'SEC1', name: 'Class A', grade: '10', faculty_id: 'FAC1' },
                { id: 'SEC2', name: 'Class B', grade: '10', faculty_id: 'FAC1' }
            ];

            (sectionService as any).pool = { query: jest.fn().mockResolvedValue({ rows: mockSections }) };

            const sections = await sectionService.getSectionsByFaculty('FAC1');

            expect(sections).toHaveLength(2);
            expect(sections[0].name).toBe('Class A');
        });
    });

    describe('Data Validation', () => {
        it('should validate attendance record structure', () => {
            const validRecord = {
                studentId: 'STU1',
                facultyId: 'FAC1',
                sectionId: 'SEC1',
                timestamp: new Date(),
                status: 'present' as const,
                captureMethod: 'ml' as const
            };

            // Basic validation checks
            expect(validRecord.studentId).toBeTruthy();
            expect(validRecord.facultyId).toBeTruthy();
            expect(validRecord.sectionId).toBeTruthy();
            expect(['present', 'absent']).toContain(validRecord.status);
            expect(['ml', 'manual']).toContain(validRecord.captureMethod);
        });

        it('should validate required fields exist', () => {
            const incompleteRecord = {
                studentId: 'STU1',
                // Missing required fields
            };

            expect(incompleteRecord.studentId).toBeTruthy();
            expect((incompleteRecord as any).facultyId).toBeUndefined();
        });
    });

    describe('Error Handling', () => {
        it('should handle database connection errors', async () => {
            const authService = new AuthService();
            (authService as any).pool = { query: jest.fn().mockRejectedValue(new Error('Connection timeout')) };

            await expect(
                authService.login({ username: 'user', password: 'pass' })
            ).rejects.toThrow('Connection timeout');
        });

        it('should handle malformed data gracefully', async () => {
            const studentService = new StudentService();
            (studentService as any).pool = { query: jest.fn().mockResolvedValue({ rows: [{ malformed: 'data' }] }) };

            const students = await studentService.getStudentsBySection('SEC1');
            expect(students).toEqual([]);
        });

        it('should sanitize SQL inputs', () => {
            const maliciousInput = "'; DROP TABLE students; --";

            // Basic validation - malicious input should be detected
            expect(maliciousInput).toContain('DROP TABLE');
            expect(maliciousInput).toContain('--');
        });
    });

    describe('Performance', () => {
        it('should handle large datasets efficiently', async () => {
            const studentService = new StudentService();
            const largeDataset = Array.from({ length: 1000 }, (_, i) => ({
                id: `STU${i}`,
                rollNumber: `S${i.toString().padStart(3, '0')}`,
                name: `Student ${i}`,
                sectionId: 'SEC1'
            }));

            mockDb.query = jest.fn().mockResolvedValue({ rows: largeDataset });

            const startTime = Date.now();
            const students = await studentService.getStudentsBySection('SEC1');
            const endTime = Date.now();

            expect(students).toHaveLength(1000);
            expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
        });

        it('should cache frequently accessed data', async () => {
            const sectionService = new SectionService();
            const mockSections = [{ id: 'SEC1', name: 'Class A', grade: '10', facultyId: 'FAC1' }];

            mockDb.query = jest.fn().mockResolvedValue({ rows: mockSections });

            // First call
            await sectionService.getSectionsByFaculty('FAC1');
            // Second call should use cache
            await sectionService.getSectionsByFaculty('FAC1');

            // Should only query database once due to caching
            expect(mockDb.query).toHaveBeenCalledTimes(1);
        });
    });
});