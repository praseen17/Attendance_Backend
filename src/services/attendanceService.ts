import { Pool } from 'pg';
import { getPool } from '../database/connection';
import { AttendanceRecord } from '../types';

export interface SyncResult {
    success: boolean;
    syncedCount: number;
    failedCount: number;
    errors: Array<{
        recordIndex: number;
        error: string;
    }>;
}

export interface ValidationResult {
    isValid: boolean;
    errors: string[];
}

export interface AttendanceStatistics {
    student_id: string;
    total_days: number;
    present_days: number;
    absent_days: number;
    attendance_percentage: number;
}

export class AttendanceService {
    private pool: Pool;

    constructor() {
        this.pool = getPool();
    }

    /**
     * Sync attendance records from mobile app to database
     */
    async syncAttendanceRecords(records: AttendanceRecord[]): Promise<SyncResult> {
        const result: SyncResult = {
            success: true,
            syncedCount: 0,
            failedCount: 0,
            errors: []
        };

        for (let i = 0; i < records.length; i++) {
            const record = records[i];

            try {
                // Validate record before insertion
                const validation = this.validateAttendanceRecord(record);
                if (!validation.isValid) {
                    throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
                }

                // Insert attendance record
                const query = `
                    INSERT INTO attendance_logs (student_id, faculty_id, section_id, date, status, capture_method)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    ON CONFLICT (student_id, date) 
                    DO UPDATE SET 
                        status = EXCLUDED.status,
                        capture_method = EXCLUDED.capture_method,
                        synced_at = CURRENT_TIMESTAMP
                    RETURNING id
                `;

                const values = [
                    record.studentId,
                    record.facultyId,
                    record.sectionId,
                    record.timestamp.toISOString().split('T')[0], // Extract date part
                    record.status,
                    record.captureMethod
                ];

                await this.pool.query(query, values);
                result.syncedCount++;

            } catch (error) {
                result.success = false;
                result.failedCount++;
                result.errors.push({
                    recordIndex: i,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }

        return result;
    }

    /**
     * Get attendance history for a student
     */
    async getAttendanceHistory(studentId: string): Promise<any[]> {
        try {
            const query = `
                SELECT * FROM attendance_logs 
                WHERE student_id = $1 
                ORDER BY date DESC
            `;

            const result = await this.pool.query(query, [studentId]);
            return result.rows;

        } catch (error) {
            console.error('Get attendance history error:', error);
            throw new Error('Failed to retrieve attendance history');
        }
    }

    /**
     * Validate attendance record
     */
    validateAttendanceRecord(record: AttendanceRecord): ValidationResult {
        const errors: string[] = [];

        // Check required fields
        if (!record.studentId || record.studentId.trim() === '') {
            errors.push('Student ID is required');
        }

        if (!record.facultyId || record.facultyId.trim() === '') {
            errors.push('Faculty ID is required');
        }

        if (!record.sectionId || record.sectionId.trim() === '') {
            errors.push('Section ID is required');
        }

        if (!record.timestamp) {
            errors.push('Timestamp is required');
        } else if (record.timestamp > new Date()) {
            errors.push('Timestamp cannot be in the future');
        }

        // Validate status
        if (!['present', 'absent'].includes(record.status)) {
            errors.push('Invalid attendance status');
        }

        // Validate capture method
        if (!['ml', 'manual'].includes(record.captureMethod)) {
            errors.push('Invalid capture method');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Get attendance statistics for a section
     */
    async getAttendanceStatistics(sectionId: string, startDate: string, endDate: string): Promise<AttendanceStatistics[]> {
        try {
            const query = `
                SELECT 
                    student_id,
                    COUNT(*) as total_days,
                    COUNT(CASE WHEN status = 'present' THEN 1 END) as present_days,
                    COUNT(CASE WHEN status = 'absent' THEN 1 END) as absent_days,
                    ROUND(
                        (COUNT(CASE WHEN status = 'present' THEN 1 END) * 100.0) / COUNT(*), 
                        2
                    ) as attendance_percentage
                FROM attendance_logs 
                WHERE section_id = $1 
                AND date BETWEEN $2 AND $3
                GROUP BY student_id
                ORDER BY attendance_percentage DESC
            `;

            const result = await this.pool.query(query, [sectionId, startDate, endDate]);
            return result.rows as AttendanceStatistics[];

        } catch (error) {
            console.error('Get attendance statistics error:', error);
            throw new Error('Failed to retrieve attendance statistics');
        }
    }

    /**
     * Get attendance summary for a date range
     */
    async getAttendanceSummary(sectionId: string, startDate: string, endDate: string): Promise<{
        totalStudents: number;
        totalDays: number;
        averageAttendance: number;
        presentCount: number;
        absentCount: number;
    }> {
        try {
            const query = `
                SELECT 
                    COUNT(DISTINCT student_id) as total_students,
                    COUNT(DISTINCT date) as total_days,
                    COUNT(CASE WHEN status = 'present' THEN 1 END) as present_count,
                    COUNT(CASE WHEN status = 'absent' THEN 1 END) as absent_count,
                    ROUND(
                        (COUNT(CASE WHEN status = 'present' THEN 1 END) * 100.0) / COUNT(*), 
                        2
                    ) as average_attendance
                FROM attendance_logs 
                WHERE section_id = $1 
                AND date BETWEEN $2 AND $3
            `;

            const result = await this.pool.query(query, [sectionId, startDate, endDate]);
            const row = result.rows[0];

            return {
                totalStudents: parseInt(row.total_students) || 0,
                totalDays: parseInt(row.total_days) || 0,
                averageAttendance: parseFloat(row.average_attendance) || 0,
                presentCount: parseInt(row.present_count) || 0,
                absentCount: parseInt(row.absent_count) || 0
            };

        } catch (error) {
            console.error('Get attendance summary error:', error);
            throw new Error('Failed to retrieve attendance summary');
        }
    }
}