import { Router, Request, Response } from 'express';
import { StudentService } from '../services/studentService';
import { SectionService } from '../services/sectionService';
import { authenticateToken } from '../middleware/auth';
import { CreateStudentInput, UpdateStudentInput } from '../database/models';
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
 * GET /api/students/section/:sectionId
 * Get all students in a specific section
 */
router.get('/section/:sectionId',
    managementRateLimit,
    validateRequest([
        new UUIDValidationRule('sectionId', 'params')
    ]),
    async (req: Request, res: Response) => {
        try {
            const { sectionId } = req.params;

            // Validate section exists
            const section = await sectionService.getSectionById(sectionId);
            if (!section) {
                return res.status(404).json({
                    success: false,
                    error: 'Section not found'
                });
            }

            // Get students in the section
            const students = await studentService.getStudentsBySection(sectionId);

            return res.json({
                success: true,
                data: {
                    section: {
                        id: section.id,
                        name: section.name,
                        grade: section.grade,
                        studentCount: section.student_count
                    },
                    students: students.map(student => ({
                        id: student.id,
                        rollNumber: student.roll_number,
                        name: student.name,
                        sectionId: student.section_id,
                        isActive: student.is_active,
                        createdAt: student.created_at,
                        updatedAt: student.updated_at
                        // Note: face_embedding is excluded for security
                    }))
                }
            });
        } catch (error) {
            console.error('Get students by section error:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to retrieve students'
            });
        }
    });

/**
 * GET /api/students/:studentId
 * Get student by ID
 */
router.get('/:studentId', async (req: Request, res: Response) => {
    try {
        const { studentId } = req.params;

        const student = await studentService.getStudentById(studentId);
        if (!student) {
            return res.status(404).json({
                success: false,
                error: 'Student not found'
            });
        }

        return res.json({
            success: true,
            data: {
                id: student.id,
                rollNumber: student.roll_number,
                name: student.name,
                sectionId: student.section_id,
                isActive: student.is_active,
                createdAt: student.created_at,
                updatedAt: student.updated_at
                // Note: face_embedding is excluded for security
            }
        });
    } catch (error) {
        console.error('Get student by ID error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to retrieve student'
        });
    }
});

/**
 * POST /api/students
 * Create a new student
 */
router.post('/',
    managementRateLimit,
    validateRequest([
        new RequiredFieldRule('rollNumber'),
        new RequiredFieldRule('name'),
        new RequiredFieldRule('sectionId'),
        new TypeValidationRule('rollNumber', 'string'),
        new TypeValidationRule('name', 'string'),
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

            const input: CreateStudentInput = {
                roll_number: rollNumber,
                name: name.trim(),
                section_id: sectionId,
                is_active: isActive ?? true
            };

            const student = await studentService.createStudent(input);

            // Optionally enroll student face with external ML API
            if (faceImage && typeof faceImage === 'string') {
                try {
                    await mlApiService.enrollStudent({
                        imageData: faceImage,
                        studentId: student.id,
                        name: student.name,
                        sectionId: student.section_id,
                    });
                } catch (mlErr) {
                    console.warn('ML enroll failed (non-blocking):', mlErr);
                }
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
                    updatedAt: student.updated_at
                }
            });
        } catch (error) {
            console.error('Create student error:', error);
            if (error instanceof Error && error.message.includes('already exists')) {
                return res.status(409).json({
                    success: false,
                    error: error.message
                });
            }
            return res.status(500).json({
                success: false,
                error: 'Failed to create student'
            });
        }
    });

/**
 * PUT /api/students/:studentId
 * Update student information
 */
router.put('/:studentId', async (req: Request, res: Response) => {
    try {
        const { studentId } = req.params;
        const { rollNumber, name, sectionId, isActive } = req.body;

        // Check if student exists
        const existingStudent = await studentService.getStudentById(studentId);
        if (!existingStudent) {
            return res.status(404).json({
                success: false,
                error: 'Student not found'
            });
        }

        // If section is being changed, validate new section exists
        if (sectionId && sectionId !== existingStudent.section_id) {
            const section = await sectionService.getSectionById(sectionId);
            if (!section) {
                return res.status(404).json({
                    success: false,
                    error: 'New section not found'
                });
            }
        }

        // If roll number is being changed, check for duplicates
        if (rollNumber && rollNumber !== existingStudent.roll_number) {
            const targetSectionId = sectionId || existingStudent.section_id;
            const rollNumberExists = await studentService.rollNumberExists(rollNumber, targetSectionId, studentId);
            if (rollNumberExists) {
                return res.status(409).json({
                    success: false,
                    error: 'Student with this roll number already exists in the section'
                });
            }
        }

        const input: UpdateStudentInput = {};
        if (rollNumber !== undefined) input.roll_number = rollNumber;
        if (name !== undefined) input.name = name.trim();
        if (sectionId !== undefined) input.section_id = sectionId;
        if (isActive !== undefined) input.is_active = isActive;

        const updatedStudent = await studentService.updateStudent(studentId, input);
        if (!updatedStudent) {
            return res.status(404).json({
                success: false,
                error: 'Student not found'
            });
        }

        return res.json({
            success: true,
            data: {
                id: updatedStudent.id,
                rollNumber: updatedStudent.roll_number,
                name: updatedStudent.name,
                sectionId: updatedStudent.section_id,
                isActive: updatedStudent.is_active,
                createdAt: updatedStudent.created_at,
                updatedAt: updatedStudent.updated_at
            }
        });
    } catch (error) {
        console.error('Update student error:', error);
        if (error instanceof Error && error.message.includes('already exists')) {
            return res.status(409).json({
                success: false,
                error: error.message
            });
        }
        return res.status(500).json({
            success: false,
            error: 'Failed to update student'
        });
    }
});

/**
 * DELETE /api/students/:studentId
 * Delete student (soft delete)
 */
router.delete('/:studentId', async (req: Request, res: Response) => {
    try {
        const { studentId } = req.params;

        const deleted = await studentService.deleteStudent(studentId);
        if (!deleted) {
            return res.status(404).json({
                success: false,
                error: 'Student not found'
            });
        }

        return res.json({
            success: true,
            message: 'Student deleted successfully'
        });
    } catch (error) {
        console.error('Delete student error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to delete student'
        });
    }
});

export default router;