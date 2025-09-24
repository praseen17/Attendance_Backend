import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { query, withTransaction, batchInsert } from '../database/utils';
import { AttendanceRecord, SyncResult, SyncError } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { validateRequest, RequiredFieldRule, ArrayValidationRule, UUIDValidationRule } from '../middleware/validation';
import { syncRateLimit, managementRateLimit } from '../middleware/rateLimiting';
import { DataIntegrityService } from '../services/dataIntegrityService';
import { validatePaginationParams, validateDateRange } from '../utils/validation';

const router = Router();
const dataIntegrityService = new DataIntegrityService();

// Apply authentication middleware to all attendance routes
router.use(authenticateToken);

/**
 * POST /api/attendance/sync
 * Bulk upload attendance records from mobile app
 */
router.post('/sync',
    syncRateLimit,
    validateRequest([
        new RequiredFieldRule('records'),
        new ArrayValidationRule('records', 1, 100) // Limit batch size to 100 records
    ]),
    async (req: Request, res: Response): Promise<void> => {
        try {
            const records: AttendanceRecord[] = req.body.records;

            // Use comprehensive data integrity validation
            const batchValidation = await dataIntegrityService.validateAttendanceBatch(records);

            const validRecords = batchValidation.validRecords;
            const validationErrors: SyncError[] = batchValidation.invalidRecords.map((invalid, index) => ({
                recordId: invalid.record.id || index,
                error: invalid.errors.join('; '),
                retryCount: 0,
                timestamp: new Date()
            }));

            let syncedRecords: any[] = [];
            let syncErrors: SyncError[] = [...validationErrors];

            if (validRecords.length > 0) {
                try {
                    // Process records individually (not in a single transaction to allow partial success)
                    const processedRecords: any[] = [];

                    for (const record of validRecords) {
                        try {
                            await withTransaction(async (client) => {
                                // Check for existing record (conflict resolution)
                                const existingRecord = await client.query(
                                    `SELECT id FROM attendance_logs 
                                 WHERE student_id = $1 AND date = $2`,
                                    [record.studentId, new Date(record.timestamp).toDateString()]
                                );

                                let result;
                                if (existingRecord.rows.length > 0) {
                                    // Update existing record (latest timestamp wins)
                                    result = await client.query(
                                        `UPDATE attendance_logs 
                                     SET status = $1, capture_method = $2, synced_at = CURRENT_TIMESTAMP,
                                         faculty_id = $3, section_id = $4
                                     WHERE student_id = $5 AND date = $6
                                     RETURNING *`,
                                        [
                                            record.status,
                                            record.captureMethod,
                                            record.facultyId,
                                            record.sectionId,
                                            record.studentId,
                                            new Date(record.timestamp).toDateString()
                                        ]
                                    );
                                } else {
                                    // Insert new record
                                    result = await client.query(
                                        `INSERT INTO attendance_logs 
                                     (id, student_id, faculty_id, section_id, date, status, capture_method, synced_at)
                                     VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
                                     RETURNING *`,
                                        [
                                            uuidv4(),
                                            record.studentId,
                                            record.facultyId,
                                            record.sectionId,
                                            new Date(record.timestamp).toDateString(),
                                            record.status,
                                            record.captureMethod
                                        ]
                                    );
                                }

                                processedRecords.push(result.rows[0]);
                            });
                        } catch (error) {
                            syncErrors.push({
                                recordId: record.id || 0,
                                error: `Database error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                                retryCount: 0,
                                timestamp: new Date()
                            });
                        }
                    }

                    syncedRecords = processedRecords;
                } catch (error) {
                    console.error('Transaction failed:', error);
                    res.status(500).json({
                        success: false,
                        error: 'Failed to sync attendance records',
                        details: error instanceof Error ? error.message : 'Unknown error'
                    });
                    return;
                }
            }

            const syncResult: SyncResult = {
                totalRecords: records.length,
                syncedRecords: syncedRecords.length,
                failedRecords: syncErrors.length,
                errors: syncErrors
            };

            res.json({
                success: true,
                result: syncResult,
                data: syncedRecords
            });

        } catch (error) {
            console.error('Sync endpoint error:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error during sync',
                details: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });

/**
 * GET /api/attendance/student/:studentId
 * Get attendance history for a specific student
 */
router.get('/student/:studentId',
    managementRateLimit,
    validateRequest([
        new UUIDValidationRule('studentId', 'params')
    ]),
    async (req: Request, res: Response): Promise<void> => {
        try {
            const { studentId } = req.params;
            const { startDate, endDate, limit = '50', offset = '0' } = req.query;

            // Validate pagination parameters
            const paginationValidation = validatePaginationParams(limit as string, offset as string);
            if (!paginationValidation.isValid) {
                res.status(400).json({
                    success: false,
                    error: 'Invalid pagination parameters',
                    details: paginationValidation.errors
                });
                return;
            }

            // Validate date range if provided
            const dateValidation = validateDateRange(startDate as string, endDate as string);
            if (!dateValidation.isValid) {
                res.status(400).json({
                    success: false,
                    error: 'Invalid date range',
                    details: dateValidation.errors
                });
                return;
            }

            // Validate student exists
            const studentExists = await query(
                'SELECT id FROM students WHERE id = $1 AND is_active = true',
                [studentId]
            );

            if (studentExists.rows.length === 0) {
                res.status(404).json({
                    success: false,
                    error: 'Student not found or inactive'
                });
                return;
            }

            // Build query with optional date filters
            let queryText = `
            SELECT 
                al.*,
                s.name as student_name,
                s.roll_number,
                f.name as faculty_name,
                sec.name as section_name
            FROM attendance_logs al
            JOIN students s ON al.student_id = s.id
            JOIN faculty f ON al.faculty_id = f.id
            JOIN sections sec ON al.section_id = sec.id
            WHERE al.student_id = $1
        `;

            const queryParams: any[] = [studentId];
            let paramIndex = 2;

            if (startDate) {
                queryText += ` AND al.date >= $${paramIndex}`;
                queryParams.push(startDate);
                paramIndex++;
            }

            if (endDate) {
                queryText += ` AND al.date <= $${paramIndex}`;
                queryParams.push(endDate);
                paramIndex++;
            }

            queryText += ` ORDER BY al.date DESC, al.synced_at DESC`;
            queryText += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
            queryParams.push(parseInt(limit as string), parseInt(offset as string));

            const result = await query(queryText, queryParams);

            // Get total count for pagination
            let countQuery = `
            SELECT COUNT(*) 
            FROM attendance_logs 
            WHERE student_id = $1
        `;
            const countParams: any[] = [studentId];
            let countParamIndex = 2;

            if (startDate) {
                countQuery += ` AND date >= $${countParamIndex}`;
                countParams.push(startDate);
                countParamIndex++;
            }

            if (endDate) {
                countQuery += ` AND date <= $${countParamIndex}`;
                countParams.push(endDate);
            }

            const countResult = await query(countQuery, countParams);
            const totalRecords = parseInt(countResult.rows[0].count);

            res.json({
                success: true,
                data: result.rows,
                pagination: {
                    total: totalRecords,
                    limit: parseInt(limit as string),
                    offset: parseInt(offset as string),
                    hasMore: parseInt(offset as string) + result.rows.length < totalRecords
                }
            });

        } catch (error) {
            console.error('Get attendance history error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to retrieve attendance history',
                details: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });

/**
 * Validate attendance record data
 */
function validateAttendanceRecord(record: AttendanceRecord): { isValid: boolean; error?: string } {
    if (!record.studentId || typeof record.studentId !== 'string') {
        return { isValid: false, error: 'Invalid or missing studentId' };
    }

    if (!record.facultyId || typeof record.facultyId !== 'string') {
        return { isValid: false, error: 'Invalid or missing facultyId' };
    }

    if (!record.sectionId || typeof record.sectionId !== 'string') {
        return { isValid: false, error: 'Invalid or missing sectionId' };
    }

    if (!record.timestamp || isNaN(new Date(record.timestamp).getTime())) {
        return { isValid: false, error: 'Invalid or missing timestamp' };
    }

    if (!record.status || !['present', 'absent'].includes(record.status)) {
        return { isValid: false, error: 'Invalid status. Must be "present" or "absent"' };
    }

    if (!record.captureMethod || !['ml', 'manual'].includes(record.captureMethod)) {
        return { isValid: false, error: 'Invalid captureMethod. Must be "ml" or "manual"' };
    }

    // Validate timestamp is not in the future
    const recordDate = new Date(record.timestamp);
    const now = new Date();
    if (recordDate > now) {
        return { isValid: false, error: 'Timestamp cannot be in the future' };
    }

    // Validate timestamp is not too old (e.g., more than 1 year ago)
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    if (recordDate < oneYearAgo) {
        return { isValid: false, error: 'Timestamp is too old (more than 1 year ago)' };
    }

    return { isValid: true };
}

export default router;