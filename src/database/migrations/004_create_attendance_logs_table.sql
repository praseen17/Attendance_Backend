-- Migration: Create attendance_logs table
-- Description: Create attendance_logs table for storing attendance records
-- Requirements: 6.2, 6.3

CREATE TABLE IF NOT EXISTS attendance_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL,
    faculty_id UUID NOT NULL,
    section_id UUID NOT NULL,
    date DATE NOT NULL,
    status VARCHAR(10) CHECK(status IN ('present', 'absent')) NOT NULL,
    capture_method VARCHAR(10) CHECK(capture_method IN ('ml', 'manual')) NOT NULL,
    synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (faculty_id) REFERENCES faculty(id) ON DELETE CASCADE,
    FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE,
    UNIQUE(student_id, date)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_attendance_logs_student_id ON attendance_logs(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_faculty_id ON attendance_logs(faculty_id);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_section_id ON attendance_logs(section_id);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_date ON attendance_logs(date);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_status ON attendance_logs(status);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_student_date ON attendance_logs(student_id, date);

-- Create composite index for common queries
CREATE INDEX IF NOT EXISTS idx_attendance_logs_section_date ON attendance_logs(section_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_faculty_date ON attendance_logs(faculty_id, date);