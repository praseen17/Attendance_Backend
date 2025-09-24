import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { query, withTransaction } from '../database/utils';
import { v4 as uuidv4 } from 'uuid';
import { validateRequest, RequiredFieldRule, TypeValidationRule, UUIDValidationRule } from '../middleware/validation';
import { syncRateLimit } from '../middleware/rateLimiting';
import { mlApiService } from '../services/mlApiService';
import { CreateAttendanceLogInput } from '../database/models';

const router = Router();

// Apply authentication middleware to all routes
router.use(authenticateToken);

/**
 * POST /api/attendance-face/mark
 * Mark attendance using face detection and liveness detection
 * This endpoint processes face detection, liveness detection, and marks attendance
 */
router.post('/mark',
    syncRateLimit,
    validateRequest([
        new RequiredFieldRule('imageData'),
        new RequiredFieldRule('sectionId'),
        new TypeValidationRule('imageData', 'string'),
        new UUIDValidationRule('sectionId')
    ]),
    async (req: Request, res: Response): Promise<void> => {
        try {
            const { imageData, sectionId } = req.body;
            const facultyId = (req as any).user.id; // From auth middleware

            // Validate image format
            if (!imageData || typeof imageData !== 'string' || !imageData.startsWith('data:image/')) {
                res.status(400).json({
                    success: false,
                    error: 'Invalid image format. Must be a valid base64 encoded image.'
                });
                return;
            }

            // Validate section exists
            const sectionResult = await query(
                'SELECT id, name FROM sections WHERE id = $1',
                [sectionId]
            );

            if (sectionResult.rows.length === 0) {
                res.status(404).json({
                    success: false,
                    error: 'Section not found'
                });
                return;
            }

            const section = sectionResult.rows[0];

            // Call ML API for face recognition and liveness detection
            let mlResult;
            try {
                mlResult = await mlApiService.analyzeFace({
                    imageData,
                    sectionId,
                    facultyId
                });
            } catch (mlError) {
                console.error('ML API error:', mlError);
                res.status(500).json({
                    success: false,
                    error: 'Face detection service unavailable',
                    details: mlError instanceof Error ? mlError.message : 'Unknown ML error'
                });
                return;
            }

            // Check if face was detected and liveness was confirmed
            if (!mlResult.success) {
                res.status(400).json({
                    success: false,
                    error: 'Face detection failed',
                    details: mlResult.error || 'No face detected or liveness check failed'
                });
                return;
            }

            if (!mlResult.studentId) {
                res.status(404).json({
                    success: false,
                    error: 'Student not recognized',
                    details: 'Face detected but student not found in database'
                });
                return;
            }

            // Validate student exists and is in the correct section
            const studentResult = await query(
                'SELECT id, name, roll_number FROM students WHERE id = $1 AND section_id = $2 AND is_active = true',
                [mlResult.studentId, sectionId]
            );

            if (studentResult.rows.length === 0) {
                res.status(404).json({
                    success: false,
                    error: 'Student not found in this section',
                    details: 'Student ID from face recognition does not match any active student in the specified section'
                });
                return;
            }

            const student = studentResult.rows[0];
            const today = new Date().toDateString();

            // Check if attendance already marked for today
            const existingAttendance = await query(
                'SELECT id, status FROM attendance_logs WHERE student_id = $1 AND date = $2',
                [mlResult.studentId, today]
            );

            if (existingAttendance.rows.length > 0) {
                const existingRecord = existingAttendance.rows[0];
                res.status(409).json({
                    success: false,
                    error: 'Attendance already marked',
                    details: `Student ${student.name} (${student.roll_number}) already marked as ${existingRecord.status} for today`,
                    data: {
                        studentId: mlResult.studentId,
                        studentName: student.name,
                        rollNumber: student.roll_number,
                        existingStatus: existingRecord.status,
                        date: today
                    }
                });
                return;
            }

            // Mark attendance in database
            let attendanceRecord;
            try {
                await withTransaction(async (client) => {
                    const attendanceInput: CreateAttendanceLogInput = {
                        student_id: mlResult.studentId!,
                        faculty_id: facultyId,
                        section_id: sectionId,
                        date: new Date(),
                        status: 'present',
                        capture_method: 'face_detection',
                        face_detected: true,
                        liveness_detected: true,
                        confidence_score: mlResult.confidence || 0,
                        face_detection_timestamp: new Date()
                    };

                    const result = await client.query(
                        `INSERT INTO attendance_logs 
                         (id, student_id, faculty_id, section_id, date, status, capture_method, 
                          face_detected, liveness_detected, confidence_score, face_detection_timestamp, synced_at)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)
                         RETURNING *`,
                        [
                            uuidv4(),
                            attendanceInput.student_id,
                            attendanceInput.faculty_id,
                            attendanceInput.section_id,
                            attendanceInput.date,
                            attendanceInput.status,
                            attendanceInput.capture_method,
                            attendanceInput.face_detected,
                            attendanceInput.liveness_detected,
                            attendanceInput.confidence_score,
                            attendanceInput.face_detection_timestamp
                        ]
                    );

                    attendanceRecord = result.rows[0];
                });
            } catch (dbError) {
                console.error('Database error:', dbError);
                res.status(500).json({
                    success: false,
                    error: 'Failed to mark attendance',
                    details: dbError instanceof Error ? dbError.message : 'Database error'
                });
                return;
            }

            // Return success response
            res.status(201).json({
                success: true,
                message: 'Attendance marked successfully',
                data: {
                    attendanceId: attendanceRecord!.id,
                    studentId: mlResult.studentId,
                    studentName: student.name,
                    rollNumber: student.roll_number,
                    sectionName: section.name,
                    status: 'present',
                    captureMethod: 'face_detection',
                    faceDetected: true,
                    livenessDetected: true,
                    confidenceScore: mlResult.confidence || 0,
                    faceDetectionTimestamp: attendanceRecord!.face_detection_timestamp,
                    attendanceTimestamp: attendanceRecord!.created_at,
                    date: today
                }
            });

        } catch (error) {
            console.error('Face attendance marking error:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error',
                details: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });

/**
 * POST /api/attendance-face/capture-image
 * Capture attendance image after marking attendance
 * This endpoint is called after successful attendance marking to store the attendance image
 */
router.post('/capture-image',
    syncRateLimit,
    validateRequest([
        new RequiredFieldRule('attendanceId'),
        new RequiredFieldRule('imageData'),
        new TypeValidationRule('imageData', 'string'),
        new UUIDValidationRule('attendanceId')
    ]),
    async (req: Request, res: Response): Promise<void> => {
        try {
            const { attendanceId, imageData } = req.body;

            // Validate image format
            if (!imageData || typeof imageData !== 'string' || !imageData.startsWith('data:image/')) {
                res.status(400).json({
                    success: false,
                    error: 'Invalid image format. Must be a valid base64 encoded image.'
                });
                return;
            }

            // Check if attendance record exists
            const attendanceResult = await query(
                'SELECT id, student_id FROM attendance_logs WHERE id = $1',
                [attendanceId]
            );

            if (attendanceResult.rows.length === 0) {
                res.status(404).json({
                    success: false,
                    error: 'Attendance record not found'
                });
                return;
            }

            // Update attendance record with image
            try {
                await withTransaction(async (client) => {
                    await client.query(
                        `UPDATE attendance_logs 
                         SET attendance_image = $1, attendance_image_timestamp = CURRENT_TIMESTAMP
                         WHERE id = $2`,
                        [Buffer.from(imageData, 'base64'), attendanceId]
                    );
                });
            } catch (dbError) {
                console.error('Database error:', dbError);
                res.status(500).json({
                    success: false,
                    error: 'Failed to save attendance image',
                    details: dbError instanceof Error ? dbError.message : 'Database error'
                });
                return;
            }

            res.json({
                success: true,
                message: 'Attendance image captured successfully',
                data: {
                    attendanceId,
                    imageCaptured: true,
                    timestamp: new Date()
                }
            });

        } catch (error) {
            console.error('Attendance image capture error:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error',
                details: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });

/**
 * GET /api/attendance-face/student/:studentId
 * Get face-based attendance history for a specific student
 */
router.get('/student/:studentId',
    validateRequest([
        new UUIDValidationRule('studentId', 'params')
    ]),
    async (req: Request, res: Response): Promise<void> => {
        try {
            const { studentId } = req.params;
            const { limit = '50', offset = '0' } = req.query;

            // Validate student exists
            const studentResult = await query(
                'SELECT id, name, roll_number FROM students WHERE id = $1 AND is_active = true',
                [studentId]
            );

            if (studentResult.rows.length === 0) {
                res.status(404).json({
                    success: false,
                    error: 'Student not found or inactive'
                });
                return;
            }

            const student = studentResult.rows[0];

            // Get face-based attendance records
            const attendanceResult = await query(
                `SELECT 
                    al.*,
                    f.name as faculty_name,
                    sec.name as section_name
                FROM attendance_logs al
                JOIN faculty f ON al.faculty_id = f.id
                JOIN sections sec ON al.section_id = sec.id
                WHERE al.student_id = $1 
                AND al.capture_method = 'face_detection'
                ORDER BY al.date DESC, al.created_at DESC
                LIMIT $2 OFFSET $3`,
                [studentId, parseInt(limit as string), parseInt(offset as string)]
            );

            // Get total count
            const countResult = await query(
                `SELECT COUNT(*) FROM attendance_logs 
                 WHERE student_id = $1 AND capture_method = 'face_detection'`,
                [studentId]
            );

            const totalRecords = parseInt(countResult.rows[0].count);

            res.json({
                success: true,
                data: {
                    student: {
                        id: student.id,
                        name: student.name,
                        rollNumber: student.roll_number
                    },
                    attendanceRecords: attendanceResult.rows.map(record => ({
                        id: record.id,
                        date: record.date,
                        status: record.status,
                        captureMethod: record.capture_method,
                        faceDetected: record.face_detected,
                        livenessDetected: record.liveness_detected,
                        confidenceScore: record.confidence_score,
                        faceDetectionTimestamp: record.face_detection_timestamp,
                        attendanceImageTimestamp: record.attendance_image_timestamp,
                        hasAttendanceImage: !!record.attendance_image,
                        facultyName: record.faculty_name,
                        sectionName: record.section_name,
                        createdAt: record.created_at
                    }))
                },
                pagination: {
                    total: totalRecords,
                    limit: parseInt(limit as string),
                    offset: parseInt(offset as string),
                    hasMore: parseInt(offset as string) + attendanceResult.rows.length < totalRecords
                }
            });

        } catch (error) {
            console.error('Get face attendance history error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to retrieve face attendance history',
                details: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });

export default router;
