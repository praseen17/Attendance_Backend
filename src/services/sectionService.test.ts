import { SectionService } from './sectionService';
import { AuthService } from './authService';
import { pool } from '../database/connection';
import { CreateSectionInput, UpdateSectionInput } from '../database/models';

describe('SectionService', () => {
    let sectionService: SectionService;
    let authService: AuthService;
    let testFacultyId: string;
    let testSectionId: string;

    beforeAll(async () => {
        sectionService = new SectionService();
        authService = new AuthService();

        // Create test faculty
        const faculty = await authService.createFaculty({
            username: 'test_faculty_section',
            password_hash: 'password123',
            name: 'Test Faculty',
            email: 'test_faculty_section@example.com'
        });
        testFacultyId = faculty!.id;
    });

    afterAll(async () => {
        // Clean up test data
        await pool.query('DELETE FROM sections WHERE faculty_id = $1', [testFacultyId]);
        await pool.query('DELETE FROM faculty WHERE id = $1', [testFacultyId]);
    });

    afterEach(async () => {
        // Clean up sections after each test
        await pool.query('DELETE FROM sections WHERE faculty_id = $1', [testFacultyId]);
    });

    describe('createSection', () => {
        it('should create a new section successfully', async () => {
            const input: CreateSectionInput = {
                name: 'Test Section',
                grade: '10',
                faculty_id: testFacultyId
            };

            const section = await sectionService.createSection(input);

            expect(section).toBeDefined();
            expect(section.name).toBe('Test Section');
            expect(section.grade).toBe('10');
            expect(section.faculty_id).toBe(testFacultyId);
            expect(section.student_count).toBe(0);
            expect(section.id).toBeDefined();
            expect(section.created_at).toBeDefined();

            testSectionId = section.id;
        });

        it('should throw error for non-existent faculty', async () => {
            const input: CreateSectionInput = {
                name: 'Test Section',
                grade: '10',
                faculty_id: 'non-existent-faculty-id'
            };

            await expect(sectionService.createSection(input))
                .rejects.toThrow('Faculty not found');
        });
    });

    describe('getSectionsByFaculty', () => {
        it('should return all sections for a faculty', async () => {
            // Create test sections
            const sections = [
                { name: 'Section A', grade: '9', faculty_id: testFacultyId },
                { name: 'Section B', grade: '10', faculty_id: testFacultyId },
                { name: 'Section C', grade: '11', faculty_id: testFacultyId }
            ];

            for (const section of sections) {
                await sectionService.createSection(section);
            }

            const result = await sectionService.getSectionsByFaculty(testFacultyId);

            expect(result).toHaveLength(3);
            expect(result[0].grade).toBe('9'); // Should be ordered by grade
            expect(result[1].grade).toBe('10');
            expect(result[2].grade).toBe('11');
        });

        it('should return empty array for faculty with no sections', async () => {
            const result = await sectionService.getSectionsByFaculty(testFacultyId);
            expect(result).toHaveLength(0);
        });
    });

    describe('getSectionById', () => {
        it('should return section by ID', async () => {
            const input: CreateSectionInput = {
                name: 'Test Section',
                grade: '10',
                faculty_id: testFacultyId
            };
            const createdSection = await sectionService.createSection(input);

            const section = await sectionService.getSectionById(createdSection.id);

            expect(section).toBeDefined();
            expect(section!.id).toBe(createdSection.id);
            expect(section!.name).toBe('Test Section');
            expect(section!.grade).toBe('10');
        });

        it('should return null for non-existent section', async () => {
            const section = await sectionService.getSectionById('non-existent-id');
            expect(section).toBeNull();
        });
    });

    describe('getAllSections', () => {
        it('should return all sections', async () => {
            // Create test sections
            const sections = [
                { name: 'Section A', grade: '9', faculty_id: testFacultyId },
                { name: 'Section B', grade: '10', faculty_id: testFacultyId }
            ];

            for (const section of sections) {
                await sectionService.createSection(section);
            }

            const result = await sectionService.getAllSections();

            expect(result.length).toBeGreaterThanOrEqual(2);
            const testSections = result.filter(s => s.faculty_id === testFacultyId);
            expect(testSections).toHaveLength(2);
        });
    });

    describe('updateSection', () => {
        it('should update section information', async () => {
            // Create section
            const input: CreateSectionInput = {
                name: 'Original Section',
                grade: '9',
                faculty_id: testFacultyId
            };
            const createdSection = await sectionService.createSection(input);

            // Update section
            const updateInput: UpdateSectionInput = {
                name: 'Updated Section',
                grade: '10'
            };
            const updatedSection = await sectionService.updateSection(createdSection.id, updateInput);

            expect(updatedSection).toBeDefined();
            expect(updatedSection!.name).toBe('Updated Section');
            expect(updatedSection!.grade).toBe('10');
            expect(updatedSection!.updated_at.getTime()).toBeGreaterThan(updatedSection!.created_at.getTime());
        });

        it('should return null for non-existent section', async () => {
            const updateInput: UpdateSectionInput = { name: 'New Name' };
            const result = await sectionService.updateSection('non-existent-id', updateInput);
            expect(result).toBeNull();
        });
    });

    describe('deleteSection', () => {
        it('should delete section with no students', async () => {
            // Create section
            const input: CreateSectionInput = {
                name: 'Test Section',
                grade: '10',
                faculty_id: testFacultyId
            };
            const createdSection = await sectionService.createSection(input);

            // Delete section
            const deleted = await sectionService.deleteSection(createdSection.id);
            expect(deleted).toBe(true);

            // Verify section is deleted
            const section = await sectionService.getSectionById(createdSection.id);
            expect(section).toBeNull();
        });

        it('should return false for non-existent section', async () => {
            const deleted = await sectionService.deleteSection('non-existent-id');
            expect(deleted).toBe(false);
        });
    });

    describe('sectionNameExists', () => {
        it('should return true for existing section name for faculty', async () => {
            const input: CreateSectionInput = {
                name: 'Test Section',
                grade: '10',
                faculty_id: testFacultyId
            };
            await sectionService.createSection(input);

            const exists = await sectionService.sectionNameExists('Test Section', testFacultyId);
            expect(exists).toBe(true);
        });

        it('should return false for non-existing section name', async () => {
            const exists = await sectionService.sectionNameExists('Non-existent Section', testFacultyId);
            expect(exists).toBe(false);
        });

        it('should exclude specific section ID when checking', async () => {
            const input: CreateSectionInput = {
                name: 'Test Section',
                grade: '10',
                faculty_id: testFacultyId
            };
            const section = await sectionService.createSection(input);

            const exists = await sectionService.sectionNameExists('Test Section', testFacultyId, section.id);
            expect(exists).toBe(false);
        });
    });

    describe('getSectionsWithFaculty', () => {
        it('should return sections with faculty details', async () => {
            const input: CreateSectionInput = {
                name: 'Test Section',
                grade: '10',
                faculty_id: testFacultyId
            };
            await sectionService.createSection(input);

            const result = await sectionService.getSectionsWithFaculty();
            const testSection = result.find(s => s.faculty_id === testFacultyId);

            expect(testSection).toBeDefined();
            expect(testSection.faculty_name).toBe('Test Faculty');
            expect(testSection.faculty_email).toBe('test_faculty_section@example.com');
        });
    });

    describe('updateStudentCount', () => {
        it('should update student count correctly', async () => {
            const input: CreateSectionInput = {
                name: 'Test Section',
                grade: '10',
                faculty_id: testFacultyId
            };
            const section = await sectionService.createSection(input);

            // Manually insert a student for testing
            await pool.query(
                'INSERT INTO students (roll_number, name, section_id, is_active) VALUES ($1, $2, $3, $4)',
                ['001', 'Test Student', section.id, true]
            );

            await sectionService.updateStudentCount(section.id);

            const updatedSection = await sectionService.getSectionById(section.id);
            expect(updatedSection!.student_count).toBe(1);

            // Clean up
            await pool.query('DELETE FROM students WHERE section_id = $1', [section.id]);
        });
    });
});