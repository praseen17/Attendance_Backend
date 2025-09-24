import { Router, Request, Response } from 'express';
import { SectionService } from '../services/sectionService';
import { AuthService } from '../services/authService';
import { authenticateToken } from '../middleware/auth';
import { CreateSectionInput, UpdateSectionInput } from '../database/models';

const router = Router();
const sectionService = new SectionService();
const authService = new AuthService();

// Apply authentication middleware to all routes
router.use(authenticateToken);

/**
 * GET /api/faculty/:facultyId/sections
 * Get all sections assigned to a faculty member
 */
router.get('/faculty/:facultyId/sections', async (req: Request, res: Response) => {
    try {
        const { facultyId } = req.params;

        // Validate faculty exists
        const faculty = await authService.getUserProfile(facultyId);
        if (!faculty) {
            return res.status(404).json({
                success: false,
                error: 'Faculty not found'
            });
        }

        // Get sections for the faculty
        const sections = await sectionService.getSectionsByFaculty(facultyId);

        return res.json({
            success: true,
            data: {
                faculty: {
                    id: faculty.id,
                    name: faculty.name,
                    email: faculty.email
                },
                sections: sections.map(section => ({
                    id: section.id,
                    name: section.name,
                    grade: section.grade,
                    facultyId: section.faculty_id,
                    studentCount: section.student_count,
                    createdAt: section.created_at,
                    updatedAt: section.updated_at
                }))
            }
        });
    } catch (error) {
        console.error('Get sections by faculty error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to retrieve sections'
        });
    }
});

/**
 * GET /api/sections/:sectionId
 * Get section by ID with details
 */
router.get('/:sectionId', async (req: Request, res: Response) => {
    try {
        const { sectionId } = req.params;
        const { includeStudents } = req.query;

        if (includeStudents === 'true') {
            // Get section with students
            const sectionWithStudents = await sectionService.getSectionWithStudents(sectionId);
            if (!sectionWithStudents) {
                return res.status(404).json({
                    success: false,
                    error: 'Section not found'
                });
            }

            return res.json({
                success: true,
                data: {
                    id: sectionWithStudents.id,
                    name: sectionWithStudents.name,
                    grade: sectionWithStudents.grade,
                    facultyId: sectionWithStudents.faculty_id,
                    studentCount: sectionWithStudents.student_count,
                    createdAt: sectionWithStudents.created_at,
                    updatedAt: sectionWithStudents.updated_at,
                    faculty: {
                        name: sectionWithStudents.faculty_name,
                        email: sectionWithStudents.faculty_email
                    },
                    students: sectionWithStudents.students.map((student: any) => ({
                        id: student.id,
                        rollNumber: student.roll_number,
                        name: student.name,
                        sectionId: student.section_id,
                        isActive: student.is_active,
                        createdAt: student.created_at,
                        updatedAt: student.updated_at
                    }))
                }
            });
        } else {
            // Get section only
            const section = await sectionService.getSectionById(sectionId);
            if (!section) {
                return res.status(404).json({
                    success: false,
                    error: 'Section not found'
                });
            }

            return res.json({
                success: true,
                data: {
                    id: section.id,
                    name: section.name,
                    grade: section.grade,
                    facultyId: section.faculty_id,
                    studentCount: section.student_count,
                    createdAt: section.created_at,
                    updatedAt: section.updated_at
                }
            });
        }
    } catch (error) {
        console.error('Get section by ID error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to retrieve section'
        });
    }
});

/**
 * GET /api/sections
 * Get all sections (admin endpoint)
 */
router.get('/', async (req: Request, res: Response) => {
    try {
        const { includeFaculty } = req.query;

        if (includeFaculty === 'true') {
            // Get sections with faculty details
            const sectionsWithFaculty = await sectionService.getSectionsWithFaculty();

            return res.json({
                success: true,
                data: sectionsWithFaculty.map(section => ({
                    id: section.id,
                    name: section.name,
                    grade: section.grade,
                    facultyId: section.faculty_id,
                    studentCount: section.student_count,
                    createdAt: section.created_at,
                    updatedAt: section.updated_at,
                    faculty: {
                        name: section.faculty_name,
                        email: section.faculty_email
                    }
                }))
            });
        } else {
            // Get sections only
            const sections = await sectionService.getAllSections();

            return res.json({
                success: true,
                data: sections.map(section => ({
                    id: section.id,
                    name: section.name,
                    grade: section.grade,
                    facultyId: section.faculty_id,
                    studentCount: section.student_count,
                    createdAt: section.created_at,
                    updatedAt: section.updated_at
                }))
            });
        }
    } catch (error) {
        console.error('Get all sections error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to retrieve sections'
        });
    }
});

/**
 * POST /api/sections
 * Create a new section
 */
router.post('/', async (req: Request, res: Response) => {
    try {
        const { name, grade, facultyId } = req.body;

        // Validate required fields
        if (!name || !grade || !facultyId) {
            return res.status(400).json({
                success: false,
                error: 'Name, grade, and faculty ID are required'
            });
        }

        // Validate faculty exists
        const faculty = await authService.getUserProfile(facultyId);
        if (!faculty) {
            return res.status(404).json({
                success: false,
                error: 'Faculty not found'
            });
        }

        // Check if section name already exists for this faculty
        const sectionNameExists = await sectionService.sectionNameExists(name.trim(), facultyId);
        if (sectionNameExists) {
            return res.status(409).json({
                success: false,
                error: 'Section with this name already exists for the faculty'
            });
        }

        const input: CreateSectionInput = {
            name: name.trim(),
            grade: grade.trim(),
            faculty_id: facultyId
        };

        const section = await sectionService.createSection(input);

        return res.status(201).json({
            success: true,
            data: {
                id: section.id,
                name: section.name,
                grade: section.grade,
                facultyId: section.faculty_id,
                studentCount: section.student_count,
                createdAt: section.created_at,
                updatedAt: section.updated_at
            }
        });
    } catch (error) {
        console.error('Create section error:', error);
        if (error instanceof Error && error.message.includes('Faculty not found')) {
            return res.status(404).json({
                success: false,
                error: error.message
            });
        }
        return res.status(500).json({
            success: false,
            error: 'Failed to create section'
        });
    }
});

/**
 * PUT /api/sections/:sectionId
 * Update section information
 */
router.put('/:sectionId', async (req: Request, res: Response) => {
    try {
        const { sectionId } = req.params;
        const { name, grade, facultyId } = req.body;

        // Check if section exists
        const existingSection = await sectionService.getSectionById(sectionId);
        if (!existingSection) {
            return res.status(404).json({
                success: false,
                error: 'Section not found'
            });
        }

        // If faculty is being changed, validate new faculty exists
        if (facultyId && facultyId !== existingSection.faculty_id) {
            const faculty = await authService.getUserProfile(facultyId);
            if (!faculty) {
                return res.status(404).json({
                    success: false,
                    error: 'New faculty not found'
                });
            }
        }

        // If name is being changed, check for duplicates
        if (name && name.trim() !== existingSection.name) {
            const targetFacultyId = facultyId || existingSection.faculty_id;
            const sectionNameExists = await sectionService.sectionNameExists(name.trim(), targetFacultyId, sectionId);
            if (sectionNameExists) {
                return res.status(409).json({
                    success: false,
                    error: 'Section with this name already exists for the faculty'
                });
            }
        }

        const input: UpdateSectionInput = {};
        if (name !== undefined) input.name = name.trim();
        if (grade !== undefined) input.grade = grade.trim();
        if (facultyId !== undefined) input.faculty_id = facultyId;

        const updatedSection = await sectionService.updateSection(sectionId, input);
        if (!updatedSection) {
            return res.status(404).json({
                success: false,
                error: 'Section not found'
            });
        }

        return res.json({
            success: true,
            data: {
                id: updatedSection.id,
                name: updatedSection.name,
                grade: updatedSection.grade,
                facultyId: updatedSection.faculty_id,
                studentCount: updatedSection.student_count,
                createdAt: updatedSection.created_at,
                updatedAt: updatedSection.updated_at
            }
        });
    } catch (error) {
        console.error('Update section error:', error);
        if (error instanceof Error && (error.message.includes('Faculty not found') || error.message.includes('already exists'))) {
            return res.status(error.message.includes('not found') ? 404 : 409).json({
                success: false,
                error: error.message
            });
        }
        return res.status(500).json({
            success: false,
            error: 'Failed to update section'
        });
    }
});

/**
 * DELETE /api/sections/:sectionId
 * Delete section (only if no students are assigned)
 */
router.delete('/:sectionId', async (req: Request, res: Response) => {
    try {
        const { sectionId } = req.params;

        const deleted = await sectionService.deleteSection(sectionId);
        if (!deleted) {
            return res.status(404).json({
                success: false,
                error: 'Section not found'
            });
        }

        return res.json({
            success: true,
            message: 'Section deleted successfully'
        });
    } catch (error) {
        console.error('Delete section error:', error);
        if (error instanceof Error && error.message.includes('Cannot delete section')) {
            return res.status(400).json({
                success: false,
                error: error.message
            });
        }
        return res.status(500).json({
            success: false,
            error: 'Failed to delete section'
        });
    }
});

/**
 * POST /api/sections/:sectionId/update-student-count
 * Manually update section student count (maintenance endpoint)
 */
router.post('/:sectionId/update-student-count', async (req: Request, res: Response) => {
    try {
        const { sectionId } = req.params;

        // Check if section exists
        const section = await sectionService.getSectionById(sectionId);
        if (!section) {
            return res.status(404).json({
                success: false,
                error: 'Section not found'
            });
        }

        await sectionService.updateStudentCount(sectionId);

        // Get updated section
        const updatedSection = await sectionService.getSectionById(sectionId);

        return res.json({
            success: true,
            message: 'Student count updated successfully',
            data: {
                sectionId: sectionId,
                studentCount: updatedSection?.student_count || 0
            }
        });
    } catch (error) {
        console.error('Update student count error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to update student count'
        });
    }
});

export default router;