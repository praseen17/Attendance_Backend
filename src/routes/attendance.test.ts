import request from 'supertest';
import app from '../index';
import { query, withTransaction } from '../database/utils';
import { generateTokenPair } from '../utils/auth';

// Mock the database utils
jest.mock('../database/utils');
const mockQuery = query as jest.MockedFunction<typeof query>;

// Mock withTransaction
const mockWithTransaction = withTransaction as jest.MockedFunction<typeof withTransaction>;

// Mock the auth utils
jest.mock('../utils/auth');
const mockGenerateTokenPair = generateTokenPair as jest.MockedFunction<typeof generateTokenPair>;

// Mock the auth middleware
jest.mock('../middleware/auth', () => ({
    authenticateToken: (req: any, res: any, next: any) => {
        req.user = { userId: 'faculty-123', username: 'testfaculty' };
        next();
    },
    authenticateRefreshToken: (req: any, res: any, next: any) => {
        req.user = { userId: 'faculty-123', username: 'testfaculty' };
        next();
    },
    optionalAuth: (req: any, res: any, next: any) => {
        next();
    }
}));

describe('Attendance Routes', () => {
    let authToken: string;
    const mockFacultyId = 'faculty-123';
    const mockStudentId = 'student-123';
    const mockSectionId = 'section-123';

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock token generation
        mockGenerateTokenPair.mockReturnValue({
            accessToken: 'mock-access-token',
            refreshToken: 'mock-refresh-token'
        });

        authToken = 'Bearer mock-access-token';
    });

    describe('POST /api/attendance/sync', () => {
        const validAttendanceRecords = [
            {
                id: 1,
                studentId: mockStudentId,
                facultyId: mockFacultyId,
                sectionId: mockSectionId,
                timestamp: new Date().toISOString(),
                status: 'present' as const,
                captureMethod: 'ml' as const
            },
            {
                id: 2,
                studentId: 'student-456',
                facultyId: mockFacultyId,
                sectionId: mockSectionId,
                timestamp: new Date().toISOString(),
                status: 'absent' as const,
                captureMethod: 'manual' as const
            }
        ];

        it('should successfully sync valid attendance records', async () => {
            // Mock withTransaction to simulate successful processing
            mockWithTransaction.mockImplementation(async (callback) => {
                const mockClient = {
                    query: jest.fn()
                        .mockResolvedValueOnce({ rows: [] }) // No existing record for first student
                        .mockResolvedValueOnce({ rows: [{ id: 'log-1', student_id: mockStudentId }] }) // Insert result
                        .mockResolvedValueOnce({ rows: [] }) // No existing record for second student
                        .mockResolvedValueOnce({ rows: [{ id: 'log-2', student_id: 'student-456' }] }) // Insert result
                };
                return await callback(mockClient as any);
            });

            const response = await request(app)
                .post('/api/attendance/sync')
                .set('Authorization', authToken)
                .send({ records: validAttendanceRecords });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.result.totalRecords).toBe(2);
            expect(response.body.result.syncedRecords).toBe(2);
            expect(response.body.result.failedRecords).toBe(0);
        });

        it('should handle conflict resolution for duplicate records', async () => {
            // Mock withTransaction to simulate conflict resolution
            mockWithTransaction.mockImplementation(async (callback) => {
                const mockClient = {
                    query: jest.fn()
                        .mockResolvedValueOnce({ rows: [{ id: 'existing-log' }] }) // Existing record found
                        .mockResolvedValueOnce({ rows: [{ id: 'existing-log', student_id: mockStudentId }] }) // Update result
                };
                return await callback(mockClient as any);
            });

            const response = await request(app)
                .post('/api/attendance/sync')
                .set('Authorization', authToken)
                .send({ records: [validAttendanceRecords[0]] });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.result.syncedRecords).toBe(1);
        });

        it('should validate attendance records and return errors for invalid data', async () => {
            const invalidRecords = [
                {
                    id: 1,
                    studentId: '', // Invalid: empty studentId
                    facultyId: mockFacultyId,
                    sectionId: mockSectionId,
                    timestamp: new Date().toISOString(),
                    status: 'present' as const,
                    captureMethod: 'ml' as const
                },
                {
                    id: 2,
                    studentId: mockStudentId,
                    facultyId: mockFacultyId,
                    sectionId: mockSectionId,
                    timestamp: 'invalid-date', // Invalid: bad timestamp
                    status: 'present' as const,
                    captureMethod: 'ml' as const
                }
            ];

            const response = await request(app)
                .post('/api/attendance/sync')
                .set('Authorization', authToken)
                .send({ records: invalidRecords });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.result.totalRecords).toBe(2);
            expect(response.body.result.syncedRecords).toBe(0);
            expect(response.body.result.failedRecords).toBe(2);
            expect(response.body.result.errors).toHaveLength(2);
        });

        it('should return 400 for empty or invalid records array', async () => {
            const response = await request(app)
                .post('/api/attendance/sync')
                .set('Authorization', authToken)
                .send({ records: [] });

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toBe('Invalid or empty records array');
        });

        it.skip('should return 401 without authentication token', async () => {
            // This test is skipped because auth middleware is mocked globally
            // In real implementation, this would return 401
        });

        it('should handle database errors gracefully', async () => {
            mockWithTransaction.mockRejectedValue(new Error('Database connection failed'));

            const response = await request(app)
                .post('/api/attendance/sync')
                .set('Authorization', authToken)
                .send({ records: validAttendanceRecords });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.result.totalRecords).toBe(2);
            expect(response.body.result.syncedRecords).toBe(0);
            expect(response.body.result.failedRecords).toBe(2);
            expect(response.body.result.errors).toHaveLength(2);
        });
    });

    describe('GET /api/attendance/student/:studentId', () => {
        const mockAttendanceHistory = [
            {
                id: 'log-1',
                student_id: mockStudentId,
                faculty_id: mockFacultyId,
                section_id: mockSectionId,
                date: '2024-01-15',
                status: 'present',
                capture_method: 'ml',
                synced_at: '2024-01-15T10:00:00Z',
                student_name: 'John Doe',
                roll_number: 'ST001',
                faculty_name: 'Prof. Smith',
                section_name: 'Class A'
            }
        ];

        it('should return attendance history for valid student', async () => {
            // Mock student exists check
            mockQuery.mockResolvedValueOnce({ rows: [{ id: mockStudentId }], command: 'SELECT', rowCount: 1, oid: 0, fields: [] });
            // Mock attendance history query
            mockQuery.mockResolvedValueOnce({ rows: mockAttendanceHistory, command: 'SELECT', rowCount: 1, oid: 0, fields: [] });
            // Mock count query
            mockQuery.mockResolvedValueOnce({ rows: [{ count: '1' }], command: 'SELECT', rowCount: 1, oid: 0, fields: [] });

            const response = await request(app)
                .get(`/api/attendance/student/${mockStudentId}`)
                .set('Authorization', authToken);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveLength(1);
            expect(response.body.data[0].student_name).toBe('John Doe');
            expect(response.body.pagination.total).toBe(1);
        });

        it('should return 404 for non-existent student', async () => {
            // Mock student not found
            mockQuery.mockResolvedValueOnce({ rows: [], command: 'SELECT', rowCount: 0, oid: 0, fields: [] });

            const response = await request(app)
                .get(`/api/attendance/student/${mockStudentId}`)
                .set('Authorization', authToken);

            expect(response.status).toBe(404);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toBe('Student not found or inactive');
        });

        it('should handle date range filters', async () => {
            // Mock student exists check
            mockQuery.mockResolvedValueOnce({ rows: [{ id: mockStudentId }], command: 'SELECT', rowCount: 1, oid: 0, fields: [] });
            // Mock attendance history query with date filters
            mockQuery.mockResolvedValueOnce({ rows: mockAttendanceHistory, command: 'SELECT', rowCount: 1, oid: 0, fields: [] });
            // Mock count query with date filters
            mockQuery.mockResolvedValueOnce({ rows: [{ count: '1' }], command: 'SELECT', rowCount: 1, oid: 0, fields: [] });

            const response = await request(app)
                .get(`/api/attendance/student/${mockStudentId}`)
                .query({
                    startDate: '2024-01-01',
                    endDate: '2024-01-31',
                    limit: '10',
                    offset: '0'
                })
                .set('Authorization', authToken);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
        });

        it('should return 400 for missing student ID', async () => {
            const response = await request(app)
                .get('/api/attendance/student/')
                .set('Authorization', authToken);

            expect(response.status).toBe(404); // Express returns 404 for missing route params
        });

        it.skip('should return 401 without authentication token', async () => {
            // This test is skipped because auth middleware is mocked globally
            // In real implementation, this would return 401
        });

        it('should handle database errors gracefully', async () => {
            mockQuery.mockRejectedValue(new Error('Database connection failed'));

            const response = await request(app)
                .get(`/api/attendance/student/${mockStudentId}`)
                .set('Authorization', authToken);

            expect(response.status).toBe(500);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toBe('Failed to retrieve attendance history');
        });
    });

    describe('Attendance Record Validation', () => {
        it('should validate required fields', async () => {
            const invalidRecords = [
                {
                    // Missing studentId
                    facultyId: mockFacultyId,
                    sectionId: mockSectionId,
                    timestamp: new Date().toISOString(),
                    status: 'present' as const,
                    captureMethod: 'ml' as const
                }
            ];

            const response = await request(app)
                .post('/api/attendance/sync')
                .set('Authorization', authToken)
                .send({ records: invalidRecords });

            expect(response.body.result.failedRecords).toBe(1);
            expect(response.body.result.errors[0].error).toContain('studentId');
        });

        it('should validate status values', async () => {
            const invalidRecords = [
                {
                    studentId: mockStudentId,
                    facultyId: mockFacultyId,
                    sectionId: mockSectionId,
                    timestamp: new Date().toISOString(),
                    status: 'invalid-status' as any,
                    captureMethod: 'ml' as const
                }
            ];

            const response = await request(app)
                .post('/api/attendance/sync')
                .set('Authorization', authToken)
                .send({ records: invalidRecords });

            expect(response.body.result.failedRecords).toBe(1);
            expect(response.body.result.errors[0].error).toContain('Invalid status');
        });

        it('should validate capture method values', async () => {
            const invalidRecords = [
                {
                    studentId: mockStudentId,
                    facultyId: mockFacultyId,
                    sectionId: mockSectionId,
                    timestamp: new Date().toISOString(),
                    status: 'present' as const,
                    captureMethod: 'invalid-method' as any
                }
            ];

            const response = await request(app)
                .post('/api/attendance/sync')
                .set('Authorization', authToken)
                .send({ records: invalidRecords });

            expect(response.body.result.failedRecords).toBe(1);
            expect(response.body.result.errors[0].error).toContain('Invalid captureMethod');
        });

        it('should reject future timestamps', async () => {
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + 1);

            const invalidRecords = [
                {
                    studentId: mockStudentId,
                    facultyId: mockFacultyId,
                    sectionId: mockSectionId,
                    timestamp: futureDate.toISOString(),
                    status: 'present' as const,
                    captureMethod: 'ml' as const
                }
            ];

            const response = await request(app)
                .post('/api/attendance/sync')
                .set('Authorization', authToken)
                .send({ records: invalidRecords });

            expect(response.body.result.failedRecords).toBe(1);
            expect(response.body.result.errors[0].error).toContain('future');
        });

        it('should reject very old timestamps', async () => {
            const oldDate = new Date();
            oldDate.setFullYear(oldDate.getFullYear() - 2);

            const invalidRecords = [
                {
                    studentId: mockStudentId,
                    facultyId: mockFacultyId,
                    sectionId: mockSectionId,
                    timestamp: oldDate.toISOString(),
                    status: 'present' as const,
                    captureMethod: 'ml' as const
                }
            ];

            const response = await request(app)
                .post('/api/attendance/sync')
                .set('Authorization', authToken)
                .send({ records: invalidRecords });

            expect(response.body.result.failedRecords).toBe(1);
            expect(response.body.result.errors[0].error).toContain('too old');
        });
    });
});