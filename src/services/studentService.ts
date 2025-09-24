import { Pool } from 'pg';
import { Student, CreateStudentInput, UpdateStudentInput } from '../database/models';
import { getPool } from '../database/connection';
import { isValidUUID } from '../utils/validation';

export class StudentService {
    private pool: Pool;

    constructor() {
        this.pool = getPool();
    }

    /**
     * Get all students in a specific section
     */
    async getStudentsBySection(sectionId: string): Promise<Student[]> {
        try {
            const query = `
                SELECT id, roll_number, name, section_id, face_embedding, is_active, created_at, updated_at
                FROM students 
                WHERE section_id = $1 AND is_active = true
                ORDER BY roll_number ASC
            `;

            const result = await this.pool.query(query, [sectionId]);
            return result.rows as Student[];
        } catch (error) {
            console.error('Get students by section error:', error);
            throw new Error('Failed to retrieve students');
        }
    }

    /**
     * Get student by ID
     */
    async getStudentById(studentId: string): Promise<Student | null> {
        try {
            // Validate UUID format
            if (!isValidUUID(studentId)) {
                return null;
            }

            const query = `
                SELECT id, roll_number, name, section_id, face_embedding, is_active, created_at, updated_at
                FROM students 
                WHERE id = $1 AND is_active = true
            `;

            const result = await this.pool.query(query, [studentId]);
            return result.rows.length > 0 ? result.rows[0] as Student : null;
        } catch (error) {
            console.error('Get student by ID error:', error);
            return null; // Return null instead of throwing for invalid UUIDs
        }
    }

    /**
     * Create a new student
     */
    async createStudent(input: CreateStudentInput): Promise<Student> {
        try {
            const query = `
                INSERT INTO students (roll_number, name, section_id, face_embedding, is_active)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING id, roll_number, name, section_id, face_embedding, is_active, created_at, updated_at
            `;

            const values = [
                input.roll_number,
                input.name,
                input.section_id,
                input.face_embedding || null,
                input.is_active ?? true
            ];

            const result = await this.pool.query(query, values);

            // Update section student count
            await this.updateSectionStudentCount(input.section_id);

            return result.rows[0] as Student;
        } catch (error) {
            console.error('Create student error:', error);
            if (error instanceof Error && (error.message.includes('duplicate key') || error.message.includes('unique constraint'))) {
                throw new Error('Student with this roll number already exists in this section');
            }
            throw new Error('Failed to create student');
        }
    }

    /**
     * Update student information
     */
    async updateStudent(studentId: string, input: UpdateStudentInput): Promise<Student | null> {
        try {
            // Validate UUID format
            if (!isValidUUID(studentId)) {
                return null;
            }

            const setParts: string[] = [];
            const values: any[] = [];
            let paramIndex = 1;

            if (input.roll_number !== undefined) {
                setParts.push(`roll_number = $${paramIndex++}`);
                values.push(input.roll_number);
            }
            if (input.name !== undefined) {
                setParts.push(`name = $${paramIndex++}`);
                values.push(input.name);
            }
            if (input.section_id !== undefined) {
                setParts.push(`section_id = $${paramIndex++}`);
                values.push(input.section_id);
            }
            if (input.face_embedding !== undefined) {
                setParts.push(`face_embedding = $${paramIndex++}`);
                values.push(input.face_embedding);
            }
            if (input.is_active !== undefined) {
                setParts.push(`is_active = $${paramIndex++}`);
                values.push(input.is_active);
            }

            if (setParts.length === 0) {
                throw new Error('No fields to update');
            }

            setParts.push(`updated_at = CURRENT_TIMESTAMP`);
            values.push(studentId);

            const query = `
                UPDATE students 
                SET ${setParts.join(', ')}
                WHERE id = $${paramIndex}
                RETURNING id, roll_number, name, section_id, face_embedding, is_active, created_at, updated_at
            `;

            const result = await this.pool.query(query, values);

            if (result.rows.length > 0 && input.section_id !== undefined) {
                // Update student counts for both old and new sections
                await this.updateSectionStudentCount(input.section_id);
            }

            return result.rows.length > 0 ? result.rows[0] as Student : null;
        } catch (error) {
            console.error('Update student error:', error);
            if (error instanceof Error && error.message.includes('duplicate key')) {
                throw new Error('Student with this roll number already exists');
            }
            throw new Error('Failed to update student');
        }
    }

    /**
     * Delete student (soft delete by setting is_active to false)
     */
    async deleteStudent(studentId: string): Promise<boolean> {
        try {
            // Get student's section before deletion
            const student = await this.getStudentById(studentId);
            if (!student) {
                return false;
            }

            const query = `
                UPDATE students 
                SET is_active = false, updated_at = CURRENT_TIMESTAMP
                WHERE id = $1 AND is_active = true
            `;

            const result = await this.pool.query(query, [studentId]);

            if ((result.rowCount ?? 0) > 0) {
                // Update section student count
                await this.updateSectionStudentCount(student.section_id);
                return true;
            }

            return false;
        } catch (error) {
            console.error('Delete student error:', error);
            throw new Error('Failed to delete student');
        }
    }

    /**
     * Check if roll number exists in a section
     */
    async rollNumberExists(rollNumber: string, sectionId: string, excludeStudentId?: string): Promise<boolean> {
        try {
            let query = 'SELECT id FROM students WHERE roll_number = $1 AND section_id = $2 AND is_active = true';
            const values: any[] = [rollNumber, sectionId];

            if (excludeStudentId) {
                query += ' AND id != $3';
                values.push(excludeStudentId);
            }

            const result = await this.pool.query(query, values);
            return result.rows.length > 0;
        } catch (error) {
            console.error('Roll number exists check error:', error);
            return false;
        }
    }

    /**
     * Update section student count
     */
    private async updateSectionStudentCount(sectionId: string): Promise<void> {
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
            console.error('Update section student count error:', error);
            // Don't throw error as this is a secondary operation
        }
    }

    /**
     * Get students with section details
     */
    async getStudentsWithSection(sectionId: string): Promise<any[]> {
        try {
            const query = `
                SELECT 
                    s.id, s.roll_number, s.name, s.section_id, s.face_embedding, s.is_active, s.created_at, s.updated_at,
                    sec.name as section_name, sec.grade as section_grade
                FROM students s
                JOIN sections sec ON s.section_id = sec.id
                WHERE s.section_id = $1 AND s.is_active = true
                ORDER BY s.roll_number ASC
            `;

            const result = await this.pool.query(query, [sectionId]);
            return result.rows;
        } catch (error) {
            console.error('Get students with section error:', error);
            throw new Error('Failed to retrieve students with section details');
        }
    }
}