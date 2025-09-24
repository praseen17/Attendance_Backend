import { StudentService } from './studentService';
import { SectionService } from './sectionService';
import { AuthService } from './authService';
import { pool } from '../database/connection';
import { CreateStudentInput, UpdateStudentInput } from '../database/models';

describe('StudentService', () => {
    let studentService: StudentService;
    let sectionService: SectionService;
    let authService: AuthService;
    let testFacultyId: string;
    let testSectionId: string;
    let testStudentId: string;

    beforeAll(async () => {
        studentService = new StudentService();
        sectionService = new SectionService();
        authService = new AuthService();

        // Create test faculty
        const faculty = await authService.createFaculty({
            username: 'test_faculty_student',
            password_hash: 'password123',
            name: 'Test Faculty',
            email: 'test_faculty_student@example.com'
        });
        testFacultyId = faculty!.id;

        // Create test section
        const section = await sectionService.createSection({
            name: 'Test Section',
            grade: '10',
            faculty_id: testFacultyId
        });
        testSectionId = section.id;
    });

    afterAll(async () => {
        // Clean up test data
        await pool.query('DELETE FROM students WHERE section_id = $1', [testSectionId]);
        await pool.query('DELETE FROM sections WHERE id = $1', [testSectionId]);
        await pool.query('DELETE FROM faculty WHERE id = $1', [testFacultyId]);
    });

    afterEach(async () => {
        // Clean up students after each test
        await pool.query('DELETE FROM students WHERE section_id = $1', [testSectionId]);
    });

    describe('createStudent', () => {
        it('should create a new student successfully', async () => {
            const input: CreateStudentInput = {
                roll_number: '001',
                name: 'Test Student',
                section_id: testSectionId,
                is_active: true
            };

            const student = await studentService.createStudent(input);

            expect(student).toBeDefined();
            expect(student.roll_number).toBe('001');
            expect(student.name).toBe('Test Student');
            expect(student.section_id).toBe(testSectionId);
            expect(student.is_active).toBe(true);
            expect(student.id).toBeDefined();
            expect(student.created_at).toBeDefined();

            testStudentId = student.id;
        });

        it('should throw error for duplicate roll number in same section', async () => {
            // Create first student
            const input1: CreateStudentInput = {
                roll_number: '002',
                name: 'Student One',
                section_id: testSectionId
            };
            await studentService.createStudent(input1);

            // Try to create second student with same roll number
            const input2: CreateStudentInput = {
                roll_number: '002',
                name: 'Student Two',
                section_id: testSectionId
            };

            await expect(studentService.createStudent(input2))
                .rejects.toThrow('Student with this roll number already exists');
        });
    });

    describe('getStudentsBySection', () => {
        it('should return all active students in a section', async () => {
            // Create test students
            const students = [
                { roll_number: '001', name: 'Student One', section_id: testSectionId },
                { roll_number: '002', name: 'Student Two', section_id: testSectionId },
                { roll_number: '003', name: 'Student Three', section_id: testSectionId, is_active: false }
            ];

            for (const student of students) {
                await studentService.createStudent(student);
            }

            const result = await studentService.getStudentsBySection(testSectionId);

            expect(result).toHaveLength(2); // Only active students
            expect(result[0].roll_number).toBe('001');
            expect(result[1].roll_number).toBe('002');
        });

        it('should return empty array for section with no students', async () => {
            const result = await studentService.getStudentsBySection(testSectionId);
            expect(result).toHaveLength(0);
        });
    });

    describe('getStudentById', () => {
        it('should return student by ID', async () => {
            const input: CreateStudentInput = {
                roll_number: '001',
                name: 'Test Student',
                section_id: testSectionId
            };
            const createdStudent = await studentService.createStudent(input);

            const student = await studentService.getStudentById(createdStudent.id);

            expect(student).toBeDefined();
            expect(student!.id).toBe(createdStudent.id);
            expect(student!.roll_number).toBe('001');
            expect(student!.name).toBe('Test Student');
        });

        it('should return null for non-existent student', async () => {
            const student = await studentService.getStudentById('non-existent-id');
            expect(student).toBeNull();
        });
    });

    describe('updateStudent', () => {
        it('should update student information', async () => {
            // Create student
            const input: CreateStudentInput = {
                roll_number: '001',
                name: 'Original Name',
                section_id: testSectionId
            };
            const createdStudent = await studentService.createStudent(input);

            // Update student
            const updateInput: UpdateStudentInput = {
                name: 'Updated Name',
                roll_number: '002'
            };
            const updatedStudent = await studentService.updateStudent(createdStudent.id, updateInput);

            expect(updatedStudent).toBeDefined();
            expect(updatedStudent!.name).toBe('Updated Name');
            expect(updatedStudent!.roll_number).toBe('002');
            expect(updatedStudent!.updated_at.getTime()).toBeGreaterThan(updatedStudent!.created_at.getTime());
        });

        it('should return null for non-existent student', async () => {
            const updateInput: UpdateStudentInput = { name: 'New Name' };
            const result = await studentService.updateStudent('non-existent-id', updateInput);
            expect(result).toBeNull();
        });
    });

    describe('deleteStudent', () => {
        it('should soft delete student', async () => {
            // Create student
            const input: CreateStudentInput = {
                roll_number: '001',
                name: 'Test Student',
                section_id: testSectionId
            };
            const createdStudent = await studentService.createStudent(input);

            // Delete student
            const deleted = await studentService.deleteStudent(createdStudent.id);
            expect(deleted).toBe(true);

            // Verify student is not returned in active queries
            const student = await studentService.getStudentById(createdStudent.id);
            expect(student).toBeNull();
        });

        it('should return false for non-existent student', async () => {
            const deleted = await studentService.deleteStudent('non-existent-id');
            expect(deleted).toBe(false);
        });
    });

    describe('rollNumberExists', () => {
        it('should return true for existing roll number in section', async () => {
            const input: CreateStudentInput = {
                roll_number: '001',
                name: 'Test Student',
                section_id: testSectionId
            };
            await studentService.createStudent(input);

            const exists = await studentService.rollNumberExists('001', testSectionId);
            expect(exists).toBe(true);
        });

        it('should return false for non-existing roll number', async () => {
            const exists = await studentService.rollNumberExists('999', testSectionId);
            expect(exists).toBe(false);
        });

        it('should exclude specific student ID when checking', async () => {
            const input: CreateStudentInput = {
                roll_number: '001',
                name: 'Test Student',
                section_id: testSectionId
            };
            const student = await studentService.createStudent(input);

            const exists = await studentService.rollNumberExists('001', testSectionId, student.id);
            expect(exists).toBe(false);
        });
    });
});