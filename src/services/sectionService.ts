import { Pool } from 'pg';
import { Section, CreateSectionInput, UpdateSectionInput } from '../database/models';
import { getPool } from '../database/connection';
import { isValidUUID } from '../utils/validation';

export class SectionService {
    private pool: Pool;

    constructor() {
        this.pool = getPool();
    }

    /**
     * Get all sections assigned to a faculty member
     */
    async getSectionsByFaculty(facultyId: string): Promise<Section[]> {
        try {
            const query = `
                SELECT id, name, grade, faculty_id, student_count, created_at, updated_at
                FROM sections 
                WHERE faculty_id = $1
                ORDER BY grade ASC, name ASC
            `;

            const result = await this.pool.query(query, [facultyId]);
            return result.rows as Section[];
        } catch (error) {
            console.error('Get sections by faculty error:', error);
            throw new Error('Failed to retrieve sections');
        }
    }

    /**
     * Get section by ID
     */
    async getSectionById(sectionId: string): Promise<Section | null> {
        try {
            // Validate UUID format
            if (!isValidUUID(sectionId)) {
                return null;
            }

            const query = `
                SELECT id, name, grade, faculty_id, student_count, created_at, updated_at
                FROM sections 
                WHERE id = $1
            `;

            const result = await this.pool.query(query, [sectionId]);
            return result.rows.length > 0 ? result.rows[0] as Section : null;
        } catch (error) {
            console.error('Get section by ID error:', error);
            return null;
        }
    }

    /**
     * Get all sections (for admin purposes)
     */
    async getAllSections(): Promise<Section[]> {
        try {
            const query = `
                SELECT id, name, grade, faculty_id, student_count, created_at, updated_at
                FROM sections 
                ORDER BY grade ASC, name ASC
            `;

            const result = await this.pool.query(query);
            return result.rows as Section[];
        } catch (error) {
            console.error('Get all sections error:', error);
            throw new Error('Failed to retrieve sections');
        }
    }

    /**
     * Create a new section
     */
    async createSection(input: CreateSectionInput): Promise<Section> {
        try {
            const query = `
                INSERT INTO sections (name, grade, faculty_id, student_count)
                VALUES ($1, $2, $3, 0)
                RETURNING id, name, grade, faculty_id, student_count, created_at, updated_at
            `;

            const values = [
                input.name,
                input.grade,
                input.faculty_id
            ];

            const result = await this.pool.query(query, values);
            return result.rows[0] as Section;
        } catch (error) {
            console.error('Create section error:', error);
            if (error instanceof Error && error.message.includes('foreign key')) {
                throw new Error('Faculty not found');
            }
            throw new Error('Failed to create section');
        }
    }

    /**
     * Update section information
     */
    async updateSection(sectionId: string, input: UpdateSectionInput): Promise<Section | null> {
        try {
            const setParts: string[] = [];
            const values: any[] = [];
            let paramIndex = 1;

            if (input.name !== undefined) {
                setParts.push(`name = $${paramIndex++}`);
                values.push(input.name);
            }
            if (input.grade !== undefined) {
                setParts.push(`grade = $${paramIndex++}`);
                values.push(input.grade);
            }
            if (input.faculty_id !== undefined) {
                setParts.push(`faculty_id = $${paramIndex++}`);
                values.push(input.faculty_id);
            }

            if (setParts.length === 0) {
                throw new Error('No fields to update');
            }

            setParts.push(`updated_at = CURRENT_TIMESTAMP`);
            values.push(sectionId);

            const query = `
                UPDATE sections 
                SET ${setParts.join(', ')}
                WHERE id = $${paramIndex}
                RETURNING id, name, grade, faculty_id, student_count, created_at, updated_at
            `;

            const result = await this.pool.query(query, values);
            return result.rows.length > 0 ? result.rows[0] as Section : null;
        } catch (error) {
            console.error('Update section error:', error);
            if (error instanceof Error && error.message.includes('foreign key')) {
                throw new Error('Faculty not found');
            }
            throw new Error('Failed to update section');
        }
    }

    /**
     * Delete section (only if no students are assigned)
     */
    async deleteSection(sectionId: string): Promise<boolean> {
        try {
            // Check if section has students
            const studentCountQuery = 'SELECT COUNT(*) as count FROM students WHERE section_id = $1 AND is_active = true';
            const studentCountResult = await this.pool.query(studentCountQuery, [sectionId]);
            const studentCount = parseInt(studentCountResult.rows[0].count);

            if (studentCount > 0) {
                throw new Error('Cannot delete section with active students');
            }

            const query = 'DELETE FROM sections WHERE id = $1';
            const result = await this.pool.query(query, [sectionId]);

            return (result.rowCount ?? 0) > 0;
        } catch (error) {
            console.error('Delete section error:', error);
            if (error instanceof Error && error.message.includes('Cannot delete section')) {
                throw error;
            }
            throw new Error('Failed to delete section');
        }
    }

    /**
     * Get sections with faculty details
     */
    async getSectionsWithFaculty(): Promise<any[]> {
        try {
            const query = `
                SELECT 
                    s.id, s.name, s.grade, s.faculty_id, s.student_count, s.created_at, s.updated_at,
                    f.name as faculty_name, f.email as faculty_email
                FROM sections s
                JOIN faculty f ON s.faculty_id = f.id
                WHERE f.is_active = true
                ORDER BY s.grade ASC, s.name ASC
            `;

            const result = await this.pool.query(query);
            return result.rows;
        } catch (error) {
            console.error('Get sections with faculty error:', error);
            throw new Error('Failed to retrieve sections with faculty details');
        }
    }

    /**
     * Get section with students
     */
    async getSectionWithStudents(sectionId: string): Promise<any | null> {
        try {
            const sectionQuery = `
                SELECT 
                    s.id, s.name, s.grade, s.faculty_id, s.student_count, s.created_at, s.updated_at,
                    f.name as faculty_name, f.email as faculty_email
                FROM sections s
                JOIN faculty f ON s.faculty_id = f.id
                WHERE s.id = $1 AND f.is_active = true
            `;

            const studentsQuery = `
                SELECT id, roll_number, name, section_id, is_active, created_at, updated_at
                FROM students 
                WHERE section_id = $1 AND is_active = true
                ORDER BY roll_number ASC
            `;

            const [sectionResult, studentsResult] = await Promise.all([
                this.pool.query(sectionQuery, [sectionId]),
                this.pool.query(studentsQuery, [sectionId])
            ]);

            if (sectionResult.rows.length === 0) {
                return null;
            }

            const section = sectionResult.rows[0];
            const students = studentsResult.rows;

            return {
                ...section,
                students
            };
        } catch (error) {
            console.error('Get section with students error:', error);
            throw new Error('Failed to retrieve section with students');
        }
    }

    /**
     * Check if section name exists for a faculty
     */
    async sectionNameExists(name: string, facultyId: string, excludeSectionId?: string): Promise<boolean> {
        try {
            let query = 'SELECT id FROM sections WHERE name = $1 AND faculty_id = $2';
            const values: any[] = [name, facultyId];

            if (excludeSectionId) {
                query += ' AND id != $3';
                values.push(excludeSectionId);
            }

            const result = await this.pool.query(query, values);
            return result.rows.length > 0;
        } catch (error) {
            console.error('Section name exists check error:', error);
            return false;
        }
    }

    /**
     * Update section student count manually (for maintenance)
     */
    async updateStudentCount(sectionId: string): Promise<void> {
        try {
            const query = `
                UPDATE sections 
                SET student_count = (
                    SELECT COUNT(*) 
                    FROM students 
                    WHERE section_id = $1 AND is_active = true
                )
                WHERE id = $1
            `;

            await this.pool.query(query, [sectionId]);
        } catch (error) {
            console.error('Update student count error:', error);
            throw new Error('Failed to update student count');
        }
    }
}