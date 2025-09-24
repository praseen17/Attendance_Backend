/**
 * Database model interfaces
 * These interfaces define the structure of database entities
 */

export interface Faculty {
    id: string;
    username: string;
    password_hash: string;
    name: string;
    email: string;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
}

export interface Section {
    id: string;
    name: string;
    grade: string;
    faculty_id: string;
    student_count: number;
    created_at: Date;
    updated_at: Date;
}

export interface Student {
    id: string;
    roll_number: string;
    name: string;
    section_id: string;
    face_embedding?: Buffer;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
}

export interface AttendanceLog {
    id: string;
    student_id: string;
    faculty_id: string;
    section_id: string;
    date: Date;
    status: 'present' | 'absent';
    capture_method: 'ml' | 'manual' | 'face_detection';
    face_detected?: boolean;
    liveness_detected?: boolean;
    confidence_score?: number;
    attendance_image?: Buffer;
    face_detection_timestamp?: Date;
    attendance_image_timestamp?: Date;
    synced_at: Date;
    created_at: Date;
}

// Input types for creating new records (without auto-generated fields)
export interface CreateFacultyInput {
    username: string;
    password_hash: string;
    name: string;
    email: string;
    is_active?: boolean;
}

export interface CreateSectionInput {
    name: string;
    grade: string;
    faculty_id: string;
}

export interface CreateStudentInput {
    roll_number: string;
    name: string;
    section_id: string;
    face_embedding?: Buffer;
    is_active?: boolean;
}

export interface CreateAttendanceLogInput {
    student_id: string;
    faculty_id: string;
    section_id: string;
    date: Date;
    status: 'present' | 'absent';
    capture_method: 'ml' | 'manual' | 'face_detection';
    face_detected?: boolean;
    liveness_detected?: boolean;
    confidence_score?: number;
    attendance_image?: Buffer;
    face_detection_timestamp?: Date;
    attendance_image_timestamp?: Date;
}

// Update types for modifying existing records
export interface UpdateFacultyInput {
    username?: string;
    password_hash?: string;
    name?: string;
    email?: string;
    is_active?: boolean;
}

export interface UpdateSectionInput {
    name?: string;
    grade?: string;
    faculty_id?: string;
}

export interface UpdateStudentInput {
    roll_number?: string;
    name?: string;
    section_id?: string;
    face_embedding?: Buffer;
    is_active?: boolean;
}

// Query result types with joined data
export interface FacultyWithSections extends Faculty {
    sections: Section[];
}

export interface SectionWithStudents extends Section {
    students: Student[];
    faculty: Faculty;
}

export interface StudentWithSection extends Student {
    section: Section;
}

export interface AttendanceLogWithDetails extends AttendanceLog {
    student: Student;
    faculty: Faculty;
    section: Section;
}