import { query } from '../database/utils';
import { AttendanceRecord } from '../types';
import { isValidUUID, isValidAttendanceStatus, isValidCaptureMethod } from '../utils/validation';

/**
 * Data integrity validation result
 */
export interface IntegrityValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
}

/**
 * Attendance record validation result
 */
export interface AttendanceValidationResult extends IntegrityValidationResult {
    sanitizedRecord?: AttendanceRecord;
}

/**
 * Service for validating data integrity and business rules
 */
export class DataIntegrityService {
    /**
     * Validate attendance record for data integrity and business rules
     */
    async validateAttendanceRecord(record: AttendanceRecord): Promise<AttendanceValidationResult> {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Basic field validation
        if (!record.studentId || typeof record.studentId !== 'string') {
            errors.push('Student ID is required and must be a string');
        } else if (!isValidUUID(record.studentId)) {
            errors.push('Student ID must be a valid UUID');
        }

        if (!record.facultyId || typeof record.facultyId !== 'string') {
            errors.push('Faculty ID is required and must be a string');
        } else if (!isValidUUID(record.facultyId)) {
            errors.push('Faculty ID must be a valid UUID');
        }

        if (!record.sectionId || typeof record.sectionId !== 'string') {
            errors.push('Section ID is required and must be a string');
        } else if (!isValidUUID(record.sectionId)) {
            errors.push('Section ID must be a valid UUID');
        }

        if (!record.timestamp || isNaN(new Date(record.timestamp).getTime())) {
            errors.push('Timestamp is required and must be a valid date');
        }

        if (!record.status || !isValidAttendanceStatus(record.status)) {
            errors.push('Status must be either "present" or "absent"');
        }

        if (!record.captureMethod || !isValidCaptureMethod(record.captureMethod)) {
            errors.push('Capture method must be either "ml" or "manual"');
        }

        // If basic validation fails, return early
        if (errors.length > 0) {
            return { isValid: false, errors, warnings };
        }

        // Advanced validation with database checks
        try {
            // Validate student exists and is active
            const studentResult = await query(
                'SELECT id, is_active, section_id FROM students WHERE id = $1',
                [record.studentId]
            );

            if (studentResult.rows.length === 0) {
                errors.push('Student not found in database');
            } else {
                const student = studentResult.rows[0];
                if (!student.is_active) {
                    errors.push('Student is not active');
                }
                if (student.section_id !== record.sectionId) {
                    errors.push('Student does not belong to the specified section');
                }
            }

            // Validate faculty exists and is active
            const facultyResult = await query(
                'SELECT id, is_active FROM faculty WHERE id = $1',
                [record.facultyId]
            );

            if (facultyResult.rows.length === 0) {
                errors.push('Faculty not found in database');
            } else {
                const faculty = facultyResult.rows[0];
                if (!faculty.is_active) {
                    errors.push('Faculty is not active');
                }
            }

            // Validate section exists and faculty has access
            const sectionResult = await query(
                'SELECT id, faculty_id FROM sections WHERE id = $1',
                [record.sectionId]
            );

            if (sectionResult.rows.length === 0) {
                errors.push('Section not found in database');
            } else {
                const section = sectionResult.rows[0];
                if (section.faculty_id !== record.facultyId) {
                    errors.push('Faculty does not have access to this section');
                }
            }

            // Validate timestamp constraints
            const recordDate = new Date(record.timestamp);
            const now = new Date();

            if (recordDate > now) {
                errors.push('Attendance timestamp cannot be in the future');
            }

            // Check if timestamp is too old (more than 30 days)
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            if (recordDate < thirtyDaysAgo) {
                warnings.push('Attendance record is more than 30 days old');
            }

            // Check for duplicate attendance on the same date
            const dateString = recordDate.toISOString().split('T')[0];
            const duplicateResult = await query(
                'SELECT id FROM attendance_logs WHERE student_id = $1 AND date = $2',
                [record.studentId, dateString]
            );

            if (duplicateResult.rows.length > 0) {
                warnings.push('Attendance record already exists for this student on this date (will be updated)');
            }

            // Business rule validations
            await this.validateBusinessRules(record, warnings);

        } catch (error) {
            errors.push(`Database validation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        // Create sanitized record if validation passes
        let sanitizedRecord: AttendanceRecord | undefined;
        if (errors.length === 0) {
            sanitizedRecord = {
                ...record,
                timestamp: record.timestamp // Keep original timestamp format
            };
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings,
            sanitizedRecord
        };
    }

    /**
     * Validate business rules for attendance records
     */
    private async validateBusinessRules(record: AttendanceRecord, warnings: string[]): Promise<void> {
        try {
            const recordDate = new Date(record.timestamp);
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // Check if marking attendance for future date
            if (recordDate > today) {
                warnings.push('Marking attendance for future date');
            }

            // Check if marking attendance very late (more than 7 days ago)
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            if (recordDate < sevenDaysAgo) {
                warnings.push('Marking attendance more than 7 days late');
            }

            // Check for unusual patterns (e.g., marking attendance outside typical school hours)
            const hour = recordDate.getHours();
            if (hour < 6 || hour > 18) {
                warnings.push('Attendance marked outside typical school hours');
            }

            // Check for weekend attendance (might be valid for some schools)
            const dayOfWeek = recordDate.getDay();
            if (dayOfWeek === 0 || dayOfWeek === 6) {
                warnings.push('Attendance marked on weekend');
            }

        } catch (error) {
            warnings.push(`Business rule validation warning: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Validate batch of attendance records
     */
    async validateAttendanceBatch(records: AttendanceRecord[]): Promise<{
        validRecords: AttendanceRecord[];
        invalidRecords: Array<{ record: AttendanceRecord; errors: string[] }>;
        warnings: string[];
    }> {
        const validRecords: AttendanceRecord[] = [];
        const invalidRecords: Array<{ record: AttendanceRecord; errors: string[] }> = [];
        const allWarnings: string[] = [];

        for (let i = 0; i < records.length; i++) {
            const record = records[i];
            const validation = await this.validateAttendanceRecord(record);

            if (validation.isValid && validation.sanitizedRecord) {
                validRecords.push(validation.sanitizedRecord);
                allWarnings.push(...validation.warnings.map(w => `Record ${i + 1}: ${w}`));
            } else {
                invalidRecords.push({
                    record,
                    errors: validation.errors
                });
            }
        }

        return {
            validRecords,
            invalidRecords,
            warnings: allWarnings
        };
    }

    /**
     * Validate student data integrity
     */
    async validateStudentData(studentData: {
        rollNumber: string;
        name: string;
        sectionId: string;
        isActive?: boolean;
    }): Promise<IntegrityValidationResult> {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Basic validation
        if (!studentData.rollNumber || typeof studentData.rollNumber !== 'string') {
            errors.push('Roll number is required and must be a string');
        } else if (studentData.rollNumber.length < 1 || studentData.rollNumber.length > 20) {
            errors.push('Roll number must be between 1 and 20 characters');
        }

        if (!studentData.name || typeof studentData.name !== 'string') {
            errors.push('Name is required and must be a string');
        } else if (studentData.name.trim().length < 1 || studentData.name.trim().length > 100) {
            errors.push('Name must be between 1 and 100 characters');
        }

        if (!studentData.sectionId || !isValidUUID(studentData.sectionId)) {
            errors.push('Section ID is required and must be a valid UUID');
        }

        // Database validation
        if (errors.length === 0) {
            try {
                // Check if section exists
                const sectionResult = await query(
                    'SELECT id FROM sections WHERE id = $1',
                    [studentData.sectionId]
                );

                if (sectionResult.rows.length === 0) {
                    errors.push('Section not found');
                }

                // Check for duplicate roll number in section
                const duplicateResult = await query(
                    'SELECT id FROM students WHERE roll_number = $1 AND section_id = $2 AND is_active = true',
                    [studentData.rollNumber, studentData.sectionId]
                );

                if (duplicateResult.rows.length > 0) {
                    errors.push('Student with this roll number already exists in the section');
                }

            } catch (error) {
                errors.push(`Database validation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Validate faculty data integrity
     */
    async validateFacultyData(facultyData: {
        username: string;
        name: string;
        email: string;
    }): Promise<IntegrityValidationResult> {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Basic validation
        if (!facultyData.username || typeof facultyData.username !== 'string') {
            errors.push('Username is required and must be a string');
        } else if (facultyData.username.length < 3 || facultyData.username.length > 50) {
            errors.push('Username must be between 3 and 50 characters');
        }

        if (!facultyData.name || typeof facultyData.name !== 'string') {
            errors.push('Name is required and must be a string');
        } else if (facultyData.name.trim().length < 1 || facultyData.name.trim().length > 100) {
            errors.push('Name must be between 1 and 100 characters');
        }

        if (!facultyData.email || typeof facultyData.email !== 'string') {
            errors.push('Email is required and must be a string');
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(facultyData.email)) {
            errors.push('Email must be a valid email address');
        }

        // Database validation
        if (errors.length === 0) {
            try {
                // Check for duplicate username
                const usernameResult = await query(
                    'SELECT id FROM faculty WHERE username = $1',
                    [facultyData.username]
                );

                if (usernameResult.rows.length > 0) {
                    errors.push('Username already exists');
                }

                // Check for duplicate email
                const emailResult = await query(
                    'SELECT id FROM faculty WHERE email = $1',
                    [facultyData.email]
                );

                if (emailResult.rows.length > 0) {
                    errors.push('Email already exists');
                }

            } catch (error) {
                errors.push(`Database validation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }
}