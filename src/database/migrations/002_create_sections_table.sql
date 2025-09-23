-- Migration: Create sections table
-- Description: Create sections table for class/section management
-- Requirements: 6.2, 6.3

CREATE TABLE IF NOT EXISTS sections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) NOT NULL,
    grade VARCHAR(10) NOT NULL,
    faculty_id UUID NOT NULL,
    student_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (faculty_id) REFERENCES faculty(id) ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_sections_faculty_id ON sections(faculty_id);
CREATE INDEX IF NOT EXISTS idx_sections_grade ON sections(grade);
CREATE INDEX IF NOT EXISTS idx_sections_name ON sections(name);

-- Create trigger to update updated_at timestamp
CREATE TRIGGER update_sections_updated_at 
    BEFORE UPDATE ON sections 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();