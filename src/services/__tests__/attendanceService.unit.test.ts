import { AttendanceService } from '../attendanceService';
import { Pool } from 'pg';

// Mock the database connection
jest.mock('../database/connection', () => ({
    getPool: jest.fn(() => ({
        query: jest.fn(),
        connect: jest.fn(),
        end: jest.fn()
    }))
}));

describe('AttendanceService Unit Tests', () => {
    let attendanceService: AttendanceService;
    let mockPool: jest.Mocked<Pool>;

    beforeEach(() => {
        mockPool = {
            query: jest.fn(),
            connect: jest.fn(),
            end: jest.fn()
        } as any;

        // Mock the getPool function to return our mock
        const { getPool } = require('../database/connection');
        getPool.mockReturnValue(mockPool);

        attendanceService = new AttendanceService();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('syncAttendanceRecords', () => {
        const mockAttendanceRecords = [
            {
                studentId: 'student-1',
                facultyId: 'faculty-1',
                sectionId: 'section-1',
                timestamp: new Date('2024-01-15T10:00:00Z'),
                status: 'present' as const,
                captureMethod: 'ml' as const,
                syncStatus: 'pending' as const
            },
            {
                studentId: 'student-2',
                facultyId: 'faculty-1',
                sectionId: 'section-1',
                timestamp: new Date('2024-01-15T10:05:00Z'),
                status: 'absent' as const,
                captureMethod: 'manual' as const,
                syncStatus: 'pending' as const
            }
        ];

        it('should sync attendance records successfully', async () => {
            mockPool.query.mockResolvedValue({
                rows: [{ id: 'log-1' }, { id: 'log-2' }],
                rowCount: 2
            });

            const result = await attendanceService.syncAttendanceRecords(mockAttendanceRecords);

            expect(result.success).toBe(true);
            expect(result.syncedCount).toBe(2);
            expect(result.failedCount).toBe(0);
            expect(mockPool.query).toHaveBeenCalledTimes(2);
        });

        it('should handle partial sync failures', async () => {
            mockPool.query
                .mockResolvedValueOnce({ rows: [{ id: 'log-1' }], rowCount: 1 })
                .mockRejectedValueOnce(new Error('Database constraint violation'));

            const result = await attendanceService.syncAttendanceRecords(mockAttendanceRecords);

            expect(result.success).toBe(false);
            expect(result.syncedCount).toBe(1);
            expect(result.failedCount).toBe(1);
            expect(result.errors).toHaveLength(1);
        });

        it('should handle duplicate record conflicts', async () => {
            const duplicateError = new Error('duplicate key value violates unique constraint');
            mockPool.query.mockRejectedValue(duplicateError);

            const result = await attendanceService.syncAttendanceRecords(mockAttendanceRecords);

            expect(result.success).toBe(false);
            expect(result.failedCount).toBe(2);
            expect(result.errors[0].error).toContain('duplicate key');
        });

        it('should validate attendance records before sync', async () => {
            const invalidRecords = [
                {
                    ...mockAttendanceRecords[0],
                    studentId: '' // Invalid empty student ID
                }
            ];

            const result = await attendanceService.syncAttendanceRecords(invalidRecords);

            expect(result.success).toBe(false);
            expect(result.failedCount).toBe(1);
            expect(result.errors[0].error).toContain('validation');
        });

        it('should handle database connection errors', async () => {
            mockPool.query.mockRejectedValue(new Error('Connection timeout'));

            const result = await attendanceService.syncAttendanceRecords(mockAttendanceRecords);

            expect(result.success).toBe(false);
            expect(result.failedCount).toBe(2);
            expect(result.errors.every(e => e.error.includes('Connection timeout'))).toBe(true);
        });
    });

    describe('getAttendanceHistory', () => {
        it('should retrieve attendance history for student', async () => {
            const mockAttendanceHistory = [
                {
                    id: 'log-1',
                    student_id: 'student-1',
                    faculty_id: 'faculty-1',
                    section_id: 'section-1',
                    date: '2024-01-15',
                    status: 'present',
                    capture_method: 'ml',
                    synced_at: '2024-01-15T10:00:00Z'
                }
            ];

            mockPool.query.mockResolvedValue({
                rows: mockAttendanceHistory,
                rowCount: 1
            });

            const history = await attendanceService.getAttendanceHistory('student-1');

            expect(history).toHaveLength(1);
            expect(history[0].student_id).toBe('student-1');
            expect(mockPool.query).toHaveBeenCalledWith(
                expect.stringContaining('SELECT * FROM attendance_logs'),
                ['student-1']
            );
        });

        it('should return empty array for student with no attendance', async () => {
            mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

            const history = await attendanceService.getAttendanceHistory('student-no-attendance');

            expect(history).toHaveLength(0);
        });

        it('should handle database query errors', async () => {
            mockPool.query.mockRejectedValue(new Error('Query execution failed'));

            await expect(
                attendanceService.getAttendanceHistory('student-1')
            ).rejects.toThrow('Failed to retrieve attendance history');
        });
    });

    describe('validateAttendanceRecord', () => {
        it('should validate valid attendance record', () => {
            const validRecord = {
                studentId: 'student-1',
                facultyId: 'faculty-1',
                sectionId: 'section-1',
                timestamp: new Date(),
                status: 'present' as const,
                captureMethod: 'ml' as const,
                syncStatus: 'pending' as const
            };

            const result = attendanceService.validateAttendanceRecord(validRecord);

            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should reject record with missing required fields', () => {
            const invalidRecord = {
                studentId: '',
                facultyId: 'faculty-1',
                sectionId: 'section-1',
                timestamp: new Date(),
                status: 'present' as const,
                captureMethod: 'ml' as const,
                syncStatus: 'pending' as const
            };

            const result = attendanceService.validateAttendanceRecord(invalidRecord);

            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Student ID is required');
        });

        it('should reject record with invalid status', () => {
            const invalidRecord = {
                studentId: 'student-1',
                facultyId: 'faculty-1',
                sectionId: 'section-1',
                timestamp: new Date(),
                status: 'invalid-status' as any,
                captureMethod: 'ml' as const,
                syncStatus: 'pending' as const
            };

            const result = attendanceService.validateAttendanceRecord(invalidRecord);

            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Invalid attendance status');
        });

        it('should reject record with future timestamp', () => {
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + 1);

            const invalidRecord = {
                studentId: 'student-1',
                facultyId: 'faculty-1',
                sectionId: 'section-1',
                timestamp: futureDate,
                status: 'present' as const,
                captureMethod: 'ml' as const,
                syncStatus: 'pending' as const
            };

            const result = attendanceService.validateAttendanceRecord(invalidRecord);

            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Timestamp cannot be in the future');
        });
    });

    describe('getAttendanceStatistics', () => {
        it('should calculate attendance statistics', async () => {
            const mockStats = [
                {
                    student_id: 'student-1',
                    total_days: 20,
                    present_days: 18,
                    absent_days: 2,
                    attendance_percentage: 90.0
                }
            ];

            mockPool.query.mockResolvedValue({ rows: mockStats, rowCount: 1 });

            const stats = await attendanceService.getAttendanceStatistics('section-1', '2024-01-01', '2024-01-31');

            expect(stats).toHaveLength(1);
            expect(stats[0].attendance_percentage).toBe(90.0);
            expect(mockPool.query).toHaveBeenCalledWith(
                expect.stringContaining('SELECT'),
                ['section-1', '2024-01-01', '2024-01-31']
            );
        });

        it('should handle empty statistics', async () => {
            mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

            const stats = await attendanceService.getAttendanceStatistics('empty-section', '2024-01-01', '2024-01-31');

            expect(stats).toHaveLength(0);
        });
    });
});