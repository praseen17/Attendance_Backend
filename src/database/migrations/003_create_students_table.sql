-- Migration: Create students table
-- Description: Create students table for student registry management
-- Requirements: 6.2, 6.3

CREATE TABLE IF NOT EXISTS students (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    roll_number VARCHAR(20) NOT NULL,
    name VARCHAR(100) NOT NULL,
    section_id UUID NOT NULL,
    face_embedding BYTEA,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE,
    UNIQUE(roll_number, section_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_students_roll_number ON students(roll_number);
CREATE INDEX IF NOT EXISTS idx_students_section_id ON students(section_id);
CREATE INDEX IF NOT EXISTS idx_students_is_active ON students(is_active);
CREATE INDEX IF NOT EXISTS idx_students_name ON students(name);

-- Create trigger to update updated_at timestamp
CREATE TRIGGER update_students_updated_at 
    BEFORE UPDATE ON students 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Create trigger to update section student count
CREATE OR REPLACE FUNCTION update_section_student_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE sections 
        SET student_count = student_count + 1 
        WHERE id = NEW.section_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE sections 
        SET student_count = student_count - 1 
        WHERE id = OLD.section_id;
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        -- If section changed, update both old and new sections
        IF OLD.section_id != NEW.section_id THEN
            UPDATE sections 
            SET student_count = student_count - 1 
            WHERE id = OLD.section_id;
            UPDATE sections 
            SET student_count = student_count + 1 
            WHERE id = NEW.section_id;
        END IF;
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_section_count_on_student_change
    AFTER INSERT OR UPDATE OR DELETE ON students
    FOR EACH ROW
    EXECUTE FUNCTION update_section_student_count();