import { Router, Request, Response } from 'express';
import { StudentService } from '../services/studentService';
import { SectionService } from '../services/sectionService';
import { authenticateToken } from '../middleware/auth';
import { CreateStudentInput } from '../database/models';
import { validateRequest, RequiredFieldRule, TypeValidationRule, StringLengthRule, UUIDValidationRule } from '../middleware/validation';
import { managementRateLimit } from '../middleware/rateLimiting';
import { DataIntegrityService } from '../services/dataIntegrityService';
import { isValidRollNumber, isValidName } from '../utils/validation';
import { mlApiService } from '../services/mlApiService';

const router = Router();
const studentService = new StudentService();
const sectionService = new SectionService();
const dataIntegrityService = new DataIntegrityService();

// Apply authentication middleware to all routes
router.use(authenticateToken);

/**
 * POST /api/students-face/enroll
 * Create a new student with face enrollment
 * This endpoint captures the student's face image and enrolls them in the ML system
 */
router.post('/enroll',
    managementRateLimit,
    validateRequest([
        new RequiredFieldRule('rollNumber'),
        new RequiredFieldRule('name'),
        new RequiredFieldRule('sectionId'),
        new RequiredFieldRule('faceImage'),
        new TypeValidationRule('rollNumber', 'string'),
        new TypeValidationRule('name', 'string'),
        new TypeValidationRule('faceImage', 'string'),
        new UUIDValidationRule('sectionId'),
        new StringLengthRule('rollNumber', 1, 20),
        new StringLengthRule('name', 1, 100)
    ]),
    async (req: Request, res: Response) => {
        try {
            const { rollNumber, name, sectionId, isActive, faceImage } = req.body;

            // Additional validation using data integrity service
            const validation = await dataIntegrityService.validateStudentData({
                rollNumber,
                name,
                sectionId,
                isActive
            });

            if (!validation.isValid) {
                return res.status(400).json({
                    success: false,
                    error: 'Student data validation failed',
                    details: validation.errors
                });
            }

            // Additional format validation
            if (!isValidRollNumber(rollNumber)) {
                return res.status(400).json({
                    success: false,
                    error: 'Roll number must contain only alphanumeric characters'
                });
            }

            if (!isValidName(name)) {
                return res.status(400).json({
                    success: false,
                    error: 'Name contains invalid characters'
                });
            }

            // Validate section exists
            const section = await sectionService.getSectionById(sectionId);
            if (!section) {
                return res.status(404).json({
                    success: false,
                    error: 'Section not found'
                });
            }

            // Check if roll number already exists in the section
            const rollNumberExists = await studentService.rollNumberExists(rollNumber, sectionId);
            if (rollNumberExists) {
                return res.status(409).json({
                    success: false,
                    error: 'Student with this roll number already exists in the section'
                });
            }

            // Validate face image format (basic base64 check)
            if (!faceImage || typeof faceImage !== 'string' || !faceImage.startsWith('data:image/')) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid face image format. Must be a valid base64 encoded image.'
                });
            }

            // Create student in database first
            const input: CreateStudentInput = {
                roll_number: rollNumber,
                name: name.trim(),
                section_id: sectionId,
                is_active: isActive ?? true
            };

            const student = await studentService.createStudent(input);

            // Enroll student face with external ML API
            try {
                const enrollResult = await mlApiService.enrollStudent({
                    imageData: faceImage,
                    studentId: student.id,
                    name: student.name,
                    sectionId: student.section_id,
                });

                if (!enrollResult.success) {
                    // If ML enrollment fails, we should still return the student but with a warning
                    console.warn('ML enrollment failed for student:', student.id, enrollResult.error);
                    
                    return res.status(201).json({
                        success: true,
                        data: {
                            id: student.id,
                            rollNumber: student.roll_number,
                            name: student.name,
                            sectionId: student.section_id,
                            isActive: student.is_active,
                            createdAt: student.created_at,
                            updatedAt: student.updated_at,
                            faceEnrolled: false,
                            enrollmentError: enrollResult.error
                        },
                        warning: 'Student created but face enrollment failed. Please try enrolling again later.'
                    });
                }

                return res.status(201).json({
                    success: true,
                    data: {
                        id: student.id,
                        rollNumber: student.roll_number,
                        name: student.name,
                        sectionId: student.section_id,
                        isActive: student.is_active,
                        createdAt: student.created_at,
                        updatedAt: student.updated_at,
                        faceEnrolled: true,
                        enrollmentMessage: enrollResult.message
                    }
                });

            } catch (mlError) {
                console.error('ML enrollment error:', mlError);
                
                // Return student with enrollment failure info
                return res.status(201).json({
                    success: true,
                    data: {
                        id: student.id,
                        rollNumber: student.roll_number,
                        name: student.name,
                        sectionId: student.section_id,
                        isActive: student.is_active,
                        createdAt: student.created_at,
                        updatedAt: student.updated_at,
                        faceEnrolled: false,
                        enrollmentError: mlError instanceof Error ? mlError.message : 'Unknown enrollment error'
                    },
                    warning: 'Student created but face enrollment failed. Please try enrolling again later.'
                });
            }

        } catch (error) {
            console.error('Create student with face enrollment error:', error);
            if (error instanceof Error && error.message.includes('already exists')) {
                return res.status(409).json({
                    success: false,
                    error: error.message
                });
            }
            return res.status(500).json({
                success: false,
                error: 'Failed to create student with face enrollment'
            });
        }
    });

/**
 * POST /api/students-face/re-enroll/:studentId
 * Re-enroll an existing student's face
 * This endpoint allows updating the face data for an existing student
 */
router.post('/re-enroll/:studentId',
    managementRateLimit,
    validateRequest([
        new RequiredFieldRule('faceImage'),
        new TypeValidationRule('faceImage', 'string'),
        new UUIDValidationRule('studentId', 'params')
    ]),
    async (req: Request, res: Response) => {
        try {
            const { studentId } = req.params;
            const { faceImage } = req.body;

            // Check if student exists
            const student = await studentService.getStudentById(studentId);
            if (!student) {
                return res.status(404).json({
                    success: false,
                    error: 'Student not found'
                });
            }

            // Validate face image format
            if (!faceImage || typeof faceImage !== 'string' || !faceImage.startsWith('data:image/')) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid face image format. Must be a valid base64 encoded image.'
                });
            }

            // Re-enroll student face with external ML API
            try {
                const enrollResult = await mlApiService.enrollStudent({
                    imageData: faceImage,
                    studentId: student.id,
                    name: student.name,
                    sectionId: student.section_id,
                });

                if (!enrollResult.success) {
                    return res.status(400).json({
                        success: false,
                        error: 'Face re-enrollment failed',
                        details: enrollResult.error
                    });
                }

                return res.json({
                    success: true,
                    data: {
                        studentId: student.id,
                        rollNumber: student.roll_number,
                        name: student.name,
                        faceReEnrolled: true,
                        enrollmentMessage: enrollResult.message
                    }
                });

            } catch (mlError) {
                console.error('ML re-enrollment error:', mlError);
                return res.status(500).json({
                    success: false,
                    error: 'Face re-enrollment failed',
                    details: mlError instanceof Error ? mlError.message : 'Unknown enrollment error'
                });
            }

        } catch (error) {
            console.error('Re-enroll student face error:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to re-enroll student face'
            });
        }
    });

export default router;
